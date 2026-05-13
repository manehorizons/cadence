import { describe, it, expect } from 'vitest';
import { KeelStateZ, emptyState } from '../src/state.js';

describe('KeelStateZ', () => {
  it('accepts an empty state', () => {
    expect(() => KeelStateZ.parse(emptyState())).not.toThrow();
  });

  it('rejects invalid loopPosition', () => {
    expect(() => KeelStateZ.parse({ ...emptyState(), loopPosition: 'nope' })).toThrow();
  });

  it('clamps tokenUtilization to [0,1]', () => {
    const s = emptyState();
    s.session.tokenUtilization = 1.5;
    expect(() => KeelStateZ.parse(s)).toThrow();
  });

  it('round-trips through JSON', () => {
    const s = emptyState();
    const parsed = KeelStateZ.parse(JSON.parse(JSON.stringify(s)));
    expect(parsed).toEqual(s);
  });
});
