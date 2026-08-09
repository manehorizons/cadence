import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import {
  detectProjectLanguage,
  detectTestGlobs,
  planInit,
  renderInitPlan,
  resolveProviderSelection,
} from '../../src/init/plan.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('detectProjectLanguage (phase 166, AC-1)', () => {
  it('detects js/ts from package.json', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'package.json'), JSON.stringify({ name: 'widget' }));
    expect(detectProjectLanguage(active.root)).toBe('js');
  });

  it('detects python from pyproject.toml', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'pyproject.toml'), '[project]\nname = "widget"\n');
    expect(detectProjectLanguage(active.root)).toBe('python');
  });

  it('detects python from setup.py', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'setup.py'), 'from setuptools import setup\n');
    expect(detectProjectLanguage(active.root)).toBe('python');
  });

  it('detects python from requirements.txt', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'requirements.txt'), 'requests==2.31.0\n');
    expect(detectProjectLanguage(active.root)).toBe('python');
  });

  it('detects go from go.mod', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'go.mod'), 'module widget\n');
    expect(detectProjectLanguage(active.root)).toBe('go');
  });

  it('detects rust from Cargo.toml', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'Cargo.toml'), '[package]\nname = "widget"\n');
    expect(detectProjectLanguage(active.root)).toBe('rust');
  });

  it('detects php from composer.json', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'composer.json'), JSON.stringify({ name: 'widget' }));
    expect(detectProjectLanguage(active.root)).toBe('php');
  });

  it('falls back to unknown when no marker file is found', async () => {
    active = await tempRepo();
    expect(detectProjectLanguage(active.root)).toBe('unknown');
  });

  it('prefers package.json over a nested/co-located python marker (deterministic priority)', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'package.json'), JSON.stringify({ name: 'widget' }));
    await writeFile(join(active.root, 'pyproject.toml'), '[project]\nname = "widget"\n');
    expect(detectProjectLanguage(active.root)).toBe('js');
  });

  it('never throws on a non-existent directory, falling back to unknown', () => {
    expect(() => detectProjectLanguage('/definitely/does/not/exist/anywhere')).not.toThrow();
    expect(detectProjectLanguage('/definitely/does/not/exist/anywhere')).toBe('unknown');
  });
});

describe('detectTestGlobs language-aware defaults (phase 166, AC-2)', () => {
  it('returns python defaults when a python marker is present', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'pyproject.toml'), '[project]\nname = "widget"\n');
    expect(detectTestGlobs(active.root)).toEqual(['**/test_*.py', '**/*_test.py']);
  });

  it('returns go defaults when go.mod is present', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'go.mod'), 'module widget\n');
    expect(detectTestGlobs(active.root)).toEqual(['**/*_test.go']);
  });

  it('returns rust defaults when Cargo.toml is present, including src/**/*.rs (phase 167, AC-10)', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'Cargo.toml'), '[package]\nname = "widget"\n');
    expect(detectTestGlobs(active.root)).toEqual(['tests/**/*.rs', '**/*_test.rs', 'src/**/*.rs']);
  });

  it('returns php defaults when composer.json is present', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'composer.json'), JSON.stringify({ name: 'widget' }));
    expect(detectTestGlobs(active.root)).toEqual(['**/*Test.php', 'tests/**/*.php']);
  });

  it('regression: single-package js/ts layout is unchanged', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'package.json'), JSON.stringify({ name: 'widget' }));
    expect(detectTestGlobs(active.root)).toEqual(['**/*.test.ts', '**/*.test.tsx']);
  });

  it('regression: monorepo js/ts layout (packages/ present) is unchanged', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'package.json'), JSON.stringify({ name: 'widget' }));
    await mkdir(join(active.root, 'packages'));
    expect(detectTestGlobs(active.root)).toEqual([
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
    ]);
  });

  it('regression: unknown language with no markers keeps the js/ts fallback globs', async () => {
    active = await tempRepo();
    expect(detectTestGlobs(active.root)).toEqual(['**/*.test.ts', '**/*.test.tsx']);
  });

  it('accepts an explicit lang override so callers can avoid a second detection pass', async () => {
    active = await tempRepo();
    // cwd has no markers at all, but an explicit override still wins
    expect(detectTestGlobs(active.root, 'go')).toEqual(['**/*_test.go']);
  });
});

