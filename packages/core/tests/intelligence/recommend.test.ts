import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackendStatus, Recommendation } from '@manehorizons/cadence-types';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import { scoreRecommendation, partitionLedger, buildAdvisory, synthesizeRecommendation, runRecommend } from '../../src/intelligence/recommend.js';

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

  it('AC-6: excludes shipped from the active surface, like rejected/converted', () => {
    const p = partitionLedger([
      mkRec({ id: 'a', status: 'shipped' }),
      mkRec({ id: 'b', status: 'candidate' }),
    ]);
    expect(p.excludedCount).toBe(1);
    expect(p.ranked.map((r) => r.id)).toEqual(['b']);
    expect(p.parked).toEqual([]);
    expect(p.needsAttention).toEqual([]);
  });

  it('excludes settle-pending from the active surface, like converted/shipped', () => {
    const p = partitionLedger([
      mkRec({ id: 'rec-1', status: 'settle-pending' }),
      mkRec({ id: 'rec-2', status: 'accepted' }),
    ]);
    expect(p.excludedCount).toBe(1);
    expect(p.ranked.map((r) => r.id)).toEqual(['rec-2']);
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

describe('synthesizeRecommendation', () => {
  it('ranks by raw desc, tiebreak createdAt then id; assembles totals', () => {
    const recs = [
      mkRec({ id: 'low', leverageScore: 1, status: 'candidate', readiness: 'raw-idea' }),
      mkRec({ id: 'hi', leverageScore: 9, status: 'accepted', readiness: 'ready-for-milestone' }),
      mkRec({ id: 'rej', status: 'rejected' }),
      mkRec({ id: 'def', status: 'deferred', decayState: 'fresh' }),
      mkRec({ id: 'rot', status: 'candidate', decayState: 'contradicted' }),
    ];
    const report = synthesizeRecommendation(recs, idleBackend, new Date('2026-05-17T00:00:00.000Z'));
    expect(report.schemaVersion).toBe(1);
    expect(report.ranked.map((r) => r.id)).toEqual(['hi', 'low']);
    expect(report.parked.map((r) => r.id)).toEqual(['def']);
    expect(report.needsAttention.map((r) => r.id)).toEqual(['rot']);
    expect(report.totals).toEqual({
      total: 5, ranked: 2, parked: 1, needsAttention: 1, excluded: 1,
    });
    expect(report.advisory.kind).toBe('top-recommendation');
  });

  it('stable tiebreak: equal raw → createdAt asc then id asc', () => {
    const a = mkRec({ id: 'b', createdAt: '2026-05-17T00:00:00.000Z' });
    const b = mkRec({ id: 'a', createdAt: '2026-05-17T00:00:00.000Z' });
    const c = mkRec({ id: 'z', createdAt: '2026-05-16T00:00:00.000Z' });
    const report = synthesizeRecommendation([a, b, c], idleBackend, new Date());
    expect(report.ranked.map((r) => r.id)).toEqual(['z', 'a', 'b']);
  });

  it('AC-3: carries scoutId into the ranked item', () => {
    const recs = [mkRec({ id: 'hi', leverageScore: 9, scoutId: 'scout-A' })];
    const report = synthesizeRecommendation(recs, idleBackend, new Date());
    expect(report.ranked[0]?.scoutId).toBe('scout-A');
  });

  it('AC-3: omits scoutId on the ranked item when the rec has none', () => {
    const recs = [mkRec({ id: 'hi', leverageScore: 9 })];
    const report = synthesizeRecommendation(recs, idleBackend, new Date());
    expect(report.ranked[0]?.scoutId).toBeUndefined();
  });

  it('AC-4: scoutId filter narrows the report to one cluster, totals scoped', () => {
    const recs = [
      mkRec({ id: 'a1', leverageScore: 9, scoutId: 'scout-A' }),
      mkRec({ id: 'a2', leverageScore: 8, scoutId: 'scout-A' }),
      mkRec({ id: 'b1', leverageScore: 7, scoutId: 'scout-B' }),
      mkRec({ id: 'none', leverageScore: 6 }),
    ];
    const report = synthesizeRecommendation(recs, idleBackend, new Date(), {
      scoutId: 'scout-A',
    });
    expect(report.ranked.map((r) => r.id)).toEqual(['a1', 'a2']);
    expect(report.totals.total).toBe(2);
    expect(report.totals.ranked).toBe(2);
  });
});

let activeRec: Fixture | null = null;
afterEach(async () => {
  if (activeRec) {
    await activeRec.cleanup();
    activeRec = null;
  }
});

describe('runRecommend', () => {
  it('writes recommend.json + RECOMMEND.md and returns the report', async () => {
    activeRec = await tempRepo({ initialized: true, projectName: 'recommend-fix' });
    await addRecommendation(activeRec.root, {
      title: 'ship the thing',
      summary: 'because',
      priority: 'high',
      readiness: 'ready-for-milestone',
      affectedAreas: [],
      affectedFiles: [],
    });

    const report = await runRecommend(activeRec.root);
    expect(report.schemaVersion).toBe(1);
    expect(report.ranked).toHaveLength(1);

    const jsonRaw = await readFile(
      join(activeRec.root, '.cadence', 'intelligence', 'recommend.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);

    const md = await readFile(
      join(activeRec.root, '.cadence', 'intelligence', 'RECOMMEND.md'),
      'utf8',
    );
    expect(md).toMatch(/# CADENCE Recommended Next Moves/);
  });

  it('degrades cleanly on an empty ledger', async () => {
    activeRec = await tempRepo({ initialized: true });
    const report = await runRecommend(activeRec.root);
    expect(report.ranked).toEqual([]);
    expect(report.advisory.kind).toBe('empty');
  });
});
