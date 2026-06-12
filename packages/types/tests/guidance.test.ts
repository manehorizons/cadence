import { describe, expect, it } from 'vitest';
import { MOCK_VERIFIER_NOTICE } from '../src/guidance.js';

// AC-1 (phase 104): one source-of-truth "mock = not real verification" message.
describe('MOCK_VERIFIER_NOTICE', () => {
  it('names mock a placeholder that is NOT real verification', () => {
    const msg = MOCK_VERIFIER_NOTICE.message.toLowerCase();
    expect(msg).toContain('not real verification');
    expect(msg).toContain('placeholder');
  });

  it('points the operator at `cadence activate`', () => {
    expect(MOCK_VERIFIER_NOTICE.activateHint).toBe('cadence activate');
    expect(MOCK_VERIFIER_NOTICE.message).toContain('cadence activate');
  });

  it('exposes a short non-empty inline label', () => {
    expect(MOCK_VERIFIER_NOTICE.label.length).toBeGreaterThan(0);
  });
});
