import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@keel/testkit';

const KEEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [KEEL, ...args], { cwd });
    let stdout = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.on('exit', (code) => resolve({ stdout, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('keel progress', () => {
  it('IDLE state suggests draft new', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['progress'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/keel draft new/);
  });

  it('BUILD state suggests build task or settle', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(['progress'], active.root);
    expect(r.stdout).toMatch(/keel build task|keel settle/);
  });
});
