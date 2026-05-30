import { describe, expect, it } from 'vitest';
import type {
  AssumptionLedger,
  EvidenceLedger,
  IntelligenceDecisionLedger,
  Recommendation,
  RecommendationLedger,
} from '@manehorizons/cadence-types';
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

  describe('Slice 30: stale-supersededby', () => {
    it('AC-1: no decisions with supersededBy → no stale-supersededby findings', () => {
      const decL: IntelligenceDecisionLedger = {
        schemaVersion: 1,
        decisions: [
          { id: 'dec-1', title: 'a', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
        ],
      };
      const r = computeIntelligenceAudit(emptyRec, emptyEv, emptyAs, decL);
      expect(r.byKind['stale-supersededby']).toEqual([]);
    });

    it('AC-1: valid supersededBy ref → no finding', () => {
      const decL: IntelligenceDecisionLedger = {
        schemaVersion: 1,
        decisions: [
          { id: 'dec-1', title: 'a', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-2' },
          { id: 'dec-2', title: 'b', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
        ],
      };
      const r = computeIntelligenceAudit(emptyRec, emptyEv, emptyAs, decL);
      expect(r.byKind['stale-supersededby']).toEqual([]);
    });

    it('AC-2: stale supersededBy ref → one finding with subject id + missing target id', () => {
      const decL: IntelligenceDecisionLedger = {
        schemaVersion: 1,
        decisions: [
          { id: 'dec-1', title: 'a', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-missing' },
        ],
      };
      const r = computeIntelligenceAudit(emptyRec, emptyEv, emptyAs, decL);
      expect(r.byKind['stale-supersededby']).toHaveLength(1);
      expect(r.byKind['stale-supersededby'][0]).toEqual({
        kind: 'stale-supersededby',
        decisionId: 'dec-1',
        missingTargetId: 'dec-missing',
      });
    });

    it('AC-3: multiple stale refs → one finding per stale ref', () => {
      const decL: IntelligenceDecisionLedger = {
        schemaVersion: 1,
        decisions: [
          { id: 'dec-1', title: 'a', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-x' },
          { id: 'dec-2', title: 'b', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-y' },
        ],
      };
      const r = computeIntelligenceAudit(emptyRec, emptyEv, emptyAs, decL);
      expect(r.byKind['stale-supersededby']).toHaveLength(2);
      expect(r.byKind['stale-supersededby'].map((f) => f.kind === 'stale-supersededby' ? f.missingTargetId : '')).toEqual(['dec-x', 'dec-y']);
    });

    it('AC-4: mixed clean + stale → only stale ones surface', () => {
      const decL: IntelligenceDecisionLedger = {
        schemaVersion: 1,
        decisions: [
          { id: 'dec-1', title: 'a', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-2' }, // valid
          { id: 'dec-2', title: 'b', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
          { id: 'dec-3', title: 'c', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-missing' }, // stale
        ],
      };
      const r = computeIntelligenceAudit(emptyRec, emptyEv, emptyAs, decL);
      expect(r.byKind['stale-supersededby']).toHaveLength(1);
      const finding = r.byKind['stale-supersededby'][0];
      expect(finding?.kind).toBe('stale-supersededby');
      if (finding?.kind === 'stale-supersededby') {
        expect(finding.decisionId).toBe('dec-3');
        expect(finding.missingTargetId).toBe('dec-missing');
      }
    });

    it('AC-9: byKind initialization includes stale-supersededby (empty array on clean ledger)', () => {
      const r = computeIntelligenceAudit(emptyRec, emptyEv, emptyAs, emptyDec);
      expect(r.byKind).toHaveProperty('stale-supersededby');
      expect(r.byKind['stale-supersededby']).toEqual([]);
    });
  });

  describe('Slice 34.2: stale-converted-phase finding kind', () => {
    it('clean ledger (no convertedToPhaseId anywhere) → no findings', () => {
      const recL: RecommendationLedger = {
        schemaVersion: 1,
        recommendations: [mkRec({ id: 'rec-1' })],
      };
      const r = computeIntelligenceAudit(recL, emptyEv, emptyAs, emptyDec, new Set());
      expect(r.byKind['stale-converted-phase']).toEqual([]);
    });

    it('rec.convertedToPhaseId present + phase id IN existingPhaseIds → no finding', () => {
      const recL: RecommendationLedger = {
        schemaVersion: 1,
        recommendations: [
          mkRec({
            id: 'rec-1',
            status: 'converted',
            convertedToPhaseId: '34.1-rec-phase-linkage',
          }),
        ],
      };
      const r = computeIntelligenceAudit(
        recL, emptyEv, emptyAs, emptyDec,
        new Set(['34.1-rec-phase-linkage']),
      );
      expect(r.byKind['stale-converted-phase']).toEqual([]);
    });

    it('rec.convertedToPhaseId present + phase id NOT in set → one finding', () => {
      const recL: RecommendationLedger = {
        schemaVersion: 1,
        recommendations: [
          mkRec({
            id: 'rec-1',
            status: 'converted',
            convertedToPhaseId: 'deleted-phase',
          }),
        ],
      };
      const r = computeIntelligenceAudit(
        recL, emptyEv, emptyAs, emptyDec,
        new Set(['some-other-phase']),
      );
      expect(r.byKind['stale-converted-phase']).toHaveLength(1);
      const f = r.byKind['stale-converted-phase'][0];
      expect(f).toEqual({
        kind: 'stale-converted-phase',
        recommendationId: 'rec-1',
        missingPhaseId: 'deleted-phase',
      });
    });

    it('multiple stale refs surface one finding each', () => {
      const recL: RecommendationLedger = {
        schemaVersion: 1,
        recommendations: [
          mkRec({ id: 'rec-1', status: 'converted', convertedToPhaseId: 'phase-A' }),
          mkRec({ id: 'rec-2', status: 'converted', convertedToPhaseId: 'phase-B' }),
          mkRec({ id: 'rec-3', status: 'converted', convertedToPhaseId: 'phase-A' }), // dup target
        ],
      };
      const r = computeIntelligenceAudit(
        recL, emptyEv, emptyAs, emptyDec,
        new Set(), // none exist
      );
      expect(r.byKind['stale-converted-phase']).toHaveLength(3);
    });

    it('rec WITHOUT convertedToPhaseId is ignored even when set is empty (no false positives)', () => {
      const recL: RecommendationLedger = {
        schemaVersion: 1,
        recommendations: [mkRec({ id: 'rec-1', status: 'candidate' })],
      };
      const r = computeIntelligenceAudit(recL, emptyEv, emptyAs, emptyDec, new Set());
      expect(r.byKind['stale-converted-phase']).toEqual([]);
    });

    it('byKind initialization includes stale-converted-phase (empty array on clean ledger)', () => {
      const r = computeIntelligenceAudit(emptyRec, emptyEv, emptyAs, emptyDec);
      expect(r.byKind).toHaveProperty('stale-converted-phase');
      expect(r.byKind['stale-converted-phase']).toEqual([]);
    });

    it('pre-Slice-34.2 callers (4-arg signature) still work — existingPhaseIds defaults to empty set', () => {
      // A rec with convertedToPhaseId but 4-arg call → all converted refs surface as stale
      // (correct default: without phase-existence info, can't claim refs are valid).
      const recL: RecommendationLedger = {
        schemaVersion: 1,
        recommendations: [
          mkRec({ id: 'rec-1', status: 'converted', convertedToPhaseId: '34.1-x' }),
        ],
      };
      const r = computeIntelligenceAudit(recL, emptyEv, emptyAs, emptyDec);
      expect(r.byKind['stale-converted-phase']).toHaveLength(1);
    });

    it('mixed-kind report: stale-converted-phase + stale-supersededby coexist', () => {
      const recL: RecommendationLedger = {
        schemaVersion: 1,
        recommendations: [
          mkRec({ id: 'rec-1', status: 'converted', convertedToPhaseId: 'missing-phase' }),
        ],
      };
      const decL: IntelligenceDecisionLedger = {
        schemaVersion: 1,
        decisions: [
          { id: 'dec-1', title: 't', rationale: 'r', status: 'superseded',
            decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-missing' },
        ],
      };
      const r = computeIntelligenceAudit(recL, emptyEv, emptyAs, decL, new Set());
      expect(r.byKind['stale-converted-phase']).toHaveLength(1);
      expect(r.byKind['stale-supersededby']).toHaveLength(1);
      expect(r.findings).toHaveLength(2);
    });
  });
});
