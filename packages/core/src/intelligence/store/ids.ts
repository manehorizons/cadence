import type {
  Assumption,
  AssumptionLedger,
  Evidence,
  EvidenceLedger,
  IntelligenceDecision,
  IntelligenceDecisionLedger,
  Recommendation,
  RecommendationLedger,
} from '@manehorizons/cadence-types';
import { assumptionLedgerSpec } from './assumptions.js';
import { decisionLedgerSpec } from './decisions.js';
import { evidenceLedgerSpec } from './io.js';
import { mintId, type SubjectLedgerSpec } from './ledger.js';
import { recommendationLedgerSpec } from './recommendations.js';

// Phase 220 T5: this module is now a thin per-subject wrapper over `mintId`
// (ledger.ts) — the Phase 219 cross-ledger id-collision safeguard lives in
// exactly one place instead of being re-derived per subject. The three specs
// below compose the imported (unmodified) base spec with a `crossCheckIds`
// this module supplies, rather than editing assumptions.ts/decisions.ts/
// io.ts directly (out of this task's boundary) — spec objects are plain
// data, so this is pure composition, not a second copy of mintId's logic.
//
// Built lazily (function, not a module-top-level const): `assumptions.ts`,
// `decisions.ts`, `io.ts`, and `recommendations.ts` form an import cycle with
// this module (`recommendations.ts` already imports `nextEvidenceId`/
// `nextRecommendationId` from here). Spreading a still-uninitialized spec at
// this module's own top level — before the cycle finishes resolving —
// silently produces an object missing `records`/`idOf`/etc; building the
// composed spec inside the function body instead defers evaluation until
// the exported next*Id functions are actually called, by which point the
// whole module graph has finished loading.

// AC-2: an evidence id can collide with a dangling `recommendation.evidenceIds[]`
// reference in a sibling recommendation ledger.
function evidenceLedgerSpecWithCrossCheck(): SubjectLedgerSpec<
  Evidence,
  EvidenceLedger,
  string,
  string,
  { recommendationLedger?: RecommendationLedger }
> {
  return {
    ...evidenceLedgerSpec,
    crossCheckIds: (payload) =>
      (payload.recommendationLedger?.recommendations ?? []).flatMap(
        (r: Recommendation) => r.evidenceIds ?? [],
      ),
  };
}

// AC-2: an assumption id can collide with a dangling `recommendation.assumptionIds[]`
// reference in a sibling recommendation ledger.
function assumptionLedgerSpecWithCrossCheck(): SubjectLedgerSpec<
  Assumption,
  AssumptionLedger,
  Assumption['status'],
  string,
  { recommendationLedger?: RecommendationLedger }
> {
  return {
    ...assumptionLedgerSpec,
    crossCheckIds: (payload) =>
      (payload.recommendationLedger?.recommendations ?? []).flatMap(
        (r: Recommendation) => r.assumptionIds ?? [],
      ),
  };
}

// AC-2: a decision id can collide with a dangling `recommendation.decisionIds[]`
// reference, or with a dangling `supersededBy`/`supersedes` reference recorded
// on a sibling decision within this same ledger — neither is captured by
// mintId's own ledger-id scan, which only looks at `d.id`.
function decisionLedgerSpecWithCrossCheck(): SubjectLedgerSpec<
  IntelligenceDecision,
  IntelligenceDecisionLedger,
  IntelligenceDecision['status'],
  string,
  { decisionLedger: IntelligenceDecisionLedger; recommendationLedger?: RecommendationLedger }
> {
  return {
    ...decisionLedgerSpec,
    crossCheckIds: (payload) => [
      ...(payload.recommendationLedger?.recommendations ?? []).flatMap(
        (r: Recommendation) => r.decisionIds ?? [],
      ),
      ...payload.decisionLedger.decisions.flatMap((d) =>
        d.supersededBy !== undefined ? [d.supersededBy] : [],
      ),
      ...payload.decisionLedger.decisions.flatMap((d) => d.supersedes ?? []),
    ],
  };
}

export function nextRecommendationId(
  ledger: RecommendationLedger,
  now: Date,
  evidenceLedger?: EvidenceLedger,
): string {
  return mintId(
    recommendationLedgerSpec,
    ledger,
    now,
    evidenceLedger ? { evidenceLedger } : undefined,
  );
}

export function nextEvidenceId(
  ledger: EvidenceLedger,
  now: Date,
  recommendationLedger?: RecommendationLedger,
): string {
  return mintId(
    evidenceLedgerSpecWithCrossCheck(),
    ledger,
    now,
    recommendationLedger ? { recommendationLedger } : undefined,
  );
}

export function nextAssumptionId(
  ledger: AssumptionLedger,
  now: Date,
  recommendationLedger?: RecommendationLedger,
): string {
  return mintId(
    assumptionLedgerSpecWithCrossCheck(),
    ledger,
    now,
    recommendationLedger ? { recommendationLedger } : undefined,
  );
}

export function nextIntelligenceDecisionId(
  ledger: IntelligenceDecisionLedger,
  now: Date,
  recommendationLedger?: RecommendationLedger,
): string {
  return mintId(
    decisionLedgerSpecWithCrossCheck(),
    ledger,
    now,
    recommendationLedger
      ? { decisionLedger: ledger, recommendationLedger }
      : { decisionLedger: ledger },
  );
}
