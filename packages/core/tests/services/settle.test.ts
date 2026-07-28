import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultConfig,
  emptyState,
  type CadenceConfig,
  type Summary,
} from '@manehorizons/cadence-types';
import type { CommandIO } from '../../src/services/io.js';
import { computeSummaryContentHash, canonicalStringify } from '../../src/services/summary-hash.js';

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
        verify: async () => ({ findings: {}, provider: real.name }),
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
          return { findings: [], provider: real.name };
        },
      };
    },
  };
});

const { settleService } = await import('../../src/services/settle.js');

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
  it('AC-4/AC-1: refuses cadence settle run --auto when an AC PASS verdict rests on evidence below the effective floor', async () => {
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

    // Refused before the loop transitioned — state stays in BUILD, no
    // SUMMARY promising a settle that didn't happen.
    const stateRaw = await readFile(join(root, '.cadence', 'state.json'), 'utf8');
    const state = JSON.parse(stateRaw) as { loopPosition: string; activeDraft: string | null };
    expect(state.loopPosition).toBe('BUILD');
    expect(state.activeDraft).toBe('214-01');
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
