import { describe, it, expect } from 'vitest';
import { CadenceConfigZ, defaultConfig } from '@manehorizons/cadence-types';
import { planActivation } from '../../src/activate/plan.js';

const base = CadenceConfigZ.parse({ ...defaultConfig });

describe('planActivation (AC-2, AC-6)', () => {
  it('deep-verify scope flips only the verifier seam', () => {
    const p = planActivation({ provider: 'anthropic', scope: 'deep-verify', currentConfig: base });
    expect(p.changes.map((c) => c.seam)).toEqual(['verifier']);
    expect(p.changes[0]).toMatchObject({ from: 'mock', to: 'anthropic' });
    expect(p.envVar).toBe('ANTHROPIC_API_KEY');
    expect(p.nextStep).toBe('cadence settle run --deep');
  });

  it('all scope flips every still-mock seam', () => {
    const p = planActivation({ provider: 'anthropic', scope: 'all', currentConfig: base });
    expect(p.changes).toHaveLength(7);
  });

  it('is idempotent — re-running on an already-activated config is a no-op', () => {
    const activated = CadenceConfigZ.parse({ ...defaultConfig, verifier: { ...defaultConfig.verifier, provider: 'anthropic' } });
    const p = planActivation({ provider: 'anthropic', scope: 'deep-verify', currentConfig: activated });
    expect(p.changes).toEqual([]);
  });

  it('mock provider has no env var', () => {
    const p = planActivation({ provider: 'mock', scope: 'deep-verify', currentConfig: base });
    expect(p.envVar).toBeNull();
  });
});
