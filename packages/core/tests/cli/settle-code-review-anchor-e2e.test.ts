import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { NO_TEST_COMMAND_NOTICE } from '@thomas-powers-jr/cadence-types';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

/**
 * Phase 241 (T3) — end-to-end reachability of the §7.1 anchor ladder's top
 * `executable` tier through a REAL settle, and its cap when the test gate
 * does not corroborate.
 *
 * Nothing here injects a test double: the real CLI is spawned against a real
 * `tempRepo`, a real DRAFT is scaffolded/approved, a real diff is staged, and
 * the persisted `SUMMARY.json` is the only observable. The `executable` tier
 * needs BOTH ladder conditions (`packages/core/src/verify/anchor.ts`): the AC
 * cited by a task with a non-empty `verify`, AND a `build-test-must-pass`
 * provenance entry with `status: 'ran'` — the second of which was
 * unreachable in production before T1+T2 wired `ctx.gateProvenance` through
 * to `gates/code-review.ts`.
 *
 * The `refused` half of AC-4's wording is deliberately NOT exercised: when
 * `build-test-must-pass` refuses, `runSettleGates` returns immediately, so
 * `code-review` (9th in `GATE_ORDER`, vs. the test gate's 5th) never runs and
 * no anchoring happens at all. Both asserted non-corroborating states are
 * therefore `skipped`: no test command configured, and a genuinely failing
 * test command waved through with `--allow-failing-build`.
 */

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
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
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function initGitRepo(root: string): Promise<void> {
  execSync('git init -q', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
  await writeFile(join(root, '.gitignore'), '.cadence/state.json\n');
  execSync('git add .gitignore', { cwd: root, stdio: 'ignore' });
  execSync('git commit -q -m init', { cwd: root, stdio: 'ignore' });
}

/** `code-review` is NOT in the default `auto` profile's gate set; strict is
 *  the cheapest profile that carries it (mirrors settle-code-review.test.ts). */
async function setStrictProfile(root: string): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.profile = 'strict';
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

async function patchVerification(root: string, patch: Record<string, unknown>): Promise<void> {
  const path = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(path, 'utf8'));
  cfg.verification = { ...(cfg.verification ?? {}), ...patch };
  await writeFile(path, JSON.stringify(cfg, null, 2));
}

const DRAFT_REL = '.cadence/phases/01-foundation/01-01-DRAFT.md';

/** Point T1's `files:` at the file the staged diff actually touches, so
 *  `criteria-gap`'s `candidatesForFile` can propose AC-1 for it at all. */
async function rewireT1(root: string, relPath: string): Promise<void> {
  const draftPath = join(root, DRAFT_REL);
  let body = await readFile(draftPath, 'utf8');
  body = body.replace(/- files: `path\/to\/file\.ts`/, `- files: \`${relPath}\``);
  await writeFile(draftPath, body, 'utf8');
}

async function seedAcCoverage(root: string, acId: string): Promise<void> {
  const p = join(root, 'packages/core/tests/foo.test.ts');
  await mkdir(dirname(p), { recursive: true });
  await writeFile(
    p,
    `it('${acId} coverage fixture', () => { expect(true).toBe(true); });\n`,
    'utf8',
  );
}

interface SummaryJson {
  readonly gates?: Array<{ gate: string; status: string; skipReason?: string }>;
  readonly codeReview?: Record<
    string,
    Array<{
      severity: string;
      message: string;
      anchor?: { kind: string; ref?: string; tier: string };
    }>
  >;
}

