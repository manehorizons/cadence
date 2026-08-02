import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  defaultConfig,
  emptyState,
  type CadenceConfig,
  type Finding,
  type Recommendation,
  type RecommendationLedger,
  type Summary,
} from '@thomas-powers-jr/cadence-types';
import { tempRepo, runGit } from '@thomas-powers-jr/cadence-testkit';
import type { CommandIO } from '../../src/services/io.js';
import { computeSummaryContentHash, canonicalStringify } from '../../src/services/summary-hash.js';
import { GATE_ORDER } from '../../src/gates/registry.js';
import { buildCadenceMcpServer } from '../../src/mcp/server.js';
import { discoverChangedPhases } from '../../src/git/diff-strict.js';

/**
 * T5 (phase 164): `settleService` threads `repoRoot` as `cwd` into all three
 * of its memoized verifier-selection seams — `selectVerifier` (deep-verify),
 * `selectCodeReviewVerifier`, and `selectSecurityAuditVerifier` — so a key
 * discoverable only via a `.env` file AT THE REPO ROOT is found, regardless of
 * the test process's own `process.cwd()`. We spy on each real factory to
 * capture which concrete verifier it constructed (`.name`), then swap in a
 * stubbed `.verify` so no real network call is ever made (mirrors
 * `spec-approve.test.ts`'s "construction alone never makes a network call"
 * technique — construction alone is fine, only `.verify()` would reach the
 * network).
 */
const constructed = vi.hoisted(() => ({
  deep: [] as string[],
  codeReview: [] as string[],
  securityAudit: [] as string[],
  /**
   * Phase 184: captures the `opts` (`{ signal?; traceId? }`) argument each
   * real `.verify()` call receives, so a test can prove `settleService`'s
   * memoized wrapper (`services/settle.ts`) genuinely forwards the gate's
   * generated traceId to the concrete verifier rather than silently
   * dropping it — the bug an earlier review of this phase caught (the
   * wrapper only accepted `input` and never passed `opts` through).
   */
  securityAuditOpts: [] as Array<{ signal?: AbortSignal; traceId?: string } | undefined>,
  /**
   * Phase 242 (T3): per-test override for the mocked code-review verifier's
   * `findings` return value. `null` (the default, reset in `afterEach`)
   * preserves this file's existing behavior — every other test in this file
   * runs code-review through a stub that returns `{}` regardless of the
   * real diff. Setting this lets a finding-ledger-routing test produce real,
   * `attachFindingIdentity`-stamped findings (the gate's own anchoring/
   * identity logic still runs for real over whatever is set here — only the
   * verifier call itself is stubbed).
   */
  codeReviewFindingsOverride: null as Record<string, Finding[]> | null,
  /**
   * Phase 247 (T4, review follow-up): per-test override for the mocked
   * security-audit verifier's `findings` return value, mirroring
   * `codeReviewFindingsOverride` above. Without this seam nothing in this
   * file could drive `writeRefusedSettleSummary`'s `securityAuditFindings`
   * branch (it was always `[]`) — a whole-branch review of this phase
   * flagged that gap: inverting the `hasSecurityAuditFindings` truthiness
   * check would still have left the full suite green.
   */
  securityAuditFindingsOverride: null as Finding[] | null,
}));

vi.mock('../../src/verify/factory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/verify/factory.js')>();
  return {
    ...actual,
    selectVerifier: (
      cfg: Parameters<typeof actual.selectVerifier>[0],
      opts: Parameters<typeof actual.selectVerifier>[1],
    ) => {
      const real = actual.selectVerifier(cfg, opts);
      constructed.deep.push(real.name);
      return {
        name: real.name,
        verify: async () => ({
          verdicts: { 'AC-1': { pass: true, reason: 'stubbed for cwd-threading test' } },
          provider: real.name,
        }),
      };
    },
  };
});

vi.mock('../../src/verify/code-review-factory.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/verify/code-review-factory.js')>();
  return {
    ...actual,
    selectCodeReviewVerifier: (
      cfg: Parameters<typeof actual.selectCodeReviewVerifier>[0],
      opts: Parameters<typeof actual.selectCodeReviewVerifier>[1],
    ) => {
      const real = actual.selectCodeReviewVerifier(cfg, opts);
      constructed.codeReview.push(real.name);
      return {
        name: real.name,
        verify: async () => ({
          findings: constructed.codeReviewFindingsOverride ?? {},
          provider: real.name,
        }),
      };
    },
  };
});

vi.mock('../../src/verify/security-audit-factory.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/verify/security-audit-factory.js')>();
  return {
    ...actual,
    selectSecurityAuditVerifier: (
      cfg: Parameters<typeof actual.selectSecurityAuditVerifier>[0],
      opts: Parameters<typeof actual.selectSecurityAuditVerifier>[1],
    ) => {
      const real = actual.selectSecurityAuditVerifier(cfg, opts);
      constructed.securityAudit.push(real.name);
      return {
        name: real.name,
        verify: async (
          _input: Parameters<typeof real.verify>[0],
          verifyOpts?: Parameters<typeof real.verify>[1],
        ) => {
          constructed.securityAuditOpts.push(verifyOpts);
          return { findings: constructed.securityAuditFindingsOverride ?? [], provider: real.name };
        },
      };
    },
  };
});

const { settleService, refusedSnapshotArtifactBase } = await import('../../src/services/settle.js');

function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

async function mktemp(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), 'cadence-settle-verifier-cwd-')));
}

function draftMd(phase: string, id: string, tier: string): string {
  return `---
phase: ${phase}
id: ${id}
tier: ${tier}
status: APPROVED
---

# ${id} — demo

## Objective

Prove cwd threading.

## Acceptance Criteria

### AC-1: it works
Given a precondition
When an action
Then an observable outcome

## Tasks

### T1: do the thing
- files: \`src/foo.ts\`
- action: do it
- verify: it works
- done: AC-1

## Boundaries

- none
`;
}

/** A BUILD-state cadence repo with a single DONE task, phase/tier configurable. */
async function setupBuildRepo(args: {
  root: string;
  phase: string;
  id: string;
  tier: string;
  config: CadenceConfig;
}): Promise<void> {
  const { root, phase, id, tier, config } = args;
  const phaseDir = join(root, '.cadence', 'phases', phase);
  await mkdir(phaseDir, { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'foo.ts'), 'export const x = 1;\n', 'utf8');
  await writeFile(join(root, '.cadence', 'config.json'), JSON.stringify(config, null, 2));
  const state = {
    ...emptyState('settle-verifier-cwd'),
    loopPosition: 'BUILD' as const,
    activePhase: phase,
    activeDraft: id,
  };
  await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));
  await writeFile(join(phaseDir, `${id}-DRAFT.md`), draftMd(phase, id, tier));
  await writeFile(
    join(phaseDir, `${id}-PROGRESS.json`),
    JSON.stringify({ draftId: id, tasks: { T1: { status: 'DONE' } } }, null, 2),
  );
  // The key lives ONLY here — a repo root distinct from process.cwd() — and
  // ONLY as a .env file, never exported into process.env (AC-1).
  await writeFile(join(root, '.env'), 'ANTHROPIC_API_KEY=from-dotenv-settle-test\n');
}

let root: string | null = null;
const origKey = process.env.ANTHROPIC_API_KEY;

afterEach(async () => {
  constructed.deep.length = 0;
  constructed.codeReview.length = 0;
  constructed.securityAudit.length = 0;
  constructed.securityAuditOpts.length = 0;
  constructed.codeReviewFindingsOverride = null;
  constructed.securityAuditFindingsOverride = null;
  if (origKey !== undefined) {
    process.env.ANTHROPIC_API_KEY = origKey;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
  }
  if (root) {
    await rm(root, { recursive: true, force: true }).catch(() => {});
    root = null;
  }
});

