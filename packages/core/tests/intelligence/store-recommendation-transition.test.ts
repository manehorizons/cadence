import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import type { Recommendation, RecommendationLedger } from '@manehorizons/cadence-types';
import { readRecommendationLedger } from '../../src/intelligence/store/io.js';
import {
  addRecommendation,
  applyRecommendationTransition,
  runRecommendationTransition,
} from '../../src/intelligence/store/recommendations.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

function mkRec(
  id: string,
  status: Recommendation['status'],
  overrides: Partial<Recommendation> = {},
): Recommendation {
  return {
    id,
    title: `${id} title`,
    summary: `${id} summary`,
    source: 'manual',
    status,
    readiness: 'raw-idea',
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
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
    ...overrides,
  };
}

function mkLedger(recs: Recommendation[]): RecommendationLedger {
  return { schemaVersion: 1, recommendations: recs };
}

describe('applyRecommendationTransition (Slice 34.1 pure helper)', () => {
  const now = new Date('2026-05-25T12:00:00.000Z');

  it('convert: candidate → converted; sets convertedToPhaseId; bumps updatedAt', () => {
    const ledger = mkLedger([
      mkRec('rec-1', 'candidate'),
      mkRec('rec-2', 'accepted'),
    ]);
    const res = applyRecommendationTransition(
      ledger,
      'rec-1',
      'convert',
      '34.1-rec-phase-linkage',
      now,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.recommendations[0]).toEqual({
      ...mkRec('rec-1', 'converted'),
      convertedToPhaseId: '34.1-rec-phase-linkage',
      updatedAt: '2026-05-25T12:00:00.000Z',
    });
    // Non-target preserved byte-equal
    expect(res.ledger.recommendations[1]).toBe(ledger.recommendations[1]);
  });

  it('convert: accepted → converted', () => {
    const ledger = mkLedger([mkRec('rec-1', 'accepted')]);
    const res = applyRecommendationTransition(ledger, 'rec-1', 'convert', '34.1-x', now);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.recommendations[0]!.status).toBe('converted');
    expect(res.ledger.recommendations[0]!.convertedToPhaseId).toBe('34.1-x');
    expect(res.ledger.recommendations[0]!.updatedAt).toBe('2026-05-25T12:00:00.000Z');
  });

  it.each([
    [
      'deferred',
      'cannot convert recommendation in status deferred — run `cadence recommendation promote rec-1 --status=accepted` to reach an eligible status, then retry `cadence recommendation convert`',
    ],
    [
      'rejected',
      'cannot convert recommendation in status rejected — run `cadence recommendation promote rec-1 --status=accepted` to reach an eligible status, then retry `cadence recommendation convert`',
    ],
    [
      'converted',
      'cannot convert recommendation in status converted — run `cadence recommendation promote rec-1 --status=accepted` to reach an eligible status, then retry `cadence recommendation convert`',
    ],
  ] as const)('convert refused from %s', (status, expectedError) => {
    const ledger = mkLedger([mkRec('rec-1', status)]);
    const res = applyRecommendationTransition(ledger, 'rec-1', 'convert', '34.1-x', now);
    expect(res).toEqual({ ok: false, error: expectedError });
  });

  it('id not in ledger', () => {
    const ledger = mkLedger([]);
    const res = applyRecommendationTransition(ledger, 'rec-bogus', 'convert', '34.1-x', now);
    expect(res).toEqual({
      ok: false,
      error: 'recommendation rec-bogus not found. Run `cadence recommendation list` to browse.',
    });
  });

  it('idempotency-by-refusal: re-convert refused because status is converted', () => {
    const ledger = mkLedger([
      mkRec('rec-1', 'converted', { convertedToPhaseId: '34.1-x' }),
    ]);
    const res = applyRecommendationTransition(ledger, 'rec-1', 'convert', '34.1-y', now);
    expect(res).toEqual({
      ok: false,
      error:
        'cannot convert recommendation in status converted — run `cadence recommendation promote rec-1 --status=accepted` to reach an eligible status, then retry `cadence recommendation convert`',
    });
  });

  it('pure helper does not mutate input ledger', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const before = JSON.stringify(ledger);
    applyRecommendationTransition(ledger, 'rec-1', 'convert', '34.1-x', now);
    expect(JSON.stringify(ledger)).toBe(before);
  });
});

