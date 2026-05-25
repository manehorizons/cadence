import { describe, expect, it } from 'vitest';
import type {
  IntelligenceDecision,
  IntelligenceDecisionLedger,
} from '@cadence/types';
import { buildDecisionGraph } from '../../src/intelligence/graph-decision.js';

function mkDec(partial: Partial<IntelligenceDecision> & { id: string }): IntelligenceDecision {
  return {
    id: partial.id,
    title: partial.title ?? `title-${partial.id}`,
    rationale: partial.rationale ?? `rationale-${partial.id}`,
    status: partial.status ?? 'active',
    decidedAt: partial.decidedAt ?? '2026-05-25T00:00:00.000Z',
    ...(partial.recommendationId !== undefined
      ? { recommendationId: partial.recommendationId }
      : {}),
    ...(partial.supersededBy !== undefined ? { supersededBy: partial.supersededBy } : {}),
  };
}

function mkLedger(decisions: IntelligenceDecision[]): IntelligenceDecisionLedger {
  return { schemaVersion: 1, decisions };
}

describe('buildDecisionGraph', () => {
  it('AC-1: isolated decision returns empty ancestors and descendants', () => {
    const d = mkDec({ id: 'dec-1' });
    const res = buildDecisionGraph(mkLedger([d]), 'dec-1');
    expect(res).toEqual({
      ok: true,
      graph: { decision: d, ancestors: [], descendants: [] },
    });
  });

  it('AC-2: missing root id returns ok: false with not-found error', () => {
    const ledger = mkLedger([mkDec({ id: 'dec-1' })]);
    const res = buildDecisionGraph(ledger, 'dec-missing');
    expect(res).toEqual({ ok: false, error: 'decision dec-missing not found' });
  });

  it('linear forward chain emits descendants in order, no ancestors', () => {
    const d1 = mkDec({ id: 'dec-1', supersededBy: 'dec-2', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2', supersededBy: 'dec-3', status: 'superseded' });
    const d3 = mkDec({ id: 'dec-3' });
    const res = buildDecisionGraph(mkLedger([d1, d2, d3]), 'dec-1');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.graph.decision).toBe(d1);
    expect(res.graph.ancestors).toEqual([]);
    expect(res.graph.descendants).toEqual([{ decision: d2 }, { decision: d3 }]);
  });

  it('AC-4: direct-only backward lists both parents at depth 0', () => {
    const d1 = mkDec({ id: 'dec-1', supersededBy: 'dec-2', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2' });
    const d3 = mkDec({ id: 'dec-3', supersededBy: 'dec-2', status: 'superseded' });
    const res = buildDecisionGraph(mkLedger([d1, d2, d3]), 'dec-2');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.graph.ancestors).toEqual([
      { decision: d1, ancestors: [] },
      { decision: d3, ancestors: [] },
    ]);
    expect(res.graph.descendants).toEqual([]);
  });

  it('AC-5: transitive backward nests grandchildren under each parent', () => {
    const d1 = mkDec({ id: 'dec-1', supersededBy: 'dec-2', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2', supersededBy: 'dec-3', status: 'superseded' });
    const d3 = mkDec({ id: 'dec-3' });
    const d4 = mkDec({ id: 'dec-4', supersededBy: 'dec-2', status: 'superseded' });
    const res = buildDecisionGraph(mkLedger([d1, d2, d3, d4]), 'dec-3');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.graph.ancestors).toEqual([
      {
        decision: d2,
        ancestors: [
          { decision: d1, ancestors: [] },
          { decision: d4, ancestors: [] },
        ],
      },
    ]);
    expect(res.graph.descendants).toEqual([]);
  });

  it('AC-6: backward cycle marks the revisited node with cycle: true and stops', () => {
    // D1.supersededBy=D2, D2.supersededBy=D1 — run on D1.
    // Ancestor walk from D1: direct = D2 (D2.supersededBy === 'dec-1'); recurse into D2.
    // From D2: direct = D1 (D1.supersededBy === 'dec-2'). D1 is already in seen → cycle on D1.
    const d1 = mkDec({ id: 'dec-1', supersededBy: 'dec-2', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2', supersededBy: 'dec-1', status: 'superseded' });
    const res = buildDecisionGraph(mkLedger([d1, d2]), 'dec-1');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.graph.ancestors).toEqual([
      {
        decision: d2,
        ancestors: [{ decision: d1, ancestors: [], cycle: true }],
      },
    ]);
    // Confirm cycle marker is on D1 (the revisit), not D2.
    const outer = res.graph.ancestors[0]!;
    expect(outer.decision.id).toBe('dec-2');
    expect(outer).not.toHaveProperty('cycle');
    const inner = outer.ancestors[0]!;
    expect(inner.decision.id).toBe('dec-1');
    expect(inner.cycle).toBe(true);
  });

  it('AC-7: forward cycle marks the revisited node with cycle: true and stops', () => {
    // Same data, on D1, forward direction.
    // cursor = D2; push {D2}; seen = {D1, D2}.
    // cursor = D1; D1 in seen → push {D1, cycle: true}; break.
    const d1 = mkDec({ id: 'dec-1', supersededBy: 'dec-2', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2', supersededBy: 'dec-1', status: 'superseded' });
    const res = buildDecisionGraph(mkLedger([d1, d2]), 'dec-1');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.graph.descendants).toEqual([
      { decision: d2 },
      { decision: d1, cycle: true },
    ]);
    const tail = res.graph.descendants[1]!;
    expect('decision' in tail && tail.decision.id).toBe('dec-1');
    expect('decision' in tail && tail.cycle).toBe(true);
  });

  it('AC-8: broken forward link emits missingId and stops the walk', () => {
    const d1 = mkDec({ id: 'dec-1', supersededBy: 'dec-9', status: 'superseded' });
    const res = buildDecisionGraph(mkLedger([d1]), 'dec-1');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.graph.descendants).toEqual([{ missingId: 'dec-9' }]);
    expect(res.graph.descendants).toHaveLength(1);
  });

  it('AC-10: cycle field is absent (never false) when no cycle is hit', () => {
    const d1 = mkDec({ id: 'dec-1', supersededBy: 'dec-2', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2' });
    const d3 = mkDec({ id: 'dec-3', supersededBy: 'dec-1', status: 'superseded' });
    const res = buildDecisionGraph(mkLedger([d1, d2, d3]), 'dec-1');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    // Descendant on a non-cyclic chain has no cycle property.
    const desc = res.graph.descendants[0]!;
    expect(desc).not.toHaveProperty('cycle');
    // Ancestor on a non-cyclic chain has no cycle property.
    const anc = res.graph.ancestors[0]!;
    expect(anc).not.toHaveProperty('cycle');
    expect(anc.ancestors[0]).toBeUndefined();
  });

  it('AC-11: missingId discriminates broken links; cycle nodes keep decision field', () => {
    // Build a ledger where the same chain hits BOTH a cycle (in ancestors) and a broken
    // forward link (in descendants) — verify both shapes in the same response.
    // D1.supersededBy=D9 (missing). D2.supersededBy=D1. D3.supersededBy=D2. D1 cycles backward via D? — easier:
    // Two independent shapes verified here:
    //   forward: D1 -> dec-missing
    //   backward cycle: D2 -> D1, D1 -> ?  no, want cycle on ancestors.
    // Simpler: separate fixtures composed into the same test.
    const a1 = mkDec({ id: 'dec-1', supersededBy: 'dec-9', status: 'superseded' });
    const ledgerMissing = mkLedger([a1]);
    const resMissing = buildDecisionGraph(ledgerMissing, 'dec-1');
    expect(resMissing.ok).toBe(true);
    if (!resMissing.ok) throw new Error('expected ok');
    const brokenNode = resMissing.graph.descendants[0]!;
    expect(brokenNode).toEqual({ missingId: 'dec-9' });
    expect(brokenNode).not.toHaveProperty('decision');

    // Backward cycle: D1 -> D2 -> D1 (cycle on D1). Cycle node keeps decision.
    const b1 = mkDec({ id: 'dec-1', supersededBy: 'dec-2', status: 'superseded' });
    const b2 = mkDec({ id: 'dec-2', supersededBy: 'dec-1', status: 'superseded' });
    const ledgerCycle = mkLedger([b1, b2]);
    const resCycle = buildDecisionGraph(ledgerCycle, 'dec-1');
    expect(resCycle.ok).toBe(true);
    if (!resCycle.ok) throw new Error('expected ok');
    const cycleInner = resCycle.graph.ancestors[0]!.ancestors[0]!;
    expect(cycleInner.cycle).toBe(true);
    expect(cycleInner.decision).toEqual(b1);
    expect(cycleInner).not.toHaveProperty('missingId');
  });
});
