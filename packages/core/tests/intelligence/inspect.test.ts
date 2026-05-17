import { describe, expect, it, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import type { RepoScan, BackendStatus } from '@cadence/types';
import { synthesizeInspection, runInspect } from '../../src/intelligence/inspect.js';

const cleanScan: RepoScan = {
  git: { available: true, branch: 'main', dirty: false, ahead: 0, behind: 0 },
  pkg: { scripts: {} },
  docs: { readme: true, design: true, roadmap: true, changelog: true, docsDir: true },
  surfaces: { turbo: true },
  phases: { count: 0 },
};
const cleanBackend: BackendStatus = {
  present: true,
  kind: 'cadence',
  loopPosition: 'IDLE',
  activePhase: null,
  activeDraft: null,
  tier: null,
  legalActions: ['cadence draft new <phase> <num> --title=…'],
};
const NOW = new Date('2026-05-17T00:00:00.000Z');

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('synthesizeInspection', () => {
  it('raises no flags for a clean repo', () => {
    const i = synthesizeInspection(
      cleanScan,
      cleanBackend,
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    expect(i.flags).toEqual([]);
    expect(i.generatedAt).toBe('2026-05-17T00:00:00.000Z');
  });

  it('flags a dirty/diverged git tree', () => {
    const i = synthesizeInspection(
      { ...cleanScan, git: { available: true, dirty: true, ahead: 2, behind: 0 } },
      cleanBackend,
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    expect(i.flags.map((f) => f.code)).toContain('git-dirty-or-diverged');
  });

  it('flags loop-state inconsistency (DRAFT with no active draft)', () => {
    const i = synthesizeInspection(
      cleanScan,
      { ...cleanBackend, loopPosition: 'DRAFT', activeDraft: null },
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    expect(i.flags.map((f) => f.code)).toContain('loop-state-inconsistent');
  });

  it('flags a stateError', () => {
    const i = synthesizeInspection(
      cleanScan,
      { present: true, kind: 'cadence', legalActions: [], stateError: 'boom' },
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    expect(i.flags.map((f) => f.code)).toContain('loop-state-inconsistent');
  });

  it('flags ledger decay', () => {
    const i = synthesizeInspection(
      cleanScan,
      cleanBackend,
      { recommendations: 4, byDecay: { fresh: 2, stale: 1, contradicted: 1 }, evidence: 0 },
      NOW,
    );
    expect(i.flags.map((f) => f.code)).toContain('ledger-decay');
  });

  it('flags missing docs', () => {
    const i = synthesizeInspection(
      { ...cleanScan, docs: { readme: true, design: false, roadmap: true, changelog: true, docsDir: true } },
      cleanBackend,
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    const docs = i.flags.find((f) => f.code === 'docs-missing');
    expect(docs?.severity).toBe('info');
    expect(docs?.evidence).toMatch(/DESIGN\.md/);
  });

  it('does not raise git flag when git unavailable', () => {
    const i = synthesizeInspection(
      { ...cleanScan, git: { available: false } },
      cleanBackend,
      { recommendations: 0, byDecay: {}, evidence: 0 },
      NOW,
    );
    expect(i.flags.map((f) => f.code)).not.toContain('git-dirty-or-diverged');
  });
});

describe('runInspect', () => {
  it('writes inspection.json + STRATEGY.md and returns the inspection', async () => {
    active = await tempRepo({ initialized: true, projectName: 'inspect-fix' });

    const inspection = await runInspect(active.root);
    expect(inspection.schemaVersion).toBe(1);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'inspection.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'STRATEGY.md'),
      'utf8',
    );
    expect(md).toMatch(/# CADENCE Strategic Status/);
  });
});
