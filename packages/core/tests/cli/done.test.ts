import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    p.stderr.on('data', (b) => {
      stderr += b.toString();
    });
    p.on('exit', (code) => resolve({ code: code ?? 0, stderr }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence done <id>', () => {
  it('records DONE with notes in PROGRESS.json (AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(['done', 'T1', '--notes=finished'], active.root);
    expect(r.code).toBe(0);

    const progress = JSON.parse(
      await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.status).toBe('DONE');
    expect(progress.tasks.T1.notes).toBe('finished');
  });

  it('records DONE with empty notes when --notes omitted', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(['done', 'T2'], active.root);
    expect(r.code).toBe(0);

    const progress = JSON.parse(
      await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T2.status).toBe('DONE');
    expect(progress.tasks.T2.notes).toBe('');
  });

  it('exits non-zero with LoopViolation when not in BUILD (AC-2)', async () => {
    active = await tempRepo({ initialized: true });

    const r = await run(['done', 'T1'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/BUILD/i);
  });

  it('updates state.activeTask to the just-recorded task', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    await run(['done', 'T1'], active.root);

    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.activeTask?.id).toBe('T1');
    expect(state.activeTask?.status).toBe('DONE');
  });
});
