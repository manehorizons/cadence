import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

describe('cadence init', () => {
  it('scaffolds .cadence/ with team preset by default', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, '.cadence/config.json'))).toBe(true);
    expect(existsSync(join(active.root, '.cadence/state.json'))).toBe(true);
    const cfg = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(cfg.loopEnforcement).toBe('soft');
  });

  it('applies --profile=production', async () => {
    active = await tempRepo();
    await run(['init', '--name=demo', '--profile=production'], active.root);
    const cfg = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(cfg.loopEnforcement).toBe('strict');
    expect(cfg.hooks.preToolUseBuildGate).toBe(true);
  });

  it('refuses to overwrite existing .cadence/', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/already initialized/i);
  });
});
