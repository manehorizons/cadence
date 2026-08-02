import { describe, it, expect } from 'vitest';
import { defaultConfig, presets } from '@thomas-powers-jr/cadence-types';
import { gatesFor } from '../../src/gates/engine.js';
import { buildExplanation } from '../../src/config-explain/build.js';
import type { ExplainContext } from '../../src/config-explain/types.js';

/** A context with no active phase and every external probe satisfied. */
const cleanCtx: ExplainContext = {
  activeTier: null,
  anthropicKeyPresent: true,
  localKeyPresent: true,
  hostHooksInstalled: true,
};

describe('buildExplanation — gate sets per tier (AC-1)', () => {
  // AC-1: each tier's gate set equals gatesFor(tier, effectiveProfile).
  it('AC-1: computes a gate set per tier from the configured profile', () => {
    // standard profile so the three tiers differ observably.
    const config = { ...defaultConfig, profile: 'standard' as const };
    const exp = buildExplanation(config, cleanCtx);

    const tiers = exp.tiers.map((t) => t.tier);
    expect(tiers).toEqual(['quick-fix', 'standard', 'complex']);

    for (const view of exp.tiers) {
      const want = gatesFor(view.tier, 'standard');
      expect(view.gates).toEqual(want.gates);
      expect(view.softCap).toBe(want.softCap);
    }
  });

  // AC-1: the tier matching ctx.activeTier is flagged current; none when absent.
  it('AC-1: flags the active tier as current, none when no phase is active', () => {
    const withActive = buildExplanation(presets.production, {
      ...cleanCtx,
      activeTier: 'complex',
    });
    expect(withActive.tiers.filter((t) => t.current).map((t) => t.tier)).toEqual(['complex']);

    const idle = buildExplanation(presets.production, cleanCtx);
    expect(idle.tiers.some((t) => t.current)).toBe(false);
  });
});

describe('buildExplanation — provider rows (Phase 165 AC-1)', () => {
  // AC-1: a 'host-cli' provider renders as a real, non-mock row — proves the
  // ProviderRow['provider'] type (and providerRows' block-indexed read) genuinely
  // admits the 4th provider rather than silently coercing/erroring on it.
  it("AC-1: a 'host-cli' provider block renders as a non-mock row", () => {
    const config = { ...defaultConfig, perTaskVerifier: { provider: 'host-cli' as const } };
    const exp = buildExplanation(config, cleanCtx);

    const row = exp.providers.find((r) => r.block === 'perTaskVerifier');
    expect(row).toEqual({
      block: 'perTaskVerifier',
      gate: 'per-task-verify',
      provider: 'host-cli',
      isMock: false,
    });
  });
});

describe('buildExplanation — hooks-not-installed stale-vs-absent honesty (phase 250, T16)', () => {
  // defaultConfig has sessionStart/stopReminder/userPromptSubmit = true, so
  // anyHookEnabled is true and the hooks-not-installed warning is live.
  const ctxAbsent: ExplainContext = { ...cleanCtx, hostHooksInstalled: false };
  const ctxStale: ExplainContext = {
    ...cleanCtx,
    hostHooksInstalled: false,
    hostHooksStale: true,
  };

  // T16: a present-but-stale entry must not get the "no host hook entry was
  // found" message — that claim is false when an entry does exist.
  it('T16: a stale-scope managed entry gets a distinct "needs reinstalling" message, not "no host hook entry was found"', () => {
    const warnings = buildExplanation(defaultConfig, ctxStale).warnings;
    const warning = warnings.find((w) => w.code === 'hooks-not-installed');
    expect(warning).toBeDefined();
    expect(warning!.message).toMatch(/outdated npm scope/i);
    expect(warning!.message).toMatch(/needs reinstalling/i);
    expect(warning!.message).not.toMatch(/no host hook entry was found/i);
  });

  // T16: a genuinely absent entry keeps the original message, and it must
  // not pick up the stale-scope framing.
  it('T16: a genuinely absent entry still reports "no host hook entry was found", distinct from the stale message', () => {
    const warnings = buildExplanation(defaultConfig, ctxAbsent).warnings;
    const warning = warnings.find((w) => w.code === 'hooks-not-installed');
    expect(warning).toBeDefined();
    expect(warning!.message).toMatch(/no host hook entry was found/i);
    expect(warning!.message).not.toMatch(/outdated npm scope/i);
  });
});
