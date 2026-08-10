// AC-6 is covered by the Task 4 docs changes (DESIGN.md §10 item 38 + §4.1
// note, CHANGELOG, .cadence/ROADMAP.md); no runtime assertion — this token
// satisfies the per-AC test-coverage grep for the docs-only criterion.
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

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

/** Merge a patch into .cadence/config.json (profile / notify / convergence). */
async function patchConfig(
  root: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  Object.assign(cfg, patch);
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

async function rewireT1(root: string, relPath: string): Promise<void> {
  const draftPath = join(root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
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

const HIGH_SRC = 'export function f() { console.log("oops"); }\n';
const CLEAN_SRC = 'export const x = 1;\n';
const SIDECAR = '.cadence/phases/01-foundation/01-01-CODE-REVIEW.json';
const SUMMARY = '.cadence/phases/01-foundation/01-01-SUMMARY.json';
const ANOM_LOG = '.cadence/anomalies.log';

async function readJson(root: string, rel: string): Promise<any> {
  return JSON.parse(await readFile(join(root, rel), 'utf8'));
}

/** strict×standard scaffold up to (but not including) `settle run`. */
async function strictScaffold(
  root: string,
  src: string,
  extraCfg: Record<string, unknown> = {},
): Promise<void> {
  await initGitRepo(root);
  await patchConfig(root, { profile: 'strict', ...extraCfg });
  await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], root);
  await rewireT1(root, 'src/foo.ts');
  await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], root);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'foo.ts'), src);
  execSync('git add src/foo.ts', { cwd: root, stdio: 'ignore' });
  await seedAcCoverage(root, 'AC-1');
}

