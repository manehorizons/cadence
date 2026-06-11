import { describe, expect, it } from 'vitest';
import type {
  Recommendation,
  RecommendationLedger,
} from '@manehorizons/cadence-types';
import { applyRecommendationPromotion } from '../../src/intelligence/store/recommendations.js';

function mkRec(
  id: string,
  status: Recommendation['status'],
  overrides: Partial<Recommendation> = {},
): Recommendation {
  return {
    id,
    title: `${id} title`,
    summary: `${id} summary`,
    source: 'manual',
    status,
    readiness: 'raw-idea',
    priority: 'medium',
    leverageScore: 5,
    riskScore: 5,
    confidence: 0.5,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
    ...overrides,
  };
}

const mkLedger = (recs: Recommendation[]): RecommendationLedger => ({
  schemaVersion: 1,
  recommendations: recs,
});

describe('applyRecommendationPromotion (phase 57 pure helper)', () => {
  const now = new Date('2026-06-04T12:00:00.000Z');

  it('AC-1: sets readiness; bumps updatedAt; preserves status', () => {
    const ledger = mkLedger([
      mkRec('rec-1', 'candidate', { readiness: 'needs-evidence' }),
    ]);
    const res = applyRecommendationPromotion(
      ledger,
      'rec-1',
      { readiness: 'ready-for-milestone' },
      now,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.recommendations[0]!.readiness).toBe('ready-for-milestone');
    expect(res.ledger.recommendations[0]!.status).toBe('candidate');
    expect(res.ledger.recommendations[0]!.updatedAt).toBe(
      '2026-06-04T12:00:00.000Z',
    );
  });

  it('AC-2: sets status', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const res = applyRecommendationPromotion(
      ledger,
      'rec-1',
      { status: 'accepted' },
      now,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.recommendations[0]!.status).toBe('accepted');
  });

  it('AC-2/AC-1: sets both at once', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const res = applyRecommendationPromotion(
      ledger,
      'rec-1',
      { status: 'accepted', readiness: 'ready-for-milestone' },
      now,
    );
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.recommendations[0]!.status).toBe('accepted');
    expect(res.ledger.recommendations[0]!.readiness).toBe('ready-for-milestone');
  });

  it('AC-4: empty change set is refused', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const res = applyRecommendationPromotion(ledger, 'rec-1', {}, now);
    expect(res.ok).toBe(false);
  });

  it.each(['converted', 'rejected'] as const)(
    'AC-6: terminal status %s cannot be promoted',
    (status) => {
      const ledger = mkLedger([mkRec('rec-1', status)]);
      const res = applyRecommendationPromotion(
        ledger,
        'rec-1',
        { status: 'accepted' },
        now,
      );
      expect(res.ok).toBe(false);
    },
  );

  it('AC-6: promote must never write convertedToPhaseId', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const res = applyRecommendationPromotion(
      ledger,
      'rec-1',
      { status: 'accepted' },
      now,
    );
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.recommendations[0]!.convertedToPhaseId).toBeUndefined();
  });

  it('AC-7: unknown id is a clean error', () => {
    const res = applyRecommendationPromotion(
      mkLedger([]),
      'rec-bogus',
      { status: 'accepted' },
      now,
    );
    expect(res).toEqual({ ok: false, error: 'recommendation rec-bogus not found' });
  });

  it('does not mutate the input ledger', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const before = JSON.stringify(ledger);
    applyRecommendationPromotion(ledger, 'rec-1', { status: 'accepted' }, now);
    expect(JSON.stringify(ledger)).toBe(before);
  });
});

describe('phase 100: shipped terminal status', () => {
  const now = new Date('2026-06-11T12:00:00.000Z');

  it.each(['candidate', 'accepted', 'deferred'] as const)(
    'AC-2: promotes %s → shipped',
    (from) => {
      const ledger = mkLedger([mkRec('rec-1', from)]);
      const res = applyRecommendationPromotion(ledger, 'rec-1', { status: 'shipped' }, now);
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('expected ok');
      expect(res.ledger.recommendations[0]!.status).toBe('shipped');
      expect(res.ledger.recommendations[0]!.updatedAt).toBe('2026-06-11T12:00:00.000Z');
    },
  );

  it('AC-3: converted → shipped is allowed (the one sanctioned exception)', () => {
    const ledger = mkLedger([
      mkRec('rec-1', 'converted', { convertedToPhaseId: '100-rec-shipped-status' }),
    ]);
    const res = applyRecommendationPromotion(ledger, 'rec-1', { status: 'shipped' }, now);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.recommendations[0]!.status).toBe('shipped');
    // the phase link is preserved through the transition
    expect(res.ledger.recommendations[0]!.convertedToPhaseId).toBe('100-rec-shipped-status');
  });

  it('AC-3: converted may ONLY go to shipped, not back to an active status', () => {
    const ledger = mkLedger([mkRec('rec-1', 'converted')]);
    const res = applyRecommendationPromotion(ledger, 'rec-1', { status: 'accepted' }, now);
    expect(res.ok).toBe(false);
  });

  it('AC-4: shipped is terminal — cannot be promoted out of', () => {
    const ledger = mkLedger([mkRec('rec-1', 'shipped')]);
    const res = applyRecommendationPromotion(ledger, 'rec-1', { status: 'accepted' }, now);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected refusal');
    expect(res.error).toMatch(/terminal status shipped/);
  });

  it('AC-5: records shippedRef when promoting to shipped', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const res = applyRecommendationPromotion(
      ledger,
      'rec-1',
      { status: 'shipped', shippedRef: 'PR #70 / v1.22.1' },
      now,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.recommendations[0]!.shippedRef).toBe('PR #70 / v1.22.1');
  });

  it('AC-5: shipped without a ref is allowed (ref absent)', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const res = applyRecommendationPromotion(ledger, 'rec-1', { status: 'shipped' }, now);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.recommendations[0]!.shippedRef).toBeUndefined();
  });

  it('AC-5: shippedRef paired with a non-shipped status is refused', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const res = applyRecommendationPromotion(
      ledger,
      'rec-1',
      { status: 'accepted', shippedRef: 'PR #70' },
      now,
    );
    expect(res.ok).toBe(false);
  });
});
