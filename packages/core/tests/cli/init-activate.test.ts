import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

function run(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

function readConfig(root: string): { text: string; cfg: any } {
  const text = readFileSync(join(root, '.cadence/config.json'), 'utf8');
  return { text, cfg: JSON.parse(text) };
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

const FAKE_KEY = 'sk-ant-test-DO-NOT-PERSIST';

describe('cadence init --activate (phase 110, rec-20260617-004)', () => {
  it('AC-1: --activate with a key wires anthropic and never persists the key', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--activate'], active.root, {
      ANTHROPIC_API_KEY: FAKE_KEY,
    });
    expect(r.code).toBe(0);
    const { text, cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('anthropic');
    expect(text).not.toContain(FAKE_KEY);
  });

  it('AC-2: no key (no flag) stays mock and points at cadence activate', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
    expect(r.stdout).toMatch(/cadence activate/);
  });

  it('AC-2/AC-4: --activate without a key stays mock + prints the export hint (no hang)', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--activate'], active.root, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
    expect(r.stdout).toMatch(/export ANTHROPIC_API_KEY/);
    expect(r.stdout).toMatch(/staying on mock/i);
  });

  it('AC-5: the mock-not-real notice is suppressed once anthropic is wired', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--activate'], active.root, {
      ANTHROPIC_API_KEY: FAKE_KEY,
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/real verification on: anthropic/);
    expect(r.stdout).not.toMatch(/not real verification/i);
  });

  it('AC-3: init reuses the activate seam (planActivation + setPath), no bespoke mutation', () => {
    const src = readFileSync(
      join(__dirname, '../../src/cli/commands/init.ts'),
      'utf8',
    );
    expect(src).toMatch(/planActivation/);
    expect(src).toMatch(/setPath/);
  });
});
