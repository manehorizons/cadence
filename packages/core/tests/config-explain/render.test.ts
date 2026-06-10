import { describe, it, expect } from 'vitest';
import { defaultConfig, presets } from '@manehorizons/cadence-types';
import { buildExplanation } from '../../src/config-explain/build.js';
import { renderText, renderJson } from '../../src/config-explain/render.js';
import type { ExplainContext } from '../../src/config-explain/types.js';

const cleanCtx: ExplainContext = {
  activeTier: null,
  anthropicKeyPresent: true,
  localKeyPresent: true,
  hostHooksInstalled: true,
};

describe('renderText / renderJson (AC-3)', () => {
  // AC-3: the curated default carries the five blocks + footer affordances.
  it('AC-3: default renders profile, per-tier gates, providers, warnings, footer', () => {
    const config = { ...defaultConfig, profile: 'auto' as const }; // auto → a softcap warning fires
    const exp = buildExplanation(config, { ...cleanCtx, hostHooksInstalled: false });
    const out = renderText(exp, {});

    expect(out).toMatch(/profile/i);
    for (const tier of ['quick-fix', 'standard', 'complex']) expect(out).toContain(tier);
    expect(out).toContain('verifier'); // a provider row
    expect(out.toLowerCase()).toMatch(/warning/); // warnings present for this config
    expect(out).toContain('cadence doctor');
    expect(out).toContain('--all');
    expect(out).toContain('config explain'); // footer drill-in hint
  });

  // AC-3: a clean config prints no warnings section noise.
  // Use a non-mock provider so the all-mock warning does not fire; cleanCtx has
  // keys present + hooks installed, so no other warnings fire either.
  it('AC-3: a clean config omits the warnings section', () => {
    const exp = buildExplanation(
      { ...defaultConfig, profile: 'standard' as const, verifier: { provider: 'anthropic' as const, diffCapBytes: 262144 } },
      cleanCtx,
    );
    expect(renderText(exp, {}).toLowerCase()).not.toMatch(/warning/);
  });

  // AC-3: a known field deep-dives that block only.
  it('AC-3: a known field renders only that block', () => {
    const exp = buildExplanation(defaultConfig, cleanCtx);
    const out = renderText(exp, { field: 'verifier' });
    expect(out).toContain('verifier');
    expect(out).toContain('mock');
    expect(out).not.toContain('loopEnforcement'); // other blocks excluded
  });

  // AC-3: an unknown field yields a did-you-mean nudge naming the closest key.
  it('AC-3: an unknown field suggests the nearest key', () => {
    const exp = buildExplanation(defaultConfig, cleanCtx);
    const out = renderText(exp, { field: 'verifer' });
    expect(out).toMatch(/did you mean.*verifier/i);
  });

  // AC-3: --all groups every config key.
  it('AC-3: --all renders every config key', () => {
    const exp = buildExplanation(defaultConfig, cleanCtx);
    const out = renderText(exp, { all: true });
    for (const key of ['subagentPolicy', 'notify', 'tier', 'verifier', 'phaseGuard', 'handoff']) {
      expect(out).toContain(key);
    }
  });

  // AC-3: renderJson returns the structured explanation.
  it('AC-3: renderJson returns the structured explanation object', () => {
    const exp = buildExplanation(presets.production, { ...cleanCtx, activeTier: 'standard' });
    const json = renderJson(exp) as Record<string, unknown>;
    expect(json.profile).toBe(exp.profile);
    expect(Array.isArray(json.tiers)).toBe(true);
    expect((json.tiers as unknown[]).length).toBe(3);
    expect((json.providers as unknown[]).length).toBe(6);
    expect(Array.isArray(json.warnings)).toBe(true);
    // round-trips through JSON without throwing (no functions / cycles).
    expect(() => JSON.stringify(json)).not.toThrow();
  });

  // AC-3: golden-ish coverage across representative presets renders without throwing
  // and reflects each preset's distinctive setting.
  it('AC-3: renders solo / production / anthropic-without-key distinctively', () => {
    expect(renderText(buildExplanation(presets.solo, cleanCtx), {})).toMatch(/reminder/);
    expect(renderText(buildExplanation(presets.production, cleanCtx), {})).toMatch(/strict/);
    const anthropic = {
      ...defaultConfig,
      verifier: { provider: 'anthropic' as const },
    };
    const out = renderText(buildExplanation(anthropic, { ...cleanCtx, anthropicKeyPresent: false }), {});
    expect(out).toMatch(/ANTHROPIC_API_KEY/);
  });
});
