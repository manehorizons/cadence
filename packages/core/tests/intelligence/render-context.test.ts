import { describe, expect, it } from 'vitest';
import type { ContextPacket } from '@cadence/types';
import { renderContextMd } from '../../src/intelligence/render-context.js';

const full: ContextPacket = {
  schemaVersion: 1,
  scope: 'phase',
  generatedAt: '2026-05-18T00:00:00.000Z',
  loop: { present: true, loopPosition: 'BUILD', activePhase: '40-foo', nextAction: 'cadence done T1' },
  recommendations: [
    { id: 'rec-a', title: 'ship it', score: 83, status: 'accepted', readiness: 'ready-for-milestone', priority: 'high', suggestedBackendAction: 'cadence milestone propose' },
  ],
  assumptions: [{ id: 'as-1', recommendationId: 'rec-a', text: 'db reachable', status: 'open' }],
  decisions: [{ id: 'dec-1', title: 'approach A', rationale: 'cheapest', recommendationId: 'rec-a' }],
  files: [{ path: 'src/a.ts', why: 'affected by rec-a ship it' }],
  totals: { recommendations: 1, assumptions: 1, decisions: 1, files: 1, recommendationsOmitted: 2 },
};

const empty: ContextPacket = {
  schemaVersion: 1,
  scope: 'handoff',
  generatedAt: '2026-05-18T00:00:00.000Z',
  loop: { present: false },
  recommendations: [],
  assumptions: [],
  decisions: [],
  files: [],
  totals: { recommendations: 0, assumptions: 0, decisions: 0, files: 0, recommendationsOmitted: 0 },
};

describe('renderContextMd', () => {
  it('renders all sections with scope label and content', () => {
    const md = renderContextMd(full);
    expect(md).toMatch(/# CADENCE Context Packet — phase/);
    expect(md).toContain('cadence done T1');
    expect(md).toContain('rec-a');
    expect(md).toContain('ship it');
    expect(md).toContain('db reachable');
    expect(md).toContain('approach A');
    expect(md).toContain('src/a.ts');
    expect(md).toContain('2 omitted');
  });

  it('uses _(none)_ placeholders when sections are empty and notes no backend', () => {
    const md = renderContextMd(empty);
    expect(md).toMatch(/# CADENCE Context Packet — handoff/);
    expect((md.match(/_\(none\)_/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(md).toMatch(/no CADENCE backend/i);
  });

  it('emits no blank-line-breaking artifacts and ends with a newline', () => {
    expect(renderContextMd(full).endsWith('\n')).toBe(true);
  });
});
