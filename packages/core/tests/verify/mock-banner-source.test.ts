import { describe, it, expect } from 'vitest';
import { MOCK_VERIFIER_NOTICE, MOCK_VERIFIER_CAPABILITY } from '@thomas-powers-jr/cadence-types';
import { MOCK_FALLBACK_BANNER, createVerifierFactory } from '../../src/verify/verifier-factory.js';

// AC-2 (phase 104): the settle mock banner renders from the single
// source-of-truth notice — no duplicated honesty literal.
describe('MOCK_FALLBACK_BANNER is sourced from MOCK_VERIFIER_NOTICE', () => {
  it('embeds the canonical message verbatim', () => {
    expect(MOCK_FALLBACK_BANNER).toContain(MOCK_VERIFIER_NOTICE.message);
  });

  it('states the verdict is not real verification', () => {
    expect(MOCK_FALLBACK_BANNER.toLowerCase()).toContain('not real verification');
  });

  it('points the operator at cadence activate', () => {
    expect(MOCK_FALLBACK_BANNER).toContain('cadence activate');
  });
});

// Phase 264 (T5): both loud stderr banners (the module-level
// MOCK_FALLBACK_BANNER and the buildDowngradeBanner(reason) builder) also
// name the neutral MOCK_VERIFIER_CAPABILITY fact — alongside, not instead
// of, the existing MOCK_VERIFIER_NOTICE activation-nudge line.
describe('banners also embed MOCK_VERIFIER_CAPABILITY', () => {
  it('264-01/AC-4: MOCK_FALLBACK_BANNER embeds the capability message verbatim', () => {
    expect(MOCK_FALLBACK_BANNER).toContain(MOCK_VERIFIER_CAPABILITY.message);
  });

  it('264-01/AC-4: the selection-time downgrade banner (buildDowngradeBanner) embeds the capability message verbatim', () => {
    // buildDowngradeBanner is not exported directly; exercise it through
    // createVerifierFactory's anthropic-without-a-key downgrade branch,
    // mirroring the pattern in verifier-factory.test.ts.
    type FakeV = { kind: 'mock' } | { kind: 'anthropic' };
    interface FakeConfig {
      fake?: { provider?: 'mock' | 'anthropic' };
    }
    const select = createVerifierFactory<FakeConfig, FakeV>({
      label: 'fake',
      read: (c) => c?.fake,
      mock: () => ({ kind: 'mock' }),
      anthropic: () => ({ kind: 'anthropic' }),
      local: () => ({ kind: 'mock' }),
    });

    const warns: string[] = [];
    const v = select({ fake: { provider: 'anthropic' } }, { env: {}, warn: (m) => warns.push(m) });
    expect(v).toEqual({ kind: 'mock' });
    expect(warns.length).toBe(1);
    expect(warns[0]).toContain(MOCK_VERIFIER_CAPABILITY.message);
  });
});
