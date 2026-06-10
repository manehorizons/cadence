import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

describe('cadence quickstart', () => {
  // AC-4: in a fresh (non-init) dir, shows the uninitialized front door, exit 0.
  it('AC-4: uninitialized front door, exit 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qs-'));
    const r = await run(['quickstart'], dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/not set up/i);
    expect(r.stdout).toMatch(/cadence init/);
  });

  // AC-5: in an initialized repo, shows the progress-equivalent next move, exit 0.
  it('AC-5: initialized shows the next move', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['quickstart'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/initialized/i);
    expect(r.stdout).toMatch(/Next:/);
  });

  // AC-6: --json emits structured output with a status field.
  it('AC-6: --json emits structured output', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['quickstart', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.status).toBe('initialized');
    expect(Array.isArray(parsed.commandMap)).toBe(true);
  });

  // AC-7: a corrupt state.json degrades to the front door, never crashes (exit 0).
  it('AC-7: corrupt state.json degrades to the front door', async () => {
    active = await tempRepo({ initialized: true });
    writeFileSync(join(active.root, '.cadence', 'state.json'), '{ this is not json');
    const r = await run(['quickstart'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/not set up|Onboarding commands/i);
  });
});
