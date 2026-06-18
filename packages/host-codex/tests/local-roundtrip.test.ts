import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installHooks } from '../src/install.js';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

interface Result {
  stdout: string;
  stderr: string;
  code: number;
}

function runShellCommand(cmd: string, cwd: string, stdin: string): Promise<Result> {
  return new Promise((resolve) => {
    const p = spawn(cmd, { cwd, shell: true });
    let stdout = '';
    let stderr = '';
    p.stdout?.on('data', (d) => (stdout += d.toString()));
    p.stderr?.on('data', (d) => (stderr += d.toString()));
    p.stdin?.write(stdin);
    p.stdin?.end();
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

describe('codex install --local round-trip', () => {
  it('AC-1: regenerated hooks.json command runs the local shim end-to-end', async () => {
    active = await tempRepo({ initialized: true, projectName: 'local-codex-rt' });
    await installHooks(active.root, { local: true });
    const cfg = JSON.parse(await readFile(join(active.root, '.codex/hooks.json'), 'utf8'));
    const cmd = cfg.hooks.SessionStart[0].hooks[0].command as string;
    expect(cmd).toMatch(/host-codex[\\/]dist[\\/]cli\.js hook/);
    expect(cmd).toMatch(/--cadence "node .+core[\\/]dist[\\/]cli[\\/]index\.js"/);

    const r = await runShellCommand(
      cmd,
      active.root,
      JSON.stringify({ hook_event_name: 'SessionStart' }),
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/CADENCE session/i);
    expect(r.stdout).toMatch(/local-codex-rt/);
  });
});