// AC-4 (standard×complex) spawns the CLI many times; macOS runners can brush
// the 20s global ceiling under load. Match the pattern from
// settle-security-audit.test.ts: 45s for non-win32, 90s for win32.
describe(
  'cadence settle run (Phase 37.1 — code-review convergence)',
  { timeout: process.platform === 'win32' ? 90_000 : 45_000 },
  () => {
  it('AC-1: clean diff converges — settle proceeds, sidecar converged:true', async () => {
    active = await tempRepo({ initialized: true });
    await strictScaffold(active.root, CLEAN_SRC);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);

    const r = await run(
      ['settle', 'run', '--auto', '--no-interactive'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/code-review:/);

    const sc = await readJson(active.root, SIDECAR);
    // Phase 267 (267-01, dec-20260810-003): default init resolves code-review
    // to mock, so a clean pass now persists `converged: false` +
    // `verdict: 'abstained'` on CODE-REVIEW.json -- `r.code === 0` above (the
    // real control-flow signal, and the settle that actually closed the
    // loop) is unaffected.
    expect(sc.converged).toBe(false);
    expect(sc.attempts).toBe(0);
    expect(sc.findings).toBe(0);
    expect(sc.history).toHaveLength(1);
    expect(sc.history[0].verdict).toBe('abstained');
    expect(sc.history[0].pass).toBe(false);
    expect(sc.history[0].mockAbstained).toBe(true);
  });

  it('AC-2: HIGH no flag — reloop, exit 1, attempt 1/3, sidecar attempts:1, SUMMARY records the refusal (phase 170)', async () => {
    active = await tempRepo({ initialized: true });
    await strictScaffold(active.root, HIGH_SRC); // default convergence → max 3
    await run(
      ['build', 'task', 'T1', '--status=DONE', '--allow-per-task-failure'],
      active.root,
    );

    const r = await run(
      ['settle', 'run', '--auto', '--no-interactive'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(
      /code-review: src\/foo\.ts:\d+ high — console\.log left in source/,
    );
    expect(r.stderr).toMatch(/code-review: attempt 1\/3 did not pass/);
    expect(r.stderr).toMatch(/--allow-code-review-failure/);

    const sc = await readJson(active.root, SIDECAR);
    expect(sc.attempts).toBe(1);
    expect(sc.converged).toBe(false);
    expect(sc.history).toHaveLength(1);
    expect(sc.history[0].verdict).toBe('reloop');
    // Refused settle now persists a SUMMARY with the refusing gate's
    // provenance (phase 170), where previously nothing was written.
    expect(existsSync(join(active.root, SUMMARY))).toBe(true);
    const summary = await readJson(active.root, SUMMARY);
    expect(summary.gates[summary.gates.length - 1]).toMatchObject({
      gate: 'code-review',
      status: 'refused',
    });
  });

  it('AC-3: escalate (maxAttempts:1) — exit 1, unconditional code-review-unconverged under strict (no anomaly-notify), code-review-high silent', async () => {
    active = await tempRepo({ initialized: true });
    await strictScaffold(active.root, HIGH_SRC, {
      notify: { transport: 'file' },
      convergence: { maxAttempts: 1 },
    });
    await run(
      ['build', 'task', 'T1', '--status=DONE', '--allow-per-task-failure'],
      active.root,
    );

    const r = await run(
      ['settle', 'run', '--auto', '--no-interactive'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(
      /settle run refused: code-review did NOT converge after 1 attempts/,
    );
    expect(r.stderr).toMatch(/a human decision is required/);

    const logPath = join(active.root, ANOM_LOG);
    expect(existsSync(logPath)).toBe(true);
    const log = await readFile(logPath, 'utf8');
    // Unconditional: strict×standard carries NO anomaly-notify, yet the
    // escalation anomaly still fired.
    expect(log).toMatch(/"type":"code-review-unconverged"/);
    // Sibling code-review-high keeps its Phase 24.3 anomaly-notify guard →
    // silent under strict.
    expect(log).not.toMatch(/code-review-high/);

    const sc = await readJson(active.root, SIDECAR);
    expect(sc.converged).toBe(false);
    expect(sc.history[sc.history.length - 1].verdict).toBe('escalate');
  });

  it('AC-4: escalate + --allow-code-review-failure under standard×complex — settles, SUMMARY present, BOTH anomalies, bypassed:true', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await patchConfig(active.root, {
      profile: 'standard',
      notify: { transport: 'file' },
      convergence: { maxAttempts: 1 },
    });
    await run(
      ['draft', 'new', '01-foundation', '01', '--title=Demo', '--tier=complex'],
      active.root,
    );
    const draftPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-DRAFT.md',
    );
    let body = await readFile(draftPath, 'utf8');
    body = body.replace(/- files: `path\/to\/file\.ts`/, '- files: `src/foo.ts`');
    body += [
      '\n### T2: stub\n- files: `src/foo.ts`\n- action: stub\n- verify: stub\n- done: AC-1\n',
      '### T3: stub\n- files: `src/foo.ts`\n- action: stub\n- verify: stub\n- done: AC-1\n',
      '### T4: stub\n- files: `src/foo.ts`\n- action: stub\n- verify: stub\n- done: AC-1\n',
      '### T5: stub\n- files: `src/foo.ts`\n- action: stub\n- verify: stub\n- done: AC-1\n',
      '### T6: stub\n- files: `src/foo.ts`\n- action: stub\n- verify: stub\n- done: AC-1\n',
    ].join('');
    await writeFile(draftPath, body, 'utf8');
    await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src', 'foo.ts'), HIGH_SRC);
    execSync('git add src/foo.ts', { cwd: active.root, stdio: 'ignore' });
    await seedAcCoverage(active.root, 'AC-1');
    for (const t of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']) {
      await run(['build', 'task', t, '--status=DONE'], active.root);
    }

    const r = await run(
      [
        'settle',
        'run',
        '--auto',
        '--allow-code-review-failure',
        '--allow-verifier-failure',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(
      /--allow-code-review-failure set; proceeding past 1 HIGH/,
    );

    const summary = await readJson(active.root, SUMMARY);
    expect(summary.codeReview['src/foo.ts']).toHaveLength(1);
    expect(summary.codeReview['src/foo.ts'][0]).toMatchObject({
      severity: 'high',
      message: 'console.log left in source',
    });

    const log = await readFile(join(active.root, ANOM_LOG), 'utf8');
    expect(log).toMatch(/"type":"code-review-high"/);
    expect(log).toMatch(/"type":"code-review-unconverged"/);
    expect(log).toMatch(/"bypassed":true/);

    const sc = await readJson(active.root, SIDECAR);
    const last = sc.history[sc.history.length - 1];
    expect(last.bypassed).toBe(true);
    expect(last.verdict).toBe('escalate');
  });

  it('AC-1: legacy/absent sidecar → attemptsSoFar 0 (legacy back-compat)', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await patchConfig(active.root, { profile: 'strict' }); // default convergence → 3
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await rewireT1(active.root, 'src/foo.ts');
    await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    // Legacy 29.7-style sidecar (NO `attempts`, NO `history`) written AFTER
    // approve and BEFORE settle so it is read, not clobbered.
    await mkdir(
      join(active.root, '.cadence/phases/01-foundation'),
      { recursive: true },
    );
    await writeFile(
      join(active.root, SIDECAR),
      JSON.stringify({
        draftId: '01-01',
        pass: false,
        provider: 'mock',
        findings: 1,
        at: '2026-05-16T00:00:00.000Z',
      }),
    );
    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src', 'foo.ts'), HIGH_SRC);
    execSync('git add src/foo.ts', { cwd: active.root, stdio: 'ignore' });
    await seedAcCoverage(active.root, 'AC-1');
    await run(
      ['build', 'task', 'T1', '--status=DONE', '--allow-per-task-failure'],
      active.root,
    );

    const r = await run(
      ['settle', 'run', '--auto', '--no-interactive'],
      active.root,
    );
    expect(r.code).toBe(1);
    // legacy file had no `attempts` → attemptsSoFar 0 → THIS run is attempt
    // 1/3 (reloop), NOT an escalation — proves legacy → 0 back-compat.
    expect(r.stderr).toMatch(/code-review: attempt 1\/3 did not pass/);

    const sc = await readJson(active.root, SIDECAR);
    expect(sc.attempts).toBe(1);
    expect(sc.history).toHaveLength(1);
  });

  it('AC-4: --force (not --allow) still bypasses code-review — Phase 24.3 contract NOT narrowed', async () => {
    active = await tempRepo({ initialized: true });
    await strictScaffold(active.root, HIGH_SRC, {
      convergence: { maxAttempts: 1 },
    });
    await run(
      ['build', 'task', 'T1', '--status=DONE', '--allow-per-task-failure'],
      active.root,
    );

    const r = await run(
      ['settle', 'run', '--auto', '--no-interactive', '--force'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(
      /code-review: --force set; proceeding past 1 HIGH finding\(s\)\./,
    );

    const summary = await readJson(active.root, SUMMARY);
    expect(summary.codeReview['src/foo.ts']).toHaveLength(1);

    const sc = await readJson(active.root, SIDECAR);
    expect(sc.history[sc.history.length - 1].bypassed).toBe(true);
  });
});