async function seedRec(root: string, status: Recommendation['status'] = 'candidate'): Promise<string> {
  const r = await addRecommendation(root, {
    title: 'T', summary: 'S', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  if (status !== 'candidate') {
    // Hand-edit the ledger to set the target source status.
    const ledger = await readRecommendationLedger(root);
    ledger.recommendations[0]!.status = status;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(root, '.cadence/intelligence/recommendations.json'),
      JSON.stringify(ledger, null, 2),
      'utf8',
    );
  }
  return r.id;
}

async function makePhaseDir(root: string, phaseId: string): Promise<void> {
  await mkdir(join(root, '.cadence/phases', phaseId), { recursive: true });
}

describe('runRecommendationTransition (Slice 34.1 I/O wrapper)', () => {
  it('happy path: phase dir exists + rec is candidate → status flips; ledger written; RECOMMENDATIONS.md re-rendered', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    const recId = await seedRec(active.root, 'candidate');
    await makePhaseDir(active.root, '34.1-rec-phase-linkage');
    const res = await runRecommendationTransition(
      active.root,
      recId,
      'convert',
      '34.1-rec-phase-linkage',
    );
    expect(res.ok).toBe(true);
    const ledger = await readRecommendationLedger(active.root);
    expect(ledger.recommendations[0]!.status).toBe('converted');
    expect(ledger.recommendations[0]!.convertedToPhaseId).toBe('34.1-rec-phase-linkage');
    // RECOMMENDATIONS.md reflects the new status (Slice 15 status bullet).
    const md = await readFile(
      join(active.root, '.cadence/intelligence/RECOMMENDATIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/- status: converted/);
  });

  it('FK miss: phase dir does NOT exist → refused phase-not-found; ledger byte-equal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    const recId = await seedRec(active.root, 'candidate');
    const jsonPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const mdPath = join(active.root, '.cadence/intelligence/RECOMMENDATIONS.md');
    const jsonBefore = await readFile(jsonPath, 'utf8');
    const mdBefore = await readFile(mdPath, 'utf8');
    const res = await runRecommendationTransition(
      active.root,
      recId,
      'convert',
      'missing-phase',
    );
    expect(res).toEqual({
      ok: false,
      error:
        'cannot convert: phase missing-phase not found — create it first via `cadence draft new missing-phase`, or pass an existing --to-phase',
    });
    expect(await readFile(jsonPath, 'utf8')).toBe(jsonBefore);
    expect(await readFile(mdPath, 'utf8')).toBe(mdBefore);
  });

  it('invalid from-status: phase dir exists but rec is deferred → refused; ledger byte-equal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    const recId = await seedRec(active.root, 'deferred');
    await makePhaseDir(active.root, '34.1-x');
    const jsonPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const jsonBefore = await readFile(jsonPath, 'utf8');
    const res = await runRecommendationTransition(active.root, recId, 'convert', '34.1-x');
    expect(res).toEqual({
      ok: false,
      error: `cannot convert recommendation in status deferred — run \`cadence recommendation promote ${recId} --status=accepted\` to reach an eligible status, then retry \`cadence recommendation convert\``,
    });
    expect(await readFile(jsonPath, 'utf8')).toBe(jsonBefore);
  });

  it('rec not found: refused; no ledger files created', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    await makePhaseDir(active.root, '34.1-x');
    const jsonPath = join(active.root, '.cadence/intelligence/recommendations.json');
    expect(existsSync(jsonPath)).toBe(false);
    const res = await runRecommendationTransition(active.root, 'rec-bogus', 'convert', '34.1-x');
    expect(res).toEqual({
      ok: false,
      error: 'recommendation rec-bogus not found. Run `cadence recommendation list` to browse.',
    });
    expect(existsSync(jsonPath)).toBe(false);
  });

  it('phase-not-found takes precedence over rec-not-found (FK checked first)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    // No phase dir; no recs.
    const res = await runRecommendationTransition(active.root, 'rec-bogus', 'convert', 'missing-phase');
    expect(res).toEqual({
      ok: false,
      error:
        'cannot convert: phase missing-phase not found — create it first via `cadence draft new missing-phase`, or pass an existing --to-phase',
    });
  });

  it('FK rejects a file at the phase path (must be a directory)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice34_1' });
    const recId = await seedRec(active.root, 'candidate');
    // Create a FILE (not a directory) at .cadence/phases/some-file
    const { writeFile } = await import('node:fs/promises');
    await mkdir(join(active.root, '.cadence/phases'), { recursive: true });
    await writeFile(join(active.root, '.cadence/phases', 'not-a-dir'), 'sentinel', 'utf8');
    const res = await runRecommendationTransition(active.root, recId, 'convert', 'not-a-dir');
    expect(res).toEqual({
      ok: false,
      error:
        'cannot convert: phase not-a-dir not found — create it first via `cadence draft new not-a-dir`, or pass an existing --to-phase',
    });
  });
});
