import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@cadence/types';
import { isEligible, seedPreMortem } from '../../src/intelligence/milestone.js';

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
