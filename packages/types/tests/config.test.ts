import { describe, it, expect } from 'vitest';
import { KeelConfigZ, defaultConfig, presets } from '../src/config.js';

describe('KeelConfigZ', () => {
  it('accepts default config', () => {
    expect(() => KeelConfigZ.parse(defaultConfig)).not.toThrow();
  });

  it('rejects invalid loopEnforcement', () => {
    expect(() =>
      KeelConfigZ.parse({ ...defaultConfig, loopEnforcement: 'nope' }),
    ).toThrow();
  });

  it('clamps contextBudgetThreshold to valid range', () => {
    const cfg = { ...defaultConfig, subagentPolicy: { ...defaultConfig.subagentPolicy, contextBudgetThreshold: 1.5 } };
    expect(() => KeelConfigZ.parse(cfg)).toThrow();
  });

  it('exports three named presets', () => {
    expect(presets.solo.loopEnforcement).toBe('reminder');
    expect(presets.team.loopEnforcement).toBe('soft');
    expect(presets.production.loopEnforcement).toBe('strict');
  });
});
