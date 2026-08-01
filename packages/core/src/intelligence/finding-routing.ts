import type {
  Finding,
  RecommendationPriority,
  RecommendationReadiness,
} from '@manehorizons/cadence-types';
import { redactSecrets } from '../security/redact.js';
import { normalizeMessage } from '../verify/finding-identity.js';

/**
 * Phase 242 (T2, §7.3, dec-20260731-001) — pure finding-routing derivation.
 * Turns a settle's raw `codeReview` findings into the set of new
 * `Recommendation` candidates T3 should write to the ledger, without ever
 * touching the ledger itself: no fs, no clock reads (`now` is injected), and
 * deliberately no import from `services/settle.ts` or any `store/*`
 * ledger-store module — T3 owns wiring this module's output into
 * `addRecommendation` (`intelligence/store/recommendations.ts`). Matches the
 * house pure-core/impure-shell split used throughout `verify/*`
 * (`finding-identity.ts`, `criteria-gap.ts`).
 *
 * Three responsibilities, in order:
 *   1. Group findings by `Finding.id` first (dec-20260731-001): two or more
 *      findings that collide on identity within this one call merge into a
 *      single candidate, whose summary text records how many occurrences
 *      were collapsed. `computeFindingId` (`verify/finding-identity.ts`)
 *      hashes `(file, anchor.kind, anchor.ref, severity, normalized
 *      message)`, so a shared id can only arise from the same file — the
 *      merged candidate's `file`/`line` are taken from the *first*
 *      occurrence encountered, and that is safe because every occurrence in
 *      the group already agrees on file/anchor/severity/message by
 *      construction.
 *   2. Skip any finding with no `id` at all (AC-3) — un-identified findings
 *      (e.g. security-audit, which has no identity wired in yet) are
 *      deliberately never force-routed. An empty-string id is treated the
 *      same as a missing one.
 *   3. Skip any id already present in the caller-supplied `alreadyRoutedIds`
 *      set (AC-2) — the cross-settle dedup lookup. This check is orthogonal
 *      to the intra-call merge above: it applies regardless of how many
 *      occurrences of that id appear in *this* call.
 *
 * Every finding message is passed through `redactSecrets` (the same choke
 * point `addRecommendation` uses for its own evidence text) before it is
 * embedded in a candidate's title/summary/evidence — `addRecommendation`
 * itself only redacts `evidence.summary`, and this is the first automated
 * caller whose text is never human-typed/human-reviewed before reaching the
 * ledger, since a finding's message can quote diff content verbatim.
 *
 * Exactly one `scoutId` is minted per call (AC-4), derived from the injected
 * `now` using the existing `scout-YYYYMMDD-HHMM` convention (UTC) — never one
 * per finding.
 */

/** Settle-pointer facts the caller already knows and this module has no
 *  business re-deriving: which phase/draft this settle belongs to, its
 *  SUMMARY content hash, and the on-disk SUMMARY.json path each routed
 *  candidate's evidence should point at. */
export interface RoutingSettlePointer {
  phaseId: string;
  draftId: string;
  contentHash: string;
  summaryPath: string;
}

/** Structurally identical to `RecommendationEvidenceOverride`
 *  (`intelligence/store/recommendations.ts`) on purpose, but declared
 *  locally rather than imported — this module must not import a
 *  ledger-store module (pure-core boundary). Because the shape matches
 *  exactly, a `RoutingCandidate.evidence` value is directly assignable
 *  wherever `RecommendationEvidenceOverride` is expected. */
export interface RoutingCandidateEvidence {
  kind: 'cadence-artifact';
  summary: string;
  path: string;
}

/**
 * One new ledger candidate, shaped so T3 can pass it into
 * `addRecommendation`'s `AddRecommendationInput` almost verbatim — nothing
 * here needs re-deriving at the call site.
 */
export interface RoutingCandidate {
  title: string;
  summary: string;
  priority: RecommendationPriority;
  readiness: RecommendationReadiness;
  affectedAreas: string[];
  affectedFiles: string[];
  source: 'review';
  sourceFindingId: string;
  scoutId: string;
  evidence: RoutingCandidateEvidence;
}

