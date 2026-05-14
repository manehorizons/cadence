import { describe, it, expect } from 'vitest';
import { CadenceStateZ, emptyState } from '../src/state.js';

describe('CadenceStateZ', () => {
  it('accepts an empty state', () => {
    expect(() => CadenceStateZ.parse(emptyState())).not.toThrow();
  });

  it('rejects invalid loopPosition', () => {
    expect(() => CadenceStateZ.parse({ ...emptyState(), loopPosition: 'nope' })).toThrow();
  });

  it('clamps tokenUtilization to [0,1]', () => {
    const s = emptyState();
    s.session.tokenUtilization = 1.5;
    expect(() => CadenceStateZ.parse(s)).toThrow();
  });

  it('round-trips through JSON', () => {
    const s = emptyState();
    const parsed = CadenceStateZ.parse(JSON.parse(JSON.stringify(s)));
    expect(parsed).toEqual(s);
  });
});
