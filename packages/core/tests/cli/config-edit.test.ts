import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
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
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence config edit', () => {
  // AC-9: in a non-TTY (spawned stdin), edit refuses and points to `config set`.
  it('AC-9: refuses in a non-TTY with a pointer to config set', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['config', 'edit'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/interactive terminal/i);
    expect(r.stderr).toMatch(/config set/);
  });

  // AC-10: an unknown <field> yields a did-you-mean nudge + the editable list.
  it('AC-10: unknown field nudges the nearest match', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['config', 'edit', 'profil'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/did you mean.*profile/i);
    expect(r.stderr).toMatch(/loopEnforcement/);
  });
});
