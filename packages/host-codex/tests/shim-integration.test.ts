import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHIM = join(__dirname, '../dist/cli.js');
const CADENCE_CLI = join(__dirname, '../../core/dist/cli/index.js');

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

describe('codex shim → core integration (AC-3)', () => {
  it('AC-3: SessionStart through the shim prints CADENCE session context', async () => {
    active = await tempRepo({ initialized: true, projectName: 'integcodex' });
    const stdin = JSON.stringify({ hook_event_name: 'SessionStart' });
    const r = await runShim(['hook', '--cadence', `${process.execPath} ${CADENCE_CLI}`], active.root, stdin);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/CADENCE session/i);
    expect(r.stdout).toMatch(/integcodex/);
  });

  it('AC-3: PostToolUse apply_patch records touchedFiles when a task is active', async () => {
    active = await tempRepo({ initialized: true });
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activeTask = { id: 'T1', status: 'IN_PROGRESS', touchedFiles: [] };
    await writeFile(statePath, JSON.stringify(state, null, 2));

    const patch = '*** Begin Patch\n*** Update File: /proj/src/foo.ts\n*** End Patch';
    const stdin = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'apply_patch', tool_input: { input: patch } });
    const r = await runShim(['hook', '--cadence', `${process.execPath} ${CADENCE_CLI}`], active.root, stdin);
    expect(r.code).toBe(0);
    const after = JSON.parse(await readFile(statePath, 'utf8'));
    expect(after.activeTask.touchedFiles).toEqual(['/proj/src/foo.ts']);
  });

  it('AC-2/AC-3: an unmapped event is a no-op (exit 0, no output)', async () => {
    active = await tempRepo({ initialized: true });
    const stdin = JSON.stringify({ hook_event_name: 'PreCompact' });
    const r = await runShim(['hook', '--cadence', `${process.execPath} ${CADENCE_CLI}`], active.root, stdin);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
  });
});
