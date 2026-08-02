import type { EvidenceLedger, Recommendation, RetroRollup } from '@thomas-powers-jr/cadence-types';
import { redactSecrets } from '../security/redact.js';
import { addEvidenceToRecommendation } from '../intelligence/store/recommendations.js';

/**
 * Phase 212 (rec-20260712-004 lineage). The three `RetroRollup` frequency
 * dimensions a friction entry can come from — deliberately the exact key
 * names of `RetroRollup` itself so a match can be traced straight back to
 * `rollup[frictionBucket].recurring`.
 */
export type FrictionBucket = 'bypasses' | 'roughTaskStatuses' | 'findingCategories';

const FRICTION_BUCKETS: readonly FrictionBucket[] = [
  'bypasses',
  'roughTaskStatuses',
  'findingCategories',
];

/** Human label for a bucket, used in the evidence note text. */
const BUCKET_LABEL: Record<FrictionBucket, string> = {
  bypasses: 'gate bypass',
  roughTaskStatuses: 'rough task status',
  findingCategories: 'finding category',
};

/**
 * One recurring friction entry matched to one candidate recommendation.
 * `phaseIds` is carried through from the `RetroFrequencyEntry` unchanged —
 * it is the evidence of *recurrence* the note text (below) reports.
 */
export interface FrictionMatch {
  frictionKey: string;
  frictionBucket: FrictionBucket;
  phaseIds: string[];
  recommendationId: string;
}

/**
 * Turn a friction key (`code-review`, `codeReview`, `BLOCKED`,
 * `build-test-must-pass`, ...) into lowercase word tokens, splitting on both
 * non-alphanumeric separators and camelCase boundaries. Deliberately simple:
 * this repo's convention for gate/status/category names is kebab-case or
 * camelCase, never mixed with real prose, so a boundary-based tokenizer is
 * enough — no stemming, no stopword list.
 */
