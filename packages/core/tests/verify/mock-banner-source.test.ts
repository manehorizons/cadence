import { describe, it, expect } from 'vitest';
import { MOCK_VERIFIER_NOTICE } from '@thomas-powers-jr/cadence-types';
import { MOCK_FALLBACK_BANNER } from '../../src/verify/verifier-factory.js';

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
