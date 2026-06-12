import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { scanTestCoverage } from '../../src/verify/coverage.js';

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
  });

  it('AC-1+AC-2 (phase 62): prints the guided first-loop nudge', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    // AC-1: a numbered first-loop sequence with the real first commands.
    expect(r.stdout).toMatch(/Your first loop/);
    expect(r.stdout).toMatch(/cadence draft new/);
    expect(r.stdout).toMatch(/cadence draft approve/);
    expect(r.stdout).toMatch(/cadence settle run/);
    // AC-2: the `cadence progress` escape hatch + Docs pointer.
    expect(r.stdout).toMatch(/cadence progress/);
    expect(r.stdout).toMatch(/Docs:/);
  });

  it('AC-5: init output points at cadence activate for real verification', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Turn on real verification/);
    expect(r.stdout).toMatch(/cadence activate/);
  });

  // phase-104 AC-4/Q2: a dedicated block naming the default mock a placeholder.
  it('phase-104: init names the default mock a placeholder (not real verification)', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/placeholder/i);
    expect(r.stdout).toMatch(/not real verification/i);
  });
});

describe('cadence init — --preset flag rename (rec-20260602-001)', () => {
  it('AC-1: --preset selects the config preset with no deprecation notice', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--preset=solo'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.loopEnforcement).toBe('reminder');
    expect(r.stderr).not.toMatch(/deprecated/i);
  });

  it('AC-2: --profile still applies the preset AND warns it is deprecated', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--profile=production'],
      active.root,
    );
    expect(r.code).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.loopEnforcement).toBe('strict');
    expect(cfg.hooks.preToolUseBuildGate).toBe(true);
    expect(r.stderr).toMatch(/--profile.*deprecated.*--preset/i);
  });

  it('AC-3: --preset wins when both flags are passed', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--preset=production', '--profile=solo'],
      active.root,
    );
    expect(r.code).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.loopEnforcement).toBe('strict');
  });

  it('AC-3: preset defaults to team when neither flag is passed', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.loopEnforcement).toBe('soft');
    expect(r.stderr).not.toMatch(/deprecated/i);
  });

  it('AC-4: commands.md documents --preset as primary and --profile as deprecated', () => {
    const doc = readFileSync(
      join(__dirname, '../../../../docs/reference/commands.md'),
      'utf8',
    );
    expect(doc).toMatch(/`--preset <preset>`/);
    expect(doc).toMatch(/`--profile <preset>`.*[Dd]eprecated/);
  });
});

describe('cadence init — F2 layout-detected testGlobs', () => {
  it('AC-1: monorepo (packages/ present) keeps the workspace testGlobs', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, 'packages'), { recursive: true });
    const r = await run(
      ['init', '--name=mono', '--gate-profile=auto'],
      active.root,
    );
    expect(r.code).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.verification.testGlobs).toEqual([
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
    ]);
    expect(r.stdout).toMatch(/layout {2,}monorepo/);
  });

  it('AC-2: single-package repo gets a glob the coverage scanner matches', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, 'tests'), { recursive: true });
    await writeFile(
      join(active.root, 'tests/sample.test.ts'),
      'it("covers AC-2 from a tests/ dir", () => {});\n',
    );
    const r = await run(
      ['init', '--name=single', '--gate-profile=auto'],
      active.root,
    );
    expect(r.code).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.verification.testGlobs).toEqual([
      '**/*.test.ts',
      '**/*.test.tsx',
    ]);
    // F2 runtime proof: the written glob actually links the AC.
    const cov = await scanTestCoverage(active.root, {
      globs: cfg.verification.testGlobs,
    });
    expect((cov.get('AC-2') ?? []).length).toBeGreaterThan(0);
  });

  it('AC-3: post-init summary reports detected layout + effective globs', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=s', '--gate-profile=auto'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/layout {2,}single-package/);
    expect(r.stdout).toMatch(/test globs {2,}\*\*\/\*\.test\.ts/);
  });
});

describe('cadence init — F1/F4/F6 remediation', () => {
  it('AC-2: standard gate profile prints the non-TTY draft-approve hint', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--gate-profile=standard'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/cadence draft approve/);
    expect(r.stdout).toMatch(/--no-approve/);
    expect(r.stdout).toMatch(/non-TTY/);
  });

  it('AC-2: auto gate profile omits the approve hint', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--gate-profile=auto'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/--no-approve/);
  });

  it('AC-3: summary disambiguates config preset vs gate profile', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--gate-profile=auto'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/config preset — workflow defaults/);
    expect(r.stdout).toMatch(/gate strictness: strict\|standard\|auto/);
  });
});
