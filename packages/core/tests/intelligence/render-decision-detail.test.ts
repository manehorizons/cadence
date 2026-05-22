import { describe, expect, it } from 'vitest';
import type { IntelligenceDecision, Recommendation } from '@cadence/types';
import { renderDecisionDetail } from '../../src/intelligence/render-decision-detail.js';

function mkDec(p: Partial<IntelligenceDecision> = {}): IntelligenceDecision {
  return {
    id: 'dec-1',
    recommendationId: 'rec-1',
    title: 'a decision',
    rationale: 'the rationale paragraph',
    status: 'active',
    decidedAt: '2026-05-20T00:00:00.000Z',
    ...p,
  };
}

function mkRec(p: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-1',
    title: 'do thing',
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
    ...p,
  };
}

describe('renderDecisionDetail (Slice 16)', () => {
  it('AC-4: tied + rec supplied → header, status, recommendation cross-ref, decided, rationale', () => {
    const md = renderDecisionDetail(mkDec(), mkRec());
    expect(md).toMatch(/# dec-1 — a decision/);
    expect(md).toMatch(/- status: active/);
    expect(md).toMatch(/- recommendation: rec-1 — do thing/);
    expect(md).toMatch(/- decided: 2026-05-20T00:00:00\.000Z/);
    expect(md).toMatch(/^the rationale paragraph$/m);
  });

  it('AC-5: untied (no recommendationId) → no recommendation bullet', () => {
    const untied: IntelligenceDecision = {
      id: 'dec-2',
      title: 'untied',
      rationale: 'r',
      status: 'active',
      decidedAt: '2026-05-20T00:00:00.000Z',
    };
    const md = renderDecisionDetail(untied);
    expect(md).toMatch(/# dec-2 — untied/);
    expect(md).not.toMatch(/- recommendation:/);
    expect(md).toMatch(/- decided: 2026-05-20T00:00:00\.000Z/);
  });

  it('AC-6: tied but rec missing → `(rec not found)` fallback', () => {
    const md = renderDecisionDetail(mkDec());
    expect(md).toMatch(/- recommendation: rec-1 \(rec not found\)/);
  });

  it('section ordering: header → status → recommendation → decided → rationale', () => {
    const md = renderDecisionDetail(mkDec(), mkRec());
    const hdr = md.indexOf('# dec-1');
    const st = md.indexOf('- status:');
    const rec = md.indexOf('- recommendation:');
    const dec = md.indexOf('- decided:');
    const rat = md.indexOf('the rationale');
    expect(hdr).toBeLessThan(st);
    expect(st).toBeLessThan(rec);
    expect(rec).toBeLessThan(dec);
    expect(dec).toBeLessThan(rat);
  });

  it('superseded status reflected in bullet', () => {
    const md = renderDecisionDetail(mkDec({ status: 'superseded' }), mkRec());
    expect(md).toMatch(/- status: superseded/);
  });

  it('Slice 28: supersededBy bullet appears when set and ledger contains target', () => {
    const dec = mkDec({ status: 'superseded', supersededBy: 'dec-2' });
    const ledger = {
      schemaVersion: 1 as const,
      decisions: [dec, mkDec({ id: 'dec-2', title: 'D2' })],
    };
    const md = renderDecisionDetail(dec, mkRec(), ledger);
    expect(md).toMatch(/- superseded-by: dec-2$/m);
  });

  it('Slice 28: supersededBy bullet absent when field unset', () => {
    const md = renderDecisionDetail(mkDec(), mkRec());
    expect(md).not.toMatch(/- superseded-by:/);
  });

  it('Slice 28 AC-11: supersededBy unknown id → (not found) fallback', () => {
    const dec = mkDec({ status: 'superseded', supersededBy: 'dec-bogus' });
    const ledger = { schemaVersion: 1 as const, decisions: [dec] };
    const md = renderDecisionDetail(dec, mkRec(), ledger);
    expect(md).toMatch(/- superseded-by: dec-bogus \(not found\)/);
  });
});
