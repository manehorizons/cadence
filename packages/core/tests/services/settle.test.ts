import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState, type CadenceConfig } from '@manehorizons/cadence-types';
import type { CommandIO } from '../../src/services/io.js';

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
        verify: async () => ({ findings: [], provider: real.name }),
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
      config: { ...defaultConfig, profile: 'strict', codeReview: { provider: 'anthropic' } },
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
      config: {
        ...defaultConfig,
        profile: 'strict',
        securityAudit: { provider: 'anthropic' },
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
