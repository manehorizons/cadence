import { describe, expect, it } from 'vitest';
import type {
  Assumption,
  Evidence,
  IntelligenceDecision,
  Recommendation,
} from '@cadence/types';
import { renderRecommendationDetail } from '../../src/intelligence/render-recommendation-detail.js';

function mkRec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-1',
    title: 'do thing',
    summary: 'the summary body',
    source: 'manual',
    status: 'candidate',
    readiness: 'raw-idea',
    priority: 'medium',
    leverageScore: 7,
    riskScore: 3,
    confidence: 0.7,
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

function mkDec(p: Partial<IntelligenceDecision> = {}): IntelligenceDecision {
  return {
    id: 'dec-1',
    recommendationId: 'rec-1',
    title: 'a decision',
    rationale: 'a rationale',
    status: 'active',
    decidedAt: '2026-05-20T00:00:00.000Z',
    ...p,
  };
}

function mkEv(p: Partial<Evidence> = {}): Evidence {
  return {
    id: 'ev-1',
    recommendationId: 'rec-1',
    kind: 'note',
    summary: 'an evidence note',
    createdAt: '2026-05-20T00:00:00.000Z',
    ...p,
  };
}

describe('renderRecommendationDetail (Slice 14)', () => {
  it('AC-1: empty children → header + envelope + summary + 3 _(none)_ blocks', () => {
    const md = renderRecommendationDetail(mkRec(), [], [], []);
    expect(md).toMatch(/^# rec-1 — do thing/);
    expect(md).toMatch(/- status: candidate/);
    expect(md).toMatch(/- ready: raw-idea/);
    expect(md).toMatch(/- priority: medium/);
    expect(md).toMatch(/- leverage: 7\/10/);
    expect(md).toMatch(/- risk: 3\/10/);
    expect(md).toMatch(/- confidence: 70%/);
    expect(md).toMatch(/- decay: fresh/);
    expect(md).toMatch(/- created: 2026-05-20T00:00:00\.000Z/);
    expect(md).toMatch(/- updated: 2026-05-20T00:00:00\.000Z/);
    expect(md).toMatch(/## Summary\n\nthe summary body/);
    expect(md).toMatch(/## Assumptions \(0\/0\)[\s\S]*?_\(none\)_/);
    expect(md).toMatch(/## Decisions \(0\/0\)[\s\S]*?_\(none\)_/);
    expect(md).toMatch(/## Evidence \(0\)[\s\S]*?_\(none\)_/);
  });

  it('AC-2: conditional bullets emitted only when non-empty', () => {
    const md = renderRecommendationDetail(
      mkRec({ affectedAreas: ['core'], affectedFiles: ['src/foo.ts'], suggestedBackendAction: 'cadence milestone propose' }),
      [], [], [],
    );
    expect(md).toMatch(/- areas: core/);
    expect(md).toMatch(/- files: src\/foo\.ts/);
    expect(md).toMatch(/- next: cadence milestone propose/);
  });

  it('AC-2: conditional bullets omitted when empty', () => {
    const md = renderRecommendationDetail(mkRec(), [], [], []);
    expect(md).not.toMatch(/- areas:/);
    expect(md).not.toMatch(/- files:/);
    expect(md).not.toMatch(/- next:/);
  });

  it('AC-3: assumptions bucket renders per-entry shape; insertion order preserved', () => {
    const as = [
      mkAs({ id: 'as-2', text: 'second' }),
      mkAs({ id: 'as-1', text: 'first' }),
    ];
    const md = renderRecommendationDetail(mkRec(), [], as, []);
    expect(md).toMatch(/## Assumptions \(2\/2\)/);
    expect(md).toMatch(/### as-2 — second/);
    expect(md).toMatch(/### as-1 — first/);
    // Order
    const a2Idx = md.indexOf('### as-2');
    const a1Idx = md.indexOf('### as-1');
    expect(a2Idx).toBeLessThan(a1Idx);
  });

  it('AC-4: decisions bucket renders per-entry shape with rationale; insertion order preserved', () => {
    const dec = [
      mkDec({ id: 'dec-2', title: 'second', rationale: 'r2' }),
      mkDec({ id: 'dec-1', title: 'first', rationale: 'r1' }),
    ];
    const md = renderRecommendationDetail(mkRec(), [], [], dec);
    expect(md).toMatch(/## Decisions \(2\/2\)/);
    expect(md).toMatch(/### dec-2 — second[\s\S]*?- status: active[\s\S]*?- decided: 2026-05-20T00:00:00\.000Z[\s\S]*?r2/);
    const d2Idx = md.indexOf('### dec-2');
    const d1Idx = md.indexOf('### dec-1');
    expect(d2Idx).toBeLessThan(d1Idx);
  });

  it('AC-5: openAssumptionsOnly filters to status open; header shows shown/total', () => {
    const as = [
      mkAs({ id: 'as-o', text: 'open one', status: 'open' }),
      mkAs({ id: 'as-v', text: 'validated', status: 'validated' }),
      mkAs({ id: 'as-r', text: 'rejected', status: 'rejected' }),
    ];
    const md = renderRecommendationDetail(mkRec(), [], as, [], { openAssumptionsOnly: true });
    expect(md).toMatch(/## Assumptions \(1\/3\)/);
    expect(md).toMatch(/### as-o — open one/);
    expect(md).not.toMatch(/### as-v/);
    expect(md).not.toMatch(/### as-r/);
  });

  it('AC-5: openAssumptionsOnly with all-non-open → _(none)_ bucket; header 0/N', () => {
    const as = [
      mkAs({ id: 'as-v', status: 'validated' }),
      mkAs({ id: 'as-r', status: 'rejected' }),
    ];
    const md = renderRecommendationDetail(mkRec(), [], as, [], { openAssumptionsOnly: true });
    expect(md).toMatch(/## Assumptions \(0\/2\)[\s\S]*?_\(none\)_/);
  });

  it('AC-6: activeDecisionsOnly filters to status active; header shows shown/total', () => {
    const dec = [
      mkDec({ id: 'dec-a', title: 'active one', status: 'active' }),
      mkDec({ id: 'dec-s', title: 'sup', status: 'superseded' }),
      mkDec({ id: 'dec-r', title: 'res', status: 'rescinded' }),
    ];
    const md = renderRecommendationDetail(mkRec(), [], [], dec, { activeDecisionsOnly: true });
    expect(md).toMatch(/## Decisions \(1\/3\)/);
    expect(md).toMatch(/### dec-a — active one/);
    expect(md).not.toMatch(/### dec-s/);
    expect(md).not.toMatch(/### dec-r/);
  });

  it('AC-7: evidence rendered with kind prefix; file path + command formatting', () => {
    const ev: Evidence[] = [
      mkEv({ id: 'ev-1', kind: 'note', summary: 'plain note' }),
      mkEv({ id: 'ev-2', kind: 'file', summary: 'in foo', path: 'src/foo.ts' }),
      mkEv({ id: 'ev-3', kind: 'command', summary: 'ran lint', command: 'pnpm lint' }),
      mkEv({ id: 'ev-4', kind: 'cadence-artifact', summary: 'phase summary' }),
    ];
    const md = renderRecommendationDetail(mkRec(), ev, [], []);
    expect(md).toMatch(/## Evidence \(4\)/);
    expect(md).toMatch(/- note: plain note/);
    expect(md).toMatch(/- file: in foo \(src\/foo\.ts\)/);
    expect(md).toMatch(/- command: ran lint `pnpm lint`/);
    expect(md).toMatch(/- cadence-artifact: phase summary/);
  });

  it('AC-1: header ordering — header before summary before buckets', () => {
    const md = renderRecommendationDetail(
      mkRec(),
      [mkEv()],
      [mkAs()],
      [mkDec()],
    );
    const hdrIdx = md.indexOf('# rec-1');
    const sumIdx = md.indexOf('## Summary');
    const asIdx = md.indexOf('## Assumptions');
    const decIdx = md.indexOf('## Decisions');
    const evIdx = md.indexOf('## Evidence');
    expect(hdrIdx).toBeLessThan(sumIdx);
    expect(sumIdx).toBeLessThan(asIdx);
    expect(asIdx).toBeLessThan(decIdx);
    expect(decIdx).toBeLessThan(evIdx);
  });
});
