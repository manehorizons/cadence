import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverKey } from '../../src/activate/key-discovery.js';

describe('discoverKey (AC-1)', () => {
  const dirs: string[] = [];

  const makeTmpDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'cadence-key-discovery-'));
    dirs.push(dir);
    return dir;
  };

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prefers env over a .env file when both are present (AC-1)', () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, '.env'), 'ANTHROPIC_API_KEY=from-dotenv\n');
    const result = discoverKey('ANTHROPIC_API_KEY', { ANTHROPIC_API_KEY: 'from-env' }, cwd);
    expect(result).toEqual({ value: 'from-env', source: 'env' });
  });

  it('falls back to a .env file at cwd when the env var is unset (AC-1)', () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, '.env'), 'SOME_OTHER=1\nANTHROPIC_API_KEY=from-dotenv\n');
    const result = discoverKey('ANTHROPIC_API_KEY', {}, cwd);
    expect(result).toEqual({ value: 'from-dotenv', source: 'dotenv' });
  });

  it('returns undefined value and source when neither env nor .env has the key', () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, '.env'), 'UNRELATED=1\n');
    const result = discoverKey('ANTHROPIC_API_KEY', {}, cwd);
    expect(result).toEqual({ value: undefined, source: undefined });
  });

  it('returns undefined when there is no .env file at all', () => {
    const cwd = makeTmpDir();
    const result = discoverKey('ANTHROPIC_API_KEY', {}, cwd);
    expect(result).toEqual({ value: undefined, source: undefined });
  });

  it('handles quoted values and comments in the .env file', () => {
    const cwd = makeTmpDir();
    writeFileSync(
      cwd + '/.env',
      ['# a comment', '', 'ANTHROPIC_API_KEY="quoted-value"', 'OTHER=\'single-quoted\''].join('\n'),
    );
    const result = discoverKey('ANTHROPIC_API_KEY', {}, cwd);
    expect(result).toEqual({ value: 'quoted-value', source: 'dotenv' });
  });
});
