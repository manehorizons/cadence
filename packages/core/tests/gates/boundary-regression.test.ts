/**
 * Phase 234 (T5): regression pins for the kernel/verifier/consumer-boundary
 * refactor (`packages/core/src/contracts/index.ts`'s `VerifierPort<I, R>`,
 * the type-only restatement of the three settle-side gate port interfaces,
 * and the four type-only import repoints in `gates/interactive.ts`,
 * `gates/deep-verify.ts`, `services/settle.ts`, and
 * `notify/code-review.ts`). That refactor was intended to be entirely
 * behavior-preserving — this suite pins the two claims mechanically:
 *
 *  - AC-4: `GATE_ORDER`'s content/order is unchanged (see also
 *    `registry.test.ts`'s own AC-4 describe block) AND a real settle run
 *    through every one of the ten `GATE_ORDER` gates, driven by the actual
 *    production `GATE_REGISTRY` (not a stub), produces the same
 *    pass/refuse outcome per gate that it did before the refactor.
 *  - AC-5: every real settled `SUMMARY.json` already committed under
 *    `.cadence/phases/**` (spanning both `schemaVersion` 1 and the
 *    `schemaVersion` 2 introduced in phase 232) still parses against the
 *    current `SummaryZ`, and re-settling an unchanged phase — run twice
 *    from byte-identical inputs, and separately re-derived from committed
 *    artifacts via `cadence verify phase` — yields an equivalent verdict.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { SummaryZ } from '@thomas-powers-jr/cadence-types';
import { runVerifyPhase } from '../../src/services/verify.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(HERE, '..', '..', 'dist', 'cli', 'index.js');
// tests/gates -> tests -> core -> packages -> repo root.
const REPO_ROOT = join(HERE, '..', '..', '..', '..');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ANTHROPIC_API_KEY: '' };
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd, env });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
let active2: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
  if (active2) {
    await active2.cleanup();
    active2 = null;
  }
});

// ---------------------------------------------------------------------------
// AC-5: the existing settled SUMMARY corpus still parses.
// ---------------------------------------------------------------------------

async function findSummaryFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findSummaryFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('-SUMMARY.json')) {
      out.push(full);
    }
  }
  return out;
}

describe('AC-5: existing settled SUMMARY corpus still parses', () => {
  it('every real settled SUMMARY.json committed under .cadence/phases/** still parses against SummaryZ (AC-5)', async () => {
    const phasesDir = join(REPO_ROOT, '.cadence', 'phases');
    const files = await findSummaryFiles(phasesDir);
    // Sanity floor: this repo has settled 200+ phases by phase 234 — if this
    // comes back small or empty, the path resolution above is wrong, not the
    // corpus itself.
    expect(files.length).toBeGreaterThan(200);

    const failures: string[] = [];
    for (const file of files) {
      const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
      const result = SummaryZ.safeParse(raw);
      if (!result.success) {
        failures.push(`${file}: ${result.error.message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('both a real schemaVersion 1 record and the schemaVersion 2 record introduced in phase 232 parse cleanly (AC-5)', async () => {
    const v1Path = join(
      REPO_ROOT,
      '.cadence/phases/233-per-settle-assurance-record/233-01-SUMMARY.json',
    );
    const v2Path = join(
      REPO_ROOT,
      '.cadence/phases/232-gate-provenance-verifier-identity/232-01-SUMMARY.json',
    );

    const v1Result = SummaryZ.safeParse(JSON.parse(await readFile(v1Path, 'utf8')));
    const v2Result = SummaryZ.safeParse(JSON.parse(await readFile(v2Path, 'utf8')));

    expect(v1Result.success).toBe(true);
    expect(v1Result.success && v1Result.data.schemaVersion).toBe(1);
    expect(v2Result.success).toBe(true);
    expect(v2Result.success && v2Result.data.schemaVersion).toBe(2);
    // Both records still carry their full gate provenance array post-parse —
    // proves the parse round-trips real content, not just the version tag.
    expect(v1Result.success && v1Result.data.gates?.length).toBe(10);
    expect(v2Result.success && v2Result.data.gates?.length).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// AC-4 + AC-5: drive a real settle through all ten GATE_ORDER gates via the
// production GATE_REGISTRY (not a stub) with the mock verifier, and reuse
// that same recipe for re-settle equivalence.
// ---------------------------------------------------------------------------

const PHASE = '99-boundary-regression';
const NUM = '01';
const DRAFT_ID = '99-01';
const SUMMARY_REL = `.cadence/phases/${PHASE}/${DRAFT_ID}-SUMMARY.json`;
const APP_SRC = 'export const x = 1;\n';

async function initGitRepo(root: string): Promise<void> {
  execSync('git init -q', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
  await writeFile(join(root, '.gitignore'), '.cadence/state.json\n');
  execSync('git add .gitignore', { cwd: root, stdio: 'ignore' });
  execSync('git commit -q -m init', { cwd: root, stdio: 'ignore' });
}

/**
 * strict × complex activates every DELTAS-driven SettleGate
 * (draft-read, test-coverage, interactive-verdict, code-review,
 * security-audit, task-verify-required) on top of ALWAYS_FIRE's
 * structural-verifier + build-test-must-pass; boundaryEnforcement:'block'
 * self-guards boundary-scan into running; a real testCommand makes
 * build-test-must-pass actually run rather than skip for lack of one; --deep
 * on the settle invocation self-guards deep-verify into running. Together
 * this is the only combination that exercises all ten GATE_ORDER gates in a
 * single settle.
 */
