import { describe, expect, it } from 'vitest';
import type { ContextPacket } from '@thomas-powers-jr/cadence-types';
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

describe('renderContextMd — review scope (Slice 7)', () => {
  it('emits a "## Needs Attention" section with all entries (no TOP_N cap)', () => {
    const packet: ContextPacket = {
      schemaVersion: 1,
      scope: 'review',
      generatedAt: '2026-05-18T00:00:00.000Z',
      loop: { present: false },
      recommendations: [],
      assumptions: [],
      decisions: [],
      files: [],
      needsAttention: [
        {
          id: 'a',
          title: 'x',
          score: 50,
          status: 'candidate',
          readiness: 'needs-evidence',
          priority: 'medium',
        },
        {
          id: 'b',
          title: 'y',
          score: 30,
          status: 'candidate',
          readiness: 'blocked',
          priority: 'low',
        },
      ],
      totals: {
        recommendations: 0,
        assumptions: 0,
        decisions: 0,
        files: 0,
        recommendationsOmitted: 0,
      },
    };
    const md = renderContextMd(packet);
    expect(md).toMatch(/## Needs Attention/);
    // Recommendations idiom: '### id — title' heading followed by bullet rows.
    expect(md).toMatch(/### a — x/);
    expect(md).toMatch(/### b — y/);
    expect(md).toMatch(
      /- score: 50\/100 · status: candidate · ready: needs-evidence · priority: medium/,
    );
  });

  it('emits "_(none)_" under "## Needs Attention" when bucket is empty', () => {
    const packet: ContextPacket = {
      schemaVersion: 1,
      scope: 'review',
      generatedAt: '2026-05-18T00:00:00.000Z',
      loop: { present: false },
      recommendations: [],
      assumptions: [],
      decisions: [],
      files: [],
      needsAttention: [],
      totals: {
        recommendations: 0,
        assumptions: 0,
        decisions: 0,
        files: 0,
        recommendationsOmitted: 0,
      },
    };
    const md = renderContextMd(packet);
    expect(md).toMatch(/## Needs Attention\n+_\(none\)_/);
  });
});

describe('renderContextMd — agent scope (Slice 7)', () => {
  it("omits '- next action:' line from Markdown loop block (JSON keeps the field)", () => {
    const packet: ContextPacket = {
      schemaVersion: 1,
      scope: 'agent',
      generatedAt: '2026-05-18T00:00:00.000Z',
      loop: {
        present: true,
        loopPosition: 'BUILD',
        activePhase: 'p1',
        activeDraft: null,
        activeSpec: null,
        tier: null,
        nextAction: 'cadence build task T1',
      },
      recommendations: [],
      assumptions: [],
      decisions: [],
      files: [],
      totals: {
        recommendations: 0,
        assumptions: 0,
        decisions: 0,
        files: 0,
        recommendationsOmitted: 0,
      },
    };
    const md = renderContextMd(packet);
    expect(md).not.toMatch(/- next action:/);
    expect(md).not.toMatch(/cadence build task T1/);
    // JSON parity: render is markdown-only — the field still lives on the packet object.
    expect(packet.loop.nextAction).toBe('cadence build task T1');
  });

  it("omits '- state error:' line from Markdown loop block (JSON keeps the field)", () => {
    const packet: ContextPacket = {
      schemaVersion: 1,
      scope: 'agent',
      generatedAt: '2026-05-18T00:00:00.000Z',
      loop: { present: true, loopPosition: 'IDLE', stateError: 'state.json corrupt' },
      recommendations: [],
      assumptions: [],
      decisions: [],
      files: [],
      totals: {
        recommendations: 0,
        assumptions: 0,
        decisions: 0,
        files: 0,
        recommendationsOmitted: 0,
      },
    };
    const md = renderContextMd(packet);
    expect(md).not.toMatch(/- state error:/);
    expect(md).not.toMatch(/state\.json corrupt/);
    expect(packet.loop.stateError).toBe('state.json corrupt');
  });

  it('phase + handoff render UNCHANGED — "- next action:" / "- state error:" still present', () => {
    const ph: ContextPacket = {
      schemaVersion: 1,
      scope: 'phase',
      generatedAt: '2026-05-18T00:00:00.000Z',
      loop: {
        present: true,
        loopPosition: 'DRAFT',
        activePhase: 'p2',
        nextAction: 'cadence draft new …',
      },
      recommendations: [],
      assumptions: [],
      decisions: [],
      files: [],
      totals: {
        recommendations: 0,
        assumptions: 0,
        decisions: 0,
        files: 0,
        recommendationsOmitted: 0,
      },
    };
    expect(renderContextMd(ph)).toMatch(/- next action: cadence draft new …/);

    const ho: ContextPacket = {
      schemaVersion: 1,
      scope: 'handoff',
      generatedAt: '2026-05-18T00:00:00.000Z',
      loop: { present: true, loopPosition: 'IDLE', stateError: 'X' },
      recommendations: [],
      assumptions: [],
      decisions: [],
      files: [],
      totals: {
        recommendations: 0,
        assumptions: 0,
        decisions: 0,
        files: 0,
        recommendationsOmitted: 0,
      },
    };
    expect(renderContextMd(ho)).toMatch(/- state error: X/);
  });
});
