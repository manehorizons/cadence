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

  // AC-1 (Phase 23.1) — draftReadAt field.
  it('emptyState includes draftReadAt: null', () => {
    expect(emptyState().draftReadAt).toBeNull();
  });

  it('parses state.json without draftReadAt (legacy, defaults to null)', () => {
    const s = emptyState();
    const { draftReadAt: _drop, ...withoutField } = s;
    const parsed = CadenceStateZ.parse(withoutField);
    expect(parsed.draftReadAt).toBeNull();
  });

  it('rejects malformed draftReadAt ISO8601', () => {
    const s = emptyState();
    expect(() =>
      CadenceStateZ.parse({ ...s, draftReadAt: 'yesterday' }),
    ).toThrow();
  });

  it('accepts valid ISO8601 offset-aware draftReadAt', () => {
    const s = emptyState();
    const parsed = CadenceStateZ.parse({
      ...s,
      draftReadAt: '2026-05-14T22:30:00.000Z',
    });
    expect(parsed.draftReadAt).toBe('2026-05-14T22:30:00.000Z');
  });

  // AC-1 (Phase 36.1) — SPEC loop position + activeSpec.
  it('accepts loopPosition SPEC (AC-1)', () => {
    expect(() =>
      CadenceStateZ.parse({ ...emptyState(), loopPosition: 'SPEC' }),
    ).not.toThrow();
  });

  it('emptyState includes activeSpec: null (AC-1)', () => {
    expect(emptyState().activeSpec).toBeNull();
  });

  it('parses state.json without activeSpec (legacy, defaults to null) (AC-1)', () => {
    const { activeSpec: _drop, ...withoutField } = emptyState();
    expect(CadenceStateZ.parse(withoutField).activeSpec).toBeNull();
  });
});