describe('settleService threads repoRoot as cwd to its verifier-selection seams (T5)', () => {
  it('AC-1: deep-verify seam resolves a real anthropic verifier from a key discoverable only via .env at repoRoot (AC-3)', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '50-deep-verifier-cwd',
      id: '50-01',
      tier: 'standard',
      config: { ...defaultConfig, verifier: { provider: 'anthropic', diffCapBytes: 262144 } },
    });

    delete process.env.ANTHROPIC_API_KEY;
    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, deep: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);
    // Before the fix, selectVerifier defaulted `cwd` to the real process.cwd()
    // (this test's own working directory, which has neither the env var nor a
    // .env with the key) and would have constructed the 'mock' verifier instead.
    expect(constructed.deep).toEqual(['anthropic']);
  });

  it('AC-1: code-review seam resolves a real anthropic verifier from a key discoverable only via .env at repoRoot (AC-3)', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '51-code-review-verifier-cwd',
      id: '51-01',
      tier: 'standard',
      // Phase 214 (T4): this fixture has no real test coverage for AC-1
      // (--allow-missing-coverage) and predates gates.evidenceFloor — set the
      // floor to 'unverified' (no requirement) so it isn't newly refused by
      // the evidence-floor gate this test doesn't care about. Real
      // evidence-floor coverage lives in the dedicated describe block below.
      config: {
        ...defaultConfig,
        profile: 'strict',
        codeReview: { provider: 'anthropic' },
        gates: { sealed: [], evidenceFloor: 'unverified' },
      },
    });

    delete process.env.ANTHROPIC_API_KEY;
    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);
    expect(constructed.codeReview).toEqual(['anthropic']);
  });

  it('AC-1: security-audit seam resolves a real anthropic verifier from a key discoverable only via .env at repoRoot (AC-3)', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '52-security-audit-verifier-cwd',
      id: '52-01',
      tier: 'complex',
      // Phase 214 (T4): see the '51-code-review-verifier-cwd' comment above —
      // this fixture has no real AC-1 coverage and predates evidence-floor.
      config: {
        ...defaultConfig,
        profile: 'strict',
        securityAudit: { provider: 'anthropic' },
        gates: { sealed: [], evidenceFloor: 'unverified' },
      },
    });

    delete process.env.ANTHROPIC_API_KEY;
    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);
    expect(constructed.securityAudit).toEqual(['anthropic']);
  });

  it('Phase 184 AC-3: settleService forwards the security-audit gate\'s generated traceId to the concrete verifier through the real settle path, not just the gate function in isolation', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '184-security-audit-traceid',
      id: '184-01',
      tier: 'complex',
      // Phase 214 (T4): see the '51-code-review-verifier-cwd' comment above —
      // this fixture has no real AC-1 coverage and predates evidence-floor.
      config: {
        ...defaultConfig,
        profile: 'strict',
        securityAudit: { provider: 'anthropic' },
        gates: { sealed: [], evidenceFloor: 'unverified' },
      },
    });

    delete process.env.ANTHROPIC_API_KEY;
    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);
    // Before this fix, services/settle.ts's memoized securityAudit.verify
    // wrapper accepted only `input` and never forwarded `opts` — the gate
    // generated a real traceId but it never reached the concrete verifier.
    expect(constructed.securityAuditOpts).toHaveLength(1);
    expect(typeof constructed.securityAuditOpts[0]?.traceId).toBe('string');
    expect(constructed.securityAuditOpts[0]?.traceId).not.toBe('');
  });
});

describe('settleService persists a SUMMARY on the refused-settle path (phase 170, T4)', () => {
  it('AC-3: a refused build-test-must-pass gate still writes SUMMARY.json/.md with the refused gate in provenance, and leaves loop state unchanged', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '53-refused-settle-summary',
      id: '53-01',
      tier: 'standard',
      config: {
        ...defaultConfig,
        verification: {
          ...defaultConfig.verification,
          testCommand: 'node -e "process.exit(1)"',
        },
      },
    });

    const { io, err } = captureIO();
    const res = await settleService(root, {}, io);

    // The gate refuses (no --allow-failing-build / --force) — settle halts.
    expect(res.exitCode).toBe(1);
    expect(err.join('')).toContain('build-test-must-pass:');

    const summaryPath = join(
      root, '.cadence', 'phases', '53-refused-settle-summary', '53-01-SUMMARY.json',
    );
    const summaryMdPath = join(
      root, '.cadence', 'phases', '53-refused-settle-summary', '53-01-SUMMARY.md',
    );
    const summaryRaw = await readFile(summaryPath, 'utf8');
    const summary = JSON.parse(summaryRaw) as {
      acResults: unknown[];
      gates: { gate: string; status: string; reason?: string }[];
      taskResults: { id: string; status: string }[];
    };

    expect(summary.acResults).toEqual([]);
    expect(summary.gates.length).toBeGreaterThan(0);
    const lastGate = summary.gates[summary.gates.length - 1];
    expect(lastGate?.status).toBe('refused');
    expect(lastGate?.gate).toBe('build-test-must-pass');
    expect(typeof lastGate?.reason).toBe('string');
    expect(summary.taskResults.some((t) => t.id === 'T1' && t.status === 'DONE')).toBe(true);

    // .md sibling was also written (renderSummaryMd's output — not asserting
    // its exact shape, `reason` rendering is explicitly out of scope for this
    // phase).
    const mdRaw = await readFile(summaryMdPath, 'utf8');
    expect(mdRaw.length).toBeGreaterThan(0);

    // The refusal must NOT transition the loop — a human retries `settle run`
    // from exactly where they left off.
    const stateRaw = await readFile(join(root, '.cadence', 'state.json'), 'utf8');
    const state = JSON.parse(stateRaw) as { loopPosition: string; activeDraft: string | null };
    expect(state.loopPosition).toBe('BUILD');
    expect(state.activeDraft).toBe('53-01');
  });
});

describe('settleService threads acc-accumulated findings into the refused SUMMARY (phase 247, T1)', () => {
  it('247-01/AC-1: a refused code-review gate (HIGH finding, no bypass flag) records codeReview + a contentHash in the refused SUMMARY', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '247-01-refused-code-review',
      id: '247-01',
      tier: 'standard',
      // strict×standard's delta includes 'code-review' (engine.ts DELTAS);
      // gates.sealed: [] + evidenceFloor: 'unverified' mirrors the
      // '51-code-review-verifier-cwd' fixture above — this test never
      // reaches the evidence-floor check (the gate loop halts at
      // code-review, before settle.ts's post-loop AC-merge code runs it).
      config: {
        ...defaultConfig,
        profile: 'strict',
        gates: { sealed: [], evidenceFloor: 'unverified' },
      },
    });
    constructed.codeReviewFindingsOverride = {
      'src/foo.ts': [mkFinding('console.log left in source', 'high')],
    };

    const { io, err } = captureIO();
    // Deliberately NO --force / --allow-code-review-failure: either would
    // set `bypassed: true` in the code-review gate and fall through to
    // `outcome: 'pass'` instead of refusing (gates/code-review.ts) — the
    // whole point of this test is to exercise the refuse path.
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true },
      io,
    );

    // Default convergence.maxAttempts is 3; a single failing attempt
    // (attemptsSoFar 0 → attempt 1) yields verdict 'reloop', which ALSO
    // returns `outcome: 'refuse'` (gates/code-review.ts) — no need to force
    // an 'escalate' verdict via convergence.maxAttempts:1 for this AC.
    expect(res.exitCode).toBe(1);
    expect(err.join('')).toContain('code-review:');

    const summaryPath = join(
      root, '.cadence/phases/247-01-refused-code-review/247-01-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    const lastGate = summary.gates?.[summary.gates.length - 1];
    expect(lastGate).toMatchObject({ gate: 'code-review', status: 'refused' });

    expect(summary.codeReview?.['src/foo.ts']).toHaveLength(1);
    expect(summary.codeReview?.['src/foo.ts']?.[0]).toMatchObject({
      severity: 'high',
      message: 'console.log left in source',
    });
    expect(summary.contentHash?.algorithm).toBe('sha256');
    expect(summary.contentHash?.value).toMatch(/^[0-9a-f]{64}$/);
    // Independent recomputation, not just presence — proves the stored
    // hash genuinely reflects this refused SUMMARY's content (a hash
    // computed over the wrong object, or a stale variable, would still
    // pass a bare truthy check but fail this).
    const recomputed = computeSummaryContentHash(summary);
    expect(recomputed.value).toBe(summary.contentHash?.value);
  });

  it('a refused build-test-must-pass settle with no code-review/security-audit findings gains no codeReview/securityAudit/contentHash keys (no regression)', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '247-02-refused-no-findings',
      id: '247-02',
      tier: 'standard',
      config: {
        ...defaultConfig,
        verification: { ...defaultConfig.verification, testCommand: 'node -e "process.exit(1)"' },
      },
    });

    const { io } = captureIO();
    const res = await settleService(root, {}, io);
    expect(res.exitCode).toBe(1);

    const summaryPath = join(
      root, '.cadence/phases/247-02-refused-no-findings/247-02-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Record<string, unknown>;

    // Hard constraint (SPEC AC-1): a findings-free refusal produces the
    // exact same output as before this phase — no new keys at all, not
    // even present-but-undefined ones.
    expect('codeReview' in summary).toBe(false);
    expect('securityAudit' in summary).toBe(false);
    expect('contentHash' in summary).toBe(false);
  });

  it('247-01/AC-1: a refused security-audit gate (CRITICAL finding, code-review clean) records securityAudit + codeReview:{} + a contentHash in the refused SUMMARY (review follow-up)', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '247-03-refused-security-audit',
      id: '247-03',
      tier: 'complex',
      config: {
        ...defaultConfig,
        // strict×complex is the only cell where security-audit fires
        // (gates/engine.ts DELTAS) — code-review also fires in this cell
        // and runs first in GATE_ORDER, so leaving codeReviewFindingsOverride
        // unset (code-review returns `{}`, clean) exercises exactly the
        // "codeReview: {} present, securityAudit is what refuses" case the
        // T1 comment above describes.
        profile: 'strict',
        gates: { sealed: [], evidenceFloor: 'unverified' },
      },
    });
    constructed.securityAuditFindingsOverride = [mkFinding('hardcoded secret', 'critical')];

    const { io, err } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true },
      io,
    );

    expect(res.exitCode).toBe(1);
    expect(err.join('')).toContain('security-audit:');

    const summaryPath = join(
      root, '.cadence/phases/247-03-refused-security-audit/247-03-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    const lastGate = summary.gates?.[summary.gates.length - 1];
    expect(lastGate).toMatchObject({ gate: 'security-audit', status: 'refused' });

    // code-review ran and passed clean before security-audit refused —
    // `codeReview: {}` is present (per the success-path-mirroring spread),
    // even though it holds no findings itself.
    expect(summary.codeReview).toEqual({});
    expect(summary.securityAudit).toHaveLength(1);
    expect(summary.securityAudit?.[0]).toMatchObject({
      severity: 'critical',
      message: 'hardcoded secret',
    });
    expect(summary.contentHash?.value).toMatch(/^[0-9a-f]{64}$/);
    const recomputed = computeSummaryContentHash(summary);
    expect(recomputed.value).toBe(summary.contentHash?.value);

    // The sibling snapshot is written for this path too (identical
    // condition to the codeReview-refusal case).
    const entries = await readdir(join(root, '.cadence/phases/247-03-refused-security-audit'));
    expect(entries.some((e) => e.includes('SUMMARY-snapshot'))).toBe(true);
  });
});

