import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.on('exit', (code) => resolve({ stdout, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence progress', () => {
  it('IDLE state suggests draft new', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['progress'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/cadence draft new/);
  });

  it('DRAFT state (after `draft new`) suggests approve with real phase + num', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(['progress'], active.root);
    expect(r.stdout).toMatch(/cadence draft approve 01-foundation 01/);
    expect(r.stdout).not.toMatch(/<phase>|<num>/);
  });

  it('BUILD state suggests build task or settle', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(['progress'], active.root);
    expect(r.stdout).toMatch(/cadence build task|cadence settle/);
  });
});
