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
    ] as const;
    for (const t of types) {
      expect(() =>
        AnomalyEventZ.parse({
          type: t,
          severity: 'info',
          message: 'x',
          context: {},
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
      }),
    ).toThrow();
  });

  it('rejects missing context', () => {
    expect(() =>
      AnomalyEventZ.parse({
        type: 'force-used',
        severity: 'info',
        message: 'x',
      } as never),
    ).toThrow();
  });
});
