import type { Summary } from '@manehorizons/cadence-types';
import { computeSummaryContentHash } from './summary-hash.js';

/**
 * Phase 223 (T3): the three possible outcomes of checking a settled
 * `Summary`'s stored `contentHash` against a fresh recomputation.
 *
 * - `MATCH` — `contentHash` is present and the recomputed digest is
 *   identical: the content has not changed since settle wrote it.
 * - `MISMATCH` — `contentHash` is present but the recomputed digest
 *   differs: the file was hand-edited after settle (or otherwise altered)
 *   without regenerating the hash.
 * - `NO_HASH` — no `contentHash` field at all: either a pre-phase-223
 *   record (phase 223's T1 added the field as optional/additive) or a
 *   REFUSED-settle SUMMARY.json that recorded no `codeReview`/
 *   `securityAudit` findings (phase 247: `settle.ts`'s `refusedSummary`
 *   path attaches a `contentHash` exactly when it recorded those findings,
 *   and omits one — same as before — when it didn't). This is a clean,
 *   informational outcome — not an error — per this repo's "no silent
 *   fallback" rule it must still be reported loudly, just without a
 *   failing exit code.
 */
export type SummaryVerifyVerdict = 'MATCH' | 'MISMATCH' | 'NO_HASH';

/**
 * Pure verification: given an already-parsed-and-validated `Summary`,
 * decides whether its stored `contentHash` (if any) still matches the
 * content. Reuses `computeSummaryContentHash` from `summary-hash.ts` (T2)
 * rather than re-deriving the digest, so this can never silently drift from
 * what settle actually wrote.
 */
export function verifySummaryContentHash(summary: Summary): SummaryVerifyVerdict {
  if (!summary.contentHash) {
    return 'NO_HASH';
  }
  const recomputed = computeSummaryContentHash(summary);
  return recomputed.value === summary.contentHash.value ? 'MATCH' : 'MISMATCH';
}
