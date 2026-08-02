import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
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

  // Phase 239 (T5, AC-5 clause b): `defaultConfig` deliberately holds 'bare'
  // for back-compat — `loadConfig` merges user config OVER it, so a strict
  // value there would silently flip every pre-existing consumer on upgrade.
  // That makes init's verification overlay the SOLE opt-in point for the
  // whole phase-qualified scheme. Without this test, an overlay that quietly
  // stopped writing the field would leave every fresh init on the bare
  // scheme, turn the phase into a no-op for new projects, and keep the entire
  // suite green. Asserts against the real spawned CLI and the config.json it
  // actually wrote — not the schema in isolation.
  it('239-01/AC-5: a fresh init writes coverageScheme: phase-qualified into config.json', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(cfg.verification.coverageScheme).toBe('phase-qualified');
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

  // rec-20260726-002 — a fresh worktree/clone has .cadence/ committed but
  // never state.json (gitignored since phase 196); `init` must still refuse
  // (never silently bootstrap), but point at `cadence onboard`, which already
  // handles this case safely, instead of leaving a dead end.
  it('refusal points at `cadence onboard` when .cadence/ exists but state.json does not', async () => {
    active = await tempRepo({ initialized: true });
    const { rm } = await import('node:fs/promises');
    await rm(join(active.root, '.cadence/state.json'));
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/cadence onboard/);
  });

  it('AC-2: --gate-profile + --name still set name and profile explicitly', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=myproj', '--gate-profile=standard'], active.root);
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

  it('AC-4: non-TTY without flags derives a real name + git profile, no hang', async () => {
    active = await tempRepo();
    const r = await run(['init'], active.root);
    expect(r.code).toBe(0);
    const state = JSON.parse(
      readFileSync(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    // phase 108: name is derived (dir basename here), never the literal `unnamed`.
    expect(state.project.name).not.toBe('unnamed');
    expect(state.project.name.length).toBeGreaterThan(0);
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
    expect(r.stdout).toMatch(/--template bugfix/);
    expect(r.stdout).toMatch(/templates are scaffolds, not proof/);
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

describe('cadence init — testCommand derivation (phase 139, AC-2/AC-3/AC-4)', () => {
  it('AC-2: writes a pnpm-prefixed testCommand when scripts.test + pnpm-lock.yaml exist', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ name: 'widget', scripts: { test: 'vitest run' } }),
    );
    await writeFile(join(active.root, 'pnpm-lock.yaml'), '');
    const r = await run(['init', '--gate-profile=auto'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.verification.testCommand).toBe('pnpm test');
  });

  it('AC-3: no testCommand written when there is no scripts.test', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=nodejs', '--gate-profile=auto'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.verification.testCommand).toBeUndefined();
  });

  it('AC-4: --dry-run previews the same testCommand a real init would write', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    );
    const dry = await run(['init', '--dry-run', '--gate-profile=auto'], active.root);
    expect(dry.code).toBe(0);
    expect(dry.stdout).toMatch(/test command\s+npm test/i);
    expect(existsSync(join(active.root, '.cadence'))).toBe(false);

    const real = await run(['init', '--gate-profile=auto'], active.root);
    expect(real.code).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(active.root, '.cadence/config.json'), 'utf8'),
    );
    expect(cfg.verification.testCommand).toBe('npm test');
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

describe('cadence init — phase 108 zero-prompt + auto-wire (rec-20260617-001)', () => {
  it('AC-1: derives the project name from package.json and asks nothing', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ name: '@scope/cool-app' }),
    );
    const r = await run(['init'], active.root);
    expect(r.code).toBe(0);
    const state = JSON.parse(
      readFileSync(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    // scope stripped to the trailing segment.
    expect(state.project.name).toBe('cool-app');
    // zero-prompt: no name/profile question was emitted.
    expect(r.stdout + r.stderr).not.toMatch(/Project name/i);
    expect(r.stdout + r.stderr).not.toMatch(/Profile \[/i);
  });

  it('AC-2: --name overrides the derived package.json name', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ name: 'derived-name' }),
    );
    const r = await run(['init', '--name=explicit'], active.root);
    expect(r.code).toBe(0);
    const state = JSON.parse(
      readFileSync(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.project.name).toBe('explicit');
  });

  it('AC-3: --wire-host spawns the host install via the wire seam', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'), { recursive: true });
    const sentinel = join(active.root, 'sentinel.cjs');
    await writeFile(
      sentinel,
      "require('fs').writeFileSync(require('path').join(process.cwd(),'WIRED'),'ok');",
    );
    const r = await run(['init', '--name=demo', '--wire-host'], active.root, {
      CADENCE_HOST_WIRE_CMD: JSON.stringify([process.execPath, sentinel]),
    });
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, 'WIRED'))).toBe(true);
    expect(r.stdout).toMatch(/Claude Code/i);
  });

  it('AC-3/AC-4: non-TTY without --wire-host skips the wire (no hang) and prints a pointer', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'), { recursive: true });
    const sentinel = join(active.root, 'sentinel.cjs');
    await writeFile(
      sentinel,
      "require('fs').writeFileSync(require('path').join(process.cwd(),'WIRED'),'ok');",
    );
    const r = await run(['init', '--name=demo'], active.root, {
      CADENCE_HOST_WIRE_CMD: JSON.stringify([process.execPath, sentinel]),
    });
    expect(r.code).toBe(0);
    // skipped: the seam never ran.
    expect(existsSync(join(active.root, 'WIRED'))).toBe(false);
    // but a discoverability pointer is printed.
    expect(r.stdout).toMatch(/cadence-host-claude-code install/);
  });

  it('AC-3: init.ts source does not import the host package (spawn seam only)', () => {
    const src = readFileSync(
      join(__dirname, '../../src/cli/commands/init.ts'),
      'utf8',
    );
    expect(src).not.toMatch(
      /import[\s\S]*from\s*['"]@thomas-powers-jr\/cadence-host-claude-code['"]/,
    );
  });

  it('AC-5: --claude-md still works on an already-initialized repo', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['init', '--claude-md'], active.root);
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, 'CLAUDE.md'))).toBe(true);
  });

  it('AC-6: --host codex spawns the Codex host install and writes AGENTS.md', async () => {
    active = await tempRepo();
    const sentinel = join(active.root, 'sentinel.cjs');
    await writeFile(
      sentinel,
      "require('fs').writeFileSync(require('path').join(process.cwd(),'CODEX_WIRED'),'ok');",
    );
    const r = await run(['init', '--name=demo', '--host=codex'], active.root, {
      CADENCE_HOST_CODEX_WIRE_CMD: JSON.stringify([process.execPath, sentinel]),
    });
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, 'CODEX_WIRED'))).toBe(true);
    expect(existsSync(join(active.root, 'AGENTS.md'))).toBe(true);
    expect(readFileSync(join(active.root, 'AGENTS.md'), 'utf8')).toMatch(
      /cadence init --agents-md/,
    );
    expect(r.stdout).toMatch(/Codex first run/);
  });

  it('AC-6: --agents-md works on an already-initialized repo', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['init', '--agents-md'], active.root);
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, 'AGENTS.md'))).toBe(true);
    expect(r.stdout).toMatch(/AGENTS\.md created/);
  });

  it('AC-6: --agents-md preserves marker-less user-owned AGENTS.md', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(join(active.root, 'AGENTS.md'), '# User rules\n');
    const r = await run(['init', '--agents-md'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/AGENTS\.md preserved/);
    expect(readFileSync(join(active.root, 'AGENTS.md'), 'utf8')).toBe('# User rules\n');
  });

  it('AC-6: invalid --host refuses before writing', async () => {
    active = await tempRepo();
    const r = await run(['init', '--host=vim'], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/Unknown host/);
    expect(existsSync(join(active.root, '.cadence'))).toBe(false);
  });
});

