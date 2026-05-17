import { describe, expect, it } from 'vitest';
import type { RecommendationReport } from '@cadence/types';
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

  it('renders the empty-ledger shape', () => {
    const md = renderRecommendMd({
      ...base,
      ranked: [],
      parked: [],
      needsAttention: [],
      advisory: { kind: 'empty', primary: 'No actionable recommendations — add one with `cadence recommendation add`.' },
      totals: { total: 0, ranked: 0, parked: 0, needsAttention: 0, excluded: 0 },
    });
    expect(md).toMatch(/No actionable recommendations\./);
    expect(md).toMatch(/## Ranked/);
    expect(md).toMatch(/## Parked \(deferred\)\n\nNone\./);
    expect(md).toMatch(/## Needs attention \(superseded \/ contradicted\)\n\nNone\./);
    expect(md).toMatch(/total 0 · ranked 0 · parked 0 · needs-attention 0 · excluded 0/);
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
