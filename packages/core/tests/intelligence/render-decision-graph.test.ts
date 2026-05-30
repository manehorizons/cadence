import { describe, expect, it } from 'vitest';
import type {
  DecisionAncestor,
  DecisionDescendant,
  DecisionGraph,
  IntelligenceDecision,
} from '@manehorizons/cadence-types';
import { renderDecisionGraph } from '../../src/intelligence/render-decision-graph.js';

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

describe('renderDecisionGraph (Slice 29)', () => {
  it('AC-1: isolated graph (no ancestors, no descendants) → exact two-section output', () => {
    const graph: DecisionGraph = {
      decision: mkDec({ id: 'dec-A', title: 'only decision', status: 'active' }),
      ancestors: [],
      descendants: [],
    };
    const md = renderDecisionGraph(graph);
    expect(md).toBe(
      '# dec-A — only decision (active)\n' +
        '\n' +
        '## Supersedes\n' +
        '(none)\n' +
        '\n' +
        '## Superseded by\n' +
        '(none)\n',
    );
  });

  it('AC-3: linear forward chain → arrow chain starting from root id', () => {
    const d1 = mkDec({ id: 'dec-1', title: 'D1', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2', title: 'D2', status: 'superseded' });
    const d3 = mkDec({ id: 'dec-3', title: 'D3', status: 'active' });
    const graph: DecisionGraph = {
      decision: d1,
      ancestors: [],
      descendants: [{ decision: d2 }, { decision: d3 }],
    };
    const md = renderDecisionGraph(graph);
    expect(md).toMatch(/^## Superseded by\ndec-1 → dec-2 → dec-3$/m);
  });

  it('AC-4: direct-only backward → two depth-0 bullets, no indentation', () => {
    const d1 = mkDec({ id: 'dec-1', title: 'D1', status: 'superseded' });
    const d3 = mkDec({ id: 'dec-3', title: 'D3', status: 'superseded' });
    const root = mkDec({ id: 'dec-2', title: 'D2', status: 'active' });
    const graph: DecisionGraph = {
      decision: root,
      ancestors: [
        { decision: d1, ancestors: [] },
        { decision: d3, ancestors: [] },
      ],
      descendants: [],
    };
    const md = renderDecisionGraph(graph);
    expect(md).toMatch(/^- dec-1 — D1 \(superseded\)$/m);
    expect(md).toMatch(/^- dec-3 — D3 \(superseded\)$/m);
    // No leading indentation on either bullet.
    expect(md).not.toMatch(/^  - dec-1/m);
    expect(md).not.toMatch(/^  - dec-3/m);
  });

  it('AC-5: transitive backward → depth-1 children indented two spaces under depth-0', () => {
    const d1 = mkDec({ id: 'dec-1', title: 'D1', status: 'superseded' });
    const d4 = mkDec({ id: 'dec-4', title: 'D4', status: 'rescinded' });
    const d2 = mkDec({ id: 'dec-2', title: 'D2', status: 'superseded' });
    const d3 = mkDec({ id: 'dec-3', title: 'D3', status: 'active' });
    const ancestors: DecisionAncestor[] = [
      {
        decision: d2,
        ancestors: [
          { decision: d1, ancestors: [] },
          { decision: d4, ancestors: [] },
        ],
      },
    ];
    const graph: DecisionGraph = { decision: d3, ancestors, descendants: [] };
    const md = renderDecisionGraph(graph);
    expect(md).toMatch(/^- dec-2 — D2 \(superseded\)$/m);
    expect(md).toMatch(/^  - dec-1 — D1 \(superseded\)$/m);
    expect(md).toMatch(/^  - dec-4 — D4 \(rescinded\)$/m);
  });

  it('AC-6: backward cycle → revisited node prints `- <id> (cycle)` with no title/status, indented one level', () => {
    const d1 = mkDec({ id: 'dec-1', title: 'D1', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2', title: 'D2', status: 'superseded' });
    const graph: DecisionGraph = {
      decision: d1,
      ancestors: [
        {
          decision: d2,
          ancestors: [{ decision: d1, ancestors: [], cycle: true }],
        },
      ],
      descendants: [],
    };
    const md = renderDecisionGraph(graph);
    // D2 still rendered with full title/status at depth 0
    expect(md).toMatch(/^- dec-2 — D2 \(superseded\)$/m);
    // D1 cycle-truncated at depth 1, no title, no status
    expect(md).toMatch(/^  - dec-1 \(cycle\)$/m);
    expect(md).not.toMatch(/^  - dec-1 — D1/m);
  });

  it('AC-7: forward cycle → arrow chain ends with `<id> (cycle)`', () => {
    const d1 = mkDec({ id: 'dec-1', title: 'D1', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2', title: 'D2', status: 'superseded' });
    const descendants: DecisionDescendant[] = [
      { decision: d2 },
      { decision: d1, cycle: true },
    ];
    const graph: DecisionGraph = { decision: d1, ancestors: [], descendants };
    const md = renderDecisionGraph(graph);
    expect(md).toMatch(/^## Superseded by\ndec-1 → dec-2 → dec-1 \(cycle\)$/m);
  });

  it('AC-8: broken forward link → arrow chain ends with `<missingId> (not found)`', () => {
    const d1 = mkDec({ id: 'dec-1', title: 'D1', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2', title: 'D2', status: 'superseded' });
    const descendants: DecisionDescendant[] = [{ decision: d2 }, { missingId: 'dec-9' }];
    const graph: DecisionGraph = { decision: d1, ancestors: [], descendants };
    const md = renderDecisionGraph(graph);
    expect(md).toMatch(/^## Superseded by\ndec-1 → dec-2 → dec-9 \(not found\)$/m);
  });

  it('mixed: non-empty ancestors AND non-empty descendants render both sections', () => {
    const d1 = mkDec({ id: 'dec-1', title: 'D1', status: 'superseded' });
    const root = mkDec({ id: 'dec-2', title: 'D2', status: 'superseded' });
    const d3 = mkDec({ id: 'dec-3', title: 'D3', status: 'active' });
    const graph: DecisionGraph = {
      decision: root,
      ancestors: [{ decision: d1, ancestors: [] }],
      descendants: [{ decision: d3 }],
    };
    const md = renderDecisionGraph(graph);
    expect(md).toMatch(/^# dec-2 — D2 \(superseded\)$/m);
    expect(md).toMatch(/^## Supersedes\n- dec-1 — D1 \(superseded\)$/m);
    expect(md).toMatch(/^## Superseded by\ndec-2 → dec-3$/m);
    expect(md).not.toMatch(/\(none\)/);
  });

  it('empty ancestors + non-empty descendants → `(none)` for Supersedes, chain for Superseded by', () => {
    const d1 = mkDec({ id: 'dec-1', title: 'D1', status: 'superseded' });
    const d2 = mkDec({ id: 'dec-2', title: 'D2', status: 'active' });
    const graph: DecisionGraph = {
      decision: d1,
      ancestors: [],
      descendants: [{ decision: d2 }],
    };
    const md = renderDecisionGraph(graph);
    expect(md).toMatch(/^## Supersedes\n\(none\)$/m);
    expect(md).toMatch(/^## Superseded by\ndec-1 → dec-2$/m);
  });

  it('trailing newline always present at end of output', () => {
    const graph: DecisionGraph = {
      decision: mkDec(),
      ancestors: [],
      descendants: [],
    };
    const md = renderDecisionGraph(graph);
    expect(md.endsWith('\n')).toBe(true);
  });
});
