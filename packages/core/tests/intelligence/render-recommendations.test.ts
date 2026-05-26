import { describe, expect, it } from 'vitest';
import type {
  AssumptionLedger,
  EvidenceLedger,
  IntelligenceDecisionLedger,
  Recommendation,
  RecommendationLedger,
} from '@cadence/types';
import { renderRecommendationsMd } from '../../src/intelligence/render.js';

const emptyEv: EvidenceLedger = { schemaVersion: 1, evidence: [] };

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

function mkLedger(recs: Recommendation[]): RecommendationLedger {
  return { schemaVersion: 1, recommendations: recs };
}

describe('renderRecommendationsMd link bullets (Slice 12)', () => {
  it('AC-1: assumptionIds populated, decisionIds empty → only assumptions bullet', () => {
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ assumptionIds: ['as-1', 'as-2'] })]),
      emptyEv,
    );
    expect(md).toMatch(/- assumptions: as-1, as-2/);
    expect(md).not.toMatch(/- decisions:/);
  });

  it('AC-2: decisionIds populated, assumptionIds empty → only decisions bullet', () => {
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ decisionIds: ['dec-1', 'dec-2'] })]),
      emptyEv,
    );
    expect(md).toMatch(/- decisions: dec-1, dec-2/);
    expect(md).not.toMatch(/- assumptions:/);
  });

  it('AC-3: both populated → assumptions bullet appears before decisions bullet', () => {
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ assumptionIds: ['as-1'], decisionIds: ['dec-1'] })]),
      emptyEv,
    );
    const aIdx = md.indexOf('- assumptions: as-1');
    const dIdx = md.indexOf('- decisions: dec-1');
    expect(aIdx).toBeGreaterThan(-1);
    expect(dIdx).toBeGreaterThan(aIdx);
  });

  it('AC-4: both empty → neither bullet emitted', () => {
    const md = renderRecommendationsMd(mkLedger([mkRec()]), emptyEv);
    expect(md).not.toMatch(/- assumptions:/);
    expect(md).not.toMatch(/- decisions:/);
  });

  it('AC-5: insertion order within each bullet preserved (no sort)', () => {
    const md = renderRecommendationsMd(
      mkLedger([
        mkRec({
          assumptionIds: ['as-9', 'as-1', 'as-5'],
          decisionIds: ['dec-3', 'dec-1'],
        }),
      ]),
      emptyEv,
    );
    expect(md).toMatch(/- assumptions: as-9, as-1, as-5/);
    expect(md).toMatch(/- decisions: dec-3, dec-1/);
  });

  it('slot order: areas → files → assumptions → decisions → evidence', () => {
    const md = renderRecommendationsMd(
      mkLedger([
        mkRec({
          affectedAreas: ['core'],
          affectedFiles: ['src/foo.ts'],
          assumptionIds: ['as-1'],
          decisionIds: ['dec-1'],
          evidenceIds: ['ev-1'],
        }),
      ]),
      {
        schemaVersion: 1,
        evidence: [
          {
            id: 'ev-1',
            recommendationId: 'rec-1',
            kind: 'note',
            summary: 'E',
            createdAt: '2026-05-20T00:00:00.000Z',
          },
        ],
      },
    );
    const areasIdx = md.indexOf('- areas:');
    const filesIdx = md.indexOf('- files:');
    const aIdx = md.indexOf('- assumptions:');
    const dIdx = md.indexOf('- decisions:');
    const evIdx = md.indexOf('- evidence:');
    expect(areasIdx).toBeLessThan(filesIdx);
    expect(filesIdx).toBeLessThan(aIdx);
    expect(aIdx).toBeLessThan(dIdx);
    expect(dIdx).toBeLessThan(evIdx);
  });

  it('empty ledger path unchanged (no recommendations)', () => {
    const md = renderRecommendationsMd(mkLedger([]), emptyEv);
    expect(md).toMatch(/^# CADENCE Recommendations/);
    expect(md).toMatch(/No recommendations recorded\./);
  });
});

describe('renderRecommendationsMd status-aware link bullets (Slice 15)', () => {
  it('AC-1: asLedger supplied → assumptions bullet annotates each id with (status)', () => {
    const asLedger: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-1', recommendationId: 'rec-1', text: 'x', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-2', recommendationId: 'rec-1', text: 'y', status: 'validated', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-3', recommendationId: 'rec-1', text: 'z', status: 'rejected', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ assumptionIds: ['as-1', 'as-2', 'as-3'] })]),
      emptyEv,
      asLedger,
    );
    expect(md).toMatch(/- assumptions: as-1 \(open\), as-2 \(validated\), as-3 \(rejected\)/);
  });

  it('AC-2: decLedger supplied → decisions bullet annotates each id with (status)', () => {
    const decLedger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-1', recommendationId: 'rec-1', title: 'a', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
        { id: 'dec-2', recommendationId: 'rec-1', title: 'b', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z' },
        { id: 'dec-3', recommendationId: 'rec-1', title: 'c', rationale: 'r', status: 'rescinded', decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ decisionIds: ['dec-1', 'dec-2', 'dec-3'] })]),
      emptyEv,
      undefined,
      decLedger,
    );
    expect(md).toMatch(/- decisions: dec-1 \(active\), dec-2 \(superseded\), dec-3 \(rescinded\)/);
  });

  it('AC-3: both ledgers supplied → assumptions bullet before decisions bullet, both annotated', () => {
    const asLedger: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-1', recommendationId: 'rec-1', text: 'x', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const decLedger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-1', recommendationId: 'rec-1', title: 'a', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ assumptionIds: ['as-1'], decisionIds: ['dec-1'] })]),
      emptyEv,
      asLedger,
      decLedger,
    );
    const aIdx = md.indexOf('- assumptions: as-1 (open)');
    const dIdx = md.indexOf('- decisions: dec-1 (active)');
    expect(aIdx).toBeGreaterThan(-1);
    expect(dIdx).toBeGreaterThan(aIdx);
  });

  it('AC-4: omitted asLedger/decLedger → bare-id Slice-12 form preserved', () => {
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ assumptionIds: ['as-1'], decisionIds: ['dec-1'] })]),
      emptyEv,
    );
    expect(md).toMatch(/- assumptions: as-1$/m);
    expect(md).toMatch(/- decisions: dec-1$/m);
    expect(md).not.toMatch(/\(open\)|\(active\)/);
  });

  it('AC-5: missing id in supplied ledger → bare id (no throw, no parens)', () => {
    const asLedger: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-1', recommendationId: 'rec-1', text: 'x', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    // rec references as-1 + as-missing; only as-1 known
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ assumptionIds: ['as-1', 'as-missing'] })]),
      emptyEv,
      asLedger,
    );
    expect(md).toMatch(/- assumptions: as-1 \(open\), as-missing$/m);
  });

  it('AC-6: insertion order preserved within annotated bullet', () => {
    const asLedger: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-1', recommendationId: 'rec-1', text: 'a', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-5', recommendationId: 'rec-1', text: 'b', status: 'validated', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-9', recommendationId: 'rec-1', text: 'c', status: 'rejected', createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderRecommendationsMd(
      mkLedger([mkRec({ assumptionIds: ['as-9', 'as-1', 'as-5'] })]),
      emptyEv,
      asLedger,
    );
    expect(md).toMatch(/- assumptions: as-9 \(rejected\), as-1 \(open\), as-5 \(validated\)/);
  });
});