describe('settleService threads an injectable clock seam for completedAt (phase 247, T2)', () => {
  it('247-01/AC-3: a fixed injected now() produces an exact completedAt on the success-path SUMMARY', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '247-03-clock-seam-success',
      id: '247-03',
      tier: 'standard',
      // Phase 214 (T4): see the '51-code-review-verifier-cwd' comment above —
      // this fixture has no real AC-1 coverage and predates evidence-floor.
      config: { ...defaultConfig, gates: { sealed: [], evidenceFloor: 'unverified' } },
    });

    const fixedNow = '2026-01-01T00:00:00.000Z';
    const { io } = captureIO();
    const res = await settleService(
      root,
      {
        auto: true,
        interactive: false,
        allowMissingCoverage: true,
        force: true,
        now: () => fixedNow,
      },
      io,
    );

    expect(res.exitCode).toBe(0);

    const summaryPath = join(
      root, '.cadence', 'phases', '247-03-clock-seam-success', '247-03-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    expect(summary.completedAt).toBe(fixedNow);
  });

  it('247-01/AC-3: a fixed injected now() produces an exact completedAt on the refused-settle SUMMARY', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '247-04-clock-seam-refused',
      id: '247-04',
      tier: 'standard',
      config: {
        ...defaultConfig,
        verification: {
          ...defaultConfig.verification,
          testCommand: 'node -e "process.exit(1)"',
        },
      },
    });

    const fixedNow = '2026-02-02T12:34:56.000Z';
    const { io } = captureIO();
    const res = await settleService(root, { now: () => fixedNow }, io);

    expect(res.exitCode).toBe(1);

    const summaryPath = join(
      root, '.cadence', 'phases', '247-04-clock-seam-refused', '247-04-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    expect(summary.completedAt).toBe(fixedNow);
  });
});

describe('settleService writes an additive per-attempt sibling snapshot on a findings-present refusal (phase 247, T3)', () => {
  it('247-01/AC-2: a refused code-review gate with findings writes a SUMMARY-snapshot sibling pair identical to the canonical refused SUMMARY', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '247-05-sibling-present',
      id: '247-05',
      tier: 'standard',
      config: {
        ...defaultConfig,
        profile: 'strict',
        gates: { sealed: [], evidenceFloor: 'unverified' },
      },
    });
    constructed.codeReviewFindingsOverride = {
      'src/foo.ts': [mkFinding('console.log left in source', 'high')],
    };

    const fixedNow = '2026-03-03T09:08:07.000Z';
    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, now: () => fixedNow },
      io,
    );

    expect(res.exitCode).toBe(1);

    const phaseDir = join(root, '.cadence/phases/247-05-sibling-present');
    const summaryPath = join(phaseDir, '247-05-SUMMARY.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;
    expect(summary.completedAt).toBe(fixedNow);

    const snapshotBase = refusedSnapshotArtifactBase('247-05', fixedNow);
    const siblingJsonPath = join(phaseDir, `${snapshotBase}.json`);
    const siblingMdPath = join(phaseDir, `${snapshotBase}.md`);

    expect(existsSync(siblingJsonPath)).toBe(true);
    expect(existsSync(siblingMdPath)).toBe(true);

    const siblingSummary = JSON.parse(await readFile(siblingJsonPath, 'utf8')) as Summary;
    expect(siblingSummary).toEqual(summary);

    const siblingMd = await readFile(siblingMdPath, 'utf8');
    const canonicalMd = await readFile(join(phaseDir, '247-05-SUMMARY.md'), 'utf8');
    expect(siblingMd).toBe(canonicalMd);
  });

  it('247-01/AC-2: a findings-free refusal (build-test-must-pass alone) writes no SUMMARY-snapshot sibling', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '247-06-sibling-absent',
      id: '247-06',
      tier: 'standard',
      config: {
        ...defaultConfig,
        verification: { ...defaultConfig.verification, testCommand: 'node -e "process.exit(1)"' },
      },
    });

    const { io } = captureIO();
    const res = await settleService(root, {}, io);
    expect(res.exitCode).toBe(1);

    const phaseDir = join(root, '.cadence/phases/247-06-sibling-absent');
    const entries = await readdir(phaseDir);
    expect(entries.some((e) => e.includes('SUMMARY-snapshot'))).toBe(false);
  });

  it('247-01/AC-2: a sibling-write failure is swallowed via io.err and never affects the canonical SUMMARY or settle exit code', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '247-07-sibling-failure',
      id: '247-07',
      tier: 'standard',
      config: {
        ...defaultConfig,
        profile: 'strict',
        gates: { sealed: [], evidenceFloor: 'unverified' },
      },
    });
    constructed.codeReviewFindingsOverride = {
      'src/foo.ts': [mkFinding('console.log left in source', 'high')],
    };

    const fixedNow = '2026-04-04T10:20:30.000Z';
    const phaseDir = join(root, '.cadence/phases/247-07-sibling-failure');
    // Force the sibling write to throw: pre-create a DIRECTORY at the exact
    // sibling .json path settle will try to atomically write to — renaming a
    // temp file onto an existing directory throws EISDIR (same fault-
    // injection idiom as the '242-12-routing-failure' test above; the fixed
    // `now()` clock seam from T2 makes the sibling's exact path predictable).
    await mkdir(
      join(phaseDir, `${refusedSnapshotArtifactBase('247-07', fixedNow)}.json`),
      { recursive: true },
    );

    const { io, err } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, now: () => fixedNow },
      io,
    );

    // The canonical write already happened before the sibling write was
    // attempted — a sibling-write failure must never change the outcome.
    expect(res.exitCode).toBe(1);
    expect(err.join('')).toMatch(/note: refused-settle sibling snapshot failed to write —/);

    const summaryPath = join(phaseDir, '247-07-SUMMARY.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;
    expect(summary.codeReview?.['src/foo.ts']).toHaveLength(1);
    expect(summary.contentHash?.value).toBeTruthy();
  });
});

