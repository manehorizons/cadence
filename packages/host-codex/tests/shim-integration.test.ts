import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
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

describe('Codex shim → core integration (dogfood smoke)', () => {
  it('SessionStart through shim prints KEEL session context', async () => {
    active = await tempRepo({ initialized: true, projectName: 'codex-integ' });
    const stdin = JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' });
    const r = await runShim(
      ['hook', '--keel', `${process.execPath} ${KEEL}`],
      active.root,
      stdin,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/KEEL session resumed/);
    expect(r.stdout).toMatch(/codex-integ/);
  });

  it('PostToolUse apply_patch through shim updates touchedFiles for the active task', async () => {
    active = await tempRepo({ initialized: true });
    const statePath = join(active.root, '.keel/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activeTask = { id: 'T1', status: 'IN_PROGRESS', touchedFiles: [] };
    await writeFile(statePath, JSON.stringify(state, null, 2));

    const stdin = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command:
          '*** Begin Patch\n*** Update File: src/codex/foo.ts\n@@\n-a\n+b\n*** End Patch\n',
      },
    });
    const r = await runShim(
      ['hook', '--keel', `${process.execPath} ${KEEL}`],
      active.root,
      stdin,
    );
    expect(r.code).toBe(0);
    const after = JSON.parse(await readFile(statePath, 'utf8'));
    expect(after.activeTask.touchedFiles).toEqual(['src/codex/foo.ts']);
  });

  it('PostToolUse apply_patch with Add+Delete records all referenced files', async () => {
    active = await tempRepo({ initialized: true });
    const statePath = join(active.root, '.keel/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activeTask = { id: 'T1', status: 'IN_PROGRESS', touchedFiles: [] };
    await writeFile(statePath, JSON.stringify(state, null, 2));

    const stdin = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          '*** Add File: new.ts',
          '+x',
          '*** Delete File: old.ts',
          '*** End Patch',
          '',
        ].join('\n'),
      },
    });
    const r = await runShim(
      ['hook', '--keel', `${process.execPath} ${KEEL}`],
      active.root,
      stdin,
    );
    expect(r.code).toBe(0);
    const after = JSON.parse(await readFile(statePath, 'utf8'));
    expect(after.activeTask.touchedFiles).toEqual(['new.ts', 'old.ts']);
  });

  it('PermissionRequest through shim is a no-op (no KEEL mapping)', async () => {
    active = await tempRepo({ initialized: true });
    const stdin = JSON.stringify({
      hook_event_name: 'PermissionRequest',
      tool_name: 'apply_patch',
      tool_input: { description: 'edit foo' },
    });
    const r = await runShim(
      ['hook', '--keel', `${process.execPath} ${KEEL}`],
      active.root,
      stdin,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('PostToolUse Bash is dropped (out-of-scope tool)', async () => {
    active = await tempRepo({ initialized: true });
    const stdin = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    });
    const r = await runShim(
      ['hook', '--keel', `${process.execPath} ${KEEL}`],
      active.root,
      stdin,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
  });
});
