import { describe, it, expect } from 'vitest';
import { CadenceConfigZ, defaultConfig, presets } from '../src/config.js';

describe('CadenceConfigZ', () => {
  it('accepts default config', () => {
    expect(() => CadenceConfigZ.parse(defaultConfig)).not.toThrow();
  });

  it('rejects invalid loopEnforcement', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, loopEnforcement: 'nope' }),
    ).toThrow();
  });

  it('clamps contextBudgetThreshold to valid range', () => {
    const cfg = { ...defaultConfig, subagentPolicy: { ...defaultConfig.subagentPolicy, contextBudgetThreshold: 1.5 } };
    expect(() => CadenceConfigZ.parse(cfg)).toThrow();
  });

  it('exports three named presets', () => {
    expect(presets.solo.loopEnforcement).toBe('reminder');
    expect(presets.team.loopEnforcement).toBe('soft');
    expect(presets.production.loopEnforcement).toBe('strict');
  });

  it('profile defaults to "auto" when omitted', () => {
    const { profile: _drop, ...withoutProfile } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutProfile);
    expect(parsed.profile).toBe('auto');
  });

  it('accepts profile = strict | standard | auto', () => {
    for (const p of ['strict', 'standard', 'auto'] as const) {
      expect(() => CadenceConfigZ.parse({ ...defaultConfig, profile: p })).not.toThrow();
    }
  });

  it('rejects unknown profile literal', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, profile: 'lenient' as never }),
    ).toThrow();
  });

  it('verification.testGlobs defaults to packages/**/*.test.ts(x) when absent (AC-4)', () => {
    const { verification: _drop, ...withoutVerify } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutVerify);
    expect(parsed.verification.testGlobs).toEqual([
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
    ]);
  });

  it('accepts a custom verification.testGlobs array (AC-4)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verification: { testGlobs: ['apps/**/*.spec.ts'] },
    });
    expect(parsed.verification.testGlobs).toEqual(['apps/**/*.spec.ts']);
  });

  it('rejects non-string entries in verification.testGlobs', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        verification: { testGlobs: [42] as never },
      }),
    ).toThrow();
  });

  it('verifier defaults to provider=mock when absent', () => {
    const { verifier: _drop, ...withoutVerifier } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutVerifier);
    expect(parsed.verifier.provider).toBe('mock');
  });

  it('accepts verifier provider = mock | anthropic', () => {
    for (const p of ['mock', 'anthropic'] as const) {
      expect(() =>
        CadenceConfigZ.parse({ ...defaultConfig, verifier: { provider: p } }),
      ).not.toThrow();
    }
  });

  it('rejects unknown verifier provider', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        verifier: { provider: 'openai' as never },
      }),
    ).toThrow();
  });

  it('accepts verifier.model override', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verifier: { provider: 'anthropic', model: 'claude-haiku-4-5' },
    });
    expect(parsed.verifier.model).toBe('claude-haiku-4-5');
  });

  it('notify defaults to transport=stderr when absent', () => {
    const { notify: _drop, ...withoutNotify } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutNotify);
    expect(parsed.notify.transport).toBe('stderr');
    expect(parsed.notify.file).toBeUndefined();
  });

  it('accepts notify.transport = stderr | file | none', () => {
    for (const t of ['stderr', 'file', 'none'] as const) {
      expect(() =>
        CadenceConfigZ.parse({ ...defaultConfig, notify: { transport: t } }),
      ).not.toThrow();
    }
  });

  it('rejects unknown notify.transport literal', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        notify: { transport: 'webhook' as never },
      }),
    ).toThrow();
  });

  it('accepts notify.file override for file transport', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      notify: { transport: 'file', file: 'logs/anomalies.log' },
    });
    expect(parsed.notify.file).toBe('logs/anomalies.log');
  });
});