describe('settleService sibling snapshots are distinct across repeated attempts and invisible to SUMMARY discovery (phase 247, T4)', () => {
  it('247-01/AC-3: two refused attempts for the same draft, at different injected timestamps, produce two distinct siblings — neither overwrites the other', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '247-08-multi-attempt',
      id: '247-08',
      tier: 'standard',
      config: {
        ...defaultConfig,
        profile: 'strict',
        gates: { sealed: [], evidenceFloor: 'unverified' },
      },
    });
    constructed.codeReviewFindingsOverride = {
      'src/foo.ts': [mkFinding('console.log left in source', 'high')],
    };

    const phaseDir = join(root, '.cadence/phases/247-08-multi-attempt');
    const firstNow = '2026-05-01T00:00:00.000Z';
    const secondNow = '2026-05-01T00:05:00.000Z';

    const attempt1 = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, now: () => firstNow },
      captureIO().io,
    );
    expect(attempt1.exitCode).toBe(1);

    const attempt2 = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, now: () => secondNow },
      captureIO().io,
    );
    expect(attempt2.exitCode).toBe(1);

    const firstSiblingPath = join(phaseDir, `${refusedSnapshotArtifactBase('247-08', firstNow)}.json`);
    const secondSiblingPath = join(phaseDir, `${refusedSnapshotArtifactBase('247-08', secondNow)}.json`);

    // Both attempts' siblings survive on disk — attempt 2 never overwrites
    // attempt 1's forensic record.
    expect(existsSync(firstSiblingPath)).toBe(true);
    expect(existsSync(secondSiblingPath)).toBe(true);
    expect(firstSiblingPath).not.toBe(secondSiblingPath);

    const firstSibling = JSON.parse(await readFile(firstSiblingPath, 'utf8')) as Summary;
    const secondSibling = JSON.parse(await readFile(secondSiblingPath, 'utf8')) as Summary;
    expect(firstSibling.completedAt).toBe(firstNow);
    expect(secondSibling.completedAt).toBe(secondNow);

    // The canonical SUMMARY.json reflects only the latest (2nd) attempt —
    // existing overwrite-on-reloop behavior is unchanged by sibling writes.
    const canonicalSummary = JSON.parse(
      await readFile(join(phaseDir, '247-08-SUMMARY.json'), 'utf8'),
    ) as Summary;
    expect(canonicalSummary.completedAt).toBe(secondNow);
  });

  it('247-01/AC-2: the sibling filename is invisible to mcp/resources.ts\'s SUMMARY discovery, even when it would sort after the canonical file', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence/phases/247-09-mcp-discovery');
    await mkdir(phaseDir, { recursive: true });
    const canonical = { draftId: '247-09', schemaVersion: 2 };
    await writeFile(join(phaseDir, '247-09-SUMMARY.json'), JSON.stringify(canonical));
    // Deliberately a DIFFERENT payload, and a name that sorts AFTER the
    // canonical file's ('S' < 'r' in ASCII, so '...-refused-...' sorts
    // later than '...-SUMMARY.json') — proving resources.ts's
    // `.sort().at(-1)` never gets a chance to pick this one, because
    // `endsWith('-SUMMARY.json')` excludes it from the candidate set
    // entirely (it ends in `-SUMMARY-snapshot.json`, not `-SUMMARY.json`).
    const sibling = { draftId: '247-09', schemaVersion: 2, decoy: true };
    const siblingName = `${refusedSnapshotArtifactBase('247-09', '2026-05-01T00:05:00.000Z')}.json`;
    await writeFile(join(phaseDir, siblingName), JSON.stringify(sibling));

    const server = buildCadenceMcpServer(root, '1.16.0-test');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    try {
      const res = await client.readResource({ uri: 'cadence://phase/247-09-mcp-discovery/summary.json' });
      const text = (res.contents[0] as { text?: string }).text ?? '';
      expect(JSON.parse(text)).toEqual(canonical);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('247-01/AC-2: the sibling filename never matches diff-strict.ts\'s SUMMARY_PATH_RE / git pathspec discovery', async () => {
    const fx = await tempRepo();
    try {
      runGit(fx.root, ['init', '-q']);
      runGit(fx.root, ['config', 'user.email', 'test@example.com']);
      runGit(fx.root, ['config', 'user.name', 'Test']);
      await writeFile(join(fx.root, 'README.md'), '# test\n');
      runGit(fx.root, ['add', '-A']);
      runGit(fx.root, ['commit', '-q', '-m', 'base']);
      const baseSha = runGit(fx.root, ['rev-parse', 'HEAD']).trim();

      const phaseDir = join(fx.root, '.cadence', 'phases', '247-10-diff-strict');
      await mkdir(phaseDir, { recursive: true });
      // Only the sibling snapshot changes — no genuine SUMMARY.json change.
      const siblingName = `${refusedSnapshotArtifactBase('247-10', '2026-05-01T00:05:00.000Z')}.json`;
      await writeFile(join(phaseDir, siblingName), '{}');
      runGit(fx.root, ['add', '-A']);
      runGit(fx.root, ['commit', '-q', '-m', 'add sibling snapshot only']);

      const result = discoverChangedPhases(fx.root, baseSha);
      expect(result).toEqual([]);
    } finally {
      await fx.cleanup();
    }
  });
});

describe('settleService captures a stateAtSettle snapshot in SUMMARY (issue #177, phase 196 T3)', () => {
  it('AC-4: SUMMARY.json contains stateAtSettle reflecting loop state as of immediately before the reset to IDLE', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '54-state-at-settle',
      id: '54-01',
      tier: 'standard',
      // Phase 214 (T4): see the '51-code-review-verifier-cwd' comment above —
      // this fixture has no real AC-1 coverage and predates evidence-floor.
      config: { ...defaultConfig, gates: { sealed: [], evidenceFloor: 'unverified' } },
    });

    // Overwrite the fixture's default state with a distinguishable
    // pre-settle revision + subagentSpawns counter so the assertion below
    // proves the snapshot was captured BEFORE settle's reset-to-IDLE block
    // zeroes/nulls the loop-position fields, not from some post-reset value.
    const statePath = join(root, '.cadence', 'state.json');
    const preSettleState = JSON.parse(await readFile(statePath, 'utf8'));
    preSettleState.revision = 7;
    preSettleState.session.subagentSpawns = 3;
    await writeFile(statePath, JSON.stringify(preSettleState, null, 2));

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);

    const summaryPath = join(
      root, '.cadence', 'phases', '54-state-at-settle', '54-01-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as {
      stateAtSettle?: {
        loopPositionBeforeSettle: string;
        revision: number;
        sessionSubagentSpawns: number;
      };
    };

    expect(summary.stateAtSettle).toEqual({
      loopPositionBeforeSettle: 'BUILD',
      revision: 7,
      sessionSubagentSpawns: 3,
    });

    // The reset-to-IDLE block still ran normally — the snapshot is a copy,
    // not a redirect of the reset itself.
    const stateRaw = await readFile(statePath, 'utf8');
    const stateAfter = JSON.parse(stateRaw) as { loopPosition: string };
    expect(stateAfter.loopPosition).toBe('IDLE');
  });

  it('AC-4: SUMMARY.md renders a State at settle section with the snapshot fields', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '55-state-at-settle-md',
      id: '55-01',
      tier: 'standard',
      // Phase 214 (T4): see the '51-code-review-verifier-cwd' comment above —
      // this fixture has no real AC-1 coverage and predates evidence-floor.
      config: { ...defaultConfig, gates: { sealed: [], evidenceFloor: 'unverified' } },
    });

    const statePath = join(root, '.cadence', 'state.json');
    const preSettleState = JSON.parse(await readFile(statePath, 'utf8'));
    preSettleState.revision = 2;
    preSettleState.session.subagentSpawns = 5;
    await writeFile(statePath, JSON.stringify(preSettleState, null, 2));

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);

    const summaryMdPath = join(
      root, '.cadence', 'phases', '55-state-at-settle-md', '55-01-SUMMARY.md',
    );
    const mdRaw = await readFile(summaryMdPath, 'utf8');

    expect(mdRaw).toContain('## State at settle');
    expect(mdRaw).toContain('loop position before settle: BUILD');
    expect(mdRaw).toContain('- revision: 2');
    expect(mdRaw).toContain('- session subagent spawns: 5');
  });
});

describe('settleService computes a settle-time contentHash over SUMMARY (phase 223, T2)', () => {
  it('AC-1: SUMMARY.json carries a contentHash that an independent recomputation via computeSummaryContentHash matches, and SUMMARY.md renders it', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '223-01-content-hash',
      id: '223-01',
      tier: 'standard',
      // Phase 214 (T4): see the '51-code-review-verifier-cwd' comment above —
      // this fixture has no real AC-1 coverage and predates evidence-floor.
      config: { ...defaultConfig, gates: { sealed: [], evidenceFloor: 'unverified' } },
    });

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);

    const summaryPath = join(
      root, '.cadence', 'phases', '223-01-content-hash', '223-01-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    expect(summary.contentHash).toBeDefined();
    expect(summary.contentHash?.algorithm).toBe('sha256');
    expect(summary.contentHash?.value).toMatch(/^[0-9a-f]{64}$/);

    // Independent recomputation from the SUMMARY.json's own other fields,
    // via the SAME exported function T3's verify command will reuse — proves
    // the stored hash genuinely reflects the settled content rather than
    // being some unrelated/stubbed value.
    const recomputed = computeSummaryContentHash(summary);
    expect(recomputed.value).toBe(summary.contentHash?.value);
    expect(recomputed.algorithm).toBe('sha256');

    const summaryMdPath = join(
      root, '.cadence', 'phases', '223-01-content-hash', '223-01-SUMMARY.md',
    );
    const mdRaw = await readFile(summaryMdPath, 'utf8');
    // The full digest (or a visible prefix of it) must appear somewhere in
    // the human-facing render — proven against a real prefix, not just "some
    // string exists".
    expect(mdRaw).toContain(summary.contentHash!.value.slice(0, 12));
  });

  it("AC-1: two structurally-identical summaries with different key insertion order hash the same (canonicalStringify is order-independent)", () => {
    const a = { z: 1, nested: { y: 2, x: 1 }, list: [{ b: 2, a: 1 }, 3] };
    const b = { nested: { x: 1, y: 2 }, z: 1, list: [{ a: 1, b: 2 }, 3] };

    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it('AC-1: computeSummaryContentHash excludes any existing contentHash field from its own digest (no self-reference)', () => {
    const base: Summary = {
      schemaVersion: 1,
      draftId: '223-01',
      completedAt: '2026-07-25T00:00:00.000Z',
      acResults: [],
      taskResults: [],
      decisions: [],
      deferred: [],
      skillAudit: { required: [], invoked: [] },
    };

    const withStaleHash: Summary = {
      ...base,
      contentHash: { algorithm: 'sha256', value: 'f'.repeat(64) },
    };

    expect(computeSummaryContentHash(base).value).toBe(
      computeSummaryContentHash(withStaleHash).value,
    );
  });
});

