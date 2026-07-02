import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { planInit, renderInitPlan, detectTestCommand } from '../../src/init/plan.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('planInit (phase 132, AC-1)', () => {
  it('resolves a fresh repo from the --name flag and writes nothing (pure)', async () => {
    active = await tempRepo();
    const before = await readdir(active.root);

    const plan = planInit(active.root, { name: 'widget' }, {}, false);

    expect(plan.cwd).toBe(active.root);
    expect(plan.name).toBe('widget');
    expect(plan.nameSource).toBe('flag');
    expect(plan.alreadyInitialized).toBe(false);
    expect(plan.preset).toBe('team');

    // pure: planning touches nothing on disk
    expect(existsSync(join(active.root, '.cadence'))).toBe(false);
    expect(await readdir(active.root)).toEqual(before);
  });

  it('derives the name from a scoped package.json#name (scope stripped)', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ name: '@acme/gadget' }),
    );

    const plan = planInit(active.root, {}, {}, false);

    expect(plan.name).toBe('gadget');
    expect(plan.nameSource).toBe('package.json');
  });

  it('falls back to the directory name when no flag and no package.json', async () => {
    active = await tempRepo();

    const plan = planInit(active.root, {}, {}, false);

    // basename(), not split('/') — the latter does not split Windows '\' paths
    expect(plan.name).toBe(basename(active.root));
    expect(plan.nameSource).toBe('dirname');
  });

  it('resolves the preset and its --profile alias', async () => {
    active = await tempRepo();
    expect(planInit(active.root, { preset: 'production' }, {}, false).preset).toBe(
      'production',
    );
    // --profile is the deprecated alias for --preset
    expect(planInit(active.root, { profile: 'solo' }, {}, false).preset).toBe('solo');
  });
});

describe('planInit gate profile (AC-1)', () => {
  it('honors an explicit --gate-profile and reports the source', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, { gateProfile: 'strict' }, {}, false);
    expect(plan.gateProfile).toBe('strict');
    expect(plan.gateProfileSource).toBe('flag');
  });

  it('suggests a profile from git history when the flag is omitted', async () => {
    active = await tempRepo(); // no git repo ⇒ suggestGateProfile falls back to auto
    const plan = planInit(active.root, {}, {}, false);
    expect(plan.gateProfile).toBe('auto');
    expect(plan.gateProfileSource).toBe('git-suggested');
  });

  it('throws on an invalid --gate-profile (same validation as the write path)', async () => {
    active = await tempRepo();
    expect(() => planInit(active.root, { gateProfile: 'bogus' }, {}, false)).toThrow(
      /Invalid --gate-profile/,
    );
  });
});

describe('planInit layout + test globs (AC-1)', () => {
  it('detects a single-package layout', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, {}, {}, false);
    expect(plan.layout).toBe('single-package');
    expect(plan.testGlobs).toEqual(['**/*.test.ts', '**/*.test.tsx']);
  });

  it('detects a monorepo when packages/ exists', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, 'packages'));
    const plan = planInit(active.root, {}, {}, false);
    expect(plan.layout).toBe('monorepo');
    expect(plan.testGlobs).toEqual([
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
    ]);
  });
});

describe('planInit verification / --activate (AC-4)', () => {
  it('defaults to the mock placeholder', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, {}, {}, false);
    expect(plan.verification.provider).toBe('mock');
    expect(plan.verification.realVerificationOn).toBe(false);
    expect(plan.verification.activateRequested).toBe(false);
  });

  it('--activate with ANTHROPIC_API_KEY wires anthropic (real verification on)', async () => {
    active = await tempRepo();
    const plan = planInit(
      active.root,
      { activate: true },
      { ANTHROPIC_API_KEY: 'sk-ant-test' },
      false,
    );
    expect(plan.verification.provider).toBe('anthropic');
    expect(plan.verification.realVerificationOn).toBe(true);
    expect(plan.verification.activateNoKey).toBe(false);
  });

  it('--activate without a key stays mock and flags activateNoKey', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, { activate: true }, {}, false);
    expect(plan.verification.provider).toBe('mock');
    expect(plan.verification.realVerificationOn).toBe(false);
    expect(plan.verification.activateRequested).toBe(true);
    expect(plan.verification.activateNoKey).toBe(true);
  });
});

describe('planInit testCommand (phase 139, AC-4)', () => {
  it('previews the derived testCommand for a repo with scripts.test + a lockfile', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    );
    await writeFile(join(active.root, 'pnpm-lock.yaml'), '');
    const plan = planInit(active.root, {}, {}, false);
    expect(plan.verification.testCommand).toBe('pnpm test');
  });

  it('previews null when nothing can be derived', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, {}, {}, false);
    expect(plan.verification.testCommand).toBeNull();
  });

  it('renderInitPlan shows the derived test command', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    );
    const plan = planInit(active.root, {}, {}, false);
    const out = renderInitPlan(plan);
    expect(out).toMatch(/test command\s+npm test/i);
  });
});

