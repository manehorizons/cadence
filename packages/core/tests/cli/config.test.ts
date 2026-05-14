import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@cadence/testkit';

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

describe('cadence config', () => {
  it('config get reads a known knob', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['config', 'get', 'loopEnforcement'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('soft');
  });

  it('config set persists a known knob', async () => {
    active = await tempRepo({ initialized: true });
    const setR = await run(['config', 'set', 'loopEnforcement', 'strict'], active.root);
    expect(setR.code).toBe(0);
    const getR = await run(['config', 'get', 'loopEnforcement'], active.root);
    expect(getR.stdout.trim()).toBe('strict');
  });

  it('config set rejects invalid value', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['config', 'set', 'loopEnforcement', 'nope'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/loopEnforcement/i);
  });

  it('config get profile defaults to "auto"', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['config', 'get', 'profile'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('auto');
  });

  it('config set profile round-trips strict | standard | auto', async () => {
    active = await tempRepo({ initialized: true });
    for (const v of ['strict', 'standard', 'auto']) {
      const setR = await run(['config', 'set', 'profile', v], active.root);
      expect(setR.code).toBe(0);
      const getR = await run(['config', 'get', 'profile'], active.root);
      expect(getR.stdout.trim()).toBe(v);
    }
  });

  it('config set profile rejects unknown literal', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['config', 'set', 'profile', 'lenient'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/profile/i);
  });
});