describe('settleService writes schemaVersion 2 on the persisted SUMMARY (phase 232, T4)', () => {
  it('AC-3: a full settle run persists SUMMARY.json with schemaVersion 2', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '232-01-schema-version',
      id: '232-01',
      tier: 'standard',
      // Phase 214 (T4): see the '51-code-review-verifier-cwd' comment above —
      // this fixture has no real AC-1 coverage and predates evidence-floor.
      config: { ...defaultConfig, gates: { sealed: [], evidenceFloor: 'unverified' } },
    });

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);

    const summaryPath = join(
      root, '.cadence', 'phases', '232-01-schema-version', '232-01-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    expect(summary.schemaVersion).toBe(2);
  });
});

describe('settleService computes and attaches an assurance record on SUMMARY (phase 233, T3)', () => {
  it('AC-1: a full auto settle run persists a SUMMARY with a populated assurance record (verifierRollup/evidenceTally/overall all present)', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '233-01-assurance-record',
      id: '233-01',
      tier: 'standard',
      // Phase 214 (T4): see the '51-code-review-verifier-cwd' comment above —
      // this fixture has no real AC-1 coverage and predates evidence-floor.
      config: { ...defaultConfig, gates: { sealed: [], evidenceFloor: 'unverified' } },
    });

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);

    const summaryPath = join(
      root, '.cadence', 'phases', '233-01-assurance-record', '233-01-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    // verifierRollup/evidenceTally/overall must all be present — the whole
    // point of T2's deriveAssuranceRecord being wired up rather than merely
    // available.
    expect(summary.assurance).toBeDefined();
    expect(Array.isArray(summary.assurance?.verifierRollup)).toBe(true);
    expect(summary.assurance?.evidenceTally).toBeDefined();
    expect(
      Object.keys(summary.assurance?.evidenceTally ?? {}).sort(),
    ).toEqual(['ai-verified', 'assertion', 'executed', 'mention', 'unverified'].sort());
    expect(['strong', 'mixed', 'weak', 'unverified']).toContain(summary.assurance?.overall);
  });

  it('AC-4: the PASS outcome and every gate verdict are unchanged by attaching the assurance record', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '233-02-assurance-pass',
      id: '233-02',
      tier: 'standard',
      config: { ...defaultConfig, gates: { sealed: [], evidenceFloor: 'unverified' } },
    });

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    // Same pass-path outcome the '232-01-schema-version' fixture above
    // already proves: exit 0, every gate ran/skipped (never refused), every
    // AC passed. Asserted again here, alongside the now-attached assurance
    // record, to prove the new step never touches the decision path.
    expect(res.exitCode).toBe(0);

    const summaryPath = join(
      root, '.cadence', 'phases', '233-02-assurance-pass', '233-02-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    expect(summary.gates?.length).toBeGreaterThan(0);
    expect(summary.gates?.every((g) => g.status === 'ran' || g.status === 'skipped')).toBe(true);
    expect(summary.acResults.length).toBeGreaterThan(0);
    expect(summary.acResults.every((a) => a.pass)).toBe(true);
    // Reported alongside, never in place of, the real decision.
    expect(summary.assurance).toBeDefined();
  });

  it('AC-4: the REFUSE outcome and every gate verdict are unchanged by attaching the assurance record', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '233-03-assurance-refuse',
      id: '233-03',
      tier: 'standard',
      config: {
        ...defaultConfig,
        verification: {
          ...defaultConfig.verification,
          testCommand: 'node -e "process.exit(1)"',
        },
      },
    });

    const { io, err } = captureIO();
    const res = await settleService(root, {}, io);

    // Identical refusal shape to the '53-refused-settle-summary' fixture
    // above (phase 170, T4): exit 1, build-test-must-pass refused, loop
    // state left in BUILD. Re-asserted here to prove the same refusal
    // fires byte-for-byte even though this settle now also computes and
    // attaches an assurance record before the SUMMARY write.
    expect(res.exitCode).toBe(1);
    expect(err.join('')).toContain('build-test-must-pass:');

    const summaryPath = join(
      root, '.cadence', 'phases', '233-03-assurance-refuse', '233-03-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    expect(summary.acResults).toEqual([]);
    const lastGate = summary.gates?.[summary.gates.length - 1];
    expect(lastGate?.status).toBe('refused');
    expect(lastGate?.gate).toBe('build-test-must-pass');

    const stateRaw = await readFile(join(root, '.cadence', 'state.json'), 'utf8');
    const state = JSON.parse(stateRaw) as { loopPosition: string; activeDraft: string | null };
    expect(state.loopPosition).toBe('BUILD');
    expect(state.activeDraft).toBe('233-03');

    // The refusal path also carries an assurance record now (computed from
    // the empty acResults + whatever gate provenance existed before the
    // halt) — but it is purely reported: it never influenced the refusal
    // decided above it.
    expect(summary.assurance).toBeDefined();
    expect(
      Object.values(summary.assurance?.evidenceTally ?? {}).every((v) => v === 0),
    ).toBe(true);
  });
});

describe('settleService surfaces the assurance record in the rendered SUMMARY.md (phase 233, T4)', () => {
  it('renders an Assurance section with the overall label and evidence tally', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '233-04-assurance-render',
      id: '233-04',
      tier: 'standard',
      config: { ...defaultConfig, gates: { sealed: [], evidenceFloor: 'unverified' } },
    });

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );
    expect(res.exitCode).toBe(0);

    const summaryPath = join(
      root, '.cadence', 'phases', '233-04-assurance-render', '233-04-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;
    expect(summary.assurance).toBeDefined();

    const mdPath = join(
      root, '.cadence', 'phases', '233-04-assurance-render', '233-04-SUMMARY.md',
    );
    const md = await readFile(mdPath, 'utf8');

    // Human-readable surfacing: a labeled section carrying the `overall`
    // rollup, not just the machine-readable SUMMARY.json.
    expect(md).toContain('## Assurance');
    expect(md).toContain(`overall: ${summary.assurance?.overall}`);
  });
});

/**
 * Phase 214 (T4): a two-AC, two-task DRAFT/PROGRESS fixture, both tasks DONE
 * so `--auto` derives both ACs as `pass`. Neither AC has any real test
 * coverage matching `verification.testGlobs` (the temp repo has no
 * `packages/` dir) and no `--deep` run, so `deriveAcEvidence` reports both as
 * `'unverified'` — the weakest rung, below every non-default floor. That
 * makes this fixture the natural refusal case for the evidence-floor gate
 * without needing to fake coverage or a deep-verify pass.
 */
function twoAcDraftMd(phase: string, id: string): string {
  return `---
phase: ${phase}
id: ${id}
tier: standard
status: APPROVED
---

# ${id} — evidence floor fixture

## Objective

Prove the evidence-floor gate refuses/bypasses per-AC.

## Acceptance Criteria

### AC-1: first behavior
Given a precondition
When an action
Then an observable outcome

### AC-2: second behavior
Given a precondition
When an action
Then an observable outcome

## Tasks

### T1: do the first thing
- files: \`src/foo.ts\`
- action: do it
- verify: it works
- done: AC-1

### T2: do the second thing
- files: \`src/bar.ts\`
- action: do it
- verify: it works
- done: AC-2

## Boundaries

- none
`;
}

async function setupTwoAcBuildRepo(args: {
  root: string;
  phase: string;
  id: string;
  config: CadenceConfig;
}): Promise<void> {
  const { root, phase, id, config } = args;
  const phaseDir = join(root, '.cadence', 'phases', phase);
  await mkdir(phaseDir, { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'foo.ts'), 'export const x = 1;\n', 'utf8');
  await writeFile(join(root, 'src', 'bar.ts'), 'export const y = 1;\n', 'utf8');
  await writeFile(join(root, '.cadence', 'config.json'), JSON.stringify(config, null, 2));
  const state = {
    ...emptyState('settle-evidence-floor'),
    loopPosition: 'BUILD' as const,
    activePhase: phase,
    activeDraft: id,
  };
  await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));
  await writeFile(join(phaseDir, `${id}-DRAFT.md`), twoAcDraftMd(phase, id));
  await writeFile(
    join(phaseDir, `${id}-PROGRESS.json`),
    JSON.stringify(
      { draftId: id, tasks: { T1: { status: 'DONE' }, T2: { status: 'DONE' } } },
      null,
      2,
    ),
  );
}