describe('planInit host wire decision (AC-1)', () => {
  it('reports no-claude when no .claude/ workspace exists', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, {}, {}, false);
    expect(plan.host.claudePresent).toBe(false);
    expect(plan.host.decision).toBe('no-claude');
    expect(plan.host.wouldWire).toBe(false);
  });

  it('would wire with --wire-host', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'));
    const plan = planInit(active.root, { wireHost: true }, {}, false);
    expect(plan.host.decision).toBe('wire');
    expect(plan.host.wouldWire).toBe(true);
  });

  it('skips with --skip-host-wire', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'));
    const plan = planInit(active.root, { skipHostWire: true }, {}, true);
    expect(plan.host.decision).toBe('skip');
    expect(plan.host.wouldWire).toBe(false);
  });

  it('would prompt when .claude/ present and a TTY is available', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'));
    const plan = planInit(active.root, {}, {}, true);
    expect(plan.host.decision).toBe('prompt');
  });

  it('skips non-TTY with no flag and no scripted prompter', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'));
    const plan = planInit(active.root, {}, {}, false);
    expect(plan.host.decision).toBe('skip-non-tty');
  });

  it('treats CADENCE_PROMPTER_SCRIPT as a prompter (would prompt)', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'));
    const plan = planInit(active.root, {}, { CADENCE_PROMPTER_SCRIPT: 'y' }, false);
    expect(plan.host.decision).toBe('prompt');
  });
});

describe('planInit would-write file list (AC-1, AC-4)', () => {
  it('lists the core scaffold for a fresh repo', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, {}, {}, false);
    expect(plan.files).toContain('.cadence/config.json');
    expect(plan.files).toContain('.cadence/state.json');
    expect(plan.files).toContain('.cadence/STATE.md');
    expect(plan.files).toContain('CLAUDE.md');
    expect(plan.files).not.toContain('.cadence/phases/01-demo/');
  });

  it('adds the demo phase DRAFT when --demo is set', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, { demo: true }, {}, false);
    expect(plan.demo).toBe(true);
    expect(plan.files).toContain('.cadence/phases/01-demo/');
    expect(plan.files.some((f) => f.includes('01-demo') && f.endsWith('-DRAFT.md'))).toBe(
      true,
    );
  });

  it('reports an empty would-write list on an already-initialized repo', async () => {
    active = await tempRepo({ initialized: true });
    const plan = planInit(active.root, {}, {}, false);
    expect(plan.alreadyInitialized).toBe(true);
    expect(plan.files).toEqual([]);
  });
});

describe('renderInitPlan (AC-1)', () => {
  it('renders the resolved fields and the would-create list, stating nothing was written', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, { name: 'widget', gateProfile: 'strict' }, {}, false);
    const out = renderInitPlan(plan);

    expect(out).toMatch(/dry run/i);
    expect(out).toContain('widget');
    expect(out).toContain('strict');
    expect(out).toMatch(/single-package/);
    expect(out).toMatch(/\*\*\/\*\.test\.ts/);
    expect(out).toMatch(/mock/);
    expect(out).toContain('.cadence/config.json');
    expect(out).toMatch(/nothing was written/i);
  });

  it('states a real init would refuse on an already-initialized repo', async () => {
    active = await tempRepo({ initialized: true });
    const plan = planInit(active.root, {}, {}, false);
    const out = renderInitPlan(plan);
    expect(out).toMatch(/already (initialized|exists)/i);
    expect(out).toMatch(/would refuse/i);
  });

  it('shows real verification on when anthropic is wired', async () => {
    active = await tempRepo();
    const plan = planInit(
      active.root,
      { activate: true },
      { ANTHROPIC_API_KEY: 'sk-ant-test' },
      false,
    );
    const out = renderInitPlan(plan);
    expect(out).toMatch(/anthropic/);
    expect(out).toMatch(/real verification on/i);
  });
});

describe('detectTestCommand (phase 139, AC-2/AC-3)', () => {
  it('falls back to "npm test" when scripts.test exists but no lockfile is present', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ name: 'widget', scripts: { test: 'vitest run' } }),
    );
    expect(detectTestCommand(active.root)).toBe('npm test');
  });

  it('prefixes "pnpm test" when pnpm-lock.yaml is present', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    );
    await writeFile(join(active.root, 'pnpm-lock.yaml'), '');
    expect(detectTestCommand(active.root)).toBe('pnpm test');
  });

  it('prefixes "yarn test" when yarn.lock is present', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ scripts: { test: 'jest' } }),
    );
    await writeFile(join(active.root, 'yarn.lock'), '');
    expect(detectTestCommand(active.root)).toBe('yarn test');
  });

  it('prefixes "bun test" when bun.lockb is present', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ scripts: { test: 'bun test ./src' } }),
    );
    await writeFile(join(active.root, 'bun.lockb'), '');
    expect(detectTestCommand(active.root)).toBe('bun test');
  });

  it('prefixes "npm test" when package-lock.json is present', async () => {
    active = await tempRepo();
    await writeFile(
      join(active.root, 'package.json'),
      JSON.stringify({ scripts: { test: 'mocha' } }),
    );
    await writeFile(join(active.root, 'package-lock.json'), '{}');
    expect(detectTestCommand(active.root)).toBe('npm test');
  });

  it('returns null when package.json has no scripts.test', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'package.json'), JSON.stringify({ name: 'widget' }));
    expect(detectTestCommand(active.root)).toBeNull();
  });

  it('returns null when there is no package.json at all', async () => {
    active = await tempRepo();
    expect(detectTestCommand(active.root)).toBeNull();
  });
});
