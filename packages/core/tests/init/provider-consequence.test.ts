import { describe, it, expect } from 'vitest';
import { deriveProviderConsequence } from '../../src/init/provider-consequence.js';

describe('deriveProviderConsequence', () => {
  it("265-01/AC-4: auto-profile message states 'strong' is unreachable regardless of provider, and differs meaningfully from the strict-profile message for the same real provider", () => {
    const autoMessage = deriveProviderConsequence('host-cli', 'auto');
    const strictMessage = deriveProviderConsequence('host-cli', 'strict');

    // auto: unreachable, no matter the provider.
    expect(autoMessage).toMatch(/unreachable/i);
    expect(autoMessage).toMatch(/no matter which provider/i);
    expect(autoMessage).toMatch(/code-review/);
    expect(autoMessage).toMatch(/security-audit/);

    // strict (real provider): necessary-but-not-sufficient framing, never a bare
    // "unreachable regardless of provider" claim.
    expect(strictMessage).toMatch(/NECESSARY/);
    expect(strictMessage).toMatch(/not automatically SUFFICIENT/);
    expect(strictMessage).not.toMatch(/no matter which provider/i);

    // The two must actually differ, not just superficially.
    expect(autoMessage).not.toBe(strictMessage);
    expect(strictMessage).not.toMatch(/unreachable no matter which provider/i);
  });

  it('265-01/AC-4: standard-profile message differs from strict-profile message for the same real provider (tier-gating note is profile-specific)', () => {
    const standardMessage = deriveProviderConsequence('anthropic', 'standard');
    const strictMessage = deriveProviderConsequence('anthropic', 'strict');

    expect(standardMessage).not.toBe(strictMessage);
    // standard: code-review only at complex tier, security-audit never fires.
    expect(standardMessage).toMatch(/only at the `complex` tier under `standard`/);
    expect(standardMessage).toMatch(/`security-audit` never fires under `standard`/);
    // strict: code-review at standard tier and above, security-audit only at complex.
    expect(strictMessage).toMatch(/`standard` tier and above under `strict`/);
    expect(strictMessage).toMatch(/`security-audit` fires only at `complex` tier/);
  });

  it("265-01/AC-4: mock-provider message forecloses 'strong' distinctly from a real provider at the same (standard) profile", () => {
    const mockMessage = deriveProviderConsequence('mock', 'standard');
    const realMessage = deriveProviderConsequence('anthropic', 'standard');

    expect(mockMessage).not.toBe(realMessage);
    expect(mockMessage).toMatch(/never carries verifier identity/);
    expect(mockMessage).toMatch(/unreachable while `mock` is selected/);
    // The mock message must not promise reachability the way the real-provider one discusses.
    expect(mockMessage).not.toMatch(/not automatically SUFFICIENT/);
    // The real-provider message must not claim mock-style unconditional foreclosure.
    expect(realMessage).not.toMatch(/never carries verifier identity/);
  });

  it("265-01/AC-4: mock-provider message forecloses 'strong' distinctly from a real provider at the same (strict) profile", () => {
    const mockMessage = deriveProviderConsequence('mock', 'strict');
    const realMessage = deriveProviderConsequence('local', 'strict');

    expect(mockMessage).not.toBe(realMessage);
    expect(mockMessage).toMatch(/unreachable while `mock` is selected/);
    expect(realMessage).toMatch(/NECESSARY/);
    expect(realMessage).toMatch(/not automatically SUFFICIENT/);
  });

  it('265-01/AC-4: mock under auto profile states both the auto-unreachability and the mock-specific foreclosure, independent of each other', () => {
    const autoMockMessage = deriveProviderConsequence('mock', 'auto');
    const autoRealMessage = deriveProviderConsequence('host-cli', 'auto');

    expect(autoMockMessage).toMatch(/no matter which provider/i);
    expect(autoMockMessage).toMatch(/unreachable while `mock` is selected/);
    expect(autoMockMessage).toMatch(/independent of gate profile or tier/);
    // Still differs from the real-provider auto message (extra mock clause appended).
    expect(autoMockMessage).not.toBe(autoRealMessage);
    expect(autoMockMessage).toContain(autoRealMessage);
  });

  it('265-01/AC-4: never promises strong is guaranteed just because a real provider was chosen under standard/strict', () => {
    for (const profile of ['standard', 'strict'] as const) {
      for (const provider of ['anthropic', 'local', 'host-cli'] as const) {
        const message = deriveProviderConsequence(provider, profile);
        expect(message).not.toMatch(/will (reach|guarantee)/i);
        expect(message).not.toMatch(/is guaranteed/i);
        expect(message).toMatch(/does not\s+guarantee 'strong'/);
      }
    }
  });

  it('265-01/AC-4: never implies a real provider would unlock strong under auto profile', () => {
    for (const provider of ['anthropic', 'local', 'host-cli'] as const) {
      const message = deriveProviderConsequence(provider, 'auto');
      expect(message).not.toMatch(/would (unlock|enable|reach)/i);
      expect(message).toMatch(/changes nothing about that reachability/);
    }
  });
});