describe('settleService enforces gates.evidenceFloor (phase 214, T4)', () => {
  it('214-01/AC-4 + 214-01/AC-1 + 249-01/AC-4: refuses cadence settle run --auto when an AC PASS verdict rests on evidence below the effective floor, and (phase 249) the refused SUMMARY now records gates provenance + empty acResults instead of being withheld', async () => {
    root = await mktemp();
    await setupTwoAcBuildRepo({
      root,
      phase: '214-01-evidence-floor-refuse',
      id: '214-01',
      config: {
        ...defaultConfig,
        // Both ACs derive 'unverified' evidence (no coverage, no deep-verify)
        // — 'assertion' floor refuses both.
        gates: { sealed: [], evidenceFloor: 'assertion' },
      },
    });

    const { io, err } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(1);
    const errText = err.join('');
    expect(errText).toContain('evidence-floor');
    expect(errText).toContain('AC-1');
    expect(errText).toContain('AC-2');

    // Refused before the loop transitioned — state stays in BUILD.
    const stateRaw = await readFile(join(root, '.cadence', 'state.json'), 'utf8');
    const state = JSON.parse(stateRaw) as { loopPosition: string; activeDraft: string | null };
    expect(state.loopPosition).toBe('BUILD');
    expect(state.activeDraft).toBe('214-01');

    // Phase 249 (AC-2/AC-4): evidence-floor is now one of the in-scope
    // post-gate refusal families routed through writeRefusedSettleSummary —
    // a refused SUMMARY is written (not withheld) with the same shape the
    // gate-loop refusal family (phase 170/247) already produces:
    // acResults: [] (nothing synthesized) and gates[] provenance present.
    const summaryPath = join(
      root, '.cadence', 'phases', '214-01-evidence-floor-refuse', '214-01-SUMMARY.json',
    );
    expect(existsSync(summaryPath)).toBe(true);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;
    expect(summary.acResults).toEqual([]);
    expect(summary.gates?.length ?? 0).toBeGreaterThan(0);
    expect(summary.gates?.every((g) => g.status === 'ran' || g.status === 'skipped')).toBe(true);
    // This SUMMARY reflects THIS refusal's draft/progress, not a stale
    // artifact — draftId matches, and both tasks' real DONE build records
    // (set by setupTwoAcBuildRepo) round-trip through buildTaskResults.
    expect(summary.draftId).toBe('214-01');
    expect(summary.taskResults).toEqual([
      { id: 'T1', status: 'DONE', notes: '' },
      { id: 'T2', status: 'DONE', notes: '' },
    ]);
  });

  it('AC-3: refuses with the structural ai-verified/mock-provider reason, not the generic below-floor message, when floor=ai-verified under the default mock provider', async () => {
    root = await mktemp();
    await setupTwoAcBuildRepo({
      root,
      phase: '214-05-evidence-floor-ai-verified-mock',
      id: '214-05',
      config: {
        ...defaultConfig,
        // Explicit override -- no preset defaults to 'ai-verified'. Default
        // verifier.provider is 'mock', under which deriveAcEvidence never
        // returns 'ai-verified' (Phase 140), so this floor is structurally
        // unreachable and the refusal must say so, not just "below floor".
        gates: { sealed: [], evidenceFloor: 'ai-verified' },
      },
    });

    const { io, err } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(1);
    const errText = err.join('');
    expect(errText).toContain('unreachable while the deep-verify provider is `mock`');
    expect(errText).toContain('cadence activate');
    // The generic below-floor phrasing must NOT be the message shown here --
    // that would be AC-3 regressing to the case it exists to distinguish.
    expect(errText).not.toContain('Strengthen the evidence');
  });

  it('AC-4: a per-AC --evidence-floor-bypass exempts only the named AC — a second AC still below floor without a bypass still refuses', async () => {
    root = await mktemp();
    await setupTwoAcBuildRepo({
      root,
      phase: '214-02-evidence-floor-partial-bypass',
      id: '214-02',
      config: {
        ...defaultConfig,
        gates: { sealed: [], evidenceFloor: 'assertion' },
      },
    });

    const { io, err } = captureIO();
    const res = await settleService(
      root,
      {
        auto: true,
        interactive: false,
        allowMissingCoverage: true,
        force: true,
        evidenceFloorBypass: ['AC-1:reviewed manually, coverage backfill tracked separately'],
      },
      io,
    );

    // AC-1 is bypassed but AC-2 is not — still refuses, and names AC-2 (not
    // AC-1) as the remaining offender, proving the bypass is strictly per-AC.
    expect(res.exitCode).toBe(1);
    const errText = err.join('');
    expect(errText).toContain('AC-2');
    expect(errText).not.toContain('AC-1 is');
  });

  it('AC-4: settle succeeds once every below-floor AC has a bypass, and the reason is recorded in SUMMARY.gateBypasses', async () => {
    root = await mktemp();
    await setupTwoAcBuildRepo({
      root,
      phase: '214-03-evidence-floor-full-bypass',
      id: '214-03',
      config: {
        ...defaultConfig,
        gates: { sealed: [], evidenceFloor: 'assertion' },
      },
    });

    const { io } = captureIO();
    const res = await settleService(
      root,
      {
        auto: true,
        interactive: false,
        allowMissingCoverage: true,
        force: true,
        evidenceFloorBypass: [
          'AC-1:reviewed manually, coverage backfill tracked separately',
          'AC-2:spike code, coverage ticket CAD-999',
        ],
      },
      io,
    );

    expect(res.exitCode).toBe(0);

    const summaryPath = join(
      root, '.cadence', 'phases', '214-03-evidence-floor-full-bypass', '214-03-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as {
      gateBypasses?: { gate: string; flag: string; reason: string; severity: string }[];
    };

    expect(summary.gateBypasses).toBeDefined();
    const ac1Bypass = summary.gateBypasses?.find((b) => b.gate.includes('AC-1'));
    const ac2Bypass = summary.gateBypasses?.find((b) => b.gate.includes('AC-2'));
    expect(ac1Bypass).toBeDefined();
    expect(ac1Bypass?.reason).toContain('reviewed manually, coverage backfill tracked separately');
    expect(ac1Bypass?.flag).toBe('--evidence-floor-bypass');
    expect(ac2Bypass).toBeDefined();
    expect(ac2Bypass?.reason).toContain('spike code, coverage ticket CAD-999');
  });

  it('rejects a malformed --evidence-floor-bypass entry missing a reason', async () => {
    root = await mktemp();
    await setupTwoAcBuildRepo({
      root,
      phase: '214-04-evidence-floor-bad-bypass',
      id: '214-04',
      config: {
        ...defaultConfig,
        gates: { sealed: [], evidenceFloor: 'assertion' },
      },
    });

    const { io, err } = captureIO();
    const res = await settleService(
      root,
      {
        auto: true,
        interactive: false,
        allowMissingCoverage: true,
        force: true,
        evidenceFloorBypass: ['AC-1:'],
      },
      io,
    );

    expect(res.exitCode).toBe(1);
    expect(err.join('')).toContain('--evidence-floor-bypass');
  });
});

/** Phase 242 (T3): a minimal code-review `Finding` for the mocked verifier's
 *  override — `id`/`anchor` are stamped for real by the code-review gate's
 *  own `anchorFindings`/`attachFindingIdentity` pipeline, not set here. */
function mkFinding(message: string, severity: Finding['severity'] = 'medium'): Finding {
  return { severity, message };
}