async function readSummary(root: string): Promise<SummaryJson> {
  return JSON.parse(
    await readFile(join(root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'), 'utf8'),
  ) as SummaryJson;
}

function gateEntry(
  summary: SummaryJson,
  gate: string,
): { gate: string; status: string; skipReason?: string } | undefined {
  return (summary.gates ?? []).find((g) => g.gate === gate);
}

/**
 * The shared fixture for every case below: a strict-profile repo whose staged
 * diff adds a `console.log(` line (the ONLY thing the deterministic `mock`
 * code-review verifier flags — one HIGH finding on `src/foo.ts`), with T1
 * DONE and AC-1 coverage seeded so no earlier gate refuses first.
 *
 * Also asserts the ladder's condition (a) as an explicit PRECONDITION on the
 * scaffolded DRAFT: if a future scaffold change empties `verify:` or drops
 * `done: AC-1`, these tests must fail here, loudly and for the right reason,
 * rather than silently degrading to a `structured` anchor and still passing
 * the AC-4 cases.
 */
async function seedAnchorFixture(root: string): Promise<void> {
  await initGitRepo(root);
  await setStrictProfile(root);
  await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], root);
  await rewireT1(root, 'src/foo.ts');
  await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], root);

  const draft = await readFile(join(root, DRAFT_REL), 'utf8');
  // Condition (a) of `executable` (`verify/anchor.ts:87-89`): the AC must be
  // cited by a task whose `done:` includes it AND whose `verify:` is non-empty
  // — BOTH ON THE SAME TASK. Asserting the two lines independently anywhere in
  // the file would still pass if a future scaffold seeded a second task that
  // split them across tasks, quietly turning AC-3 into a tautology. So scope
  // the match to T1's own block, then re-capture `verify:` for the
  // non-emptiness check.
  const t1Block = /### T1:[\s\S]*?(?=\n### |\n## |$)/.exec(draft);
  expect(t1Block, 'the scaffolded DRAFT must contain a T1 task block').not.toBeNull();
  const t1 = t1Block?.[0] ?? '';
  // Both assertions are scoped to T1's own block, which is what makes them
  // prove "same task". Kept as two independent checks rather than one combined
  // regex so they stay agnostic to the order the scaffold emits `verify:` and
  // `done:` in.
  const verifyLine = /\n- verify: (.*)\n/.exec(t1);
  expect(verifyLine, 'T1 must carry a `- verify:` line').not.toBeNull();
  expect(
    (verifyLine?.[1] ?? '').trim().length,
    "T1's `verify:` must be non-empty — condition (a) of the executable tier",
  ).toBeGreaterThan(0);
  expect(t1, 'T1 must cite AC-1 in its `done:` field').toMatch(/\n- done: [^\n]*\bAC-1\b/);
  expect(t1).toMatch(/- files: `src\/foo\.ts`/);
  // AC-1 is `structured` on its own (all of G/W/T non-empty) — so a capped
  // tier below is genuinely the ladder's cap, not a malformed AC.
  expect(draft).toMatch(/### AC-1:[^\n]*\nGiven \S[\s\S]*?\nWhen \S[\s\S]*?\nThen \S/);

  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'foo.ts'), 'export function f() { console.log("oops"); }\n');
  execSync('git add src/foo.ts', { cwd: root, stdio: 'ignore' });
  await seedAcCoverage(root, 'AC-1');
  await run(['build', 'task', 'T1', '--status=DONE', '--allow-per-task-failure'], root);
}

