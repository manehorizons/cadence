import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultConfig,
  emptyState,
  type Recommendation,
  type RecommendationLedger,
} from '@thomas-powers-jr/cadence-types';
import { settleService } from '../../src/services/settle.js';
import type { CommandIO } from '../../src/services/io.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

const PHASE = '40-converted';
const DRAFT = `---
phase: ${PHASE}
id: 40-01
tier: standard
status: APPROVED
---

# 40-01 — Converted phase

## Objective

Settle a phase that a recommendation was converted into.

## Acceptance Criteria

### AC-1: it settles
Given a thing
When it runs
Then it settles.

## Tasks

### T1: do
- files: \`x.ts\`
- action: do
- verify: do
- done: AC-1

## Boundaries

- none
`;

function convertedRec(id: string, phaseId: string): Recommendation {
  return {
    id,
    title: `${id} title`,
    summary: 's',
    source: 'manual',
    status: 'converted',
    readiness: 'ready-for-cadence-spec',
    priority: 'medium',
    leverageScore: 5,
    riskScore: 5,
    confidence: 0.5,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    convertedToPhaseId: phaseId,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

async function setupBuildRepo(
  parent: string,
  opts: { autoArchive?: boolean; recsRaw?: string } = {},
): Promise<string> {
  const root = await realpath(await mkdtemp(join(parent, 'main-')));
  const phaseDir = join(root, '.cadence', 'phases', PHASE);
  await mkdir(phaseDir, { recursive: true });
  const config = {
    ...defaultConfig,
    recommendations: { autoArchive: opts.autoArchive ?? true },
    // Phase 214 (T4): this fixture has no real AC-1 coverage and predates
    // gates.evidenceFloor (defaultConfig's schema-level floor is 'mention')
    // — relax it to 'unverified' so this file's recommendation-archive
    // assertions aren't newly refused by the unrelated evidence-floor gate.
    gates: { sealed: [], evidenceFloor: 'unverified' as const },
  };
  await writeFile(join(root, '.cadence', 'config.json'), JSON.stringify(config, null, 2));
  const state = {
    ...emptyState('settle-auto-archive'),
    loopPosition: 'BUILD' as const,
    activePhase: PHASE,
    activeDraft: '40-01',
  };
  await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));
  await writeFile(join(phaseDir, '40-01-DRAFT.md'), DRAFT);
  await writeFile(
    join(phaseDir, '40-01-PROGRESS.json'),
    JSON.stringify({ draftId: '40-01', tasks: { T1: { status: 'DONE' } } }, null, 2),
  );
  const recPath = join(root, '.cadence', 'intelligence', 'recommendations.json');
  await mkdir(join(root, '.cadence', 'intelligence'), { recursive: true });
  if (opts.recsRaw !== undefined) {
    await writeFile(recPath, opts.recsRaw);
  } else {
    const ledger: RecommendationLedger = {
      schemaVersion: 1,
      recommendations: [convertedRec('rec-20260601-001', PHASE)],
      archived: [],
    };
    await writeFile(recPath, JSON.stringify(ledger, null, 2));
  }

  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);
  return root;
}

async function readRecs(root: string): Promise<RecommendationLedger> {
  return JSON.parse(
    await readFile(join(root, '.cadence', 'intelligence', 'recommendations.json'), 'utf8'),
  ) as RecommendationLedger;
}

describe('settle advances converted recs to settle-pending (Phase 145)', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-settle-aa-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  });

  it('AC-1: autoArchive on → the converted rec becomes settle-pending, not archived', async () => {
    const root = await setupBuildRepo(parent, { autoArchive: true });
    const { io, out } = captureIO();
    const res = await settleService(root, { auto: true, allowMissingCoverage: true }, io);
    expect(res.exitCode).toBe(0);
    const recs = await readRecs(root);
    expect(recs.recommendations).toHaveLength(1);
    expect(recs.recommendations[0]?.status).toBe('settle-pending');
    expect(recs.archived).toHaveLength(0);
    expect(out.join('')).toContain('rec-20260601-001');
  });

  it('AC-8: autoArchive off → the converted rec stays active', async () => {
    const root = await setupBuildRepo(parent, { autoArchive: false });
    const { io } = captureIO();
    const res = await settleService(root, { auto: true, allowMissingCoverage: true }, io);
    expect(res.exitCode).toBe(0);
    const recs = await readRecs(root);
    expect(recs.recommendations).toHaveLength(1);
    expect(recs.archived).toHaveLength(0);
  });

  it('AC-8: a broken recommendations.json never fails settle (best-effort)', async () => {
    const root = await setupBuildRepo(parent, {
      autoArchive: true,
      recsRaw: '{ this is not valid json',
    });
    const { io } = captureIO();
    const res = await settleService(root, { auto: true, allowMissingCoverage: true }, io);
    expect(res.exitCode).toBe(0);
  });
});