describe('resolveProviderSelection (phase 265, T1, AC-1/AC-2)', () => {
  it('265-01/AC-1: a TTY with no flags reports that a real init would prompt to choose explicitly', () => {
    expect(resolveProviderSelection({}, {}, true)).toEqual({ action: 'prompt' });
  });

  it('265-01/AC-1: CADENCE_PROMPTER_SCRIPT with no flags also reports prompt -- keying off isTTY alone would misclassify this as default-mock', () => {
    expect(
      resolveProviderSelection({}, { CADENCE_PROMPTER_SCRIPT: 'mock\n' }, false),
    ).toEqual({ action: 'prompt' });
  });

  it('265-01/AC-2: neither a TTY nor CADENCE_PROMPTER_SCRIPT with no flags resolves to default-mock, never a prompt', () => {
    expect(resolveProviderSelection({}, {}, false)).toEqual({ action: 'default-mock' });
  });

  it('265-01/AC-2: an explicit --verifier-provider flag wins outright, even under a TTY (never prompts)', () => {
    expect(resolveProviderSelection({ verifierProvider: 'local' }, {}, true)).toEqual({
      action: 'use',
      provider: 'local',
      scope: 'deep-verify',
      source: 'flag',
    });
  });

  it('265-01/AC-2: --verifier-provider can express host-cli, this repo\'s own live deep-verify provider', () => {
    expect(resolveProviderSelection({ verifierProvider: 'host-cli' }, {}, false)).toEqual({
      action: 'use',
      provider: 'host-cli',
      scope: 'deep-verify',
      source: 'flag',
    });
  });

  it('265-01/AC-2: --verifier-provider wins over --activate when both are given', () => {
    expect(
      resolveProviderSelection(
        { verifierProvider: 'host-cli', activate: true },
        { ANTHROPIC_API_KEY: 'sk-ant-test' },
        true,
      ),
    ).toEqual({ action: 'use', provider: 'host-cli', scope: 'deep-verify', source: 'flag' });
  });

  it('265-01/AC-2: --activate with ANTHROPIC_API_KEY present resolves to anthropic outright, even under a TTY (never prompts)', () => {
    expect(
      resolveProviderSelection({ activate: true }, { ANTHROPIC_API_KEY: 'sk-ant-test' }, true),
    ).toEqual({ action: 'use', provider: 'anthropic', scope: 'deep-verify', source: 'activate' });
  });

  it('265-01/AC-2: --activate without a key stays mock (D-B: never coerced to a real provider), outright rather than prompting', () => {
    expect(resolveProviderSelection({ activate: true }, {}, true)).toEqual({
      action: 'use',
      provider: 'mock',
      scope: 'deep-verify',
      source: 'activate',
    });
  });

  it('265-01/AC-2: --full behaves the same as --activate -- anthropic when a key is present, outright even under a TTY', () => {
    expect(
      resolveProviderSelection({ full: true }, { ANTHROPIC_API_KEY: 'sk-ant-test' }, true),
    ).toEqual({ action: 'use', provider: 'anthropic', scope: 'deep-verify', source: 'full' });
  });

  it('265-01/AC-2: --full behaves the same as --activate -- stays mock with no key, never prompting', () => {
    expect(resolveProviderSelection({ full: true }, {}, false)).toEqual({
      action: 'use',
      provider: 'mock',
      scope: 'deep-verify',
      source: 'full',
    });
  });

  it('265-01/AC-2: --activate wins the reported source over --full when both are set', () => {
    expect(resolveProviderSelection({ activate: true, full: true }, {}, false)).toEqual({
      action: 'use',
      provider: 'mock',
      scope: 'deep-verify',
      source: 'activate',
    });
  });
});

