import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  addRecommendation,
  runRecommendationPromotion,
} from '../../src/intelligence/store/recommendations.js';
import { readMilestoneLedger } from '../../src/intelligence/store/milestones.js';
import { milestoneProposeService } from '../../src/services/milestone-propose.js';
import { bufferIO } from '../../src/services/io.js';

async function seedEligibleRec(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 'Cluster me',
    summary: 'A test recommendation ready for milestoning',
    priority: 'medium',
    readiness: 'ready-for-milestone',
    affectedAreas: [],
    affectedFiles: [],
  });
  const promoted = await runRecommendationPromotion(root, r.id, { status: 'accepted' });
  if (!promoted.ok) throw new Error(promoted.error);
  return r.id;
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('milestoneProposeService (phase 153)', () => {
  it('clusters an eligible recommendation into a new proposed milestone', async () => {
    active = await tempRepo({ initialized: true, projectName: 'milestone-propose-svc' });
    const recId = await seedEligibleRec(active.root);

    const io = bufferIO();
    const res = await milestoneProposeService(active.root, {}, io);

    expect(res.exitCode).toBe(0);
    const data = res.data as { milestones: Array<{ status: string; recommendationIds: string[] }> };
    expect(Array.isArray(data.milestones)).toBe(true);
    const proposed = data.milestones.find(
      (m) => m.status === 'proposed' && m.recommendationIds.includes(recId),
    );
    expect(proposed).toBeDefined();
    expect(io.stdout()).toContain('Proposed milestones');

    // Persisted ledger matches the returned data.
    const persisted = await readMilestoneLedger(active.root);
    expect(
      persisted.milestones.some(
        (m) => m.status === 'proposed' && m.recommendationIds.includes(recId),
      ),
    ).toBe(true);
  });

  it('is idempotent: a second call preserves the already-proposed milestone', async () => {
    active = await tempRepo({ initialized: true, projectName: 'milestone-propose-svc-2' });
    const recId = await seedEligibleRec(active.root);

    const io = bufferIO();
    const first = await milestoneProposeService(active.root, {}, io);
    expect(first.exitCode).toBe(0);
    const firstData = first.data as { milestones: Array<{ id: string; status: string }> };
    const firstMilestone = firstData.milestones.find((m) => m.status === 'proposed');
    expect(firstMilestone).toBeDefined();

    const second = await milestoneProposeService(active.root, {}, io);
    expect(second.exitCode).toBe(0);
    const secondData = second.data as { milestones: Array<{ id: string; status: string }> };
    expect(
      secondData.milestones.some((m) => m.id === firstMilestone?.id && m.status === 'proposed'),
    ).toBe(true);
  });

  it('returns an empty milestone list when no recommendation is eligible', async () => {
    active = await tempRepo({ initialized: true, projectName: 'milestone-propose-svc-empty' });

    const io = bufferIO();
    const res = await milestoneProposeService(active.root, {}, io);

    expect(res.exitCode).toBe(0);
    const data = res.data as { milestones: unknown[] };
    expect(data.milestones).toEqual([]);
  });
});
