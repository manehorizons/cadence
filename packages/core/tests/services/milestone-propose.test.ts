import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  addRecommendation,
  runRecommendationPromotion,
} from '../../src/intelligence/store/recommendations.js';
import { readMilestoneLedger } from '../../src/intelligence/store/milestones.js';
import {
  hasNewlyProposedMilestone,
  milestoneProposeService,
} from '../../src/services/milestone-propose.js';
import { runMilestoneTransition } from '../../src/intelligence/milestone.js';
import { bufferIO } from '../../src/services/io.js';
import { emptyMilestoneLedger, type MilestoneLedger } from '@manehorizons/cadence-types';

function makeMilestone(
  id: string,
  status: MilestoneLedger['milestones'][number]['status'],
): MilestoneLedger['milestones'][number] {
  const now = new Date().toISOString();
  return {
    id,
    name: `Milestone ${id}`,
    objective: 'test objective',
    status,
    recommendationIds: ['rec-1'],
    preMortem: {
      likelyFailureModes: [],
      hiddenDependencies: [],
      driftRisks: [],
      outOfScope: [],
    },
    exportTargets: [],
    createdAt: now,
    updatedAt: now,
  };
}

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

  // AC-2: given zero recommendations meet the milestone-eligibility bar, the
  // empty-result message must state the precondition in concrete terms, name
  // the nearest-miss candidate with what it's missing, and print the exact
  // `cadence recommendation promote <id> --status=... --readiness=...`
  // command to fix the closest one — computed via the shared
  // `findNearestCandidates` helper (packages/core/src/intelligence/
  // nearest-candidate.ts) rather than a bare count.
  it('AC-2: enriches the zero-eligible empty result with precondition, nearest miss, and fix command', async () => {
    active = await tempRepo({ initialized: true, projectName: 'milestone-propose-svc-ac2' });

    // Seeded with `needs-decision` readiness and default `candidate` status —
    // in the ledger's live partition, but fails the milestone-eligibility bar
    // on both status and readiness, so it's the nearest miss.
    const nearMissId = (
      await addRecommendation(active.root, {
        title: 'Almost there',
        summary: 'A recommendation that has not yet been accepted or scoped',
        priority: 'high',
        readiness: 'needs-decision',
        affectedAreas: [],
        affectedFiles: [],
      })
    ).id;

    const io = bufferIO();
    const res = await milestoneProposeService(active.root, {}, io);

    expect(res.exitCode).toBe(0);
    const data = res.data as { milestones: unknown[] };
    expect(data.milestones).toEqual([]);

    const stdout = io.stdout();
    // States the eligibility precondition in concrete terms.
    expect(stdout).toContain('status=accepted');
    expect(stdout).toContain('ready-for-milestone');
    expect(stdout).toContain('ready-for-cadence-spec');
    // Names the nearest-miss candidate with what it's missing.
    expect(stdout).toContain(nearMissId);
    expect(stdout).toContain('candidate');
    expect(stdout).toContain('needs-decision');
    // Prints the exact fix command with the real id, not a placeholder.
    expect(stdout).toContain(
      `cadence recommendation promote ${nearMissId} --status=accepted --readiness=ready-for-milestone`,
    );
  });

  // AC-2 edge case: an empty ledger (no recommendations at all) has no
  // nearest-miss candidate to name — the enrichment must still state the
  // precondition without fabricating a candidate or command.
  it('AC-2: empty ledger states the precondition without a fabricated nearest-miss or command', async () => {
    active = await tempRepo({ initialized: true, projectName: 'milestone-propose-svc-ac2-empty' });

    const io = bufferIO();
    const res = await milestoneProposeService(active.root, {}, io);

    expect(res.exitCode).toBe(0);
    const data = res.data as { milestones: unknown[] };
    expect(data.milestones).toEqual([]);

    const stdout = io.stdout();
    expect(stdout).toContain('status=accepted');
    expect(stdout).toContain('ready-for-milestone');
    expect(stdout).not.toContain('cadence recommendation promote');
  });

  // AC-2 regression (whole-branch review, phase 207): `runProposeMilestones`
  // returns the FULL historical ledger (survivors + freshly-clustered), not
  // just this run's output, so `ledger.milestones.length === 0` is the wrong
  // empty-this-run signal — it would wrongly suppress the enrichment
  // whenever any old accepted/deferred/exported/closed milestone survives
  // from a past run. The CLI's own call site (cli/commands/milestone.ts)
  // was already fixed to key on "zero newly-proposed" instead; this test
  // pins the same fix on the MCP-facing `milestoneProposeService`, which a
  // first fix round missed because it was told not to touch this file.
  it('AC-2: enrichment still fires when the ledger already has an old accepted milestone but zero NEW proposals this run', async () => {
    active = await tempRepo({ initialized: true, projectName: 'milestone-propose-svc-ac2-old' });
    const recId = await seedEligibleRec(active.root);

    const io = bufferIO();
    const first = await milestoneProposeService(active.root, {}, io);
    expect(first.exitCode).toBe(0);
    const firstData = first.data as {
      milestones: Array<{ id: string; status: string; recommendationIds: string[] }>;
    };
    const proposedMilestone = firstData.milestones.find(
      (m) => m.status === 'proposed' && m.recommendationIds.includes(recId),
    );
    expect(proposedMilestone).toBeDefined();

    // Accept it — now the ledger has one non-'proposed' (accepted) milestone,
    // so `ledger.milestones.length` will be 1, not 0, on the next propose.
    const accepted = await runMilestoneTransition(active.root, proposedMilestone!.id, 'accept');
    expect(accepted.ok).toBe(true);

    // Run propose again with zero new eligible recommendations.
    const io2 = bufferIO();
    const second = await milestoneProposeService(active.root, {}, io2);
    expect(second.exitCode).toBe(0);
    const secondData = second.data as { milestones: unknown[] };
    // The old accepted milestone survives, so the ledger is NOT empty...
    expect(secondData.milestones.length).toBe(1);

    // ...but zero milestones were newly PROPOSED this run, so the
    // enrichment must still fire (this is the exact predicate the bug got
    // wrong — `.length === 0` would have been false here and suppressed it).
    const stdout = io2.stdout();
    expect(stdout).toContain('status=accepted');
    expect(stdout).toContain('ready-for-milestone');
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

// AC-2 (phase 221 T2): `hasNewlyProposedMilestone` is the single shared
// predicate now called from both `milestoneProposeService` (above) and
// `cli/commands/milestone.ts`'s `propose` action — these unit tests exercise
// it directly so a future edit to only one call site is structurally
// impossible (there is only one call site to edit), not just discouraged by
// comment.
describe('hasNewlyProposedMilestone (phase 221 T2)', () => {
  it('is true when the ledger has a milestone with status "proposed"', () => {
    const ledger: MilestoneLedger = {
      schemaVersion: 1,
      milestones: [makeMilestone('m-1', 'proposed')],
    };
    expect(hasNewlyProposedMilestone(ledger)).toBe(true);
  });

  it('is false when every milestone is accepted/deferred/exported/closed and none is proposed', () => {
    const ledger: MilestoneLedger = {
      schemaVersion: 1,
      milestones: [
        makeMilestone('m-1', 'accepted'),
        makeMilestone('m-2', 'deferred'),
        makeMilestone('m-3', 'exported'),
        makeMilestone('m-4', 'closed'),
      ],
    };
    expect(hasNewlyProposedMilestone(ledger)).toBe(false);
  });

  it('is false for an empty ledger', () => {
    expect(hasNewlyProposedMilestone(emptyMilestoneLedger())).toBe(false);
  });
});