describe('planInit verification.selection + renderInitPlan dry-run reporting (phase 265, T1, AC-1/AC-2)', () => {
  it('265-01/AC-2: dry-run reports default-mock with no flags and no prompter available, and resolving/rendering the plan writes nothing', async () => {
    active = await tempRepo();
    const before = await readdir(active.root);

    const plan = planInit(active.root, {}, {}, false);
    expect(plan.verification.selection).toEqual({ action: 'default-mock' });
    expect(plan.verification.provider).toBe('mock');

    const out = renderInitPlan(plan);
    expect(out).toMatch(/defaults to mock/i);

    // pure: neither resolving nor rendering the plan touches disk
    expect(existsSync(join(active.root, '.cadence'))).toBe(false);
    expect(await readdir(active.root)).toEqual(before);
  });

  it('265-01/AC-1: dry-run reports prompt under a TTY with no flags, and renderInitPlan describes it without ever prompting', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, {}, {}, true);
    expect(plan.verification.selection).toEqual({ action: 'prompt' });

    const out = renderInitPlan(plan);
    expect(out).toMatch(/would prompt/i);
  });

  it('265-01/AC-1: dry-run reports prompt when CADENCE_PROMPTER_SCRIPT is set even without a TTY (the scripted-test seam)', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, {}, { CADENCE_PROMPTER_SCRIPT: 'mock\n' }, false);
    expect(plan.verification.selection).toEqual({ action: 'prompt' });
  });

  it('265-01/AC-2: dry-run reports an explicit --verifier-provider flag outright and never a prompt, even under a TTY', async () => {
    active = await tempRepo();
    const plan = planInit(active.root, { verifierProvider: 'local' }, {}, true);
    expect(plan.verification.selection).toEqual({
      action: 'use',
      provider: 'local',
      scope: 'deep-verify',
      source: 'flag',
    });
    expect(plan.verification.provider).toBe('local');
    expect(plan.verification.realVerificationOn).toBe(true);

    const out = renderInitPlan(plan);
    expect(out).toMatch(/local/);
    expect(out).not.toMatch(/would prompt/i);
  });

  it('265-01/AC-2: dry-run reports --full resolving to anthropic when a key is present, matching --activate\'s behavior', async () => {
    active = await tempRepo();
    const plan = planInit(
      active.root,
      { full: true },
      { ANTHROPIC_API_KEY: 'sk-ant-test' },
      false,
    );
    expect(plan.verification.selection).toEqual({
      action: 'use',
      provider: 'anthropic',
      scope: 'deep-verify',
      source: 'full',
    });
    expect(plan.verification.provider).toBe('anthropic');

    const out = renderInitPlan(plan);
    expect(out).toMatch(/via --full/);
  });
});

describe('rust default testGlobs widened for inline unit tests (phase 167, T4, AC-10)', () => {
  it('a fresh cadence init in a rust project writes src/**/*.rs alongside tests/**/*.rs and **/*_test.rs (AC-10)', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'Cargo.toml'), '[package]\nname = "widget"\n');

    const plan = planInit(active.root, {}, {}, false);

    expect(plan.alreadyInitialized).toBe(false);
    expect(plan.testGlobs).toEqual(['tests/**/*.rs', '**/*_test.rs', 'src/**/*.rs']);
  });

  it('an already-initialized rust project is never rewritten by init (AC-10, init-time only, phase 139/166 precedent)', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(join(active.root, 'Cargo.toml'), '[package]\nname = "widget"\n');

    const plan = planInit(active.root, {}, {}, false);

    // A real `cadence init` refuses outright once .cadence/ exists (init.ts
    // exits before any glob detection is written to disk) — the empty
    // `files` list is what actually governs writes; `testGlobs` is still
    // computed for planning/preview purposes but nothing is written from it.
    expect(plan.alreadyInitialized).toBe(true);
    expect(plan.files).toEqual([]);
  });
});
