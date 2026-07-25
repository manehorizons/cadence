import { isEligible, runProposeMilestones } from '../intelligence/milestone.js';
import { readRecommendationLedger } from '../intelligence/store/io.js';
import { findNearestCandidates } from '../intelligence/nearest-candidate.js';
import type { CommandIO, CommandResult } from './io.js';
import type { MilestoneLedger } from '@manehorizons/cadence-types';

const ELIGIBILITY_PRECONDITION =
  'requires status=accepted and readiness in {ready-for-milestone, ready-for-cadence-spec}';

/**
 * Zero-eligible empty-result enrichment (phase 207 T2): states the
 * milestone-eligibility precondition in concrete terms, names the
 * nearest-miss candidate (highest-scored recommendation that's still live
 * but not yet eligible) with what it's missing, and prints the exact
 * `cadence recommendation promote` command that would fix it — computed via
 * the shared `findNearestCandidates` helper so this never diverges from
 * `cadence recommend`/`cadence next`'s own ranking. Best-effort: a ledger
 * read failure here silently degrades to no enrichment rather than turning
 * an otherwise-successful `propose` call into an error.
 */
export async function buildEmptyResultMessage(repoRoot: string): Promise<string> {
  const lines = [
    `No recommendations meet the milestone-eligibility bar (${ELIGIBILITY_PRECONDITION}).`,
  ];
  try {
    const { recommendations } = await readRecommendationLedger(repoRoot);
    const { nearestMiss } = findNearestCandidates(recommendations, { isEligible });
    if (nearestMiss !== undefined) {
      const { rec } = nearestMiss;
      lines.push(
        `Closest: ${rec.id} (status=${rec.status}, readiness=${rec.readiness}) — not yet eligible.`,
        `Fix: cadence recommendation promote ${rec.id} --status=accepted --readiness=ready-for-milestone`,
      );
    }
  } catch {
    // Best-effort introspection never throws (CLAUDE.md) — the bare
    // precondition line above still stands on its own.
  }
  return lines.join('\n') + '\n';
}

/**
 * AC-2 (phase 221 T2): the single shared definition of "did this run produce
 * any newly-proposed milestones". `ledger.milestones` is the FULL historical
 * ledger (clusterMilestones returns survivors + freshly-clustered), not just
 * this run's output — `ledger.milestones.length === 0` would wrongly suppress
 * the zero-eligible enrichment whenever any old accepted/deferred/exported/
 * closed milestone survives from a past run. The correct empty-this-run
 * signal is "zero newly-proposed milestones" (`status === 'proposed'`).
 * Both `milestoneProposeService` below and `cli/commands/milestone.ts`'s
 * `propose` action call this one function — a prior whole-branch review
 * caught this exact predicate fixed on only one of the two call sites when
 * they were kept as independent copies, so this export exists to make that
 * mistake structurally impossible.
 */
export function hasNewlyProposedMilestone(ledger: MilestoneLedger): boolean {
  return ledger.milestones.some((m) => m.status === 'proposed');
}

/**
 * `cadence milestone propose` as a service seam (phase 153) — MCP adapter over
 * the shared `runProposeMilestones` core. Takes no arguments: it re-reads the
 * recommendation + milestone ledgers, clusters newly eligible recommendations
 * (status `accepted`, readiness `ready-for-milestone`/`ready-for-cadence-spec`)
 * into proposed milestones, and writes the updated milestone ledger. Already
 * proposed/accepted/deferred/exported milestones are preserved untouched, so
 * this is safe to call repeatedly. `data` is the updated `MilestoneLedger`,
 * matching `cadence milestone propose --json`'s output shape.
 */
export type MilestoneProposeArgs = Record<string, never>;

export async function milestoneProposeService(
  repoRoot: string,
  _args: MilestoneProposeArgs,
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const ledger = await runProposeMilestones(repoRoot);
    io.out(`Proposed milestones: ${ledger.milestones.length}\n`);
    if (!hasNewlyProposedMilestone(ledger)) {
      io.out(await buildEmptyResultMessage(repoRoot));
    }
    return { exitCode: 0, data: ledger };
  } catch (err) {
    io.err(`milestone propose failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
