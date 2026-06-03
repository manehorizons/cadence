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

  it('exposes a banner that names mock and points at setup', () => {
    expect(MOCK_FALLBACK_BANNER).toMatch(/MOCK/);
    expect(MOCK_FALLBACK_BANNER).toMatch(/ANTHROPIC_API_KEY/);
  });
});