describe('settleService threads acc-accumulated findings into a newly-in-scope refusal family (phase 249, T5, AC-2)', () => {
  it('249-01/AC-2: an --allow-code-review-failure-bypassed HIGH code-review finding still records codeReview + a contentHash in a SUMMARY refused at evidence-floor (not the gate loop)', async () => {
    root = await mktemp();
    await setupTwoAcBuildRepo({
      root,
      phase: '249-05-findings-threading-evidence-floor',
      id: '249-05',
      config: {
        ...defaultConfig,
        // strict×standard's delta includes 'code-review' (engine.ts DELTAS),
        // matching the phase-247 fixture above. Both tasks are DONE (per
        // setupTwoAcBuildRepo) so the AC-derivation family never refuses
        // here — only evidence-floor does, since neither AC has coverage or
        // deep-verify evidence and the floor is raised to 'assertion'. This
        // deliberately proves AC-2's findings-threading claim on a family
        // OTHER than the gate-loop refusal phase 247 already covers.
        profile: 'strict',
        gates: { sealed: [], evidenceFloor: 'assertion' },
      },
    });
    constructed.codeReviewFindingsOverride = {
      'src/foo.ts': [mkFinding('console.log left in source', 'high')],
    };

    const { io, err } = captureIO();
    // --allow-code-review-failure (NOT --force): bypasses code-review's HIGH
    // finding specifically without also suppressing the AC-derivation
    // offender check (settle.ts's deriveSettleAcResults refuses on
    // `offenders.length > 0 && !opts.force` — using bare --force here would
    // make this indistinguishable from an AC-derivation-family test), so the
    // settle proceeds past code-review and is refused downstream, at
    // evidence-floor, instead.
    const res = await settleService(
      root,
      {
        auto: true,
        interactive: false,
        allowMissingCoverage: true,
        allowCodeReviewFailure: true,
      },
      io,
    );

    expect(res.exitCode).toBe(1);
    const errText = err.join('');
    // code-review bypassed (not refused) ...
    expect(errText).toContain(
      'code-review: --allow-code-review-failure set; proceeding past 1 HIGH finding(s).',
    );
    // ... and evidence-floor is what actually refused the settle.
    expect(errText).toContain('evidence-floor');
    expect(errText).toContain('AC-1');
    expect(errText).toContain('AC-2');

    const summaryPath = join(
      root, '.cadence/phases/249-05-findings-threading-evidence-floor/249-05-SUMMARY.json',
    );
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    // AC-3 invariant: nothing synthesized on a refusal.
    expect(summary.acResults).toEqual([]);
    // The gate loop itself completed cleanly — code-review "ran" via its own
    // bypass fall-through, never "refused" — so this refusal is
    // settleService's own evidence-floor check, downstream of the gate loop,
    // exactly per this phase's AC-2/AC-3.
    expect(summary.gates?.length ?? 0).toBeGreaterThan(0);
    expect(summary.gates?.every((g) => g.status === 'ran' || g.status === 'skipped')).toBe(true);
    // This SUMMARY reflects THIS refusal's draft/progress, not a stale
    // artifact — draftId matches, and both tasks' real DONE build records
    // (set by setupTwoAcBuildRepo) round-trip through buildTaskResults.
    expect(summary.draftId).toBe('249-05');
    expect(summary.taskResults).toEqual([
      { id: 'T1', status: 'DONE', notes: '' },
      { id: 'T2', status: 'DONE', notes: '' },
    ]);

    // AC-2's actual claim: the earlier-accumulated code-review finding
    // survives into this differently-shaped refusal, unmodified, with a
    // contentHash — identical treatment to the gate-loop refusal family
    // (phase 247, `codeReviewFindingsOverride` precedent above).
    expect(summary.codeReview?.['src/foo.ts']).toHaveLength(1);
    expect(summary.codeReview?.['src/foo.ts']?.[0]).toMatchObject({
      severity: 'high',
      message: 'console.log left in source',
    });
    expect(summary.contentHash?.algorithm).toBe('sha256');
    expect(summary.contentHash?.value).toMatch(/^[0-9a-f]{64}$/);
    const recomputed = computeSummaryContentHash(summary);
    expect(recomputed.value).toBe(summary.contentHash?.value);

    // Phase 247 (T3)'s additive per-attempt sibling snapshot fires on the
    // exact same hasCodeReviewFindings/hasSecurityAuditFindings condition
    // that gates contentHash above — this test is the only coverage of that
    // condition firing on a family OTHER than the gate loop, so pin it too.
    const snapshotBase = join(
      root, '.cadence/phases/249-05-findings-threading-evidence-floor',
      refusedSnapshotArtifactBase('249-05', summary.completedAt),
    );
    expect(existsSync(`${snapshotBase}.json`)).toBe(true);
    expect(existsSync(`${snapshotBase}.md`)).toBe(true);
  });
});

describe('settleService routes identified code-review findings into the recommendation ledger (phase 242, T3)', () => {
  async function readRecsFile(r: string): Promise<RecommendationLedger> {
    return JSON.parse(
      await readFile(join(r, '.cadence', 'intelligence', 'recommendations.json'), 'utf8'),
    ) as RecommendationLedger;
  }

  interface EvidenceFileRow {
    id: string;
    kind: string;
    summary: string;
    path?: string;
  }

  async function readEvidenceFile(r: string): Promise<{ evidence: EvidenceFileRow[] }> {
    return JSON.parse(
      await readFile(join(r, '.cadence', 'intelligence', 'evidence.json'), 'utf8'),
    ) as { evidence: EvidenceFileRow[] };
  }

  /** A full `Recommendation` shaped like a prior settle's routed-and-later-archived
   *  entry — used to prove AC-2's dedup check covers `ledger.archived`, not just
   *  the active `recommendations` array. */
  function archivedRoutedRec(id: string, sourceFindingId: string): Recommendation {
    return {
      id,
      title: 'a previously routed finding',
      summary: 'a previously routed finding, later archived',
      source: 'review',
      sourceFindingId,
      status: 'candidate',
      readiness: 'needs-decision',
      priority: 'medium',
      leverageScore: 5,
      riskScore: 5,
      confidence: 0.7,
      decayState: 'fresh',
      affectedAreas: [],
      affectedFiles: [],
      evidenceIds: [],
      assumptionIds: [],
      decisionIds: [],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      archivedAt: '2026-07-02T00:00:00.000Z',
      archiveReason: 'rejected',
    };
  }

  it('242-01/AC-1 + 242-01/AC-4: a settle with two routable findings creates a Recommendation+Evidence entry for each, sharing one scoutId', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '242-10-routing-basic',
      id: '242-10',
      tier: 'standard',
      config: { ...defaultConfig, profile: 'strict', gates: { sealed: [], evidenceFloor: 'unverified' } },
    });
    constructed.codeReviewFindingsOverride = {
      'src/foo.ts': [mkFinding('first routable finding'), mkFinding('second routable finding')],
    };

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );
    expect(res.exitCode).toBe(0);

    const recs = await readRecsFile(root);
    expect(recs.recommendations).toHaveLength(2);
    for (const rec of recs.recommendations) {
      expect(rec.source).toBe('review');
      // Never a fabricated/empty identity — every routed rec traces back to a
      // real Finding.id (the honest AC-3 claim reachable at this level: a
      // code-review finding always carries a stable id by construction, so
      // "excluded, not force-routed" is proven at T2's unit level instead —
      // see this file's own note in the final report).
      expect(rec.sourceFindingId).toBeTruthy();
    }
    const scoutIds = new Set(recs.recommendations.map((r) => r.scoutId));
    expect(scoutIds.size).toBe(1); // AC-4: one scoutId per batch, not one per finding

    const evidenceIds = recs.recommendations.flatMap((r) => r.evidenceIds);
    expect(evidenceIds).toHaveLength(2);
    const evidenceFile = await readEvidenceFile(root);
    const matching = evidenceFile.evidence.filter((e) => evidenceIds.includes(e.id));
    expect(matching).toHaveLength(2);

    // AC-1's evidence.summary clause has three required parts — phase id,
    // draftId, AND the SUMMARY contentHash. Read the real written SUMMARY so
    // this assertion would catch a regression to the `?? ''` fallback in
    // `finalizeAndCloseSettle` (contentHash is always set two lines before
    // that block runs, so the fallback is currently dead code — this pins it
    // staying dead rather than silently landing an empty hash in the ledger).
    const summaryPath = join(root, '.cadence/phases/242-10-routing-basic/242-10-SUMMARY.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;
    expect(summary.contentHash?.value).toBeTruthy();

    for (const ev of matching) {
      expect(ev.kind).toBe('cadence-artifact');
      expect(ev.path).toBe('.cadence/phases/242-10-routing-basic/242-10-SUMMARY.json');
      expect(ev.summary).toContain('242-10-routing-basic');
      expect(ev.summary).toContain('242-10');
      expect(ev.summary).toContain(summary.contentHash!.value);
    }
  });

  it('242-01/AC-2: re-settling an unchanged phase does not duplicate a ledger entry, even when the prior rec was already archived', async () => {
    const finding = mkFinding('duplicate-detection finding');
    const buildRepoConfig: CadenceConfig = {
      ...defaultConfig,
      profile: 'strict',
      gates: { sealed: [], evidenceFloor: 'unverified' },
    };

    // First settle: empty ledger, this finding routes fresh.
    const root1 = await mktemp();
    await setupBuildRepo({
      root: root1,
      phase: '242-11-dedup',
      id: '242-11',
      tier: 'standard',
      config: buildRepoConfig,
    });
    constructed.codeReviewFindingsOverride = { 'src/foo.ts': [finding] };
    const { io: io1 } = captureIO();
    const res1 = await settleService(
      root1,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io1,
    );
    expect(res1.exitCode).toBe(0);
    const recs1 = await readRecsFile(root1);
    expect(recs1.recommendations).toHaveLength(1);
    const capturedId = recs1.recommendations[0]?.sourceFindingId;
    expect(capturedId).toBeTruthy();
    await rm(root1, { recursive: true, force: true }).catch(() => {});

    // Second, independent settle of the identical phase/finding shape (same
    // file/message ⇒ the same Finding.id — computeFindingId hashes only
    // those two inputs; severity/anchor no longer participate) — but this
    // root pre-seeds the SAME finding id as an ARCHIVED rec, simulating a
    // prior settle whose routed rec was later soft-archived (autoArchive
    // defaults on) before this phase was ever re-settled. AC-2 requires
    // checking `archived`, not just the active `recommendations` array.
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '242-11-dedup',
      id: '242-11',
      tier: 'standard',
      config: buildRepoConfig,
    });
    const preseeded: RecommendationLedger = {
      schemaVersion: 1,
      recommendations: [],
      archived: [archivedRoutedRec('rec-20260101-001', capturedId as string)],
    };
    await mkdir(join(root, '.cadence', 'intelligence'), { recursive: true });
    await writeFile(
      join(root, '.cadence', 'intelligence', 'recommendations.json'),
      JSON.stringify(preseeded, null, 2),
    );
    constructed.codeReviewFindingsOverride = { 'src/foo.ts': [finding] };
    const { io: io2, err: err2 } = captureIO();
    const res2 = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io2,
    );
    expect(res2.exitCode).toBe(0);
    const recs2 = await readRecsFile(root);
    expect(recs2.recommendations).toHaveLength(0); // no NEW rec for the already-routed id
    expect(recs2.archived).toHaveLength(1); // the pre-seeded archived rec, untouched
    // Pins that the empty result above is a genuine dedup, not routing having
    // silently thrown (which would also leave recommendations at length 0).
    expect(err2.join('')).not.toContain('finding-ledger routing failed');
  });

  it('242-01/AC-5: a forced ledger-write failure still lets settle report its normal success outcome and prints the stderr notice', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '242-12-routing-failure',
      id: '242-12',
      tier: 'standard',
      config: { ...defaultConfig, profile: 'strict', gates: { sealed: [], evidenceFloor: 'unverified' } },
    });
    constructed.codeReviewFindingsOverride = { 'src/foo.ts': [mkFinding('will fail to route')] };
    // Force the ledger read AND write to throw regardless of whether
    // readLedger degrades malformed JSON gracefully: recommendations.json is
    // a DIRECTORY, not a file, so both `readFile` (readRecommendationLedger)
    // and the eventual write both throw EISDIR.
    await mkdir(join(root, '.cadence', 'intelligence', 'recommendations.json'), { recursive: true });

    const { io, err } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    expect(res.exitCode).toBe(0);
    expect(err.join('')).toMatch(/note: finding-ledger routing failed —/);

    const summaryPath = join(root, '.cadence/phases/242-12-routing-failure/242-12-SUMMARY.json');
    expect(existsSync(summaryPath)).toBe(true);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;
    expect(summary.contentHash).toBeDefined();
  });

  it('242-01: recommendations.autoRoute=false performs no routing even with a routable finding present', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '242-13-routing-off',
      id: '242-13',
      tier: 'standard',
      config: {
        ...defaultConfig,
        profile: 'strict',
        gates: { sealed: [], evidenceFloor: 'unverified' },
        recommendations: { ...defaultConfig.recommendations, autoRoute: false },
      },
    });
    // Pre-seed a ledger with one unrelated, pre-existing rec — discriminates
    // "routing genuinely didn't run" from "no ledger file happened to exist
    // yet", which the file's mere absence can't.
    const preseeded: RecommendationLedger = {
      schemaVersion: 1,
      recommendations: [
        {
          id: 'rec-20260101-001',
          title: 'unrelated pre-existing rec',
          summary: 'present before this settle runs',
          source: 'manual',
          status: 'candidate',
          readiness: 'raw-idea',
          priority: 'low',
          leverageScore: 5,
          riskScore: 5,
          confidence: 0.4,
          decayState: 'fresh',
          affectedAreas: [],
          affectedFiles: [],
          evidenceIds: [],
          assumptionIds: [],
          decisionIds: [],
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      archived: [],
    };
    await mkdir(join(root, '.cadence', 'intelligence'), { recursive: true });
    await writeFile(
      join(root, '.cadence', 'intelligence', 'recommendations.json'),
      JSON.stringify(preseeded, null, 2),
    );
    constructed.codeReviewFindingsOverride = { 'src/foo.ts': [mkFinding('should not route')] };

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );
    expect(res.exitCode).toBe(0);
    const recs = await readRecsFile(root);
    expect(recs.recommendations).toHaveLength(1); // only the pre-seeded one — nothing routed
    expect(recs.recommendations[0]?.id).toBe('rec-20260101-001');
  });

  it('242-01/AC-7: two findings that hash to the same identity in one settle route as a single merged Recommendation stating the occurrence count', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '242-14-routing-merge',
      id: '242-14',
      tier: 'standard',
      config: { ...defaultConfig, profile: 'strict', gates: { sealed: [], evidenceFloor: 'unverified' } },
    });
    // Same file + same message ⇒ computeFindingId hashes both to the
    // identical id (it never inputs severity, anchor, or line number) —
    // exactly the collision dec-20260731-001/rec-20260731-001 describes.
    const duplicateMessage = 'console.log left in source';
    constructed.codeReviewFindingsOverride = {
      'src/foo.ts': [mkFinding(duplicateMessage), mkFinding(duplicateMessage)],
    };

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );
    expect(res.exitCode).toBe(0);

    const recs = await readRecsFile(root);
    expect(recs.recommendations).toHaveLength(1); // merged into one, not two
    expect(recs.recommendations[0]?.summary).toContain('2 occurrences merged');
  });
});

