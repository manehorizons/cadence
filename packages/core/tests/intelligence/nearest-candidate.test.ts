import { describe, it, expect } from 'vitest';
import type { EvidenceLedger, Recommendation } from '@thomas-powers-jr/cadence-types';
import { scoreRecommendation } from '../../src/intelligence/recommend.js';
import { countFrictionEvidence } from '../../src/services/retro-feedback.js';
import { findNearestCandidates } from '../../src/intelligence/nearest-candidate.js';

function mkRec(p: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-x',
    title: 't',
    summary: 's',
    source: 'manual',
    status: 'candidate',
    readiness: 'raw-idea',
    priority: 'low',
    leverageScore: 0,
    riskScore: 0,
    confidence: 0,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...p,
  };
}

describe('findNearestCandidates', () => {
  it('AC-1: ranks eligible candidates using the same ordering as partitionLedger + scoreRecommendation (raw desc, createdAt asc, id asc)', () => {
    const low = mkRec({ id: 'rec-low', leverageScore: 1, createdAt: '2026-05-17T00:00:00.000Z' });
    const high = mkRec({ id: 'rec-high', leverageScore: 9, createdAt: '2026-05-17T00:00:00.000Z' });
    const mid = mkRec({ id: 'rec-mid', leverageScore: 5, createdAt: '2026-05-17T00:00:00.000Z' });

    const result = findNearestCandidates([low, high, mid], {
      isEligible: () => true,
    });

    expect(result.ranked.map((c) => c.rec.id)).toEqual(['rec-high', 'rec-mid', 'rec-low']);
    expect(result.top?.rec.id).toBe('rec-high');
    // Every ranked entry's raw/score matches scoreRecommendation's own output.
    expect(result.ranked[0]?.raw).toBe(scoreRecommendation(high).raw);
    expect(result.ranked[0]?.score).toBe(scoreRecommendation(high).score);
  });

  it('AC-1: ties on raw score break by createdAt asc then id asc', () => {
    const a = mkRec({ id: 'rec-b', createdAt: '2026-05-18T00:00:00.000Z' });
    const b = mkRec({ id: 'rec-a', createdAt: '2026-05-17T00:00:00.000Z' });
    const c = mkRec({ id: 'rec-a', createdAt: '2026-05-16T00:00:00.000Z' });

    const result = findNearestCandidates([a, b, c], { isEligible: () => true });

    // All score equal (identical fields except id/createdAt) — createdAt asc wins.
    expect(result.ranked.map((cand) => cand.rec.createdAt)).toEqual([
      '2026-05-16T00:00:00.000Z',
      '2026-05-17T00:00:00.000Z',
      '2026-05-18T00:00:00.000Z',
    ]);
  });

  it('AC-1: filters out recommendations excluded by partitionLedger (rejected/converted/shipped/settle-pending/deferred/needs-attention) before eligibility is even considered', () => {
    const rejected = mkRec({ id: 'rec-rejected', status: 'rejected' });
    const converted = mkRec({ id: 'rec-converted', status: 'converted' });
    const shipped = mkRec({ id: 'rec-shipped', status: 'shipped' });
    const settlePending = mkRec({ id: 'rec-settle-pending', status: 'settle-pending' });
    const deferred = mkRec({ id: 'rec-deferred', status: 'deferred' });
    const superseded = mkRec({ id: 'rec-superseded', decayState: 'superseded' });
    const candidate = mkRec({ id: 'rec-candidate', status: 'candidate' });

    const result = findNearestCandidates(
      [rejected, converted, shipped, settlePending, deferred, superseded, candidate],
      { isEligible: () => true },
    );

    expect(result.ranked.map((c) => c.rec.id)).toEqual(['rec-candidate']);
    expect(result.nearestMiss).toBeUndefined();
  });

  it('AC-1: nearestMiss is the highest-scored recommendation that is still in the live partition but fails the eligibility predicate', () => {
    const accepted = mkRec({ id: 'rec-accepted', status: 'accepted', leverageScore: 9 });
    const lowerCandidate = mkRec({ id: 'rec-candidate', status: 'candidate', leverageScore: 1 });

    const result = findNearestCandidates([accepted, lowerCandidate], {
      isEligible: (rec) => rec.status === 'candidate',
    });

    expect(result.top?.rec.id).toBe('rec-candidate');
    expect(result.ranked.map((c) => c.rec.id)).toEqual(['rec-candidate']);
    expect(result.nearestMiss?.rec.id).toBe('rec-accepted');
  });

  it('AC-1: returns undefined top and undefined nearestMiss for an empty ledger', () => {
    const result = findNearestCandidates([], { isEligible: () => true });
    expect(result.ranked).toEqual([]);
    expect(result.top).toBeUndefined();
    expect(result.nearestMiss).toBeUndefined();
  });

  it('AC-1: with no eligible candidates, nearestMiss surfaces the top-ranked ineligible one even when several exist', () => {
    const rejectedByEligibility1 = mkRec({ id: 'rec-1', status: 'accepted', leverageScore: 3 });
    const rejectedByEligibility2 = mkRec({ id: 'rec-2', status: 'accepted', leverageScore: 8 });

    const result = findNearestCandidates([rejectedByEligibility1, rejectedByEligibility2], {
      isEligible: (rec) => rec.status === 'candidate',
    });

    expect(result.top).toBeUndefined();
    expect(result.ranked).toEqual([]);
    expect(result.nearestMiss?.rec.id).toBe('rec-2');
  });

  it('phase 212 fix: an evidenceLedger with linked friction evidence produces the same score scoreRecommendation would directly (closes the recommend/next divergence)', () => {
    const withFriction = mkRec({
      id: 'rec-friction',
      leverageScore: 5,
      evidenceIds: ['ev-1'],
      createdAt: '2026-05-16T00:00:00.000Z',
    });
    const withoutFriction = mkRec({
      id: 'rec-plain',
      leverageScore: 5,
      evidenceIds: [],
      createdAt: '2026-05-17T00:00:00.000Z',
    });
    const evidenceLedger: EvidenceLedger = {
      schemaVersion: 1,
      evidence: [
        {
          id: 'ev-1',
          recommendationId: 'rec-friction',
          kind: 'note',
          summary: '[retro-friction:bypasses:code-review] recurring gate bypass "code-review" seen across 2 phase(s): 170-a, 171-b.',
          createdAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    };

    const result = findNearestCandidates(
      [withFriction, withoutFriction],
      { isEligible: () => true },
      evidenceLedger,
    );

    const frictionExpected = scoreRecommendation(
      withFriction,
      countFrictionEvidence(withFriction, evidenceLedger),
    );
    const plainExpected = scoreRecommendation(
      withoutFriction,
      countFrictionEvidence(withoutFriction, evidenceLedger),
    );

    expect(result.ranked.map((c) => c.rec.id)).toEqual(['rec-friction', 'rec-plain']);
    const frictionOut = result.ranked.find((c) => c.rec.id === 'rec-friction');
    const plainOut = result.ranked.find((c) => c.rec.id === 'rec-plain');
    expect(frictionOut!.score).toBe(frictionExpected.score);
    expect(plainOut!.score).toBe(plainExpected.score);
    expect(frictionOut!.score).toBeGreaterThan(plainOut!.score);
  });

  it('omitting evidenceLedger is a no-op — behaves identically to an explicit empty ledger', () => {
    const rec = mkRec({ id: 'rec-a', leverageScore: 5, evidenceIds: ['ev-1'] });
    const withEmptyLedger = findNearestCandidates(
      [rec],
      { isEligible: () => true },
      { schemaVersion: 1, evidence: [] },
    );
    const withoutLedgerArg = findNearestCandidates([rec], { isEligible: () => true });
    expect(withoutLedgerArg.top?.score).toBe(withEmptyLedger.top?.score);
  });
});
