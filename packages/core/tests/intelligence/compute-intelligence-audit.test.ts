import { describe, expect, it } from 'vitest';
import type {
  AssumptionLedger,
  EvidenceLedger,
  IntelligenceDecisionLedger,
  Recommendation,
  RecommendationLedger,
} from '@cadence/types';
import { computeIntelligenceAudit } from '../../src/intelligence/store.js';

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

describe('computeIntelligenceAudit (Slice 19)', () => {
  it('AC-1: empty ledgers → no findings, byKind all empty', () => {
    const r = computeIntelligenceAudit(emptyRec, emptyEv, emptyAs, emptyDec);
    expect(r.findings).toEqual([]);
    for (const arr of Object.values(r.byKind)) {
      expect(arr).toEqual([]);
    }
  });

  it('AC-2: broken assumption link enumerated', () => {
    const recL: RecommendationLedger = {
      schemaVersion: 1,
      recommendations: [mkRec({ id: 'rec-1', assumptionIds: ['as-1', 'as-missing'] })],
    };
    const asL: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-1', recommendationId: 'rec-1', text: 'x', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const r = computeIntelligenceAudit(recL, emptyEv, asL, emptyDec);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toEqual({
      kind: 'broken-assumption-link',
      recId: 'rec-1',
      assumptionId: 'as-missing',
    });
    expect(r.byKind['broken-assumption-link']).toHaveLength(1);
  });

  it('AC-3: broken decision + evidence links symmetric', () => {
    const recL: RecommendationLedger = {
      schemaVersion: 1,
      recommendations: [
        mkRec({
          id: 'rec-1',
          decisionIds: ['dec-missing'],
          evidenceIds: ['ev-missing'],
        }),
      ],
    };
    const r = computeIntelligenceAudit(recL, emptyEv, emptyAs, emptyDec);
    expect(r.findings).toHaveLength(2);
    expect(r.byKind['broken-decision-link']).toHaveLength(1);
    expect(r.byKind['broken-evidence-link']).toHaveLength(1);
  });

  it('AC-4: orphan assumption — recommendationId not in recLedger', () => {
    const asL: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-1', recommendationId: 'rec-missing', text: 'x', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const r = computeIntelligenceAudit(emptyRec, emptyEv, asL, emptyDec);
    expect(r.findings).toEqual([
      { kind: 'orphan-assumption', assumptionId: 'as-1', missingRecId: 'rec-missing' },
    ]);
  });

  it('AC-5: orphan tied decision counted; UNTIED decision NOT a finding', () => {
    const decL: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-orphan', recommendationId: 'rec-missing', title: 'a', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
        { id: 'dec-untied', title: 'b', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const r = computeIntelligenceAudit(emptyRec, emptyEv, emptyAs, decL);
    expect(r.byKind['orphan-decision']).toHaveLength(1);
    expect(r.byKind['orphan-decision'][0]).toEqual({
      kind: 'orphan-decision',
      decisionId: 'dec-orphan',
      missingRecId: 'rec-missing',
    });
  });

  it('AC-6: orphan evidence symmetric', () => {
    const evL: EvidenceLedger = {
      schemaVersion: 1,
      evidence: [
        { id: 'ev-1', recommendationId: 'rec-missing', kind: 'note', summary: 'n', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const r = computeIntelligenceAudit(emptyRec, evL, emptyAs, emptyDec);
    expect(r.byKind['orphan-evidence']).toHaveLength(1);
  });

  it('AC-7: multi-finding ordering — rec walk first, then orphan walks (as, dec, ev)', () => {
    const recL: RecommendationLedger = {
      schemaVersion: 1,
      recommendations: [mkRec({ id: 'rec-1', assumptionIds: ['as-missing'] })],
    };
    const asL: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-orphan', recommendationId: 'rec-missing-rec', text: 'x', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const decL: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-orphan', recommendationId: 'rec-missing-rec', title: 'a', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const evL: EvidenceLedger = {
      schemaVersion: 1,
      evidence: [
        { id: 'ev-orphan', recommendationId: 'rec-missing-rec', kind: 'note', summary: 'n', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const r = computeIntelligenceAudit(recL, evL, asL, decL);
    expect(r.findings.map((f) => f.kind)).toEqual([
      'broken-assumption-link',
      'orphan-assumption',
      'orphan-decision',
      'orphan-evidence',
    ]);
  });
});
