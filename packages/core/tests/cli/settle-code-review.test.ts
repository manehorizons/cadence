import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

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

async function setStrictProfile(root: string): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.profile = 'strict';
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

// AC-6 (standard×complex) spawns the CLI many times; macOS runners can brush
// the 20s global ceiling under load. Match the pattern from
// settle-security-audit.test.ts: 45s for non-win32, 90s for win32.
describe(
  'cadence settle run (Phase 24.3 — code-review verifier gate)',
  { timeout: process.platform === 'win32' ? 90_000 : 45_000 },
  () => {
  it('AC-4: refuses on HIGH findings (console.log diff)', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setStrictProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await rewireT1(active.root, 'src/foo.ts');
    await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(
      join(active.root, 'src', 'foo.ts'),
      'export function f() { console.log("oops"); }\n',
    );
    execSync('git add src/foo.ts', { cwd: active.root, stdio: 'ignore' });

    // Per-task verify needs a non-empty diff (we have one) → 'pass' → records DONE.
    // Use --allow-per-task-failure to be safe, and seed coverage so test-coverage
    // doesn't refuse first.
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
    expect(r.stderr).toMatch(/code-review: src\/foo\.ts:\d+ high — console\.log left in source/);
    expect(r.stderr).toMatch(/--allow-code-review-failure/);
    // Refused settle now persists a SUMMARY with the refusing gate's
    // provenance (phase 170), where previously nothing was written.
    const summaryPath = join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json');
    expect(existsSync(summaryPath)).toBe(true);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    expect(summary.gates[summary.gates.length - 1]).toMatchObject({
      gate: 'code-review',
      status: 'refused',
    });
  });

  it('AC-5 + AC-6: --allow-code-review-failure records SUMMARY.codeReview', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setStrictProfile(active.root);
    // Use file transport so we can assert the anomaly was dispatched.
    const cfgPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.notify = { transport: 'file' };
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2));

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await rewireT1(active.root, 'src/foo.ts');
    await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(
      join(active.root, 'src', 'foo.ts'),
      'export function f() { console.log("oops"); }\n',
    );
    execSync('git add src/foo.ts', { cwd: active.root, stdio: 'ignore' });
    await seedAcCoverage(active.root, 'AC-1');
    await run(
      ['build', 'task', 'T1', '--status=DONE', '--allow-per-task-failure'],
      active.root,
    );

    const r = await run(
      [
        'settle',
        'run',
        '--auto',
        '--no-interactive',
        '--allow-code-review-failure',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/--allow-code-review-failure set; proceeding past 1 HIGH/);

    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.codeReview['src/foo.ts']).toHaveLength(1);
    expect(summary.codeReview['src/foo.ts'][0]).toMatchObject({
      severity: 'high',
      message: 'console.log left in source',
    });

    // anomaly file should contain a code-review-high event (strict profile
    // doesn't carry anomaly-notify by default — but the file transport
    // still writes nothing if the gate is off. Strict×standard: gate is
    // NOT in the set, so no anomaly. That's intentional — assert silence.)
    // The file may or may not exist; if it exists, must not contain the type.
    const logPath = join(active.root, '.cadence/anomalies.log');
    if (existsSync(logPath)) {
      const log = await readFile(logPath, 'utf8');
      expect(log).not.toMatch(/code-review-high/);
    }
  });

  it('AC-6: code-review-high anomaly dispatches under standard×complex', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    // standard×complex carries BOTH 'code-review' and 'anomaly-notify'.
    const cfgPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.profile = 'standard';
    cfg.notify = { transport: 'file' };
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2));

    // Force tier=complex via DRAFT frontmatter; bump task count to avoid
    // tier-mismatch refusal (complex requires minTasks=6).
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo', '--tier=complex'], active.root);
    const draftPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-DRAFT.md',
    );
    let body = await readFile(draftPath, 'utf8');
    // Replace the placeholder file path in T1 and add 5 extra tasks to satisfy complex tier minTasks.
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
    await writeFile(
      join(active.root, 'src', 'foo.ts'),
      'export function f() { console.log("oops"); }\n',
    );
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
    // standard×complex set has 'anomaly-notify' → anomaly file written.
    const logPath = join(active.root, '.cadence/anomalies.log');
    expect(existsSync(logPath)).toBe(true);
    const log = await readFile(logPath, 'utf8');
    expect(log).toMatch(/"type":"code-review-high"/);
    expect(log).toMatch(/"bypassed":true/);
  });

  it('AC-4: clean diff under strict profile settles cleanly', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setStrictProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await rewireT1(active.root, 'src/foo.ts');
    await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src', 'foo.ts'), 'export const x = 1;\n');
    execSync('git add src/foo.ts', { cwd: active.root, stdio: 'ignore' });
    await seedAcCoverage(active.root, 'AC-1');
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);

    const r = await run(
      ['settle', 'run', '--auto', '--no-interactive'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/code-review:/);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.codeReview).toEqual({}); // gate ran, no findings
  });

  it('AC-4: auto profile (gate not in set) skips the gate entirely', async () => {
    active = await tempRepo({ initialized: true }); // default profile=auto
    // Phase 214 (T4): no real AC-1 coverage seeded here (unlike the other
    // cases in this file) and predates gates.evidenceFloor — relax it to
    // 'unverified' so this code-review-gate-membership assertion isn't
    // newly refused by the unrelated evidence-floor gate.
    {
      const cfgPath = join(active.root, '.cadence/config.json');
      const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
      cfg.gates = { ...(cfg.gates ?? {}), evidenceFloor: 'unverified' };
      await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    }
    await initGitRepo(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await rewireT1(active.root, 'src/foo.ts');
    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(
      join(active.root, 'src', 'foo.ts'),
      'export function f() { console.log("oops"); }\n',
    );
    execSync('git add src/foo.ts', { cwd: active.root, stdio: 'ignore' });
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);

    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/code-review:/);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.codeReview).toBeUndefined(); // gate didn't run
  });
});
