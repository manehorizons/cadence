import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@cadence/testkit';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../dist/cli/index.js',
);

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
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

describe('cadence build task — id validation (Phase 29.8, AC-2 / T3)', () => {
  async function inBuild(root: string): Promise<void> {
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], root);
    await run(['draft', 'approve', '01-foundation', '01'], root);
  }
  const progressPath = (root: string) =>
    join(root, '.cadence/phases/01-foundation/01-01-PROGRESS.json');

  it('errors (exit 2) on an unknown task id and records nothing', async () => {
    active = await tempRepo({ initialized: true });
    await inBuild(active.root);
    const r = await run(
      ['build', 'task', 'BOGUS', '--status=DONE'],
      active.root,
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/unknown task id "BOGUS"/);
    expect(r.stderr).toMatch(/Valid ids/);
    if (existsSync(progressPath(active.root))) {
      const prog = JSON.parse(await readFile(progressPath(active.root), 'utf8'));
      expect(prog.tasks?.BOGUS).toBeUndefined();
    }
  });

  it('errors on the missing-space typo `T1--status=DONE` (no ghost task)', async () => {
    active = await tempRepo({ initialized: true });
    await inBuild(active.root);
    const r = await run(
      ['build', 'task', 'T1--status=DONE'],
      active.root,
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/unknown task id "T1--status=DONE"/);
    if (existsSync(progressPath(active.root))) {
      const prog = JSON.parse(await readFile(progressPath(active.root), 'utf8'));
      expect(prog.tasks?.['T1--status=DONE']).toBeUndefined();
    }
  });

  it('records a valid declared task id', async () => {
    active = await tempRepo({ initialized: true });
    await inBuild(active.root);
    const r = await run(
      ['build', 'task', 'T1', '--status=DONE'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Recorded T1: DONE/);
  });
});
