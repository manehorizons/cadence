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

async function setProfile(root: string, profile: string): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.profile = profile;
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

const PHASE = '25-security-audit';
const DRAFT_PATH = `.cadence/phases/${PHASE}/25-02-DRAFT.md`;

/** Complex-tier DRAFT, 6 tasks all on src/app.ts, one complete AC. */
async function writeComplexDraft(root: string): Promise<void> {
  const tasks = [1, 2, 3, 4, 5, 6]
    .map(
      (n) =>
        `### T${n}: stub ${n}\n- files: \`src/app.ts\`\n- action: stub\n- verify: stub\n- done: AC-1\n`,
    )
    .join('\n');
  const body = `---
phase: ${PHASE}
id: 25-02
tier: complex
status: PENDING
---

# 25-02 — demo

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
  await writeFile(join(root, DRAFT_PATH), body, 'utf8');
}

async function seedAcCoverage(root: string): Promise<void> {
  const p = join(root, 'packages/core/tests/foo.test.ts');
  await mkdir(dirname(p), { recursive: true });
  await writeFile(
    p,
    `it('AC-1 coverage fixture', () => { expect(true).toBe(true); });\n`,
    'utf8',
  );
}

const SUMMARY_JSON = `.cadence/phases/${PHASE}/25-02-SUMMARY.json`;

/** draft new + complex DRAFT + approve (no-approve) + write app.ts + git add + all tasks DONE. */
async function driveToSettle(root: string, appSource: string): Promise<void> {
  await run(['draft', 'new', PHASE, '02', '--tier=complex'], root);
  await writeComplexDraft(root);
  await run(['draft', 'approve', PHASE, '02', '--no-approve'], root);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'app.ts'), appSource);
  execSync('git add src/app.ts', { cwd: root, stdio: 'ignore' });
  await seedAcCoverage(root);
  for (const t of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']) {
    await run(['build', 'task', t, '--status=DONE', '--allow-per-task-failure'], root);
  }
}

// AC-1 (phase 50): these tests spawn the built CLI + run a real git security
// audit per AC, so they need 30s even on Linux. Windows process-spawn + git is
// ~5× slower (passing cases already hit ~24s on windows-latest), so extend the
// slow-suite override on win32 only — non-win32 keeps the 45s it already
// required. The global win32 timeout headroom lives in vitest.shared.ts.
describe(
  'cadence settle run (Phase 25.2 — security-audit gate)',
  { timeout: process.platform === 'win32' ? 90_000 : 45_000 },
  () => {
  it('AC-4: refuses settle on a CRITICAL finding (JWT in diff)', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setProfile(active.root, 'strict');
    await driveToSettle(
      active.root,
      `export const t = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.s5x_abcDEF-123';\n`,
    );

    const r = await run(
      ['settle', 'run', '--auto', '--no-interactive', '--allow-stale-draft'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(
      /security-audit: \d+ critical — hardcoded JWT-shaped credential/,
    );
    expect(r.stderr).toMatch(/--allow-security-audit-failure/);
    // Refused settle now persists a SUMMARY with the refusing gate's
    // provenance (phase 170), where previously nothing was written.
    expect(existsSync(join(active.root, SUMMARY_JSON))).toBe(true);
    const summary = JSON.parse(await readFile(join(active.root, SUMMARY_JSON), 'utf8'));
    expect(summary.gates[summary.gates.length - 1]).toMatchObject({
      gate: 'security-audit',
      status: 'refused',
    });
  });

  it('AC-5: --allow-security-audit-failure settles + records SUMMARY.securityAudit', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setProfile(active.root, 'strict');
    await driveToSettle(
      active.root,
      `const headers = { Authorization: 'Bearer sk-live-abcdef123456' };\nexport { headers };\n`,
    );

    const r = await run(
      [
        'settle',
        'run',
        '--auto',
        '--no-interactive',
        '--allow-stale-draft',
        '--allow-security-audit-failure',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(
      /security-audit: --allow-security-audit-failure set; proceeding past 1 CRITICAL/,
    );
    const summary = JSON.parse(
      await readFile(join(active.root, SUMMARY_JSON), 'utf8'),
    );
    expect(summary.securityAudit).toHaveLength(1);
    expect(summary.securityAudit[0]).toMatchObject({
      severity: 'critical',
      message: 'hardcoded Authorization header',
    });
  });

  it('AC-4: clean diff settles cleanly under strict×complex', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setProfile(active.root, 'strict');
    await driveToSettle(active.root, `export const x = 1;\n`);

    const r = await run(
      ['settle', 'run', '--auto', '--no-interactive', '--allow-stale-draft'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/security-audit: \d+ critical/);
    const summary = JSON.parse(
      await readFile(join(active.root, SUMMARY_JSON), 'utf8'),
    );
    expect(summary.securityAudit).toEqual([]); // gate ran, no findings
  });

  it('AC-4: auto profile (gate not in set) skips the gate entirely', async () => {
    active = await tempRepo({ initialized: true }); // default profile=auto
    await initGitRepo(active.root);
    await run(['draft', 'new', PHASE, '02', '--tier=complex'], active.root);
    await writeComplexDraft(active.root);
    await run(
      ['draft', 'approve', PHASE, '02', '--allow-auto-complex'],
      active.root,
    );
    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(
      join(active.root, 'src', 'app.ts'),
      `export const t = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.s5x_abcDEF-123';\n`,
    );
    execSync('git add src/app.ts', { cwd: active.root, stdio: 'ignore' });
    for (const t of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']) {
      await run(['build', 'task', t, '--status=DONE'], active.root);
    }

    const r = await run(
      [
        'settle',
        'run',
        '--auto',
        '--allow-auto-complex',
        '--allow-missing-coverage',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/security-audit:/);
    const summary = JSON.parse(
      await readFile(join(active.root, SUMMARY_JSON), 'utf8'),
    );
    expect(summary.securityAudit).toBeUndefined(); // gate didn't run
  });
});
