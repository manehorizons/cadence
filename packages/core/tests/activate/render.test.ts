import { describe, it, expect } from 'vitest';
import { CadenceConfigZ, defaultConfig } from '@manehorizons/cadence-types';
import { planActivation } from '../../src/activate/plan.js';
import { renderText, renderJson } from '../../src/activate/render.js';
import type { ActivationResult } from '../../src/activate/render.js';

const base = CadenceConfigZ.parse({ ...defaultConfig });
const plan = planActivation({ provider: 'anthropic', scope: 'deep-verify', currentConfig: base });

describe('activate render (AC-3, AC-6)', () => {
  it('text shows the provider, next step, and a ping ✓', () => {
    const result: ActivationResult = { plan, wrote: true, keyMissing: false, ping: { ok: true } };
    const out = renderText(result);
    expect(out).toMatch(/anthropic/);
    expect(out).toMatch(/cadence settle run --deep/);
    expect(out).toMatch(/✓|verified|works/i);
  });

  it('text prints the export line when the key is missing', () => {
    const result: ActivationResult = { plan, wrote: true, keyMissing: true };
    expect(renderText(result)).toMatch(/export ANTHROPIC_API_KEY/);
  });

  it('text says "Already active" on a no-op (no changes)', () => {
    const noChange = planActivation({ provider: 'mock', scope: 'deep-verify', currentConfig: base });
    const out = renderText({ plan: noChange, wrote: false, keyMissing: false });
    expect(out).toMatch(/Already active/);
  });

  it('json carries provider, changed seams, keyMissing, and ping', () => {
    const result: ActivationResult = { plan, wrote: true, keyMissing: false, ping: { ok: false, reason: '401: bad key' } };
    const data = renderJson(result);
    expect(data).toMatchObject({
      provider: 'anthropic',
      changed: ['verifier'],
      keyMissing: false,
      ping: { ok: false, reason: '401: bad key' },
    });
  });
});
