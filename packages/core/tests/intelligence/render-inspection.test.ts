import { describe, expect, it } from 'vitest';
import type { Inspection } from '@manehorizons/cadence-types';
import { renderStrategyMd } from '../../src/intelligence/render-inspection.js';

const base: Inspection = {
  schemaVersion: 1,
  generatedAt: '2026-05-17T00:00:00.000Z',
  repo: {
    git: { available: true, branch: 'main', dirty: false, ahead: 0, behind: 0 },
    pkg: { name: 'demo', scripts: { test: true } },
    docs: { readme: true, design: true, roadmap: true, changelog: true, docsDir: true },
    surfaces: { turbo: true },
    phases: { count: 2, latestId: '38-x' },
  },
  backend: {
    present: true,
    kind: 'cadence',
    loopPosition: 'IDLE',
    activePhase: null,
    activeDraft: null,
    tier: null,
    legalActions: ['cadence draft new <phase> <num> --title=…'],
    artifacts: { phaseCount: 2, roadmap: true, state: true, milestones: true },
  },
  ledger: { recommendations: 3, byDecay: { fresh: 2, stale: 1 }, evidence: 1 },
  flags: [],
};

describe('renderStrategyMd', () => {
  it('renders heading, facts, and a no-flags line', () => {
    const md = renderStrategyMd(base);
    expect(md).toMatch(/^# CADENCE Strategic Status/m);
    expect(md).toMatch(/loop: IDLE/);
    expect(md).toMatch(/artifacts: phases 2/);
    expect(md).toMatch(/recommendations: 3/);
    expect(md).toMatch(/No flags raised\./);
  });

  it('renders flags when present', () => {
    const md = renderStrategyMd({
      ...base,
      flags: [
        { code: 'docs-missing', severity: 'info', message: 'Missing: DESIGN.md', evidence: 'DESIGN.md' },
      ],
    });
    expect(md).toMatch(/## Flags/);
    expect(md).toMatch(/\[info\] docs-missing — Missing: DESIGN\.md/);
  });

  it('renders a degraded backend', () => {
    const md = renderStrategyMd({
      ...base,
      backend: { present: false, kind: null, legalActions: [] },
    });
    expect(md).toMatch(/no CADENCE backend detected/i);
  });
});
