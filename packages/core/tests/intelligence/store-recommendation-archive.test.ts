import { afterEach, describe, expect, it } from 'vitest';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import type { Recommendation, RecommendationLedger } from '@manehorizons/cadence-types';
import { readRecommendationLedger } from '../../src/intelligence/store/io.js';
import {
  addRecommendation,
  applyRecommendationPromotion,
  archiveRecommendation,
  runRecommendationArchive,
  runRecommendationUnarchive,
  unarchiveRecommendation,
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

function mkLedger(
  recs: Recommendation[],
  archived: Recommendation[] = [],
): RecommendationLedger {
  return { schemaVersion: 1, recommendations: recs, archived };
}

const now = new Date('2026-06-11T12:00:00.000Z');

describe('archiveRecommendation (Phase 101 / AC-3, AC-4)', () => {
  it('AC-3: moves a live rec into archived, stamping archivedAt + archiveReason', () => {
    const ledger = mkLedger([mkRec('rec-1', 'shipped'), mkRec('rec-2', 'candidate')]);
    const res = archiveRecommendation(ledger, 'rec-1', 'shipped', now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ledger.recommendations.map((r) => r.id)).toEqual(['rec-2']);
    expect(res.ledger.archived).toHaveLength(1);
    const arch = res.ledger.archived[0];
    expect(arch?.id).toBe('rec-1');
    expect(arch?.archivedAt).toBe(now.toISOString());
    expect(arch?.archiveReason).toBe('shipped');
    expect(arch?.updatedAt).toBe(now.toISOString());
  });

  it('AC-3: preserves other live recs and pre-existing archived entries', () => {
    const ledger = mkLedger(
      [mkRec('rec-1', 'candidate'), mkRec('rec-2', 'rejected')],
      [mkRec('rec-0', 'shipped', { archivedAt: now.toISOString(), archiveReason: 'shipped' })],
    );
    const res = archiveRecommendation(ledger, 'rec-2', 'rejected', now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ledger.recommendations.map((r) => r.id)).toEqual(['rec-1']);
    expect(res.ledger.archived.map((r) => r.id)).toEqual(['rec-0', 'rec-2']);
  });

  it('AC-4: rejects an unknown id, leaving the ledger untouched', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const res = archiveRecommendation(ledger, 'rec-x', 'manual', now);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('rec-x');
  });

  it('AC-4: rejects an already-archived id (not in the live array)', () => {
    const ledger = mkLedger(
      [mkRec('rec-1', 'candidate')],
      [mkRec('rec-2', 'shipped', { archivedAt: now.toISOString(), archiveReason: 'shipped' })],
    );
    const res = archiveRecommendation(ledger, 'rec-2', 'manual', now);
    expect(res.ok).toBe(false);
  });
});

describe('unarchiveRecommendation (Phase 101 / AC-5)', () => {
  it('AC-5: restores an archived rec, clearing archivedAt + archiveReason', () => {
    const ledger = mkLedger(
      [mkRec('rec-1', 'candidate')],
      [mkRec('rec-2', 'shipped', { archivedAt: '2026-06-01T00:00:00.000Z', archiveReason: 'shipped' })],
    );
    const res = unarchiveRecommendation(ledger, 'rec-2', now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ledger.archived).toEqual([]);
    const restored = res.ledger.recommendations.find((r) => r.id === 'rec-2');
    expect(restored?.archivedAt).toBeUndefined();
    expect(restored?.archiveReason).toBeUndefined();
    expect(restored?.updatedAt).toBe(now.toISOString());
  });

  it('AC-5: rejects an id not in the archived array', () => {
    const ledger = mkLedger([mkRec('rec-1', 'candidate')]);
    const res = unarchiveRecommendation(ledger, 'rec-1', now);
    expect(res.ok).toBe(false);
  });
});

describe('existing transforms preserve archived (Phase 101 / AC-6)', () => {
  it('AC-6: applyRecommendationPromotion keeps the archived array intact', () => {
    const ledger = mkLedger(
      [mkRec('rec-1', 'candidate')],
      [mkRec('rec-0', 'shipped', { archivedAt: now.toISOString(), archiveReason: 'shipped' })],
    );
    const res = applyRecommendationPromotion(ledger, 'rec-1', { status: 'accepted' }, now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ledger.archived.map((r) => r.id)).toEqual(['rec-0']);
  });
});

describe('run* wrappers persist atomically (Phase 101 / AC-7)', () => {
  it('AC-7: archive then unarchive round-trips on disk', async () => {
    active = await tempRepo();
    const root = active.root;
    const rec = await addRecommendation(root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });

    const archived = await runRecommendationArchive(root, rec.id, 'manual');
    expect(archived.ok).toBe(true);
    let reloaded = await readRecommendationLedger(root);
    expect(reloaded.recommendations).toHaveLength(0);
    expect(reloaded.archived.map((r) => r.id)).toEqual([rec.id]);
    expect(reloaded.archived[0]?.archiveReason).toBe('manual');

    const restored = await runRecommendationUnarchive(root, rec.id);
    expect(restored.ok).toBe(true);
    reloaded = await readRecommendationLedger(root);
    expect(reloaded.recommendations.map((r) => r.id)).toEqual([rec.id]);
    expect(reloaded.archived).toHaveLength(0);
  });

  it('AC-7: archiving an unknown id returns a typed error and writes nothing', async () => {
    active = await tempRepo();
    const res = await runRecommendationArchive(active.root, 'rec-nope', 'manual');
    expect(res.ok).toBe(false);
  });
});
