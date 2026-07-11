import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { detectProjectLanguage, detectTestGlobs } from '../../src/init/plan.js';

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

  it('returns rust defaults when Cargo.toml is present', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'Cargo.toml'), '[package]\nname = "widget"\n');
    expect(detectTestGlobs(active.root)).toEqual(['tests/**/*.rs', '**/*_test.rs']);
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
