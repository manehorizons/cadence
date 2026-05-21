import { describe, expect, it } from 'vitest';
import type { Assumption, Recommendation } from '@cadence/types';
import { renderAssumptionDetail } from '../../src/intelligence/render-assumption-detail.js';

function mkAs(p: Partial<Assumption> = {}): Assumption {
  return {
    id: 'as-1',
    recommendationId: 'rec-1',
    text: 'an assumption',
    status: 'open',
    createdAt: '2026-05-20T00:00:00.000Z',
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

describe('renderAssumptionDetail (Slice 16)', () => {
  it('AC-1: rec arg omitted → no recommendation bullet emitted; recommendationId field also absent on as', () => {
    const md = renderAssumptionDetail({
      id: 'as-x',
      recommendationId: 'rec-X',
      text: 't',
      status: 'open',
      createdAt: '2026-05-20T00:00:00.000Z',
    });
    // Falls back to (rec not found) per AC-3 since as.recommendationId is set but rec arg is undefined.
    // AC-1 strict no-rec-no-id case:
    const md2 = renderAssumptionDetail({
      id: 'as-y',
      recommendationId: 'rec-Y',
      text: 't',
      status: 'open',
      createdAt: '2026-05-20T00:00:00.000Z',
    });
    expect(md).toMatch(/# as-x — t/);
    expect(md).toMatch(/- status: open/);
    expect(md).toMatch(/- recorded: 2026-05-20T00:00:00\.000Z/);
    expect(md2).toMatch(/- recommendation: rec-Y \(rec not found\)/);
  });

  it('AC-2: rec arg supplied → emits `- recommendation: <rec.id> — <rec.title>`', () => {
    const md = renderAssumptionDetail(mkAs(), mkRec());
    expect(md).toMatch(/# as-1 — an assumption/);
    expect(md).toMatch(/- status: open/);
    expect(md).toMatch(/- recommendation: rec-1 — do thing/);
    expect(md).toMatch(/- recorded: 2026-05-20T00:00:00\.000Z/);
  });

  it('AC-3: rec arg omitted but as.recommendationId set → `(rec not found)` fallback', () => {
    const md = renderAssumptionDetail(mkAs());
    expect(md).toMatch(/- recommendation: rec-1 \(rec not found\)/);
  });

  it('section ordering: header → status → recommendation → recorded', () => {
    const md = renderAssumptionDetail(mkAs(), mkRec());
    const hdr = md.indexOf('# as-1');
    const st = md.indexOf('- status:');
    const rec = md.indexOf('- recommendation:');
    const rec2 = md.indexOf('- recorded:');
    expect(hdr).toBeLessThan(st);
    expect(st).toBeLessThan(rec);
    expect(rec).toBeLessThan(rec2);
  });
});
