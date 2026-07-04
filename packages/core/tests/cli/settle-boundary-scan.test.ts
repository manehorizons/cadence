import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], {
      cwd,
      env: { ...process.env, ANTHROPIC_API_KEY: '' },
    });
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
  execSync('git init -q -b main', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
  await writeFile(join(root, '.gitignore'), '.cadence/state.json\n');
  execSync('git add .gitignore', { cwd: root, stdio: 'ignore' });
  execSync('git commit -q -m init', { cwd: root, stdio: 'ignore' });
}

const PHASE = '156-boundary-scan-cli';
const DRAFT_PATH = `.cadence/phases/${PHASE}/156-01-DRAFT.md`;
const SUMMARY_JSON = `.cadence/phases/${PHASE}/156-01-SUMMARY.json`;

/** Standard-tier DRAFT with `boundaryEnforcement: block` frontmatter and a
 *  single declared file — boundary-scan self-guards on this flag alone, so
 *  tier/profile membership is irrelevant to whether the gate runs. */
async function writeBlockModeDraft(root: string): Promise<void> {
  const body = `---
phase: ${PHASE}
id: 156-01
tier: standard
boundaryEnforcement: block
status: PENDING
---

# 156-01 — boundary-scan CLI flag fixture

## Objective

Exercise the boundary-scan settle gate's CLI bypass flag.

## Acceptance Criteria

### AC-1: complete
Given a precondition
When an action
Then an outcome

## Tasks

### T1: stub
- files: \`src/app.ts\`
- action: stub
- verify: stub
- done: AC-1

## Boundaries

- DO NOT widen scope
`;
  await writeFile(join(root, DRAFT_PATH), body, 'utf8');
}

/** Drives to a refusing boundary-scan gate: a declared `src/app.ts` plus an
 *  UNDECLARED untracked `src/extra.ts` the gate's unscoped enumeration must
 *  catch (working-tree porcelain, per AC-2 — no commit needed). Coverage is
 *  bypassed via `--allow-missing-coverage` at settle time, so no test fixture
 *  is seeded (a seeded fixture would itself be a second, unrelated offender). */
async function driveToRefusal(root: string): Promise<void> {
  await initGitRepo(root);
  await run(['draft', 'new', PHASE, '01', '--tier=standard'], root);
  await writeBlockModeDraft(root);
  await run(['draft', 'approve', PHASE, '01', '--no-approve'], root);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'app.ts'), 'export const x = 1;\n');
  execSync('git add src/app.ts', { cwd: root, stdio: 'ignore' });
  await writeFile(join(root, 'src', 'extra.ts'), 'export const y = 2;\n');
  await run(['build', 'task', 'T1', '--status=DONE'], root);
}

describe('cadence settle run (Phase 156 — boundary-scan gate CLI flag)', () => {
  it('refuses settle on an out-of-boundary file when boundaryEnforcement=block', async () => {
    active = await tempRepo({ initialized: true });
    await driveToRefusal(active.root);

    const r = await run(
      ['settle', 'run', '--auto', '--no-interactive', '--allow-stale-draft', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('src/extra.ts');
    expect(r.stderr).toMatch(/settle run refused: boundary-scan found file\(s\)/);
    expect(r.stderr).toContain('--allow-boundary-scan-failure');
  });

  it('--allow-boundary-scan-failure bypasses the refusal and records SUMMARY.boundaryScan', async () => {
    active = await tempRepo({ initialized: true });
    await driveToRefusal(active.root);

    const r = await run(
      [
        'settle',
        'run',
        '--auto',
        '--no-interactive',
        '--allow-stale-draft',
        '--allow-missing-coverage',
        '--allow-boundary-scan-failure',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/boundary-scan: --allow-boundary-scan-failure set; proceeding past 1 offending file/);
    const summary = JSON.parse(await readFile(join(active.root, SUMMARY_JSON), 'utf8'));
    expect(summary.boundaryScan?.offenders).toEqual(['src/extra.ts']);
  });
});
