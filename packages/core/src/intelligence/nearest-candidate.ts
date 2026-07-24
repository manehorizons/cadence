import { emptyEvidenceLedger } from '@manehorizons/cadence-types';
import type { EvidenceLedger, Recommendation } from '@manehorizons/cadence-types';
import { partitionLedger, scoreRecommendation } from './recommend.js';
import { countFrictionEvidence } from '../services/retro-feedback.js';

/**
 * A recommendation scored via `scoreRecommendation`, alongside the
 * recommendation itself — the unit `findNearestCandidates` ranks and
 * returns.
 */
export interface ScoredCandidate {
  rec: Recommendation;
  raw: number;
  score: number;
}

export interface NearestCandidateOptions {
  /**
   * Eligibility predicate: a recommendation must satisfy this to count as
   * an actionable candidate (e.g. `status === 'candidate'` for "available
   * to promote"). Recommendations already excluded by `partitionLedger`
   * (rejected, converted, shipped, settle-pending, deferred, or flagged
   * needs-attention) never reach this predicate at all.
   */
  isEligible: (rec: Recommendation) => boolean;
}

export interface NearestCandidateResult {
  /**
   * Eligible candidates, scored and ranked highest-first — the same
   * ordering (raw score desc, then createdAt asc, then id asc) `cadence
   * recommend` and `cadence next` already apply.
   */
  ranked: ScoredCandidate[];
  /** The top-ranked eligible candidate, or `undefined` when none qualify. */
  top: ScoredCandidate | undefined;
  /**
   * The highest-scored recommendation that is in the ledger's live
   * (`ranked`) partition — i.e. not rejected/converted/shipped/
   * settle-pending/deferred/needs-attention — but failed `isEligible`. This
   * is the "nearest miss": the closest thing to a usable candidate an
   * empty-result or refusal message can point at. `undefined` when no such
   * recommendation exists (including when it's the same recommendation
   * already surfaced as `top` — a rec can't be both eligible and not).
   */
  nearestMiss: ScoredCandidate | undefined;
}

function byRawDescThenCreatedAtAscThenIdAsc(
  a: ScoredCandidate,
  b: ScoredCandidate,
): number {
  if (b.raw !== a.raw) return b.raw - a.raw;
  if (a.rec.createdAt !== b.rec.createdAt) {
    return a.rec.createdAt < b.rec.createdAt ? -1 : 1;
  }
  return a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0;
}

/**
 * Given a ledger's recommendations and an eligibility predicate, return the
 * ranked eligible candidates plus the nearest miss — the highest-scored
 * recommendation that was close (still in the live `ranked` partition from
 * `partitionLedger`) but didn't satisfy `isEligible`. Built on
 * `partitionLedger` + `scoreRecommendation` (`recommend.ts`) so ranking
 * never diverges from `cadence recommend`'s own ordering.
 *
 * Pure and dependency-injected: no I/O, no hidden state. Callers pass in
 * the already-loaded ledger and decide what "eligible" means for their own
 * precondition (e.g. `cadence next`'s "available to promote" is
 * `status === 'candidate'`).
 *
 * `evidenceLedger` (optional, defaults to empty) feeds `scoreRecommendation`
 * the same `countFrictionEvidence` signal `runRecommend` wires in — so this
 * ranking never diverges from `cadence recommend`'s (docs/concepts.md,
 * "Empty-result and refusal messages"). Omitting it is a zero-friction case,
 * not an error: existing callers that don't pass one keep compiling and
 * behaving exactly as before.
 */
export function findNearestCandidates(
  recs: Recommendation[],
  options: NearestCandidateOptions,
  evidenceLedger: EvidenceLedger = emptyEvidenceLedger(),
): NearestCandidateResult {
  const { ranked } = partitionLedger(recs);
  const scored = ranked
    .map((rec) => ({
      rec,
      ...scoreRecommendation(rec, countFrictionEvidence(rec, evidenceLedger)),
    }))
    .sort(byRawDescThenCreatedAtAscThenIdAsc);

  const eligible: ScoredCandidate[] = [];
  const ineligible: ScoredCandidate[] = [];
  for (const candidate of scored) {
    (options.isEligible(candidate.rec) ? eligible : ineligible).push(candidate);
  }

  return {
    ranked: eligible,
    top: eligible[0],
    nearestMiss: ineligible[0],
  };
}
