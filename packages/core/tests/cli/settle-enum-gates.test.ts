import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

// AC-8 (Phase 39.2) — settle-level behavior of the two newly-wired ALWAYS_FIRE
// gates: structural-verifier (open-task refusal) and build-test-must-pass
// (failing-command refusal). Explicit --ac isolates them from --auto's AC
// derivation so the refusal under test is unambiguous.

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

const DRAFT_BODY = `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nprofile: auto\nstatus: PENDING\n---\n\n# 01-01 — Demo\n\n## Objective\nDemo.\n\n## Acceptance Criteria\n\n### AC-1: ok\nGiven x\nWhen y\nThen z\n\n## Tasks\n\n### T1: do\n- files: \`src/x.ts\`\n- action: a\n- verify: v\n- done: AC-1\n\n## Boundaries\n\n- _(none)_\n`;

/** Put the repo in BUILD with a draft + a PROGRESS.json whose single task has
 *  the given status. State written directly (no approve gate to fight). */
async function seedBuild(root: string, taskStatus: string): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  await writeFile(join(phaseDir, '01-01-DRAFT.md'), DRAFT_BODY);
  await writeFile(
    join(phaseDir, '01-01-PROGRESS.json'),
    JSON.stringify(
      {
        draftId: '01-01',
        tasks: {
          T1: { status: taskStatus, notes: 'n', touchedFiles: [], updatedAt: '2026-05-29T00:00:00.000Z' },
        },
      },
      null,
      2,
    ),
  );
  const statePath = join(root, '.cadence/state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.activePhase = '01-foundation';
  state.activeDraft = '01-01';
  state.loopPosition = 'BUILD';
  state.tier = 'standard';
  state.openDrafts = [{ id: '01-01', since: '2026-05-29T00:00:00.000Z' }];
  state.draftReadAt = null;
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function patchVerification(root: string, patch: Record<string, unknown>): Promise<void> {
  const path = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(path, 'utf8'));
  cfg.verification = { ...(cfg.verification ?? {}), ...patch };
  await writeFile(path, JSON.stringify(cfg, null, 2));
}

async function loopPosition(root: string): Promise<string> {
  const state = JSON.parse(await readFile(join(root, '.cadence/state.json'), 'utf8'));
  return state.loopPosition;
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('structural-verifier gate at settle (Phase 39.2, AC-8)', () => {
  it('refuses settle while a task is non-terminal (IN_PROGRESS)', async () => {
    active = await tempRepo({ initialized: true });
    await seedBuild(active.root, 'IN_PROGRESS');
    const r = await run(['settle', 'run', '--ac', 'AC-1=pass', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/structural-verifier: task T1 is IN_PROGRESS \(not terminal\)/);
    expect(r.stderr).toMatch(/all tasks must be terminal/);
    expect(await loopPosition(active.root)).toBe('BUILD');
  });

  it('--allow-open-tasks clears the structural-verifier refusal', async () => {
    active = await tempRepo({ initialized: true });
    await seedBuild(active.root, 'IN_PROGRESS');
    const r = await run(
      ['settle', 'run', '--ac', 'AC-1=pass', '--allow-missing-coverage', '--allow-open-tasks'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/structural-verifier/);
    expect(await loopPosition(active.root)).toBe('IDLE');
  });
});

describe('build-test-must-pass gate at settle (Phase 39.2, AC-8)', () => {
  it('refuses settle when verification.testCommand exits non-zero', async () => {
    active = await tempRepo({ initialized: true });
    await seedBuild(active.root, 'DONE'); // terminal → structural passes
    await patchVerification(active.root, { testCommand: 'node -e "process.exit(3)"' });
    const r = await run(['settle', 'run', '--ac', 'AC-1=pass', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/build-test-must-pass: .* exited 3/);
    expect(r.stderr).toMatch(/the test suite must pass before settle/);
    expect(await loopPosition(active.root)).toBe('BUILD');
  });

  it('--allow-failing-build clears the build-test refusal', async () => {
    active = await tempRepo({ initialized: true });
    await seedBuild(active.root, 'DONE');
    await patchVerification(active.root, { testCommand: 'node -e "process.exit(1)"' });
    const r = await run(
      ['settle', 'run', '--ac', 'AC-1=pass', '--allow-missing-coverage', '--allow-failing-build'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(await loopPosition(active.root)).toBe('IDLE');
  });

  it('passes when the configured test command succeeds', async () => {
    active = await tempRepo({ initialized: true });
    await seedBuild(active.root, 'DONE');
    await patchVerification(active.root, { testCommand: 'node -e "process.exit(0)"' });
    const r = await run(['settle', 'run', '--ac', 'AC-1=pass', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/build-test-must-pass/);
    expect(await loopPosition(active.root)).toBe('IDLE');
  });

  // Phase 139 / AC-5: no longer silent — a loud, non-blocking notice replaces
  // the old bit-identical silence (settle still passes either way).
  it('passes with a loud no-testCommand notice when none is configured and tasks are terminal', async () => {
    active = await tempRepo({ initialized: true });
    await seedBuild(active.root, 'DONE');
    const r = await run(['settle', 'run', '--ac', 'AC-1=pass', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/build-test-must-pass: no test command configured/);
    expect(r.stderr).not.toMatch(/structural-verifier/);
    expect(await loopPosition(active.root)).toBe('IDLE');
  });
});
