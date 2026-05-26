import { describe, expect, it } from 'vitest';
import type { IntelligenceStats } from '../../src/intelligence/store.js';
import { renderIntelligenceStats } from '../../src/intelligence/render-intelligence-stats.js';

function mkZeroStats(): IntelligenceStats {
  return {
    recommendations: {
      total: 0,
      byStatus: { candidate: 0, accepted: 0, deferred: 0, rejected: 0, converted: 0 },
      byReadiness: {
        'raw-idea': 0,
        'needs-evidence': 0,
        'needs-decision': 0,
        'ready-for-milestone': 0,
        'ready-for-cadence-spec': 0,
        blocked: 0,
      },
    },
    evidence: { total: 0, byKind: { file: 0, command: 0, 'cadence-artifact': 0, note: 0 } },
    assumptions: { total: 0, byStatus: { open: 0, validated: 0, rejected: 0 } },
    decisions: { total: 0, byStatus: { active: 0, superseded: 0, rescinded: 0 }, untied: 0 },
    links: { brokenAssumptionLinks: 0, brokenDecisionLinks: 0, brokenEvidenceLinks: 0 },
    perRec: [],
  };
}

describe('renderIntelligenceStats (Slice 18)', () => {
  it('AC-6: aggregate mode emits all 5 sections regardless of zero counts', () => {
    const md = renderIntelligenceStats(mkZeroStats());
    expect(md).toMatch(/^# CADENCE Intelligence Stats/);
    expect(md).toMatch(/## Recommendations \(0\)/);
    expect(md).toMatch(/- by status: candidate 0, accepted 0, deferred 0, rejected 0, converted 0/);
    expect(md).toMatch(/- by readiness: raw-idea 0/);
    expect(md).toMatch(/## Evidence \(0\)/);
    expect(md).toMatch(/- by kind: file 0, command 0, cadence-artifact 0, note 0/);
    expect(md).toMatch(/## Assumptions \(0\)/);
    expect(md).toMatch(/- by status: open 0, validated 0, rejected 0/);
    expect(md).toMatch(/## Decisions \(0\)/);
    expect(md).toMatch(/- by status: active 0, superseded 0, rescinded 0/);
    expect(md).toMatch(/- untied: 0/);
    expect(md).toMatch(/## Links/);
    expect(md).toMatch(/- broken assumption links: 0/);
    expect(md).toMatch(/- broken decision links: 0/);
    expect(md).toMatch(/- broken evidence links: 0/);
  });

  it('AC-6: populated counts surface correctly', () => {
    const stats = mkZeroStats();
    stats.recommendations.total = 3;
    stats.recommendations.byStatus.candidate = 2;
    stats.recommendations.byStatus.accepted = 1;
    stats.assumptions.total = 5;
    stats.assumptions.byStatus.open = 3;
    stats.assumptions.byStatus.validated = 2;
    stats.decisions.total = 2;
    stats.decisions.byStatus.active = 1;
    stats.decisions.byStatus.superseded = 1;
    stats.decisions.untied = 1;
    const md = renderIntelligenceStats(stats);
    expect(md).toMatch(/## Recommendations \(3\)/);
    expect(md).toMatch(/candidate 2, accepted 1/);
    expect(md).toMatch(/## Assumptions \(5\)/);
    expect(md).toMatch(/open 3, validated 2/);
    expect(md).toMatch(/- untied: 1/);
  });

  it('AC-7: per-rec mode emits markdown table with header + one row per rec', () => {
    const stats = mkZeroStats();
    stats.perRec = [
      {
        id: 'rec-A',
        title: 'first thing',
        status: 'candidate',
        assumptionsByStatus: { open: 2, validated: 1, rejected: 0 },
        decisionsByStatus: { active: 3, superseded: 0, rescinded: 0 },
        evidenceCount: 2,
      },
      {
        id: 'rec-B',
        title: 'second thing',
        status: 'accepted',
        assumptionsByStatus: { open: 0, validated: 1, rejected: 0 },
        decisionsByStatus: { active: 1, superseded: 0, rescinded: 0 },
        evidenceCount: 1,
      },
    ];
    const md = renderIntelligenceStats(stats, { byRec: true });
    expect(md).toMatch(/^# CADENCE Intelligence Stats — Per Rec/);
    expect(md).toMatch(/\| Rec \| Status \| Open \| Validated \| Rejected \| Active \| Superseded \| Rescinded \| Evidence \|/);
    expect(md).toMatch(/\| rec-A — first thing \| candidate \| 2 \| 1 \| 0 \| 3 \| 0 \| 0 \| 2 \|/);
    expect(md).toMatch(/\| rec-B — second thing \| accepted \| 0 \| 1 \| 0 \| 1 \| 0 \| 0 \| 1 \|/);
  });

  it('AC-7: long titles truncated to 40 chars with `…`', () => {
    const stats = mkZeroStats();
    stats.perRec = [
      {
        id: 'rec-X',
        title: 'this is an extremely long title that definitely exceeds forty characters',
        status: 'candidate',
        assumptionsByStatus: { open: 0, validated: 0, rejected: 0 },
        decisionsByStatus: { active: 0, superseded: 0, rescinded: 0 },
        evidenceCount: 0,
      },
    ];
    const md = renderIntelligenceStats(stats, { byRec: true });
    expect(md).toMatch(/rec-X — this is an extremely long title that de…/);
  });

  it('AC-7: empty perRec → `_(no recommendations)_`', () => {
    const md = renderIntelligenceStats(mkZeroStats(), { byRec: true });
    expect(md).toMatch(/_\(no recommendations\)_/);
  });
});
