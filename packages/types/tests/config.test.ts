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
});
