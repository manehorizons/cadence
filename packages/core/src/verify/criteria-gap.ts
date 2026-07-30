import type { AcceptanceCriterion, Anchor, GateProvenance, Task } from '@manehorizons/cadence-types';
import { resolveAnchor, type AnchorCandidate } from './anchor.js';
import { parseAcRefs } from '../parse/ac-refs.js';

/**
 * Phase 235 (T4) — criteria-gap detection. Sits directly on top of the pure
 * §7.1 anchor resolver (`resolveAnchor`, T2): for every file a code-review
 * finding was reported against, this module works out which criterion (if
 * any) that file is anchored to and tags each finding with the result. A
 * finding whose best anchor resolves to `{ kind: 'none', tier: 'undeclared'
 * }` is, by definition, a criteria gap — diff work no acceptance criterion
 * and no boundary covers (AC-4). No new refusal machinery lives here: the
 * caller (`gates/code-review.ts`) keeps feeding the tagged findings through
 * the SAME `highs`/`pass` computation it always has, so a HIGH-severity gap
 * finding refuses through the pre-existing path (`dec-20260729-005`, D2).
 *
 * Pure and dependency-injected — no fs, no clock, no I/O — matching the house
 * pure-core/impure-shell split used throughout `gates/*` and `verify/*`.
 */

/** Structural shape of a code-review finding, independent of which of the
 *  two divergent `Finding` types (persisted-schema vs. verifier) a caller
 *  holds — both satisfy this. Deliberately NOT imported from
 *  `verify/code-review.ts`: this module has no reason to depend on that
 *  file's shape beyond what it structurally needs, and the DRAFT's
 *  boundaries forbid converging the two `Finding` types. */
export interface GapCandidateFinding {
  readonly severity: 'high' | 'medium' | 'low';
  readonly message: string;
  readonly line?: number;
}

/** A finding tagged with its resolved §7.1 anchor. `anchor.tier ===
 *  'undeclared'` (equivalently `anchor.kind === 'none'`) is the criteria-gap
 *  signal — the property that makes a gap finding distinguishable from an
 *  ordinary anchored finding in the result. */
export interface AnchoredFinding extends GapCandidateFinding {
  readonly anchor: Anchor;
}

/** Phase 235 (T4, D3) — declared unconditionally by the caller regardless of
 *  whether the evidence floor stops the settle; config decides what stops
 *  you, never what is visible. `severityDistribution` tallies only the gap
 *  (undeclared-tier) findings — the population relevant to reasoning about
 *  whether the pre-existing HIGH-finding floor will refuse. */
export interface CriteriaGapSummary {
  readonly gapCount: number;
  readonly severityDistribution: Readonly<Record<'high' | 'medium' | 'low', number>>;
}

export interface CriteriaGapResult {
  /** Every input finding, unchanged except for the added `anchor`. */
  readonly findings: Record<string, AnchoredFinding[]>;
  readonly summary: CriteriaGapSummary;
}

const TIER_RANK: Record<Anchor['tier'], number> = {
  executable: 3,
  structured: 2,
  declared: 1,
  undeclared: 0,
};

/**
 * What a file could plausibly be anchored to: any AC cited by a task whose
 * `files` includes it (matched via `parseAcRefs`, never string equality on
 * `done` — the same lesson `verify/anchor.ts` already encodes), plus any
 * `boundaries[]` entry that mentions the file by substring. Substring
 * matching on boundary prose is a deliberately loose signal (boundaries are
 * free text, e.g. "DO NOT touch src/legacy.ts") — `resolveAnchor` itself
 * still requires an EXACT match against a real `boundaries[]` entry before
 * granting anything above `undeclared`, so a false-positive substring hit
 * here can never fabricate an anchor; it can only propose a candidate that
 * `resolveAnchor` then independently verifies.
 */
function candidatesForFile(
  file: string,
  boundaries: readonly string[],
  tasks: readonly Task[],
): AnchorCandidate[] {
  const acIds = new Set<string>();
  for (const t of tasks) {
    if (t.files.includes(file)) {
      for (const id of parseAcRefs(t.done)) acIds.add(id);
    }
  }
  const candidates: AnchorCandidate[] = [...acIds].map((ref) => ({ kind: 'ac', ref }) as const);
  for (const b of boundaries) {
    if (b.includes(file)) candidates.push({ kind: 'boundary', ref: b });
  }
  return candidates;
}

/** Grade every candidate for a file through `resolveAnchor` and keep the
 *  strongest result. No candidates at all resolves via the explicit `'none'`
 *  candidate, which `resolveAnchor` always grades `undeclared` — the gap. */
function bestAnchorForFile(
  file: string,
  acceptanceCriteria: readonly AcceptanceCriterion[],
  boundaries: readonly string[],
  tasks: readonly Task[],
  gateProvenance: readonly GateProvenance[],
): Anchor {
  const candidates = candidatesForFile(file, boundaries, tasks);
  if (candidates.length === 0) {
    return resolveAnchor({ kind: 'none' }, acceptanceCriteria, boundaries, tasks, gateProvenance);
  }
  let best: Anchor | undefined;
  for (const candidate of candidates) {
    const anchor = resolveAnchor(candidate, acceptanceCriteria, boundaries, tasks, gateProvenance);
    if (best === undefined || TIER_RANK[anchor.tier] > TIER_RANK[best.tier]) {
      best = anchor;
    }
  }
  return best ?? { kind: 'none', tier: 'undeclared' };
}

/**
 * Tag every finding with its resolved anchor and unconditionally declare the
 * gap count + severity distribution (D3). `gateProvenance` is threaded
 * through to `resolveAnchor` unchanged — pass `[]` when the caller has no
 * corroborating provenance available (as of Phase 241, this settle's
 * `code-review` gate does have provenance available and passes the real
 * in-flight snapshot; `[]` remains the correct fallback for any other caller
 * with none), which conservatively can never inflate a tier to `executable`.
 */
export function anchorFindings(
  findings: Readonly<Record<string, readonly GapCandidateFinding[]>>,
  acceptanceCriteria: readonly AcceptanceCriterion[],
  boundaries: readonly string[],
  tasks: readonly Task[],
  gateProvenance: readonly GateProvenance[],
): CriteriaGapResult {
  const tagged: Record<string, AnchoredFinding[]> = {};
  const severityDistribution: Record<'high' | 'medium' | 'low', number> = {
    high: 0,
    medium: 0,
    low: 0,
  };
  let gapCount = 0;

  for (const [file, list] of Object.entries(findings)) {
    const anchor = bestAnchorForFile(file, acceptanceCriteria, boundaries, tasks, gateProvenance);
    tagged[file] = list.map((f) => ({ ...f, anchor }));
    if (anchor.tier === 'undeclared') {
      gapCount += list.length;
      for (const f of list) severityDistribution[f.severity] += 1;
    }
  }

  return { findings: tagged, summary: { gapCount, severityDistribution } };
}
