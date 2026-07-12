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

  // AC-1 (Phase 173) — optimistic-concurrency revision field.
  it('emptyState includes revision: 0 (AC-1)', () => {
    expect(emptyState().revision).toBe(0);
  });

  it('parses state.json without revision (legacy, defaults to 0) (AC-1)', () => {
    const { revision: _drop, ...withoutField } = emptyState();
    expect(CadenceStateZ.parse(withoutField).revision).toBe(0);
  });

  it('rejects a negative revision (AC-1)', () => {
    expect(() => CadenceStateZ.parse({ ...emptyState(), revision: -1 })).toThrow();
  });

  it('rejects a non-integer revision (AC-1)', () => {
    expect(() => CadenceStateZ.parse({ ...emptyState(), revision: 1.5 })).toThrow();
  });

  it('accepts an incremented revision (AC-1)', () => {
    expect(CadenceStateZ.parse({ ...emptyState(), revision: 7 }).revision).toBe(7);
  });
});

describe('session.subagentBaselines', () => {
  it('defaults to {} when omitted (back-compat with existing state.json files)', () => {
    const raw = emptyState('proj');
    const { subagentBaselines: _drop, ...sessionWithoutIt } = raw.session;
    const parsed = CadenceStateZ.parse({ ...raw, session: sessionWithoutIt });
    expect(parsed.session.subagentBaselines).toEqual({});
  });

  it('emptyState() includes an empty subagentBaselines map', () => {
    expect(emptyState('proj').session.subagentBaselines).toEqual({});
  });

  it('accepts a populated baseline entry', () => {
    const raw = emptyState('proj');
    raw.session.subagentBaselines = {
      'agent-123': {
        startedAt: '2026-07-06T00:00:00.000Z',
        taskStatuses: { T1: 'DONE', T2: 'PENDING' },
        touchedFiles: ['src/a.ts'],
      },
    };
    expect(() => CadenceStateZ.parse(raw)).not.toThrow();
  });
});