async function configureFullGateSet(root: string): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.profile = 'strict';
  cfg.boundaryEnforcement = 'block';
  cfg.verification = { ...(cfg.verification ?? {}), testCommand: 'node -e "process.exit(0)"' };
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

/** Six stub tasks on src/app.ts, all done: AC-1; T1 also owns the coverage
 *  fixture file so boundary-scan doesn't flag it as an undeclared touch. */
async function writeSixTaskComplexDraft(root: string): Promise<void> {
  const tasks = [1, 2, 3, 4, 5, 6]
    .map((n) =>
      n === 1
        ? '### T1: stub 1\n- files: `src/app.ts`, `packages/core/tests/foo.test.ts`\n- action: stub\n- verify: stub\n- done: AC-1\n'
        : `### T${n}: stub ${n}\n- files: \`src/app.ts\`\n- action: stub\n- verify: stub\n- done: AC-1\n`,
    )
    .join('\n');
  const body = `---
phase: ${PHASE}
id: ${DRAFT_ID}
tier: complex
status: PENDING
---

# ${DRAFT_ID} — demo

## Objective

Ship a demonstrable thing.

## Acceptance Criteria

### AC-1: complete
Given a precondition
When an action
Then an outcome

## Tasks

${tasks}
## Boundaries

- DO NOT widen scope
`;
  await writeFile(join(root, `.cadence/phases/${PHASE}/${DRAFT_ID}-DRAFT.md`), body, 'utf8');
}

async function seedAcCoverage(root: string): Promise<void> {
  const p = join(root, 'packages/core/tests/foo.test.ts');
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, "it('AC-1 coverage fixture', () => { expect(true).toBe(true); });\n", 'utf8');
}

/** draft new + 6-task complex DRAFT + approve + clean src/app.ts + coverage
 *  fixture + all 6 tasks DONE + settle run with every self-guarded gate
 *  forced on (--deep) and no interactive prompt (--no-interactive). */
async function driveFullGateSettle(root: string): Promise<{ code: number; stderr: string }> {
  await initGitRepo(root);
  await configureFullGateSet(root);
  await run(['draft', 'new', PHASE, NUM, '--tier=complex'], root);
  await writeSixTaskComplexDraft(root);
  await run(['draft', 'approve', PHASE, NUM, '--no-approve'], root);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'app.ts'), APP_SRC);
  execSync('git add src/app.ts', { cwd: root, stdio: 'ignore' });
  await seedAcCoverage(root);
  for (const t of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']) {
    await run(['build', 'task', t, '--status=DONE', '--allow-per-task-failure'], root);
  }
  const settled = await run(
    ['settle', 'run', '--auto', '--no-interactive', '--allow-stale-draft', '--deep'],
    root,
  );
  return { code: settled.code, stderr: settled.stderr };
}

async function readSummary(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, SUMMARY_REL), 'utf8'));
}

describe(
  'AC-4: a real settle through all ten GATE_ORDER gates has unchanged pass/refuse outcomes',
  { timeout: process.platform === 'win32' ? 90_000 : 45_000 },
  () => {
    it('settles cleanly and every GATE_ORDER entry reports the same ran/skipped provenance as before the boundary refactor (AC-4)', async () => {
      active = await tempRepo({ initialized: true });
      const { code, stderr } = await driveFullGateSettle(active.root);
      expect(code).toBe(0);
      expect(stderr).not.toMatch(/refused/);

      const summary = await readSummary(active.root);
      // Full GATE_ORDER traversal via the REAL production GATE_REGISTRY —
      // nine gates ran for real (structural-verifier, boundary-scan,
      // task-verify-required, build-test-must-pass, test-coverage,
      // deep-verify, code-review, security-audit, draft-read);
      // interactive-verdict self-guards to skipped because --interactive was
      // never requested. This is the single settle configuration in the repo
      // that exercises every SettleGate member in one run.
      expect(summary.gates).toEqual([
        { gate: 'draft-read', status: 'ran' },
        { gate: 'structural-verifier', status: 'ran' },
        { gate: 'boundary-scan', status: 'ran' },
        { gate: 'task-verify-required', status: 'ran' },
        { gate: 'build-test-must-pass', status: 'ran' },
        { gate: 'test-coverage', status: 'ran' },
        {
          gate: 'interactive-verdict',
          status: 'skipped',
          skipReason: 'not requested (no --deep / --interactive, not in gate set)',
        },
        { gate: 'deep-verify', status: 'ran' },
        // Phase 267 (267-01, dec-20260809-004): the outcome is unchanged --
        // this is still a genuine mock-identified CLEAN PASS on both gates,
        // same as before this phase -- but the recorded status moved from
        // 'ran' to 'skipped' + a skipReason naming the abstention, since a
        // mock pass is no longer persisted as a real verification result
        // (registry.ts's new relabel branch). Not a regression: this is the
        // exact behavior change T2 implemented and this pin now reflects it.
        {
          gate: 'code-review',
          status: 'skipped',
          skipReason:
            'code-review: mock-identified clean pass abstained — the mock provider is not real verification, recorded as skipped rather than a persisted pass',
          provider: 'mock',
          providerSelection: 'configured',
        },
        {
          gate: 'security-audit',
          status: 'skipped',
          skipReason:
            'security-audit: mock-identified clean pass abstained — the mock provider is not real verification, recorded as skipped rather than a persisted pass',
          provider: 'mock',
          providerSelection: 'configured',
        },
      ]);
      expect(summary.acResults).toEqual([{ id: 'AC-1', pass: true, evidence: 'executed' }]);
    });
  },
);