describe('cadence init — language-aware coverageMode default (phase 166, AC-1, T2)', () => {
  it('python project: writes coverageMode mention and prints a stderr notice naming python', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'pyproject.toml'), '[project]\nname = "widget"\n');
    const r = await run(['init', '--name=pyproj', '--gate-profile=auto'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(cfg.verification.coverageMode).toBe('mention');
    expect(r.stderr).toMatch(/coverageMode/);
    expect(r.stderr).toMatch(/python/);
  });

  it('go project: writes coverageMode mention and prints a stderr notice naming go', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'go.mod'), 'module widget\n');
    const r = await run(['init', '--name=goproj', '--gate-profile=auto'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(cfg.verification.coverageMode).toBe('mention');
    expect(r.stderr).toMatch(/coverageMode/);
    expect(r.stderr).toMatch(/go/);
  });

  it('rust project: writes coverageMode mention and prints a stderr notice naming rust', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'Cargo.toml'), '[package]\nname = "widget"\n');
    const r = await run(['init', '--name=rustproj', '--gate-profile=auto'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(cfg.verification.coverageMode).toBe('mention');
    expect(r.stderr).toMatch(/coverageMode/);
    expect(r.stderr).toMatch(/rust/);
  });

  it('php project: writes coverageMode mention and prints a stderr notice naming php', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'composer.json'), JSON.stringify({ name: 'widget' }));
    const r = await run(['init', '--name=phpproj', '--gate-profile=auto'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(cfg.verification.coverageMode).toBe('mention');
    expect(r.stderr).toMatch(/coverageMode/);
    expect(r.stderr).toMatch(/php/);
  });

  it('unknown language (no marker files): writes coverageMode mention and prints a stderr notice naming unknown', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=unknownproj', '--gate-profile=auto'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(cfg.verification.coverageMode).toBe('mention');
    expect(r.stderr).toMatch(/coverageMode/);
    expect(r.stderr).toMatch(/unknown/);
  });

  it('js/ts project: coverageMode stays assertion (unchanged), no coverageMode notice printed', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'package.json'), JSON.stringify({ name: 'widget' }));
    const r = await run(['init', '--name=jsproj', '--gate-profile=auto'], active.root);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(cfg.verification.coverageMode).toBe('assertion');
    expect(r.stderr).not.toMatch(/coverageMode/);
  });

  it('never rewrites coverageMode on an existing .cadence/config.json (init-time only)', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(join(active.root, 'pyproject.toml'), '[project]\nname = "widget"\n');
    const before = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).not.toBe(0);
    const after = JSON.parse(readFileSync(join(active.root, '.cadence/config.json'), 'utf8'));
    expect(after.verification.coverageMode).toBe(before.verification.coverageMode);
  });
});
