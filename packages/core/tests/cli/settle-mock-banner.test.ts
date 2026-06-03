import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], {
      cwd,
      env: { ...process.env, ANTHROPIC_API_KEY: '' },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

async function seedBuild(root: string): Promise<void> {
  await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], root);
  await run(['draft', 'approve', '01-foundation', '01'], root);
  await run(['build', 'task', 'T1', '--status=DONE'], root);
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

// AC-3 — loud banner only on the silent mock-default path under --deep
describe('settle run --deep mock-fallback banner', () => {
  it('warns loudly when --deep falls back to mock by default (AC-3)', async () => {
    active = await tempRepo({ initialized: true }); // default config has no verifier slice
    await seedBuild(active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--deep', '--allow-missing-coverage', '--force'],
      active.root,
    );
    expect(r.stderr).toMatch(/MOCK verification/);
  });

  it('does not warn when --deep is absent (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await seedBuild(active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage', '--force'],
      active.root,
    );
    expect(r.stderr).not.toMatch(/MOCK verification/);
  });

  it('does not show the banner when a real provider is configured (AC-3)', async () => {
    // anthropic configured (no key in this env): the verifier factory prints
    // its own "falling back to mock" warning; our onboarding banner stays out
    // of the way — provider config is a real provider, not mock.
    active = await tempRepo({ initialized: true });
    const cfgPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.verifier = { provider: 'anthropic' };
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
    await seedBuild(active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--deep', '--allow-missing-coverage', '--force'],
      active.root,
    );
    expect(r.stderr).not.toMatch(/MOCK verification/);
  });
});