describe(
  'AC-5: re-settling an unchanged phase yields an equivalent verdict',
  { timeout: process.platform === 'win32' ? 120_000 : 60_000 },
  () => {
    it('two independent settles of byte-identical inputs produce equivalent SUMMARY verdicts (AC-5)', async () => {
      active = await tempRepo({ initialized: true });
      active2 = await tempRepo({ initialized: true });

      const [first, second] = await Promise.all([
        driveFullGateSettle(active.root),
        driveFullGateSettle(active2.root),
      ]);
      expect(first.code).toBe(0);
      expect(second.code).toBe(0);

      const summaryA = await readSummary(active.root);
      const summaryB = await readSummary(active2.root);

      // completedAt (wall-clock) and contentHash (covers completedAt) are the
      // only fields a re-settle of unchanged inputs is expected to vary —
      // strip exactly those two before comparing, nothing else. Two settles
      // of byte-identical inputs landing in the same wall-clock tick (and
      // therefore hashing identically) is a legitimate, correct outcome —
      // not something this test should treat as a failure — so equivalence
      // is NOT proven by asserting the two timestamps/hashes differ.
      const strip = (s: Record<string, unknown>) => {
        const { completedAt: _completedAt, contentHash: _contentHash, ...rest } = s;
        return rest;
      };
      const strippedA = strip(summaryA);
      const strippedB = strip(summaryB);
      expect(strippedA).toEqual(strippedB);
      // Anti-vacuity: prove `strip()` actually did meaningful removal work —
      // deterministically, never relying on the two wall-clock timestamps
      // (or their hashes) happening to differ. Two halves:
      //  1. the field really existed, with a well-formed value, on BOTH raw
      //     summaries before stripping (something real was there to strip);
      //  2. the stripped object genuinely no longer carries that key (the
      //     strip really happened, it isn't a no-op that left it in place).
      // Together these hold regardless of whether the two settles'
      // completedAt/contentHash happened to collide under load — unlike a
      // "the two hashes differ" check, which is a false proxy: two
      // byte-identical settles landing in the same tick is a legitimate,
      // correct outcome, not a test failure.
      for (const summary of [summaryA, summaryB]) {
        expect(typeof summary.completedAt).toBe('string');
        expect(summary.completedAt as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        const contentHash = summary.contentHash as { algorithm: string; value: string };
        expect(typeof contentHash.value).toBe('string');
        expect((contentHash.value as string).length).toBeGreaterThan(0);
        expect(contentHash.algorithm).toBe('sha256');
      }
      for (const stripped of [strippedA, strippedB]) {
        expect('completedAt' in stripped).toBe(false);
        expect('contentHash' in stripped).toBe(false);
      }
    });

    it("cadence verify phase's state-independent re-derivation from committed artifacts agrees with the recorded settle verdict — no drift (AC-5)", async () => {
      active = await tempRepo({ initialized: true });
      const { code } = await driveFullGateSettle(active.root);
      expect(code).toBe(0);

      const out: string[] = [];
      const err: string[] = [];
      const io = { out: (s: string) => out.push(s), err: (s: string) => err.push(s) };
      const result = await runVerifyPhase(
        { cwd: active.root, phase: PHASE, num: NUM, testRun: false },
        io,
      );
      expect(result.exitCode).toBe(0);
      expect(out.join('')).toContain('no drift');

      const data = result.data as {
        results: {
          perAc: { id: string; recordedPass: boolean; recordedEvidence?: string; currentlyCovered: boolean; drift: boolean }[];
        }[];
      };
      expect(data.results[0]?.perAc).toEqual([
        { id: 'AC-1', recordedPass: true, recordedEvidence: 'executed', currentlyCovered: true, drift: false },
      ]);
    });
  },
);
