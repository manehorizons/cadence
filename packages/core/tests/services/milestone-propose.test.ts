import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  addRecommendation,
  runRecommendationPromotion,
} from '../../src/intelligence/store/recommendations.js';
import { readMilestoneLedger } from '../../src/intelligence/store/milestones.js';
import { milestoneProposeService } from '../../src/services/milestone-propose.js';
import { runMilestoneTransition } from '../../src/intelligence/milestone.js';
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

  // Phase 203 (T3): a milestone that is deferred then reopened must re-enter the
  // re-clustering pool on the next propose run, rather than being treated as a
  // permanent survivor whose recommendationIds stay claimed forever. This is an
  // end-to-end check of T1's `reopen` transition (deferred -> proposed) as seen
  // through clusterMilestones()'s survivor/claimed logic
  // (packages/core/src/intelligence/milestone.ts, ~lines 244-249): only
  // `status !== 'proposed'` milestones are treated as survivors whose
  // recommendationIds get permanently claimed, so a reopened (now `proposed`)
  // milestone must fall out of `claimed` and be recomputed fresh.
  it('reopening a deferred milestone makes it re-poolable on the next propose (not a frozen survivor)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'milestone-propose-svc-reopen' });
    const recId = await seedEligibleRec(active.root);

    const io = bufferIO();

    // 1. Propose: recId gets clustered into a new proposed milestone.
    const first = await milestoneProposeService(active.root, {}, io);
    expect(first.exitCode).toBe(0);
    const firstData = first.data as {
      milestones: Array<{ id: string; status: string; recommendationIds: string[] }>;
    };
    const proposedMilestone = firstData.milestones.find(
      (m) => m.status === 'proposed' && m.recommendationIds.includes(recId),
    );
    expect(proposedMilestone).toBeDefined();
    const milestoneId = proposedMilestone!.id;

    // 2. Defer it.
    const deferred = await runMilestoneTransition(active.root, milestoneId, 'defer');
    expect(deferred.ok).toBe(true);
    const afterDefer = await readMilestoneLedger(active.root);
    expect(afterDefer.milestones.find((m) => m.id === milestoneId)?.status).toBe('deferred');

    // 3. Reopen it: deferred -> proposed.
    const reopened = await runMilestoneTransition(active.root, milestoneId, 'reopen');
    expect(reopened.ok).toBe(true);
    const afterReopen = await readMilestoneLedger(active.root);
    expect(afterReopen.milestones.find((m) => m.id === milestoneId)?.status).toBe('proposed');

    // 4. Re-run propose/cluster.
    const second = await milestoneProposeService(active.root, {}, io);
    expect(second.exitCode).toBe(0);
    const secondData = second.data as {
      milestones: Array<{ id: string; status: string; recommendationIds: string[] }>;
    };

    // 5. The milestone's recommendationIds are recomputed as a fresh `proposed`
    // entry — recId was NOT permanently excluded via the `claimed` set that
    // clusterMilestones() builds from non-`proposed` survivors.
    const recomputed = secondData.milestones.find((m) => m.id === milestoneId);
    expect(recomputed).toBeDefined();
    expect(recomputed?.status).toBe('proposed');
    expect(recomputed?.recommendationIds).toContain(recId);

    // No duplicate/orphaned milestone was created for the same recommendation —
    // recId is claimed by exactly this one (recomputed) milestone.
    const claimingRecId = secondData.milestones.filter((m) =>
      m.recommendationIds.includes(recId),
    );
    expect(claimingRecId).toHaveLength(1);
    expect(claimingRecId[0]?.id).toBe(milestoneId);

    // Persisted ledger matches.
    const persisted = await readMilestoneLedger(active.root);
    const persistedMatch = persisted.milestones.find((m) => m.id === milestoneId);
    expect(persistedMatch?.status).toBe('proposed');
    expect(persistedMatch?.recommendationIds).toContain(recId);
  });
});
