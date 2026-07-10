import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CadenceConfigZ, defaultConfig } from '@manehorizons/cadence-types';
import { assessReadiness, credsPresent, VERIFIER_SEAMS } from '../../src/activate/assess.js';

const cfg = (overrides: Record<string, unknown> = {}) =>
  CadenceConfigZ.parse({ ...defaultConfig, ...overrides });

const dirs: string[] = [];
const makeTmpDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'cadence-assess-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('assessReadiness (AC-6)', () => {
  it('reports all-mock posture on a default config', () => {
    const r = assessReadiness(cfg(), {});
    expect(r.provider).toBe('mock');
    expect(r.ready).toBe(false);
    expect(r.seamsReal).toEqual([]);
    expect(r.seamsMock).toEqual([...VERIFIER_SEAMS]);
    expect(r.reason).toMatch(/mock/i);
  });

  it('is ready when deep-verify is anthropic and the key is present', () => {
    const r = assessReadiness(cfg({ verifier: { provider: 'anthropic' } }), {
      ANTHROPIC_API_KEY: 'sk-test',
    });
    expect(r.provider).toBe('anthropic');
    expect(r.keyPresent).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.seamsReal).toContain('verifier');
  });

  it('is not ready when anthropic is selected but the key is absent', () => {
    const r = assessReadiness(cfg({ verifier: { provider: 'anthropic' } }), {});
    expect(r.keyPresent).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/missing/i);
  });

  it('local creds need a base URL and a model', () => {
    const c = cfg({ verifier: { provider: 'local', model: 'm' } });
    expect(credsPresent('local', 'verifier', c, {})).toBe(false);
    expect(credsPresent('local', 'verifier', c, { CADENCE_LOCAL_BASE_URL: 'http://x' })).toBe(true);
  });

  it('credsPresent treats a key discoverable only via .env as present (AC-1)', () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, '.env'), 'ANTHROPIC_API_KEY=from-dotenv\n');
    const c = cfg({ verifier: { provider: 'anthropic' } });
    expect(credsPresent('anthropic', 'verifier', c, {}, cwd)).toBe(true);
  });

  it('credsPresent resolves local base URL + model from .env (AC-1)', () => {
    const cwd = makeTmpDir();
    writeFileSync(
      cwd + '/.env',
      'CADENCE_LOCAL_BASE_URL=http://dotenv-host\nCADENCE_LOCAL_MODEL=dotenv-model\n',
    );
    const c = cfg({ verifier: { provider: 'local' } });
    expect(credsPresent('local', 'verifier', c, {}, cwd)).toBe(true);
  });

  it('assessReadiness is ready for a teammate whose key lives only in .env, once anthropic is committed to config (AC-1, AC-3)', () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, '.env'), 'ANTHROPIC_API_KEY=from-dotenv\n');
    // Simulates a teammate who never ran `cadence activate` themselves: the
    // provider choice came from committed config, and their key is only in .env.
    const r = assessReadiness(cfg({ verifier: { provider: 'anthropic' } }), {}, cwd);
    expect(r.provider).toBe('anthropic');
    expect(r.keyPresent).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.reason).toMatch(/credentials present/i);
  });

  it('assessReadiness without a cwd still defaults safely (no .env, no crash)', () => {
    const r = assessReadiness(cfg({ verifier: { provider: 'anthropic' } }), {});
    expect(r.provider).toBe('anthropic');
  });
});
