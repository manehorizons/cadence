import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    p.on('exit', (code) => resolve({ code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence build task', () => {
  it('records task outcome under .cadence/phases/<phase>/<id>-PROGRESS.json', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r.code).toBe(0);
    const progress = JSON.parse(
      await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.status).toBe('DONE');
  });

  it('rejects status outside the 4-state set', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(['build', 'task', 'T1', '--status=KIND_OF_DONE'], active.root);
    expect(r.code).toBe(2);
  });
});