/**
 * Severity → priority mapping: identity. A code-review finding's severity is
 * already expressed on the same four-point scale `RecommendationPriority`
 * uses (`critical`/`high`/`medium`/`low`), so routing carries it straight
 * across rather than inventing a second scale that could drift from the
 * finding's own signal.
 */
const SEVERITY_TO_PRIORITY: Record<Finding['severity'], RecommendationPriority> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

/**
 * Readiness is fixed at `'needs-decision'` for every routed candidate: a
 * routed finding already carries its evidence (the finding itself, anchored
 * to a settle) — what's missing is an operator decision (accept / waive /
 * fix / supersede), not more evidence-gathering (`'needs-evidence'`) and not
 * yet a milestone-ready shape (`'ready-for-milestone'`). Disposition
 * mutation itself stays a follow-on phase's CLI surface (phase 236's
 * boundary) — this module only picks the readiness label that describes
 * that gap honestly.
 */
const ROUTED_READINESS: RecommendationReadiness = 'needs-decision';

const MAX_TITLE_LENGTH = 80;

function truncate(message: string, maxLength: number): string {
  const trimmed = message.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

/**
 * `packages/<name>` for anything under `packages/`, else the top-level path
 * segment (e.g. `docs`, `scripts`) — a coarse but consistent area tag
 * derived from the finding's own file, since nothing else in a `Finding`
 * carries an explicit "area".
 */
function deriveArea(file: string): string {
  const segments = file.split('/');
  const first = segments[0] ?? file;
  const second = segments[1];
  if (first === 'packages' && second) return `packages/${second}`;
  return first;
}

/** `scout-YYYYMMDD-HHMM`, UTC, derived from the injected clock — the
 *  existing convention used by CLI callers (`recommendation add --scout-id`,
 *  `/cadence-scout`). Deliberately UTC (`getUTCHours`, not `getHours`) so the
 *  id is stable regardless of the machine's local timezone. */
function formatScoutId(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  const hours = pad(now.getUTCHours());
  const minutes = pad(now.getUTCMinutes());
  return `scout-${year}${month}${day}-${hours}${minutes}`;
}

interface FindingGroup {
  // Phase 242 T2 (independent-review F4): the *canonical* identity for
  // grouping is `id` alone (that's what AC-2's already-routed-set and AC-7's
  // merge are keyed on) — `file` is carried only because `computeFindingId`
  // hashes `file` as an input, so two findings sharing an `id` are already
  // guaranteed to share a `file`. Storing `id` here (rather than re-deriving
  // it from `finding.id!` at read time) keeps that guarantee explicit rather
  // than asserted.
  id: string;
  file: string;
  finding: Finding;
  occurrences: number;
  // One entry per occurrence, in encounter order, including the first — used
  // only to list every occurrence's line when merged (F2); the primary
  // `location` string still comes from `finding` (the first occurrence).
  lines: Array<number | undefined>;
}

function buildCandidate(
  group: FindingGroup,
  pointer: RoutingSettlePointer,
  scoutId: string,
): RoutingCandidate {
  const { id, file, finding, occurrences, lines } = group;
  const merged = occurrences > 1;
  // When merged, no single line represents the whole group (computeFindingId
  // deliberately excludes `line` from identity, so it's exactly the field
  // that can legitimately differ across occurrences of one id) — cite the
  // file alone and list every occurrence's line in the merge clause instead.
  const location = !merged && finding.line !== undefined ? `${file}:${finding.line}` : file;
  const definedLines = lines.filter((l): l is number => l !== undefined);
  const linesSuffix = merged && definedLines.length > 0 ? `, lines ${definedLines.join(', ')}` : '';
  const occurrenceClause = merged ? ` (${occurrences} occurrences merged${linesSuffix})` : '';
  // Choke point: a code-review finding's message can quote diff content
  // verbatim (that's the whole point of a finding), so unlike a human-typed
  // manual recommendation, this is the first automated `addRecommendation`
  // caller whose title/summary text is never human-reviewed before it lands
  // in the ledger. `addRecommendation` only redacts `evidence.summary`, not
  // `title`/`summary` — so normalize + redact the finding message itself,
  // once, up front, and build every rendering (title, top-level summary,
  // evidence summary) from that one copy. Whitespace-normalizing first
  // (independent-review F1/F6) matters for two reasons, not just cosmetics:
  // a raw multi-line message breaks `recommendation list`'s markdown
  // rendering (a heading / list-item boundary), and `computeFindingId` (this
  // id's own source of truth) hashes the *normalized* message — carrying the
  // raw one here would make the routed entry disagree with the identity it
  // was routed under.
  const redactedMessage = redactSecrets(normalizeMessage(finding.message));
  const findingDescription = `${finding.severity} finding at ${location}: ${redactedMessage}`;

  return {
    title: `Code-review finding (${finding.severity}): ${truncate(redactedMessage, MAX_TITLE_LENGTH)}`,
    // Occurrence clause is interpolated on both this top-level summary and
    // evidence.summary below (AC-7): `recommendation show` renders this
    // field, while the evidence row is a separate render path — a ledger
    // reader should see the collapsed-occurrence count on either surface.
    summary: `${findingDescription}${occurrenceClause}`,
    priority: SEVERITY_TO_PRIORITY[finding.severity],
    readiness: ROUTED_READINESS,
    affectedAreas: [deriveArea(file)],
    affectedFiles: [file],
    source: 'review',
    sourceFindingId: id,
    scoutId,
    evidence: {
      kind: 'cadence-artifact',
      path: pointer.summaryPath,
      // Matches the `phase <id>, draft <id>, SUMMARY contentHash <hash> — …`
      // shape T1's AC-1 evidence text already uses, plus the occurrence
      // clause dec-20260731-001 requires when N > 1.
      summary: `phase ${pointer.phaseId}, draft ${pointer.draftId}, SUMMARY contentHash ${pointer.contentHash} — ${findingDescription}${occurrenceClause}`,
    },
  };
}

/**
 * Derive this settle's new routing candidates. `findingsByFile` is the
 * settle's raw `SummaryZ.codeReview` shape; `alreadyRoutedIds` is the set of
 * `Finding.id`s the caller already found routed in the ledger (read by the
 * caller — this function never reads the ledger itself); `pointer` names the
 * settle whose evidence every candidate should cite; `now` is the injected
 * clock (no `Date.now()`/`new Date()` inside this module).
 */
export function deriveRoutingCandidates(
  findingsByFile: Record<string, Finding[]>,
  alreadyRoutedIds: ReadonlySet<string>,
  pointer: RoutingSettlePointer,
  now: Date,
): RoutingCandidate[] {
  const scoutId = formatScoutId(now);

  // Step 1 (dec-20260731-001): group by id first, across the whole batch —
  // preserves first-seen order via Map insertion order, so output order is
  // deterministic. Keyed on `file + id` (independent-review F4), not `id`
  // alone: `computeFindingId` hashes `file` as one of its inputs, so a real
  // collision can never span two files — keying on the pair makes that
  // invariant self-enforcing (a same-id-different-file pair, which should be
  // unreachable, would route as two candidates rather than silently losing
  // one) instead of merely documenting it.
  const groups = new Map<string, FindingGroup>();
  for (const [file, findings] of Object.entries(findingsByFile)) {
    for (const finding of findings) {
      // Step 2 (AC-3): no stable id (undefined or empty string) — skip,
      // never force-route.
      if (!finding.id) continue;
      const key = `${file}::${finding.id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.occurrences += 1;
        existing.lines.push(finding.line);
      } else {
        groups.set(key, { id: finding.id, file, finding, occurrences: 1, lines: [finding.line] });
      }
    }
  }

  const candidates: RoutingCandidate[] = [];
  for (const group of groups.values()) {
    // Step 3 (AC-2): already routed in a prior settle — skip regardless of
    // how many occurrences appear in this call.
    if (alreadyRoutedIds.has(group.id)) continue;
    candidates.push(buildCandidate(group, pointer, scoutId));
  }
  return candidates;
}
