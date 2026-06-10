import { describe, it, expect } from 'vitest';
import { CadenceConfigZ, defaultConfig } from '@manehorizons/cadence-types';
import { assessReadiness, credsPresent } from '../../src/activate/assess.js';

const cfg = (overrides: Record<string, unknown> = {}) =>
  CadenceConfigZ.parse({ ...defaultConfig, ...overrides });

describe('assessReadiness (AC-6)', () => {
  it('reports all-mock posture on a default config', () => {
    const r = assessReadiness(cfg(), {});
    expect(r.provider).toBe('mock');
    expect(r.ready).toBe(false);
    expect(r.seamsReal).toEqual([]);
    expect(r.seamsMock).toContain('verifier');
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
    expect(credsPresent('local', c, {})).toBe(false);
    expect(credsPresent('local', c, { CADENCE_LOCAL_BASE_URL: 'http://x' })).toBe(true);
  });
});
