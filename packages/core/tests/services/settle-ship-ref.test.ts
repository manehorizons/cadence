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
} from '@manehorizons/cadence-types';
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

const PHASE = '41-converted';

const DRAFT = `---
phase: ${PHASE}
id: 41-01
tier: standard
status: APPROVED
---

# 41-01 — Converted phase

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
  opts: { recsRaw?: string; noRec?: boolean } = {},
): Promise<string> {
  const root = await realpath(await mkdtemp(join(parent, 'main-')));
  const phaseDir = join(root, '.cadence', 'phases', PHASE);
  await mkdir(phaseDir, { recursive: true });
  const config = {
    ...defaultConfig,
    recommendations: { autoArchive: true },
    // Phase 214 (T4): this fixture has no real AC-1 coverage and predates
    // gates.evidenceFloor (defaultConfig's schema-level floor is 'mention')
    // — relax it to 'unverified' so this file's --ship-ref assertions
    // aren't newly refused by the unrelated evidence-floor gate.
    gates: { sealed: [], evidenceFloor: 'unverified' as const },
  };
  await writeFile(join(root, '.cadence', 'config.json'), JSON.stringify(config, null, 2));
  const state = {
    ...emptyState('settle-ship-ref'),
    loopPosition: 'BUILD' as const,
    activePhase: PHASE,
    activeDraft: '41-01',
  };
  await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));
  await writeFile(join(phaseDir, '41-01-DRAFT.md'), DRAFT);
  await writeFile(
    join(phaseDir, '41-01-PROGRESS.json'),
    JSON.stringify({ draftId: '41-01', tasks: { T1: { status: 'DONE' } } }, null, 2),
  );
  const recPath = join(root, '.cadence', 'intelligence', 'recommendations.json');
  await mkdir(join(root, '.cadence', 'intelligence'), { recursive: true });
  if (opts.recsRaw !== undefined) {
    await writeFile(recPath, opts.recsRaw);
  } else if (opts.noRec) {
    const ledger: RecommendationLedger = {
      schemaVersion: 1,
      recommendations: [],
      archived: [],
    };
    await writeFile(recPath, JSON.stringify(ledger, null, 2));
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

describe('settle run --ship-ref (Phase 148)', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-settle-ship-ref-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  });

  it('AC-1: --ship-ref promotes the converted rec straight to shipped with shippedRef set', async () => {
    const root = await setupBuildRepo(parent);
    const { io, out } = captureIO();
    const res = await settleService(
      root,
      { auto: true, allowMissingCoverage: true, shipRef: 'PR #148' },
      io,
    );
    expect(res.exitCode).toBe(0);
    const recs = await readRecs(root);
    // shipped is a terminal, auto-archived status (recommendations.autoArchive
    // default on) — the rec moves out of the live array into `archived`.
    expect(recs.recommendations).toHaveLength(0);
    expect(recs.archived).toHaveLength(1);
    expect(recs.archived[0]?.id).toBe('rec-20260601-001');
    expect(recs.archived[0]?.status).toBe('shipped');
    expect(recs.archived[0]?.shippedRef).toBe('PR #148');
    expect(out.join('')).toContain('recommendation rec-20260601-001 moved to shipped (--ship-ref)');
  });

  it('AC-2: without --ship-ref, default behavior is unchanged (advances to settle-pending)', async () => {
    const root = await setupBuildRepo(parent);
    const { io, out } = captureIO();
    const res = await settleService(root, { auto: true, allowMissingCoverage: true }, io);
    expect(res.exitCode).toBe(0);
    const recs = await readRecs(root);
    expect(recs.recommendations).toHaveLength(1);
    expect(recs.recommendations[0]?.status).toBe('settle-pending');
    expect(recs.recommendations[0]?.shippedRef).toBeUndefined();
    expect(recs.archived).toHaveLength(0);
    expect(out.join('')).toContain('recommendation rec-20260601-001 moved to settle-pending (converted phase settled)');
    expect(out.join('')).not.toContain('--ship-ref');
  });

  it('AC-3: --ship-ref is a safe no-op when there is no converted rec for this phase', async () => {
    const root = await setupBuildRepo(parent, { noRec: true });
    const { io, out } = captureIO();
    const res = await settleService(
      root,
      { auto: true, allowMissingCoverage: true, shipRef: 'PR #148' },
      io,
    );
    expect(res.exitCode).toBe(0);
    const recs = await readRecs(root);
    expect(recs.recommendations).toHaveLength(0);
    expect(recs.archived).toHaveLength(0);
    expect(out.join('')).not.toContain('moved to shipped');
  });

  it('AC-3: a broken recommendations.json never fails settle with --ship-ref (best-effort)', async () => {
    const root = await setupBuildRepo(parent, { recsRaw: '{ this is not valid json' });
    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, allowMissingCoverage: true, shipRef: 'PR #148' },
      io,
    );
    expect(res.exitCode).toBe(0);
  });
});
