import { describe, expect, it } from 'vitest';
import type { RecommendationReport } from '@thomas-powers-jr/cadence-types';
import { renderRecommendMd } from '../../src/intelligence/render-recommend.js';

const base: RecommendationReport = {
  schemaVersion: 1,
  generatedAt: '2026-05-17T00:00:00.000Z',
  ranked: [
    {
      id: 'rec-a',
      title: 'ship the thing',
      raw: 32.3,
      score: 83,
      status: 'accepted',
      readiness: 'ready-for-milestone',
      priority: 'high',
      decayState: 'fresh',
      terms: [
        { label: 'lev 7', value: 7 },
        { label: 'risk 3', value: -1.5 },
      ],
      suggestedBackendAction: 'cadence milestone propose',
    },
  ],
  parked: [
    { id: 'rec-p', title: 'later idea', status: 'deferred', readiness: 'raw-idea' },
  ],
  needsAttention: [
    { id: 'rec-r', title: 'rotten one', decayState: 'contradicted' },
  ],
  advisory: { kind: 'top-recommendation', primary: 'cadence milestone propose' },
  totals: { total: 3, ranked: 1, parked: 1, needsAttention: 1, excluded: 0 },
};

describe('renderRecommendMd', () => {
  it('renders heading, advisory, ranked rows with why-line, parked, needs-attention, totals', () => {
    const md = renderRecommendMd(base);
    expect(md).toMatch(/^# CADENCE Recommended Next Moves/m);
    expect(md).toMatch(/## Advisory/);
    expect(md).toMatch(/- cadence milestone propose/);
    expect(md).toMatch(/### rec-a — ship the thing/);
    expect(md).toMatch(/score: 83\/100 \(raw 32\.3\)/);
    expect(md).toMatch(/why: lev 7 \+7 · risk 3 -1\.5 ⇒ raw 32\.3 \(score 83\)/);
    expect(md).toMatch(/## Parked \(deferred\)/);
    expect(md).toMatch(/rec-p — later idea \(deferred, raw-idea\)/);
    expect(md).toMatch(/## Needs attention/);
    expect(md).toMatch(/rec-r — rotten one \(contradicted\)/);
    expect(md).toMatch(/total 3 · ranked 1 · parked 1 · needs-attention 1 · excluded 0/);
  });

  it('AC-3: renders a scout line for a ranked rec with a scoutId, none without', () => {
    const withScout = renderRecommendMd({
      ...base,
      ranked: [{ ...base.ranked[0]!, scoutId: 'scout-20260605-1430' }],
    });
    expect(withScout).toMatch(/- scout: scout-20260605-1430/);
    // the default base rec has no scoutId → no scout line
    expect(renderRecommendMd(base)).not.toMatch(/- scout:/);
  });

  it('shows a truncation note when ranked.length is less than totals.ranked', () => {
    const md = renderRecommendMd({
      ...base,
      totals: { ...base.totals, ranked: 12 },
    });
    expect(md).toMatch(/\(showing top 1 of 12 — run `cadence recommend` for the full list\)/);
  });

  it('shows no truncation note when ranked.length equals totals.ranked', () => {
    const md = renderRecommendMd(base);
    expect(md).not.toMatch(/showing top/);
  });

  it('AC-3: renders the empty-ledger shape ("none exist") distinctly from "none actionable"', () => {
    const md = renderRecommendMd({
      ...base,
      ranked: [],
      parked: [],
      needsAttention: [],
      advisory: { kind: 'empty', primary: 'No actionable recommendations — add one with `cadence recommendation add`.' },
      totals: { total: 0, ranked: 0, parked: 0, needsAttention: 0, excluded: 0 },
    });
    expect(md).toMatch(/No recommendations exist yet\./);
    expect(md).toMatch(/precondition: the ledger has zero recommendations\./);
    expect(md).toMatch(/fix: `cadence recommendation add`.*or `cadence scout`/);
    // the "none exist" copy must not be confusable with the "none actionable" copy
    expect(md).not.toMatch(/No actionable recommendations\./);
    expect(md).toMatch(/## Ranked/);
    expect(md).toMatch(/## Parked \(deferred\)\n\nNone\./);
    expect(md).toMatch(/## Needs attention \(superseded \/ contradicted\)\n\nNone\./);
    expect(md).toMatch(/total 0 · ranked 0 · parked 0 · needs-attention 0 · excluded 0/);
  });

  it('AC-3: "none actionable" (candidates exist but filtered out) names the nearest parked candidate and the exact unblocking command', () => {
    const md = renderRecommendMd({
      ...base,
      ranked: [],
      parked: [
        { id: 'rec-p1', title: 'shelved idea', status: 'deferred', readiness: 'needs-decision' },
        { id: 'rec-p2', title: 'other shelved idea', status: 'deferred', readiness: 'raw-idea' },
      ],
      needsAttention: [],
      advisory: { kind: 'empty', primary: 'No actionable recommendations — add one with `cadence recommendation add`.' },
      totals: { total: 2, ranked: 0, parked: 2, needsAttention: 0, excluded: 0 },
    });
    expect(md).toMatch(/No actionable recommendations\./);
    expect(md).toMatch(
      /precondition: 2 recommendation\(s\) exist, but none are in the live\/scoreable partition — 2 parked \(deferred\), 0 flagged needs-attention, 0 excluded/,
    );
    expect(md).toMatch(/nearest: rec-p1 — shelved idea \(deferred, ready: needs-decision\)/);
    expect(md).toMatch(/unblock: `cadence recommendation promote rec-p1 --status=candidate`/);
    // not the "none exist" copy
    expect(md).not.toMatch(/No recommendations exist yet\./);
  });

  it('AC-3: "none actionable" falls back to the nearest needs-attention candidate when nothing is parked', () => {
    const md = renderRecommendMd({
      ...base,
      ranked: [],
      parked: [],
      needsAttention: [{ id: 'rec-na1', title: 'possibly stale', decayState: 'superseded' }],
      advisory: { kind: 'empty', primary: 'No actionable recommendations — add one with `cadence recommendation add`.' },
      totals: { total: 1, ranked: 0, parked: 0, needsAttention: 1, excluded: 0 },
    });
    expect(md).toMatch(/nearest: rec-na1 — possibly stale \(decay: superseded\)/);
    expect(md).toMatch(/unblock: `cadence inspect` to review and revalidate it before it can rank again/);
  });

  it('AC-3: "none actionable" with only status-excluded recs names no candidate but still points at `cadence recommendation list`', () => {
    const md = renderRecommendMd({
      ...base,
      ranked: [],
      parked: [],
      needsAttention: [],
      advisory: { kind: 'empty', primary: 'No actionable recommendations — add one with `cadence recommendation add`.' },
      totals: { total: 1, ranked: 0, parked: 0, needsAttention: 0, excluded: 1 },
    });
    expect(md).toMatch(/No actionable recommendations\./);
    expect(md).toMatch(
      /no nameable near-miss in this report — the rest are rejected\/converted\/shipped\/settle-pending; run `cadence recommendation list`/,
    );
  });

  it('renders the finish-loop advisory secondary', () => {
    const md = renderRecommendMd({
      ...base,
      advisory: {
        kind: 'finish-loop',
        primary: 'Finish in-flight CADENCE loop work first — cadence build task T1.',
        secondary: 'cadence milestone propose',
      },
    });
    expect(md).toMatch(/Finish in-flight CADENCE loop work first/);
    expect(md).toMatch(/then: cadence milestone propose/);
  });
});
