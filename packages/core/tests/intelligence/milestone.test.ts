import { describe, expect, it } from 'vitest';
import type { IntelligenceMilestone, Recommendation } from '@cadence/types';
import { clusterMilestones, isEligible, seedPreMortem } from '../../src/intelligence/milestone.js';

function mkRec(p: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-x',
    title: 't',
    summary: 's',
    source: 'manual',
    status: 'accepted',
    readiness: 'ready-for-milestone',
    priority: 'low',
    leverageScore: 0,
    riskScore: 0,
    confidence: 0.9,
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

describe('isEligible', () => {
  it('accepts accepted + ready-for-milestone/spec + non-rotted', () => {
    expect(isEligible(mkRec())).toBe(true);
    expect(isEligible(mkRec({ readiness: 'ready-for-cadence-spec' }))).toBe(true);
  });
  it('rejects non-accepted status', () => {
    expect(isEligible(mkRec({ status: 'candidate' }))).toBe(false);
    expect(isEligible(mkRec({ status: 'deferred' }))).toBe(false);
  });
  it('rejects non-ready readiness', () => {
    expect(isEligible(mkRec({ readiness: 'raw-idea' }))).toBe(false);
    expect(isEligible(mkRec({ readiness: 'needs-decision' }))).toBe(false);
    expect(isEligible(mkRec({ readiness: 'blocked' }))).toBe(false);
  });
  it('rejects superseded/contradicted decay', () => {
    expect(isEligible(mkRec({ decayState: 'superseded' }))).toBe(false);
    expect(isEligible(mkRec({ decayState: 'contradicted' }))).toBe(false);
    expect(isEligible(mkRec({ decayState: 'stale' }))).toBe(true);
  });
});

describe('seedPreMortem', () => {
  it('all empty when no facts trigger', () => {
    expect(seedPreMortem([mkRec({ id: 'a' })])).toEqual({
      likelyFailureModes: [],
      hiddenDependencies: [],
      driftRisks: [],
      outOfScope: [],
    });
  });

  it('shared file across >=2 recs -> sorted hidden dependency', () => {
    const pm = seedPreMortem([
      mkRec({ id: 'b', affectedFiles: ['src/x.ts'] }),
      mkRec({ id: 'a', affectedFiles: ['src/x.ts'] }),
      mkRec({ id: 'c', affectedFiles: ['src/solo.ts'] }),
    ]);
    expect(pm.hiddenDependencies).toEqual([
      'Shared file src/x.ts edited by a, b — ordering/coordination dependency.',
    ]);
  });

  it('doc surface via area, docs/ path, or DESIGN/README/CHANGELOG -> single drift risk', () => {
    const viaArea = seedPreMortem([mkRec({ affectedAreas: ['docs'] })]);
    const viaPath = seedPreMortem([mkRec({ affectedFiles: ['docs/x.md'] })]);
    const viaName = seedPreMortem([mkRec({ affectedFiles: ['DESIGN.md'] })]);
    for (const pm of [viaArea, viaPath, viaName]) {
      expect(pm.driftRisks).toEqual([
        'Milestone touches documentation surfaces — spec/doc drift risk.',
      ]);
    }
  });

  it('confidence < 0.5 -> failure mode (0.5 boundary excluded), sorted by id', () => {
    const pm = seedPreMortem([
      mkRec({ id: 'b', confidence: 0.2 }),
      mkRec({ id: 'a', confidence: 0.49 }),
      mkRec({ id: 'c', confidence: 0.5 }),
    ]);
    expect(pm.likelyFailureModes).toEqual([
      'Low-confidence input: a (confidence 0.49) — assumption may be wrong.',
      'Low-confidence input: b (confidence 0.20) — assumption may be wrong.',
    ]);
  });

  it('outOfScope is always empty', () => {
    expect(seedPreMortem([mkRec({ affectedAreas: ['docs'] })]).outOfScope).toEqual([]);
  });
});

const NOW = new Date('2026-05-17T12:00:00.000Z');

describe('clusterMilestones', () => {
  it('groups by suggestedMilestoneId and falls back to per-rec singletons', () => {
    const out = clusterMilestones(
      [
        mkRec({ id: 'rec-1', title: 'A', suggestedMilestoneId: 'Auth Work' }),
        mkRec({ id: 'rec-2', title: 'B', suggestedMilestoneId: 'Auth Work' }),
        mkRec({ id: 'rec-3', title: 'Solo', summary: 'lone' }),
      ],
      [],
      NOW,
    );
    const byId = Object.fromEntries(out.map((m) => [m.id, m]));
    expect(Object.keys(byId).sort()).toEqual(['mil-grp-auth-work', 'mil-rec-rec-3']);
    expect(byId['mil-grp-auth-work'].recommendationIds).toEqual(['rec-1', 'rec-2']);
    expect(byId['mil-grp-auth-work'].name).toBe('Auth Work');
    expect(byId['mil-grp-auth-work'].objective).toBe(
      'Deliver 2 recommendation(s): A; B',
    );
    expect(byId['mil-rec-rec-3'].name).toBe('Solo');
    expect(byId['mil-rec-rec-3'].objective).toBe('lone');
    for (const m of out) expect(m.status).toBe('proposed');
  });

  it('filters ineligible recs and excludes empty-sanitized ids to singletons', () => {
    const out = clusterMilestones(
      [
        mkRec({ id: 'ok', suggestedMilestoneId: '   ' }),
        mkRec({ id: 'bad', status: 'candidate', suggestedMilestoneId: 'X' }),
      ],
      [],
      NOW,
    );
    expect(out.map((m) => m.id)).toEqual(['mil-rec-ok']);
  });

  it('refreshes proposed, preserves non-proposed, and excludes their recs', () => {
    const existing: IntelligenceMilestone[] = [
      {
        id: 'mil-grp-keep',
        name: 'keep',
        objective: 'kept',
        status: 'accepted',
        recommendationIds: ['rec-claimed'],
        preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
        exportTargets: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'mil-rec-stale',
        name: 'old proposed',
        objective: 'old',
        status: 'proposed',
        recommendationIds: ['rec-old'],
        preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
        exportTargets: [],
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      },
    ];
    const out = clusterMilestones(
      [
        mkRec({ id: 'rec-claimed', suggestedMilestoneId: 'keep' }),
        mkRec({ id: 'rec-new', title: 'New' }),
      ],
      existing,
      NOW,
    );
    const ids = out.map((m) => m.id).sort();
    expect(ids).toEqual(['mil-grp-keep', 'mil-rec-rec-new']);
    expect(out.find((m) => m.id === 'mil-grp-keep')!.status).toBe('accepted');
    // stale proposed dropped; claimed rec not re-proposed
    expect(out.some((m) => m.id === 'mil-rec-stale')).toBe(false);
  });

  it('carries forward createdAt of a same-id existing proposed milestone', () => {
    const existing: IntelligenceMilestone[] = [
      {
        id: 'mil-rec-rec-1',
        name: 'X',
        objective: 'x',
        status: 'proposed',
        recommendationIds: ['rec-1'],
        preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
        exportTargets: [],
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    ];
    const out = clusterMilestones([mkRec({ id: 'rec-1' })], existing, NOW);
    const m = out[0];
    expect(m.createdAt).toBe('2026-05-10T00:00:00.000Z');
    expect(m.updatedAt).toBe(NOW.toISOString());
  });

  it('is byte-stable for a fixed now on an unchanged ledger', () => {
    const recs = [mkRec({ id: 'rec-1', suggestedMilestoneId: 'g' }), mkRec({ id: 'rec-2' })];
    const a = clusterMilestones(recs, [], NOW);
    const b = clusterMilestones(recs, a, NOW);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('empty input -> empty output', () => {
    expect(clusterMilestones([], [], NOW)).toEqual([]);
  });

  it('does NOT emit a fresh bucket that collides with a non-proposed survivor id', () => {
    const existing: IntelligenceMilestone[] = [
      {
        id: 'mil-grp-auth-work',
        name: 'Auth Work',
        objective: 'kept',
        status: 'accepted',
        recommendationIds: ['rec-old'],
        preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
        exportTargets: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ];
    const out = clusterMilestones(
      [mkRec({ id: 'rec-new', suggestedMilestoneId: 'Auth Work' })],
      existing,
      NOW,
    );
    // exactly one milestone with this id, and it is the untouched accepted survivor
    expect(out.filter((m) => m.id === 'mil-grp-auth-work')).toHaveLength(1);
    const keep = out.find((m) => m.id === 'mil-grp-auth-work')!;
    expect(keep.status).toBe('accepted');
    expect(keep.recommendationIds).toEqual(['rec-old']);
  });

  it('truncates grouped objective to the first 3 titles', () => {
    const out = clusterMilestones(
      [
        mkRec({ id: 'r1', title: 'T1', suggestedMilestoneId: 'g', createdAt: '2026-05-01T00:00:00.000Z' }),
        mkRec({ id: 'r2', title: 'T2', suggestedMilestoneId: 'g', createdAt: '2026-05-02T00:00:00.000Z' }),
        mkRec({ id: 'r3', title: 'T3', suggestedMilestoneId: 'g', createdAt: '2026-05-03T00:00:00.000Z' }),
        mkRec({ id: 'r4', title: 'T4', suggestedMilestoneId: 'g', createdAt: '2026-05-04T00:00:00.000Z' }),
      ],
      [],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.objective).toBe('Deliver 4 recommendation(s): T1; T2; T3');
  });
});
