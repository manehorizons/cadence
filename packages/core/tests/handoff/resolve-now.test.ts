import { describe, it, expect } from 'vitest';
import { resolveNow } from '../../src/handoff/run-handoff.js';

describe('resolveNow (114 AC-2)', () => {
  // AC-2: a valid CADENCE_NOW is honored (handoff dates from it, not wall-clock).
  it('parses a valid CADENCE_NOW', () => {
    const d = resolveNow({ CADENCE_NOW: '2026-06-17T12:00:00Z' });
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-17');
  });

  // AC-2: an absent CADENCE_NOW falls back to the current time (a real Date).
  it('falls back to now when unset', () => {
    const before = Date.now();
    const d = resolveNow({});
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
  });

  // AC-2: an invalid CADENCE_NOW falls back rather than producing an Invalid Date.
  it('falls back to now when CADENCE_NOW is not a valid date', () => {
    const d = resolveNow({ CADENCE_NOW: 'not-a-date' });
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});