describe('settleService: finding-ledger routing is additive-only to the settle gate sequence (phase 242, T3, AC-6)', () => {
  it('242-01/AC-6: the PASS outcome, full gate order, and every gate verdict are unchanged by the new routing step', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '242-20-gate-regression-pass',
      id: '242-20',
      tier: 'standard',
      config: { ...defaultConfig, gates: { sealed: [], evidenceFloor: 'unverified' } },
    });

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );
    expect(res.exitCode).toBe(0);

    const summaryPath = join(root, '.cadence/phases/242-20-gate-regression-pass/242-20-SUMMARY.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    // Every GATE_ORDER entry present, in order, either ran or skipped —
    // identical to the pre-242 shape (phase 233's own AC-4 precedent) since
    // routing is wired strictly after this array is finalized.
    expect(summary.gates?.map((g) => g.gate)).toEqual(GATE_ORDER);
    expect(summary.gates?.every((g) => g.status === 'ran' || g.status === 'skipped')).toBe(true);
    expect(summary.acResults.length).toBeGreaterThan(0);
    expect(summary.acResults.every((a) => a.pass)).toBe(true);
    // 'auto' profile (default) never puts code-review in the gate set, so
    // routing never even attempts a ledger read/write here.
    expect(existsSync(join(root, '.cadence', 'intelligence', 'recommendations.json'))).toBe(false);
  });

  it('242-01/AC-6: the REFUSE outcome, gate order up to the refusal, and the refusal reason are unchanged — routing never runs on a refused settle', async () => {
    root = await mktemp();
    await setupBuildRepo({
      root,
      phase: '242-21-gate-regression-refuse',
      id: '242-21',
      tier: 'standard',
      config: {
        ...defaultConfig,
        verification: { ...defaultConfig.verification, testCommand: 'node -e "process.exit(1)"' },
      },
    });
    // A routable finding is present in the mocked verifier's return value,
    // but must never reach the routing step: `finalizeAndCloseSettle` — the
    // function the routing step lives in — is downstream of every refusal by
    // construction (a refused settle returns via `writeRefusedSettleSummary`
    // and never reaches it at all).
    constructed.codeReviewFindingsOverride = { 'src/foo.ts': [mkFinding('unreachable finding')] };

    const { io, err } = captureIO();
    const res = await settleService(root, {}, io);

    // Identical refusal shape to the phase 233 AC-4 REFUSE fixture: exit 1,
    // build-test-must-pass refused, loop state left in BUILD.
    expect(res.exitCode).toBe(1);
    expect(err.join('')).toContain('build-test-must-pass:');

    const summaryPath = join(root, '.cadence/phases/242-21-gate-regression-refuse/242-21-SUMMARY.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Summary;

    expect(summary.acResults).toEqual([]);
    const gateNames = summary.gates?.map((g) => g.gate) ?? [];
    const lastGate = summary.gates?.[summary.gates.length - 1];
    expect(lastGate?.status).toBe('refused');
    expect(lastGate?.gate).toBe('build-test-must-pass');
    // Prefix of GATE_ORDER, byte-for-byte, up to (and including) the
    // refusing gate — proves order is unchanged, not just the final verdict.
    expect(gateNames).toEqual(GATE_ORDER.slice(0, gateNames.length));

    // Routing never fired: no ledger file, and no failure notice either (the
    // absence of BOTH is what proves the block was never reached at all,
    // rather than reached-and-silently-skipped).
    expect(existsSync(join(root, '.cadence', 'intelligence', 'recommendations.json'))).toBe(false);
    expect(err.join('')).not.toContain('note: finding-ledger routing failed');
  });
});
