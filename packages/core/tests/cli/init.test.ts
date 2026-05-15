import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@cadence/testkit';

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

  it('AC-1+AC-2: scripted prompter supplies name + gate profile', async () => {
    active = await tempRepo();
    const r = await run(['init'], active.root, {
      CADENCE_PROMPTER_SCRIPT: 'myproj\nstandard',
    });
    expect(r.code).toBe(0);
    const state = JSON.parse(
      readFileSync(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.project.name).toBe('myproj');
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.profile).toBe('standard');
  });

  it('AC-2: --gate-profile overrides the suggestion', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--gate-profile=strict'],
      active.root,
    );
    expect(r.code).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.profile).toBe('strict');
  });

  it('AC-4: non-TTY without flags applies defaults, no hang', async () => {
    active = await tempRepo();
    const r = await run(['init'], active.root);
    expect(r.code).toBe(0);
    const state = JSON.parse(
      readFileSync(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.project.name).toBe('unnamed');
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    // temp dir is not a git repo → heuristic falls back to auto
    expect(cfg.profile).toBe('auto');
  });

  it('AC-3: prints a post-init summary on stdout', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--gate-profile=standard'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Initialized CADENCE in .* \(profile=team\)/);
    expect(r.stdout).toMatch(/CADENCE initialized/);
    expect(r.stdout).toMatch(/project {2,}demo/);
    expect(r.stdout).toMatch(/gate profile {2,}standard/);
    expect(r.stdout).toMatch(/Next: edit \.cadence\/ROADMAP\.md/);
  });
});
