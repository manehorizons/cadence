import { describe, expect, it } from 'vitest';
import type { BackendStatus, Recommendation } from '@cadence/types';
import { scoreRecommendation, partitionLedger, buildAdvisory } from '../../src/intelligence/recommend.js';

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

describe('scoreRecommendation', () => {
  it('computes the spec worked example exactly (raw 32.3, score 83)', () => {
    const r = scoreRecommendation(
      mkRec({
        leverageScore: 7,
        confidence: 0.8,
        riskScore: 3,
        status: 'accepted',
        readiness: 'ready-for-milestone',
        decayState: 'fresh',
        priority: 'high',
      }),
    );
    expect(r.raw).toBe(32.3);
    expect(r.score).toBe(83);
    expect(r.terms.map((t) => t.label)).toEqual([
      'lev 7',
      'conf 0.80',
      'risk 3',
      'status accepted',
      'ready ready-for-milestone',
      'decay fresh',
      'prio high',
    ]);
    expect(r.terms.find((t) => t.label === 'conf 0.80')?.value).toBe(4.8);
    expect(r.terms.find((t) => t.label === 'risk 3')?.value).toBe(-1.5);
  });

  it('clamps the ranked-universe minimum to 0', () => {
    const r = scoreRecommendation(
      mkRec({
        leverageScore: 0,
        confidence: 0,
        riskScore: 10,
        status: 'candidate',
        readiness: 'blocked',
        decayState: 'stale',
        priority: 'low',
      }),
    );
    expect(r.raw).toBe(-23);
    expect(r.score).toBe(0);
  });

  it('clamps the ranked-universe maximum to 100', () => {
    const r = scoreRecommendation(
      mkRec({
        leverageScore: 10,
        confidence: 1,
        riskScore: 0,
        status: 'accepted',
        readiness: 'ready-for-cadence-spec',
        decayState: 'fresh',
        priority: 'critical',
      }),
    );
    expect(r.raw).toBe(44);
    expect(r.score).toBe(100);
  });

  it('applies each categorical penalty (stale and needs-revalidation sink)', () => {
    const stale = scoreRecommendation(mkRec({ decayState: 'stale' }));
    const nr = scoreRecommendation(mkRec({ decayState: 'needs-revalidation' }));
    const fresh = scoreRecommendation(mkRec({ decayState: 'fresh' }));
    expect(fresh.raw - stale.raw).toBe(10); // +4 − (−6)
    expect(fresh.raw - nr.raw).toBe(9);     // +4 − (−5)
  });
});

describe('partitionLedger', () => {
  it('excludes rejected and converted (count only)', () => {
    const p = partitionLedger([
      mkRec({ id: 'a', status: 'rejected' }),
      mkRec({ id: 'b', status: 'converted' }),
      mkRec({ id: 'c', status: 'candidate' }),
    ]);
    expect(p.excludedCount).toBe(2);
    expect(p.ranked.map((r) => r.id)).toEqual(['c']);
    expect(p.parked).toEqual([]);
    expect(p.needsAttention).toEqual([]);
  });

  it('routes superseded/contradicted to needs-attention, overriding deferred', () => {
    const p = partitionLedger([
      mkRec({ id: 'a', status: 'deferred', decayState: 'contradicted' }),
      mkRec({ id: 'b', status: 'candidate', decayState: 'superseded' }),
    ]);
    expect(p.needsAttention.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(p.parked).toEqual([]);
    expect(p.ranked).toEqual([]);
  });

  it('parks plain deferred and ranks candidate/accepted (stale still ranked)', () => {
    const p = partitionLedger([
      mkRec({ id: 'a', status: 'deferred', decayState: 'fresh' }),
      mkRec({ id: 'b', status: 'candidate', decayState: 'stale' }),
      mkRec({ id: 'c', status: 'accepted', decayState: 'fresh' }),
    ]);
    expect(p.parked.map((r) => r.id)).toEqual(['a']);
    expect(p.ranked.map((r) => r.id).sort()).toEqual(['b', 'c']);
  });
});

const idleBackend: BackendStatus = {
  present: true,
  kind: 'cadence',
  loopPosition: 'IDLE',
  activePhase: null,
  activeDraft: null,
  activeSpec: null,
  tier: null,
  legalActions: ['cadence draft new <phase> <num> --title=…'],
};

describe('buildAdvisory', () => {
  it('finish-loop when a draft is in flight, surfacing the legal action + secondary', () => {
    const a = buildAdvisory(
      mkRec({ suggestedBackendAction: 'cadence milestone propose' }),
      {
        ...idleBackend,
        loopPosition: 'DRAFT',
        activeDraft: 'p-1-01',
        legalActions: ['cadence build task T1'],
      },
      { needsAttention: 0 },
    );
    expect(a.kind).toBe('finish-loop');
    expect(a.primary).toMatch(/cadence build task T1/);
    expect(a.secondary).toBe('cadence milestone propose');
  });

  it('finish-loop with no topRanked has no secondary', () => {
    const a = buildAdvisory(
      null,
      { ...idleBackend, loopPosition: 'DRAFT', activeDraft: 'p-1-01', legalActions: ['cadence build task T1'] },
      { needsAttention: 0 },
    );
    expect(a.kind).toBe('finish-loop');
    expect(a.secondary).toBeUndefined();
  });

  it('an inconsistent loop (DRAFT, no active draft) is treated as not-in-flight', () => {
    const a = buildAdvisory(
      mkRec({ readiness: 'ready-for-milestone' }),
      { ...idleBackend, loopPosition: 'DRAFT', activeDraft: null },
      { needsAttention: 0 },
    );
    expect(a.kind).not.toBe('finish-loop');
    expect(a.kind).toBe('top-recommendation');
  });

  it('spec-new when the top item is ready for a CADENCE spec', () => {
    const a = buildAdvisory(
      mkRec({ readiness: 'ready-for-cadence-spec' }),
      idleBackend,
      { needsAttention: 0 },
    );
    expect(a).toEqual({ kind: 'spec-new', primary: 'cadence spec new' });
  });

  it('top-recommendation falls back to the default action when none suggested', () => {
    const a = buildAdvisory(
      mkRec({ readiness: 'ready-for-milestone', suggestedBackendAction: undefined }),
      idleBackend,
      { needsAttention: 0 },
    );
    expect(a).toEqual({ kind: 'top-recommendation', primary: 'cadence milestone propose' });
  });

  it('empty when no ranked items, noting needs-attention count', () => {
    const a = buildAdvisory(null, idleBackend, { needsAttention: 2 });
    expect(a.kind).toBe('empty');
    expect(a.primary).toMatch(/cadence recommendation add/);
    expect(a.primary).toMatch(/2 recommendation\(s\) need revalidation/);
  });
});
