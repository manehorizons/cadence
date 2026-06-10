import { describe, it, expect } from 'vitest';
import { CadenceConfigZ, defaultConfig } from '@manehorizons/cadence-types';
import { buildQuickstart } from '../../src/quickstart/build.js';
import { buildExplanation } from '../../src/config-explain/build.js';

describe('activate wiring (AC-3, AC-4)', () => {
  it('AC-3: quickstart command map lists activate', () => {
    const qs = buildQuickstart({ initialized: false });
    expect(qs.commandMap.some((e) => e.name === 'activate')).toBe(true);
  });

  it('AC-4: config explain warns when every seam is mock and points at activate', () => {
    const exp = buildExplanation(CadenceConfigZ.parse({ ...defaultConfig }), {
      activeTier: null,
      anthropicKeyPresent: false,
      localKeyPresent: false,
      hostHooksInstalled: false,
    });
    const allMock = exp.warnings.find((w) => w.code === 'all-mock');
    expect(allMock).toBeDefined();
    expect(allMock!.message).toMatch(/cadence activate/);
  });
});
