import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackendStatus, Evidence, EvidenceLedger, Recommendation } from '@thomas-powers-jr/cadence-types';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
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
    // raw is exactly the pre-phase-212 7-term value (frictionEvidenceCount
    // defaults to 0 -> frictionPts is exactly 0, a genuine no-op on raw).
    expect(r.raw).toBe(32.3);
    // score is unchanged from pre-phase-212: frictionPts=0 is a no-op on both
    // raw and score, and SCORE_MIN/SCORE_MAX are unchanged (AC-3 invariant —
    // zero friction evidence must score identically to today).
    expect(r.score).toBe(83);
    expect(r.terms.map((t) => t.label)).toEqual([
      'lev 7',
      'conf 0.80',
      'risk 3',
      'status accepted',
      'ready ready-for-milestone',
      'decay fresh',
      'prio high',
      'friction 0',
    ]);
    expect(r.terms.find((t) => t.label === 'conf 0.80')?.value).toBe(4.8);
    expect(r.terms.find((t) => t.label === 'risk 3')?.value).toBe(-1.5);
    expect(r.terms.find((t) => t.label === 'friction 0')?.value).toBe(0);
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

  it('the 7-term maximum (raw 44, no friction) rescales to exactly 100 — SCORE_MAX unchanged', () => {
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
    // raw is byte-identical to the pre-phase-212 7-term max, and with
    // SCORE_MAX still 44 (reverted from the rejected 48.5 widening), this
    // rescales to exactly 100 — matching pre-phase-212 clamp behavior.
    expect(r.raw).toBe(44);
    expect(r.score).toBe(100);
  });

  it('raw exceeding 44 purely because of added frictionPts also clamps to 100 — same clamp, different term', () => {
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
      3, // capped friction-evidence count -> +4.5, pushing raw past the 44 ceiling
    );
    // raw legitimately exceeds SCORE_MAX (44) now — the pre-existing
    // Math.max(0, Math.min(100, ...)) clamp saturates score at 100, exactly
    // as it already does today whenever any other combination of the 7
    // original terms exceeds 44. Not a new bug class.
    expect(r.raw).toBe(48.5);
    expect(r.score).toBe(100);
  });

  it('applies each categorical penalty (stale and needs-revalidation sink)', () => {
    const stale = scoreRecommendation(mkRec({ decayState: 'stale' }));
    const nr = scoreRecommendation(mkRec({ decayState: 'needs-revalidation' }));
    const fresh = scoreRecommendation(mkRec({ decayState: 'fresh' }));
    expect(fresh.raw - stale.raw).toBe(10); // +4 − (−6)
    expect(fresh.raw - nr.raw).toBe(9);     // +4 − (−5)
  });

  it('AC-3: frictionEvidenceCount=0 leaves raw byte-identical to the pre-phase-212 7-term formula', () => {
    const inputs = {
      leverageScore: 7,
      confidence: 0.8,
      riskScore: 3,
      status: 'accepted' as const,
      readiness: 'ready-for-milestone' as const,
      decayState: 'fresh' as const,
      priority: 'high' as const,
    };
    const oldFormulaRaw =
      inputs.leverageScore * 1.0 +
      inputs.confidence * 10 * 0.6 -
      inputs.riskScore * 0.5 +
      6 /* status accepted */ +
      7 /* readiness ready-for-milestone */ +
      4 /* decay fresh */ +
      5 /* priority high */;
    const r = scoreRecommendation(mkRec(inputs));
    expect(r.raw).toBe(Math.round(oldFormulaRaw * 10) / 10);
    expect(r.raw).toBe(32.3);
  });

  it('AC-3: a recommendation with N>0 linked friction evidence scores strictly higher (raw and score) than an otherwise-identical one with none', () => {
    const base = mkRec({
      leverageScore: 5,
      confidence: 0.5,
      riskScore: 5,
      status: 'candidate',
      readiness: 'needs-decision',
      decayState: 'aging',
      priority: 'medium',
    });
    const withoutFriction = scoreRecommendation(base, 0);
    const withFriction = scoreRecommendation(base, 2);
    expect(withFriction.raw).toBeGreaterThan(withoutFriction.raw);
    expect(withFriction.score).toBeGreaterThan(withoutFriction.score);
    expect(withFriction.raw - withoutFriction.raw).toBe(3); // 2 * 1.5
    expect(withFriction.terms.find((t) => t.label === 'friction 2')?.value).toBe(3);
  });

  it('AC-3: frictionEvidenceCount caps at 3 — 5 linked entries scores the same as 3', () => {
    const base = mkRec({ leverageScore: 4, priority: 'low' });
    const at3 = scoreRecommendation(base, 3);
    const at5 = scoreRecommendation(base, 5);
    expect(at5.raw).toBe(at3.raw);
    expect(at5.score).toBe(at3.score);
    expect(at5.terms.find((t) => t.label.startsWith('friction'))?.label).toBe('friction 3');
    expect(at3.terms.find((t) => t.label === 'friction 3')?.value).toBe(4.5);
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

  it('top truncates the displayed ranked list but keeps totals.ranked at the full count', () => {
    const recs = [
      mkRec({ id: 'a', leverageScore: 9 }),
      mkRec({ id: 'b', leverageScore: 8 }),
      mkRec({ id: 'c', leverageScore: 7 }),
    ];
    const report = synthesizeRecommendation(recs, idleBackend, new Date(), { top: 2 });
    expect(report.ranked.map((r) => r.id)).toEqual(['a', 'b']);
    expect(report.totals.ranked).toBe(3);
  });

  it('top omitted shows the full ranked list unchanged (no truncation)', () => {
    const recs = [
      mkRec({ id: 'a', leverageScore: 9 }),
      mkRec({ id: 'b', leverageScore: 8 }),
    ];
    const report = synthesizeRecommendation(recs, idleBackend, new Date());
    expect(report.ranked).toHaveLength(2);
    expect(report.totals.ranked).toBe(2);
  });

  it('top larger than the ranked count shows everything, no truncation', () => {
    const recs = [mkRec({ id: 'a' })];
    const report = synthesizeRecommendation(recs, idleBackend, new Date(), { top: 5 });
    expect(report.ranked).toHaveLength(1);
    expect(report.totals.ranked).toBe(1);
  });

  it('top:0 empties the displayed ranked list but advisory still reflects the true top item', () => {
    const recs = [mkRec({ id: 'a', leverageScore: 9, readiness: 'ready-for-milestone' })];
    const report = synthesizeRecommendation(recs, idleBackend, new Date(), { top: 0 });
    expect(report.ranked).toEqual([]);
    expect(report.totals.ranked).toBe(1);
    expect(report.advisory.kind).toBe('top-recommendation');
  });

  it('AC-3: an evidenceLedger with linked friction evidence ranks/scores that recommendation higher than an otherwise-identical one with none', () => {
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
    const evidence: Evidence = {
      id: 'ev-1',
      recommendationId: 'rec-friction',
      kind: 'note',
      summary: '[retro-friction:bypasses:code-review] recurring gate bypass "code-review" seen across 2 phase(s): 170-a, 171-b.',
      createdAt: '2026-05-16T00:00:00.000Z',
    };
    const evidenceLedger: EvidenceLedger = { schemaVersion: 1, evidence: [evidence] };

    const report = synthesizeRecommendation(
      [withFriction, withoutFriction],
      idleBackend,
      new Date(),
      {},
      evidenceLedger,
    );

    expect(report.ranked.map((r) => r.id)).toEqual(['rec-friction', 'rec-plain']);
    const frictionRank = report.ranked.find((r) => r.id === 'rec-friction');
    const plainRank = report.ranked.find((r) => r.id === 'rec-plain');
    expect(frictionRank).toBeDefined();
    expect(plainRank).toBeDefined();
    expect(frictionRank!.raw).toBeGreaterThan(plainRank!.raw);
    expect(frictionRank!.score).toBeGreaterThan(plainRank!.score);
    expect(frictionRank!.terms.find((t) => t.label === 'friction 1')?.value).toBe(1.5);
    expect(plainRank!.terms.find((t) => t.label === 'friction 0')?.value).toBe(0);
  });

  it('omitting evidenceLedger is a no-op — behaves identically to an explicit empty ledger', () => {
    const recs = [mkRec({ id: 'a', leverageScore: 9 })];
    const withDefault = synthesizeRecommendation(recs, idleBackend, new Date('2026-05-17T00:00:00.000Z'));
    const withExplicitEmpty = synthesizeRecommendation(
      recs,
      idleBackend,
      new Date('2026-05-17T00:00:00.000Z'),
      {},
      { schemaVersion: 1, evidence: [] },
    );
    expect(withDefault.ranked[0]?.raw).toBe(withExplicitEmpty.ranked[0]?.raw);
    expect(withDefault.ranked[0]?.score).toBe(withExplicitEmpty.ranked[0]?.score);
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
