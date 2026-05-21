import { describe, expect, it } from 'vitest';
import type {
  EvidenceLedger,
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
