import { describe, expect, it } from 'vitest';
import type {
  AssumptionLedger,
  EvidenceLedger,
  IntelligenceDecisionLedger,
  Recommendation,
  RecommendationLedger,
} from '@manehorizons/cadence-types';
import { computeIntelligenceStats } from '../../src/intelligence/store.js';

function mkRec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-1',
    title: 't',
    summary: 's',
    source: 'manual',
    status: 'candidate',
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
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

const emptyRec: RecommendationLedger = { schemaVersion: 1, recommendations: [] };
const emptyEv: EvidenceLedger = { schemaVersion: 1, evidence: [] };
const emptyAs: AssumptionLedger = { schemaVersion: 1, assumptions: [] };
const emptyDec: IntelligenceDecisionLedger = { schemaVersion: 1, decisions: [] };

describe('computeIntelligenceStats (Slice 18)', () => {
  it('AC-1: empty ledgers → all zeros, perRec empty', () => {
    const s = computeIntelligenceStats(emptyRec, emptyEv, emptyAs, emptyDec);
    expect(s.recommendations.total).toBe(0);
    expect(s.evidence.total).toBe(0);
    expect(s.assumptions.total).toBe(0);
    expect(s.decisions.total).toBe(0);
    expect(s.decisions.untied).toBe(0);
    expect(s.links.brokenAssumptionLinks).toBe(0);
    expect(s.links.brokenDecisionLinks).toBe(0);
    expect(s.links.brokenEvidenceLinks).toBe(0);
    expect(s.perRec).toEqual([]);
    // All enum keys present even when 0
    expect(s.recommendations.byStatus.candidate).toBe(0);
    expect(s.assumptions.byStatus.open).toBe(0);
    expect(s.decisions.byStatus.active).toBe(0);
  });

  it('AC-2: partitions assumptions/decisions/evidence by status/kind', () => {
    const recL: RecommendationLedger = { schemaVersion: 1, recommendations: [] };
    const evL: EvidenceLedger = {
      schemaVersion: 1,
      evidence: [
        { id: 'ev-1', recommendationId: 'rec-x', kind: 'note', summary: 'n', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'ev-2', recommendationId: 'rec-x', kind: 'file', summary: 'f', path: 'a', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'ev-3', recommendationId: 'rec-x', kind: 'command', summary: 'c', command: 'pnpm', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'ev-4', recommendationId: 'rec-x', kind: 'note', summary: 'n2', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const asL: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-1', recommendationId: 'rec-x', text: 'x', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-2', recommendationId: 'rec-x', text: 'y', status: 'validated', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-3', recommendationId: 'rec-x', text: 'z', status: 'rejected', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-4', recommendationId: 'rec-x', text: 'w', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const decL: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-1', recommendationId: 'rec-x', title: 'a', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
        { id: 'dec-2', title: 'b', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const s = computeIntelligenceStats(recL, evL, asL, decL);
    expect(s.assumptions.byStatus.open).toBe(2);
    expect(s.assumptions.byStatus.validated).toBe(1);
    expect(s.assumptions.byStatus.rejected).toBe(1);
    expect(s.decisions.byStatus.active).toBe(1);
    expect(s.decisions.byStatus.superseded).toBe(1);
    expect(s.evidence.byKind.note).toBe(2);
    expect(s.evidence.byKind.file).toBe(1);
    expect(s.evidence.byKind.command).toBe(1);
  });

  it('AC-3: untied decisions counted separately', () => {
    const decL: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-1', recommendationId: 'rec-x', title: 'tied', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
        { id: 'dec-2', title: 'untied a', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
        { id: 'dec-3', title: 'untied b', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const s = computeIntelligenceStats(emptyRec, emptyEv, emptyAs, decL);
    expect(s.decisions.untied).toBe(2);
  });

  it('AC-4: broken links counted per dangling reference', () => {
    const recL: RecommendationLedger = {
      schemaVersion: 1,
      recommendations: [
        mkRec({
          id: 'rec-1',
          assumptionIds: ['as-1', 'as-missing'],
          decisionIds: ['dec-missing-1', 'dec-missing-2'],
          evidenceIds: ['ev-missing'],
        }),
      ],
    };
    const asL: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-1', recommendationId: 'rec-1', text: 'x', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const s = computeIntelligenceStats(recL, emptyEv, asL, emptyDec);
    expect(s.links.brokenAssumptionLinks).toBe(1);
    expect(s.links.brokenDecisionLinks).toBe(2);
    expect(s.links.brokenEvidenceLinks).toBe(1);
  });

  it('AC-5: perRec partitions linked subjects by status; broken refs excluded', () => {
    const recL: RecommendationLedger = {
      schemaVersion: 1,
      recommendations: [
        mkRec({
          id: 'rec-1',
          title: 'first',
          assumptionIds: ['as-o', 'as-v', 'as-missing'],
          decisionIds: ['dec-a', 'dec-s'],
        }),
      ],
    };
    const asL: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-o', recommendationId: 'rec-1', text: 'x', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-v', recommendationId: 'rec-1', text: 'y', status: 'validated', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const decL: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-a', recommendationId: 'rec-1', title: 'a', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
        { id: 'dec-s', recommendationId: 'rec-1', title: 'b', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const s = computeIntelligenceStats(recL, emptyEv, asL, decL);
    expect(s.perRec).toHaveLength(1);
    const r0 = s.perRec[0]!;
    expect(r0.id).toBe('rec-1');
    expect(r0.assumptionsByStatus.open).toBe(1);
    expect(r0.assumptionsByStatus.validated).toBe(1);
    expect(r0.assumptionsByStatus.rejected).toBe(0);
    expect(r0.decisionsByStatus.active).toBe(1);
    expect(r0.decisionsByStatus.superseded).toBe(1);
    expect(r0.decisionsByStatus.rescinded).toBe(0);
    // broken link not counted in per-rec buckets
    expect(s.links.brokenAssumptionLinks).toBe(1);
  });
});