function tokenize(raw: string): string[] {
  const withCamelBoundaries = raw.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
  return withCamelBoundaries
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Matching heuristic (AC-1): a friction key matches a candidate string (an
 * `affectedAreas` entry or an `affectedFiles` path) when every individual
 * token of the key is present as an *exact token* of the candidate, once the
 * candidate has been run through the same {@link tokenize} boundary rules
 * (`codeReview` -> ['code','review'] both found in the token set of
 * `"packages/core/src/review/code-review.ts"` -> ['packages','core','src',
 * 'review','code','review','ts']).
 *
 * Tokenizing the candidate with the *same* function used on the friction key
 * — rather than doing a raw `string.includes(token)` substring check —
 * anchors every token to a real word boundary. A raw substring check would
 * let `testRetry` (tokens `test`, `retry`) falsely match an unrelated
 * candidate like `"packages/core/src/latest/retrying.ts"`, because `"test"`
 * is a substring of `"latest"` and `"retry"` is a substring of `"retrying"`
 * even though neither is a real token there.
 *
 * Requiring *all* tokens (not just one) keeps a single generic token like
 * "test" from matching everything — deterministic and cheap, per the DRAFT's
 * explicit "pick something simple, deterministic, testable" allowance.
 */
function frictionMatchesCandidate(frictionTokens: string[], candidate: string): boolean {
  if (frictionTokens.length === 0) return false;
  const candidateTokens = new Set(tokenize(candidate));
  return frictionTokens.every((t) => candidateTokens.has(t));
}

function recommendationMatchesFriction(
  recommendation: Recommendation,
  frictionTokens: string[],
): boolean {
  return (
    recommendation.affectedAreas.some((area) => frictionMatchesCandidate(frictionTokens, area)) ||
    recommendation.affectedFiles.some((file) => frictionMatchesCandidate(frictionTokens, file))
  );
}

/**
 * AC-1: pure, no I/O. For every *recurring* entry in each of the rollup's
 * three frequency buckets (never `oneOff` — Boundaries §"recurring only"),
 * find every recommendation whose `affectedAreas`/`affectedFiles` overlap
 * the friction key under {@link frictionMatchesCandidate}'s heuristic, and
 * emit one {@link FrictionMatch} per (friction entry, recommendation) pair.
 * A friction entry with no matching recommendation contributes nothing —
 * callers (T3's CLI command) distinguish "no match" from "matched" by
 * comparing the rollup's recurring entries against this function's output.
 */
export function matchFrictionToRecommendations(
  rollup: RetroRollup,
  recommendations: Recommendation[],
): FrictionMatch[] {
  const matches: FrictionMatch[] = [];
  for (const bucket of FRICTION_BUCKETS) {
    for (const entry of rollup[bucket].recurring) {
      const frictionTokens = tokenize(entry.key);
      if (frictionTokens.length === 0) continue;
      for (const recommendation of recommendations) {
        if (recommendationMatchesFriction(recommendation, frictionTokens)) {
          matches.push({
            frictionKey: entry.key,
            frictionBucket: bucket,
            phaseIds: entry.phaseIds,
            recommendationId: recommendation.id,
          });
        }
      }
    }
  }
  return matches;
}

/**
 * Shared prefix for every friction-derived Evidence `summary` — the part of
 * {@link frictionMarker}'s output that identifies "this evidence entry was
 * derived from retro friction" independent of *which* bucket/key. Factored
 * out so `countFrictionEvidence` (phase 212 T2) can recognize any
 * friction-derived entry without duplicating the marker format in a third
 * place; `frictionMarker` itself is unchanged (same resulting string).
 */
const FRICTION_MARKER_PREFIX = '[retro-friction:';

/**
 * Stable marker embedded at the start of every friction-derived Evidence
 * `summary`, e.g. `[retro-friction:bypasses:code-review]`. `Evidence` (per
 * `packages/types/src/intelligence.ts`) has no dedicated "friction key"
 * field, so the marker is how a later run recognizes "this exact friction
 * key is already recorded against this recommendation" (AC-2 idempotency)
 * without adding a schema field of our own. The marker text itself is never
 * secret-shaped, so `redactSecrets` (applied to the whole note before
 * persisting) never touches it.
 */
function frictionMarker(bucket: FrictionBucket, key: string): string {
  return `${FRICTION_MARKER_PREFIX}${bucket}:${key}]`;
}

function buildFrictionNote(match: FrictionMatch): string {
  const marker = frictionMarker(match.frictionBucket, match.frictionKey);
  const label = BUCKET_LABEL[match.frictionBucket];
  const phaseCount = match.phaseIds.length;
  return (
    `${marker} recurring ${label} "${match.frictionKey}" seen across ${phaseCount} phase(s): ` +
    `${match.phaseIds.join(', ')}.`
  );
}

/**
 * AC-2 idempotency check: true when `recommendation` already has an Evidence
 * entry (found via its own `evidenceIds`, looked up in `evidenceLedger`)
 * whose `summary` starts with this match's friction marker.
 */
function isAlreadyRecorded(
  match: FrictionMatch,
  recommendation: Recommendation,
  evidenceLedger: EvidenceLedger,
): boolean {
  const marker = frictionMarker(match.frictionBucket, match.frictionKey);
  const linkedIds = new Set(recommendation.evidenceIds);
  return evidenceLedger.evidence.some(
    (e) =>
      linkedIds.has(e.id) &&
      e.recommendationId === recommendation.id &&
      e.summary.startsWith(marker),
  );
}

/**
 * Phase 212 T2 (AC-3): count how many `Evidence` entries linked to
 * `recommendation` (via `recommendation.evidenceIds`, cross-checked against
 * `e.recommendationId` same as {@link isAlreadyRecorded}) are
 * friction-derived — i.e. their `summary` starts with the shared
 * {@link FRICTION_MARKER_PREFIX}, regardless of bucket/key. Pure, no I/O;
 * `scoreRecommendation` (`packages/core/src/intelligence/recommend.ts`)
 * feeds this count into its capped `frictionPts` term.
 */
export function countFrictionEvidence(
  recommendation: Recommendation,
  evidenceLedger: EvidenceLedger,
): number {
  const linkedIds = new Set(recommendation.evidenceIds);
  return evidenceLedger.evidence.filter(
    (e) =>
      linkedIds.has(e.id) &&
      e.recommendationId === recommendation.id &&
      e.summary.startsWith(FRICTION_MARKER_PREFIX),
  ).length;
}

export type FrictionEvidenceOutcome = 'wrote' | 'skipped-already-recorded' | 'error';

export interface FrictionEvidenceResult {
  frictionKey: string;
  frictionBucket: FrictionBucket;
  recommendationId: string;
  outcome: FrictionEvidenceOutcome;
  evidenceId?: string;
  error?: string;
}

/**
 * AC-2: the impure write step. `recommendations` and `evidenceLedger` are
 * loaded once by the caller (T3's CLI command) and passed in — this function
 * does the idempotency check for every match purely in-memory against that
 * single snapshot. `matches` legitimately CAN carry several entries with the
 * same friction key+bucket within one run — `matchFrictionToRecommendations`
 * emits one `FrictionMatch` per (friction entry, recommendation) pair, so a
 * friction key that overlaps N recommendations produces N matches sharing
 * that key+bucket. What actually makes the in-memory snapshot safe is
 * uniqueness of the (frictionKey, frictionBucket, recommendationId) triple:
 * `recommendations` (the input array) never contains duplicate ids, and the
 * matching loop visits each recommendation at most once per friction entry,
 * so no two matches in one run ever target the same recommendation with the
 * same key+bucket — each `isAlreadyRecorded` check and each write below is
 * therefore against a distinct (recommendation, marker) pair, with no risk of
 * the in-memory snapshot going stale against itself mid-loop. Only reaches
 * for I/O (`addEvidenceToRecommendation`, phase 199's tied-record writer —
 * reused verbatim rather than re-implementing the ledger-write mechanics) on
 * an actual new match. `addEvidenceToRecommendation` redacts internally too;
 * the explicit `redactSecrets` call here matches how every other evidence
 * writer in `recommendations.ts` treats freeform text as untrusted at its
 * origin, not just at the final choke point.
 */
export async function recordFrictionEvidence(
  root: string,
  matches: FrictionMatch[],
  recommendations: Recommendation[],
  evidenceLedger: EvidenceLedger,
): Promise<FrictionEvidenceResult[]> {
  const results: FrictionEvidenceResult[] = [];
  for (const match of matches) {
    const recommendation = recommendations.find((r) => r.id === match.recommendationId);
    if (!recommendation) {
      results.push({
        frictionKey: match.frictionKey,
        frictionBucket: match.frictionBucket,
        recommendationId: match.recommendationId,
        outcome: 'error',
        error: `recommendation ${match.recommendationId} not found in supplied recommendations`,
      });
      continue;
    }

    if (isAlreadyRecorded(match, recommendation, evidenceLedger)) {
      results.push({
        frictionKey: match.frictionKey,
        frictionBucket: match.frictionBucket,
        recommendationId: match.recommendationId,
        outcome: 'skipped-already-recorded',
      });
      continue;
    }

    const note = redactSecrets(buildFrictionNote(match));
    const written = await addEvidenceToRecommendation(root, {
      recommendationId: match.recommendationId,
      note,
    });
    if (!written.ok) {
      results.push({
        frictionKey: match.frictionKey,
        frictionBucket: match.frictionBucket,
        recommendationId: match.recommendationId,
        outcome: 'error',
        error: written.error,
      });
      continue;
    }
    results.push({
      frictionKey: match.frictionKey,
      frictionBucket: match.frictionBucket,
      recommendationId: match.recommendationId,
      outcome: 'wrote',
      evidenceId: written.evidence.id,
    });
  }
  return results;
}
