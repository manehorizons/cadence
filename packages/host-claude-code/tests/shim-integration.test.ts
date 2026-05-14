import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@keel/testkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHIM = join(__dirname, '../dist/cli.js');
const KEEL = join(__dirname, '../../core/dist/cli/index.js');

interface Result {
  stdout: string;
  stderr: string;
  code: number;
}

function runShim(args: string[], cwd: string, stdin: string): Promise<Result> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SHIM, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.stdin.write(stdin);
    p.stdin.end();
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

describe('shim → core integration', () => {
  it('SessionStart through shim prints KEEL session context', async () => {
    active = await tempRepo({ initialized: true, projectName: 'integ' });
    const stdin = JSON.stringify({ hook_event_name: 'SessionStart' });
    const r = await runShim(
      ['hook', '--keel', `${process.execPath} ${KEEL}`],
      active.root,
      stdin,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/KEEL session resumed/);
    expect(r.stdout).toMatch(/integ/);
  });

  it('PostToolUse Edit through shim records touchedFiles when a task is active', async () => {
    active = await tempRepo({ initialized: true });
    // Force activeTask in state to exercise post-tool-edit path.
    const statePath = join(active.root, '.keel/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activeTask = { id: 'T1', status: 'IN_PROGRESS', touchedFiles: [] };
    const { writeFile } = await import('node:fs/promises');
    await writeFile(statePath, JSON.stringify(state, null, 2));

    const stdin = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/proj/src/foo.ts', old_string: 'a', new_string: 'b' },
    });
    const r = await runShim(
      ['hook', '--keel', `${process.execPath} ${KEEL}`],
      active.root,
      stdin,
    );
    expect(r.code).toBe(0);
    const after = JSON.parse(await readFile(statePath, 'utf8'));
    expect(after.activeTask.touchedFiles).toEqual(['/proj/src/foo.ts']);
  });

  it('Notification through shim is a no-op (exit 0, no spawn)', async () => {
    active = await tempRepo({ initialized: true });
    const stdin = JSON.stringify({ hook_event_name: 'Notification', message: 'hi' });
    const r = await runShim(
      ['hook', '--keel', `${process.execPath} ${KEEL}`],
      active.root,
      stdin,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
  });
});
