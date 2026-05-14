import { describe, it, expect, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@keel/testkit';
import { recordTaskOutcome } from '../../src/build/record.js';
import { LoopViolationError } from '../../src/errors.js';

const KEEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [KEEL, ...args], { cwd });
    p.on('exit', (code) => resolve({ code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function arrangeBuildPhase(): Promise<string> {
  active = await tempRepo({ initialized: true });
  await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
  await run(['draft', 'approve', '01-foundation', '01'], active.root);
  return active.root;
}

describe('recordTaskOutcome', () => {
  it('writes PROGRESS.json with status + notes and updates state.activeTask', async () => {
    const root = await arrangeBuildPhase();

    await recordTaskOutcome(root, 'T1', 'DONE', 'finished');

    const progress = JSON.parse(
      await readFile(join(root, '.keel/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.status).toBe('DONE');
    expect(progress.tasks.T1.notes).toBe('finished');
    const state = JSON.parse(await readFile(join(root, '.keel/state.json'), 'utf8'));
    expect(state.activeTask?.id).toBe('T1');
    expect(state.activeTask?.status).toBe('DONE');
  });

  it('throws LoopViolationError when loopPosition is not BUILD', async () => {
    active = await tempRepo({ initialized: true });
    await expect(recordTaskOutcome(active.root, 'T1', 'DONE', '')).rejects.toBeInstanceOf(
      LoopViolationError,
    );
  });

  it('produces the same PROGRESS.json that `keel build task` produces', async () => {
    const rootA = await arrangeBuildPhase();
    await recordTaskOutcome(rootA, 'T1', 'DONE', 'parity');
    const helperOut = JSON.parse(
      await readFile(join(rootA, '.keel/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    await active!.cleanup();
    active = null;

    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE', '--notes=parity'], active.root);
    const cliOut = JSON.parse(
      await readFile(join(active.root, '.keel/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );

    // updatedAt timestamps differ — strip before compare
    delete helperOut.tasks.T1.updatedAt;
    delete cliOut.tasks.T1.updatedAt;
    expect(helperOut).toEqual(cliOut);
  });
});