// Each case spawns the real CLI several times; match the precedent's
// per-describe timeout (settle-code-review.test.ts) rather than adding
// per-test band-aids. vitest.shared.ts still owns the global ceiling.
describe(
  'cadence settle run (Phase 241 — anchor ladder reachability, end to end)',
  { timeout: process.platform === 'win32' ? 90_000 : 45_000 },
  () => {
    it('AC-3: a passing build-test-must-pass makes the executable tier reachable through a real settle', async () => {
      active = await tempRepo({ initialized: true });
      await seedAnchorFixture(active.root);
      // Condition (b): a genuinely RUNNING test suite. Cross-platform — bare
      // `true` is not a Windows command.
      await patchVerification(active.root, { testCommand: 'node -e "process.exit(0)"' });

      const r = await run(
        ['settle', 'run', '--auto', '--no-interactive', '--allow-code-review-failure'],
        active.root,
      );
      expect(r.code).toBe(0);

      const summary = await readSummary(active.root);

      // Link 1 — the corroborating gate really ran (condition (b) held).
      // Exact `toEqual`, matching the two AC-4 cases below: this gate never
      // sets `flags.verifierIdentity`, so `verifierIdentityProvenance`
      // (`gates/registry.ts`) adds no `provider`/`model` and the entry really
      // is just `{ gate, status }`. (`code-review` below DOES set it, which is
      // why that one must stay `toMatchObject`.)
      expect(gateEntry(summary, 'build-test-must-pass')).toEqual({
        gate: 'build-test-must-pass',
        status: 'ran',
      });
      // Link 2 — code-review really executed (not skipped for gate-set
      // membership), so anchoring actually happened.
      expect(gateEntry(summary, 'code-review')).toMatchObject({
        gate: 'code-review',
        status: 'ran',
      });
      // Link 3 — the finding exists at all, and its persisted anchor is the
      // top tier. Exact deep-equality: no extra/missing anchor fields.
      const findings = summary.codeReview?.['src/foo.ts'];
      expect(findings).toHaveLength(1);
      expect(findings?.[0]).toMatchObject({
        severity: 'high',
        message: 'console.log left in source',
      });
      expect(findings?.[0]?.anchor).toEqual({ kind: 'ac', ref: 'AC-1', tier: 'executable' });
    });

    it('AC-4: with no verification.testCommand the test gate is skipped and the tier caps at structured', async () => {
      active = await tempRepo({ initialized: true });
      // No patchVerification at all — defaultConfig.verification carries no
      // testCommand, so this is the fixture's out-of-the-box state.
      await seedAnchorFixture(active.root);

      const r = await run(
        ['settle', 'run', '--auto', '--no-interactive', '--allow-code-review-failure'],
        active.root,
      );
      expect(r.code).toBe(0);
      expect(r.stderr).toContain(NO_TEST_COMMAND_NOTICE.message);

      const summary = await readSummary(active.root);
      expect(gateEntry(summary, 'build-test-must-pass')).toEqual({
        gate: 'build-test-must-pass',
        status: 'skipped',
        skipReason: NO_TEST_COMMAND_NOTICE.message,
      });
      expect(gateEntry(summary, 'code-review')).toMatchObject({
        gate: 'code-review',
        status: 'ran',
      });
      const findings = summary.codeReview?.['src/foo.ts'];
      expect(findings).toHaveLength(1);
      // Exact tier, not merely `not executable`: `undeclared`/`declared`
      // would be regressions this assertion must also catch.
      expect(findings?.[0]?.anchor).toEqual({ kind: 'ac', ref: 'AC-1', tier: 'structured' });
    });

    it('AC-4: a failing test command bypassed with --allow-failing-build cannot buy an executable anchor', async () => {
      active = await tempRepo({ initialized: true });
      await seedAnchorFixture(active.root);
      await patchVerification(active.root, { testCommand: 'node -e "process.exit(1)"' });

      const r = await run(
        [
          'settle',
          'run',
          '--auto',
          '--no-interactive',
          '--allow-failing-build',
          '--allow-code-review-failure',
        ],
        active.root,
      );
      expect(r.code).toBe(0);

      const summary = await readSummary(active.root);
      expect(gateEntry(summary, 'build-test-must-pass')).toEqual({
        gate: 'build-test-must-pass',
        status: 'skipped',
        // Hardcoded because the registry builds this string as a template
        // literal rather than exporting a constant — see the
        // `buildTestBypassed` branch in `gates/registry.ts`. If that wording
        // changes, this assertion is the tripwire.
        skipReason: 'bypassed via --allow-failing-build',
      });
      // The bypass must not stop code-review from running — otherwise this
      // case would prove nothing about anchoring.
      expect(gateEntry(summary, 'code-review')).toMatchObject({
        gate: 'code-review',
        status: 'ran',
      });
      const findings = summary.codeReview?.['src/foo.ts'];
      expect(findings).toHaveLength(1);
      // Pin the finding's identity, not just its count — otherwise a change in
      // what the mock emits could anchor a DIFFERENT finding and still pass.
      expect(findings?.[0]).toMatchObject({
        severity: 'high',
        message: 'console.log left in source',
      });
      expect(findings?.[0]?.anchor).toEqual({ kind: 'ac', ref: 'AC-1', tier: 'structured' });
    });
  },
);
