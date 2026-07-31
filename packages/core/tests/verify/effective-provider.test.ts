import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveProvider,
  MOCK_FALLBACK_BANNER,
} from '../../src/verify/verifier-factory.js';

// AC-3 — distinguish silent default-mock from an explicit mock choice
describe('resolveEffectiveProvider', () => {
  it('reports defaulted mock when nothing is configured', () => {
    expect(resolveEffectiveProvider(undefined)).toEqual({
      provider: 'mock',
      defaulted: true,
    });
    expect(resolveEffectiveProvider({})).toEqual({
      provider: 'mock',
      defaulted: true,
    });
  });

  it('does not flag an explicit mock choice as defaulted', () => {
    expect(resolveEffectiveProvider({ provider: 'mock' })).toEqual({
      provider: 'mock',
      defaulted: false,
    });
  });

  it('honours an explicit provider and an override (never defaulted)', () => {
    expect(resolveEffectiveProvider({ provider: 'anthropic' })).toEqual({
      provider: 'anthropic',
      defaulted: false,
    });
    expect(resolveEffectiveProvider(undefined, { override: 'local' })).toEqual({
      provider: 'local',
      defaulted: false,
    });
  });

  it('exposes a banner that names mock and points at activation', () => {
    expect(MOCK_FALLBACK_BANNER).toMatch(/MOCK/);
    // Phase 104: the banner now points at the `cadence activate` on-ramp
    // (single-sourced from MOCK_VERIFIER_NOTICE) rather than a raw env var.
    expect(MOCK_FALLBACK_BANNER).toMatch(/cadence activate/);
  });

  // AC-3 (Phase 243) — settle.ts's deep-verify pre-check (`MOCK_FALLBACK_BANNER`,
  // gated on `resolveEffectiveProvider(...).provider === 'mock'`) and
  // createVerifierFactory's credential-missing degrade banner (gated on
  // `provider === 'anthropic' | 'local' | 'host-cli'`, see
  // verifier-factory.test.ts) are disjoint by construction: they branch on
  // mutually exclusive values of the same `provider` string. This asserts the
  // half of that disjointness `resolveEffectiveProvider` owns — that it never
  // reports 'mock' for a slice explicitly configured to a real provider, credentials
  // notwithstanding, since it is config-only and never checks them.
  it('243-01/AC-3: never resolves to mock for an explicitly-configured real provider, regardless of credentials (disjoint from the factory-level degrade banner)', () => {
    for (const provider of ['anthropic', 'local', 'host-cli'] as const) {
      expect(resolveEffectiveProvider({ provider })).toEqual({
        provider,
        defaulted: false,
      });
    }
    // The only two configs that resolve to 'mock' — and so trip settle.ts's
    // pre-check — are exactly the two the factory's degrade branches never
    // touch (unconfigured, or explicit mock).
    expect(resolveEffectiveProvider(undefined).provider).toBe('mock');
    expect(resolveEffectiveProvider({ provider: 'mock' }).provider).toBe('mock');
  });
});
