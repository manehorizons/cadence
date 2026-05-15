import { describe, it, expect } from 'vitest';
import { AnomalyEventZ } from '../src/anomaly.js';

// AC-1: typed anomaly event schema
describe('AnomalyEventZ (AC-1)', () => {
  it('accepts a well-formed event', () => {
    expect(() =>
      AnomalyEventZ.parse({
        type: 'ac-blocked',
        severity: 'warn',
        message: 'AC-1 blocked by T2',
        context: { acId: 'AC-1', blockers: ['T2'] },
        ts: '2026-05-14T22:30:00.000Z',
      }),
    ).not.toThrow();
  });

  it('accepts every defined type literal', () => {
    const types = [
      'ac-blocked',
      'ac-needs-context',
      'coverage-bypassed',
      'files-outside-boundary',
      'verifier-failure',
      'force-used',
      'coherence-warn',
      'loop-violation',
    ] as const;
    for (const t of types) {
      expect(() =>
        AnomalyEventZ.parse({
          type: t,
          severity: 'info',
          message: 'x',
          context: {},
          ts: '2026-05-14T22:30:00.000Z',
        }),
      ).not.toThrow();
    }
  });

  it('accepts every defined severity literal', () => {
    for (const s of ['info', 'warn', 'error'] as const) {
      expect(() =>
        AnomalyEventZ.parse({
          type: 'force-used',
          severity: s,
          message: 'x',
          context: {},
          ts: '2026-05-14T22:30:00.000Z',
        }),
      ).not.toThrow();
    }
  });

  it('rejects unknown type literal', () => {
    expect(() =>
      AnomalyEventZ.parse({
        type: 'made-up' as never,
        severity: 'info',
        message: 'x',
        context: {},
        ts: '2026-05-14T22:30:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects unknown severity literal', () => {
    expect(() =>
      AnomalyEventZ.parse({
        type: 'force-used',
        severity: 'critical' as never,
        message: 'x',
        context: {},
        ts: '2026-05-14T22:30:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects missing context', () => {
    expect(() =>
      AnomalyEventZ.parse({
        type: 'force-used',
        severity: 'info',
        message: 'x',
        ts: '2026-05-14T22:30:00.000Z',
      } as never),
    ).toThrow();
  });

  it('rejects missing ts (AC-1 — Phase 17.3 required field)', () => {
    expect(() =>
      AnomalyEventZ.parse({
        type: 'force-used',
        severity: 'info',
        message: 'x',
        context: {},
      } as never),
    ).toThrow();
  });

  it('rejects non-ISO8601 ts (AC-1)', () => {
    for (const bad of ['2026-05-14', 'yesterday', '', 'May 14 2026']) {
      expect(() =>
        AnomalyEventZ.parse({
          type: 'force-used',
          severity: 'info',
          message: 'x',
          context: {},
          ts: bad,
        }),
      ).toThrow();
    }
  });

  // AC-1 (Phase 23.3) — loop-violation type
  it('accepts loop-violation event with context.expected + actual (AC-1)', () => {
    expect(() =>
      AnomalyEventZ.parse({
        type: 'loop-violation',
        severity: 'error',
        message: 'settle run requires loopPosition=BUILD',
        context: { expected: 'BUILD', actual: 'IDLE', source: 'settle.run' },
        ts: '2026-05-14T22:30:00.000Z',
      }),
    ).not.toThrow();
  });

  // AC-1 (Phase 23.2) — coherence-warn type
  it('accepts coherence-warn event with context.source (AC-1)', () => {
    expect(() =>
      AnomalyEventZ.parse({
        type: 'coherence-warn',
        severity: 'warn',
        message: 'Draft touches src/foo.ts which is subject of decision D1',
        context: { code: 'DECISION_TOUCH', source: 'coherence.check' },
        ts: '2026-05-14T22:30:00.000Z',
      }),
    ).not.toThrow();
  });

  it('accepts offset-aware ts variants (AC-1)', () => {
    for (const good of [
      '2026-05-14T22:30:00.000Z',
      '2026-05-14T22:30:00.000-05:00',
      '2026-05-14T22:30:00+00:00',
    ]) {
      expect(() =>
        AnomalyEventZ.parse({
          type: 'force-used',
          severity: 'info',
          message: 'x',
          context: {},
          ts: good,
        }),
      ).not.toThrow();
    }
  });
});
