import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type ArchiveReason,
  type AssumptionLedger,
  type Evidence,
  type IntelligenceDecisionLedger,
  type Recommendation,
  type RecommendationLedger,
  type RecommendationPriority,
  type RecommendationReadiness,
  type RecommendationStatus,
} from '@manehorizons/cadence-types';
import { loadConfig } from '../../config/loader.js';
import { redactSecrets } from '../../security/redact.js';
import { nextEvidenceId, nextRecommendationId } from './ids.js';
import {
  readEvidenceLedger,
  readRecommendationLedger,
  writeIntelligenceLedgers,
} from './io.js';

export type AddRecommendationInput = {
  title: string;
  summary: string;
  priority: RecommendationPriority;
  readiness: RecommendationReadiness;
  affectedAreas: string[];
  affectedFiles: string[];
  evidenceSummary?: string;
  scoutId?: string;
};

export async function addRecommendation(
  root: string,
  input: AddRecommendationInput,
): Promise<Recommendation> {
  const ledger = await readRecommendationLedger(root);
  const evidenceLedger = await readEvidenceLedger(root);
  const now = new Date();
  const ts = now.toISOString();
  const recommendationId = nextRecommendationId(ledger, now);
  const evidence: Evidence | null = input.evidenceSummary
    ? {
        id: nextEvidenceId(evidenceLedger, now),
        recommendationId,
        kind: 'note',
        // Choke point: raw evidence text may quote logs/diffs containing a live credential.
        summary: redactSecrets(input.evidenceSummary),
        createdAt: ts,
      }
    : null;
  const rec: Recommendation = {
    id: recommendationId,
    title: input.title,
    summary: input.summary,
    source: 'manual',
    status: 'candidate',
    readiness: input.readiness,
    priority: input.priority,
    leverageScore: 5,
    riskScore: 5,
    confidence: input.evidenceSummary ? 0.7 : 0.4,
    decayState: 'fresh',
    affectedAreas: input.affectedAreas,
    affectedFiles: input.affectedFiles,
    suggestedBackendAction: 'cadence milestone propose',
    evidenceIds: evidence ? [evidence.id] : [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: ts,
    updatedAt: ts,
  };
  // Phase 61: exact-optional — only set the key when supplied.
  if (input.scoutId) rec.scoutId = input.scoutId;
  if (evidence) evidenceLedger.evidence.push(evidence);
  ledger.recommendations.push(rec);
  await writeIntelligenceLedgers(root, ledger, evidenceLedger);
  return rec;
}

// Phase 199: tied-record writer. Appends a new Evidence entry and links its
// id into the matching recommendation's `evidenceIds`, in one atomic write.
export type AddEvidenceToRecommendationInput = {
  recommendationId: string;
  note: string;
};

export type AddEvidenceToRecommendationResult =
  | { ok: true; evidence: Evidence; recommendation: Recommendation }
  | { ok: false; error: string };

export async function addEvidenceToRecommendation(
  root: string,
  input: AddEvidenceToRecommendationInput,
): Promise<AddEvidenceToRecommendationResult> {
  const ledger = await readRecommendationLedger(root);
  const evidenceLedger = await readEvidenceLedger(root);
  const target = ledger.recommendations.find((r) => r.id === input.recommendationId);
  if (!target) {
    return {
      ok: false,
      error: buildRecommendationNotFoundMessage(ledger, input.recommendationId),
    };
  }
  const now = new Date();
  const ts = now.toISOString();
  const evidence: Evidence = {
    id: nextEvidenceId(evidenceLedger, now),
    recommendationId: input.recommendationId,
    kind: 'note',
    // Choke point: raw evidence text may quote logs/diffs containing a live credential.
    summary: redactSecrets(input.note),
    createdAt: ts,
  };
  const updatedRec: Recommendation = {
    ...target,
    evidenceIds: [...target.evidenceIds, evidence.id],
    updatedAt: ts,
  };
  evidenceLedger.evidence.push(evidence);
  const ledgerOut: RecommendationLedger = {
    schemaVersion: 1,
    recommendations: ledger.recommendations.map((r) =>
      r.id === input.recommendationId ? updatedRec : r,
    ),
    archived: ledger.archived,
  };
  await writeIntelligenceLedgers(root, ledgerOut, evidenceLedger);
  return { ok: true, evidence, recommendation: updatedRec };
}

// Phase 207 T4: shared "recommendation not found" message builder. Replaces the
// near-duplicate `recommendation ${id} not found` sites below
// (addEvidenceToRecommendation, applyRecommendationTransition,
// applyRecommendationPromotion, archiveRecommendation, unarchiveRecommendation)
// with one function so every refusal states: the id, an optional
// distinguishing context (e.g. "in archived recommendations"), the nearest-ID
// match already present in the loaded ledger, and the exact command to browse
// and find the right id.
export function buildRecommendationNotFoundMessage(
  ledger: RecommendationLedger,
  id: string,
  context?: string,
): string {
  const candidateIds = [
    ...ledger.recommendations.map((r) => r.id),
    // `archived` carries a Zod `.default([])` — guard defensively in case a
    // caller (e.g. a hand-built test ledger) omits it at the JS-object level.
    ...(ledger.archived ?? []).map((r) => r.id),
  ];
  const nearest = nearestRecommendationId(id, candidateIds);
  const contextSuffix = context ? ` ${context}` : '';
  const suggestion = nearest ? ` Did you mean ${nearest}?` : '';
  return `recommendation ${id} not found${contextSuffix}.${suggestion} Run \`cadence recommendation list\` to browse.`;
}

// Length of the literal `rec-YYYYMMDD-` date stem shared by every id minted
// on the same day — the threshold below treats a shared stem this long as a
// same-day match (the common typo: right date, wrong sequence number).
const REC_ID_DATE_STEM_LENGTH = 'rec-YYYYMMDD-'.length;

// Simple prefix/substring nearest-match — deliberately NOT a fuzzy-match /
// Levenshtein library (out of scope for T4). Recommendation ids are the fixed
// `rec-YYYYMMDD-NNN` shape, so:
//   1. a long shared literal prefix (same `rec-YYYYMMDD-` date stem, wrong
//      sequence number — the single most common typo) wins first, and
//   2. a plain substring relationship (truncated id, partial paste) is the
//      fallback.
// `startsWith` alone is not enough here: two same-length ids differing only
// in their trailing digits (the realistic "wrong sequence number" typo) are
// never a prefix of one another, so the match is done by explicit common-
// prefix length instead.
function nearestRecommendationId(id: string, candidateIds: string[]): string | null {
  const target = id.toLowerCase();
  let bestPrefixMatch: string | null = null;
  let bestPrefixLength = 0;
  for (const candidate of candidateIds) {
    const lower = candidate.toLowerCase();
    if (lower === target) continue;
    const prefixLength = commonPrefixLength(target, lower);
    if (prefixLength > bestPrefixLength) {
      bestPrefixLength = prefixLength;
      bestPrefixMatch = candidate;
    }
  }
  if (bestPrefixMatch && bestPrefixLength >= REC_ID_DATE_STEM_LENGTH) {
    return bestPrefixMatch;
  }
  const substringMatch = candidateIds.find((c) => {
    const lower = c.toLowerCase();
    return lower !== target && (lower.includes(target) || target.includes(lower));
  });
  return substringMatch ?? null;
}

function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i++;
  return i;
}

export function deriveRecommendationLinks(
  recLedger: RecommendationLedger,
  asLedger: AssumptionLedger,
  decLedger: IntelligenceDecisionLedger,
): RecommendationLedger {
  return {
    schemaVersion: 1,
    recommendations: recLedger.recommendations.map((r) => ({
      ...r,
      assumptionIds: asLedger.assumptions
        .filter((a) => a.recommendationId === r.id)
        .map((a) => a.id),
      decisionIds: decLedger.decisions
        .filter((d) => d.recommendationId === r.id)
        .map((d) => d.id),
    })),
    // Phase 101: archived recs pass through untouched (link derivation is for
    // the active surface only).
    archived: recLedger.archived,
  };
}

// Slice 34.1: recommendation conversion transition. Mirrors Slice 13's
// decision-transition pattern. Sole action is `convert` (terminal — no
// `unconvert` per Slice 34 Decision Log §4).
export type RecommendationTransitionAction = 'convert';

export type RecommendationTransitionResult =
  | { ok: true; ledger: RecommendationLedger }
  | { ok: false; error: string };

const RECOMMENDATION_TRANSITION_ALLOWED: Record<
  RecommendationTransitionAction,
  Recommendation['status'][]
> = {
  convert: ['candidate', 'accepted'],
};

const RECOMMENDATION_TRANSITION_NEXT: Record<
  RecommendationTransitionAction,
  Recommendation['status']
> = {
  convert: 'converted',
};

export function applyRecommendationTransition(
  ledger: RecommendationLedger,
  id: string,
  action: RecommendationTransitionAction,
  toPhase: string,
  now: Date,
): RecommendationTransitionResult {
  const target = ledger.recommendations.find((r) => r.id === id);
  if (!target) return { ok: false, error: buildRecommendationNotFoundMessage(ledger, id) };
  if (!RECOMMENDATION_TRANSITION_ALLOWED[action].includes(target.status)) {
    return {
      ok: false,
      error:
        `cannot ${action} recommendation in status ${target.status}` +
        ` — run \`cadence recommendation promote ${id} --status=accepted\` to reach an eligible` +
        ` status, then retry \`cadence recommendation ${action}\``,
    };
  }
  const nextStatus = RECOMMENDATION_TRANSITION_NEXT[action];
  const updatedAt = now.toISOString();
  const ledgerOut: RecommendationLedger = {
    schemaVersion: 1,
    recommendations: ledger.recommendations.map((r) =>
      r.id === id
        ? { ...r, status: nextStatus, convertedToPhaseId: toPhase, updatedAt }
        : r,
    ),
    archived: ledger.archived,
  };
  return { ok: true, ledger: ledgerOut };
}

// Phase 57: promote a recommendation's status and/or readiness — the missing
// link that makes `milestone propose` reachable for manual recs. Independent of
// `convert`: it never sets `convertedToPhaseId` and refuses `converted` (that
// transition is owned by `convert`, which sets the phase FK) and terminal recs.
export interface RecommendationPromotionChanges {
  status?: RecommendationStatus;
  readiness?: RecommendationReadiness;
  // Phase 100: freeform provenance for the `shipped` terminal status. Only
  // meaningful with `status: 'shipped'`; rejected otherwise.
  shippedRef?: string;
}

/**
 * Statuses an operator may promote *from*. `converted`/`rejected`/`shipped` are
 * terminal. Two sanctioned exceptions are handled below: `converted → shipped`
 * (phase 100, a converted phase that later shipped) and `settle-pending →
 * shipped` (phase 145, a converted phase that settled and later shipped).
 */
const PROMOTABLE_FROM: ReadonlySet<RecommendationStatus> = new Set([
  'candidate',
  'accepted',
  'deferred',
]);

export function applyRecommendationPromotion(
  ledger: RecommendationLedger,
  id: string,
  changes: RecommendationPromotionChanges,
  now: Date,
): RecommendationTransitionResult {
  const target = ledger.recommendations.find((r) => r.id === id);
  if (!target) return { ok: false, error: buildRecommendationNotFoundMessage(ledger, id) };
  if (changes.status === undefined && changes.readiness === undefined) {
    return {
      ok: false,
      error:
        'nothing to promote: provide --status and/or --readiness' +
        ` (e.g. \`cadence recommendation promote ${id} --status=accepted --readiness=ready-for-milestone\`)`,
    };
  }
  if (changes.status === 'converted') {
    return {
      ok: false,
      error:
        `cannot promote to converted — use \`cadence recommendation convert ${id}` +
        ` --to-phase <phaseId>\` (it sets the phase link)`,
    };
  }
  if (changes.status === 'settle-pending') {
    return {
      ok: false,
      error:
        "cannot promote to settle-pending — it is set automatically when a converted recommendation's" +
        ' phase settles (run `cadence settle run --auto` on that phase instead)',
    };
  }
  // Phase 100: `--ref` provenance is meaningful only for the shipped status.
  if (changes.shippedRef !== undefined && changes.status !== 'shipped') {
    return {
      ok: false,
      error:
        'shippedRef (--ref) is only valid when promoting to shipped' +
        ` (use \`cadence recommendation promote ${id} --status=shipped --ref "<text>"\`)`,
    };
  }
  // Phase 100: `converted → shipped` is the sole transition out of an otherwise
  // terminal status (a converted phase whose work later landed). Phase 145 adds
  // a second: `settle-pending → shipped` (a converted phase that settled locally
  // and has now been confirmed shipped).
  const convertedToShipped =
    changes.status === 'shipped' && target.status === 'converted';
  const settlePendingToShipped =
    changes.status === 'shipped' && target.status === 'settle-pending';
  if (
    !PROMOTABLE_FROM.has(target.status) &&
    !convertedToShipped &&
    !settlePendingToShipped
  ) {
    // Phase 100/145: `converted`/`settle-pending` have exactly one sanctioned
    // way out (promoting straight to shipped); `rejected`/`shipped` have none.
    const canReachShipped =
      target.status === 'converted' || target.status === 'settle-pending';
    const hint = canReachShipped
      ? ` — run \`cadence recommendation promote ${id} --status=shipped --ref "<text>"\`` +
        ` (the sole transition out of ${target.status})`
      : ` — no promotion is available from terminal status ${target.status}`;
    return {
      ok: false,
      error: `cannot promote recommendation in terminal status ${target.status}${hint}`,
    };
  }
  const updatedAt = now.toISOString();
  const ledgerOut: RecommendationLedger = {
    schemaVersion: 1,
    recommendations: ledger.recommendations.map((r) =>
      r.id === id
        ? {
            ...r,
            ...(changes.status !== undefined ? { status: changes.status } : {}),
            ...(changes.readiness !== undefined
              ? { readiness: changes.readiness }
              : {}),
            ...(changes.shippedRef !== undefined
              ? { shippedRef: changes.shippedRef }
              : {}),
            updatedAt,
          }
        : r,
    ),
    archived: ledger.archived,
  };
  return { ok: true, ledger: ledgerOut };
}

// Phase 101 (v1.24): soft-archival. Move a rec between the ledger's `recommendations`
// (live) and `archived` arrays. Recoverable — no deletion. Pure + disk-free; the
// `run*` wrappers below own I/O.

/**
 * Move a live rec into `archived`, stamping `archivedAt`/`archiveReason` (and
 * bumping `updatedAt`). Errors if `id` is not in the live array (unknown id, or
 * already archived). The ledger is otherwise untouched.
 */
export function archiveRecommendation(
  ledger: RecommendationLedger,
  id: string,
  reason: ArchiveReason,
  now: Date,
): RecommendationTransitionResult {
  const target = ledger.recommendations.find((r) => r.id === id);
  if (!target) {
    return {
      ok: false,
      error: buildRecommendationNotFoundMessage(ledger, id, 'in active recommendations'),
    };
  }
  const stamp = now.toISOString();
  const archivedRec: Recommendation = {
    ...target,
    archivedAt: stamp,
    archiveReason: reason,
    updatedAt: stamp,
  };
  return {
    ok: true,
    ledger: {
      schemaVersion: 1,
      recommendations: ledger.recommendations.filter((r) => r.id !== id),
      archived: [...ledger.archived, archivedRec],
    },
  };
}

/**
 * Restore an archived rec into `recommendations`, clearing the archive provenance
 * fields (and bumping `updatedAt`). Errors if `id` is not in the `archived` array.
 */
export function unarchiveRecommendation(
  ledger: RecommendationLedger,
  id: string,
  now: Date,
): RecommendationTransitionResult {
  const target = ledger.archived.find((r) => r.id === id);
  if (!target) {
    return {
      ok: false,
      error: buildRecommendationNotFoundMessage(ledger, id, 'in archived recommendations'),
    };
  }
  // Drop the archive-only fields without leaving them set to undefined
  // (exactOptionalPropertyTypes forbids explicit undefined).
  const { archivedAt: _archivedAt, archiveReason: _archiveReason, ...rest } = target;
  void _archivedAt;
  void _archiveReason;
  const restored: Recommendation = { ...rest, updatedAt: now.toISOString() };
  return {
    ok: true,
    ledger: {
      schemaVersion: 1,
      recommendations: [...ledger.recommendations, restored],
      archived: ledger.archived.filter((r) => r.id !== id),
    },
  };
}

// Phase 102 (v1.24): the auto-archive reason for a promotion's target status, or
// null when the status is not a terminal auto-archive trigger. `converted` is NOT
// here — converted recs archive when their phase settles, not at promote time.
export function autoArchiveReasonForPromotion(
  status: RecommendationStatus | undefined,
): ArchiveReason | null {
  if (status === 'shipped') return 'shipped';
  if (status === 'rejected') return 'rejected';
  return null;
}

// Phase 102: resolve `recommendations.autoArchive` best-effort (default `true` when
// config is missing/unreadable — auto-archive is the opt-out default for v1.24).
async function resolveAutoArchive(root: string): Promise<boolean> {
  try {
    return (await loadConfig(root)).recommendations.autoArchive;
  } catch {
    return true;
  }
}

// Slice 34.1: existence check for `.cadence/phases/<phaseId>/` lives in the
// I/O wrapper deliberately — keeps the pure helper disk-free (per Slice 34
// Decision Log §10 + §11 architectural principle).
async function phaseDirectoryExists(root: string, phaseId: string): Promise<boolean> {
  try {
    const s = await stat(join(root, '.cadence/phases', phaseId));
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function runRecommendationTransition(
  root: string,
  id: string,
  action: RecommendationTransitionAction,
  toPhase: string,
): Promise<RecommendationTransitionResult> {
  // FK check FIRST so a missing phase is caught before any ledger read.
  // Mirrors Slice 28's --by precedence: validate FK before applying transition.
  if (!(await phaseDirectoryExists(root, toPhase))) {
    return {
      ok: false,
      error:
        `cannot convert: phase ${toPhase} not found` +
        ` — create it first via \`cadence draft new ${toPhase}\`, or pass an existing --to-phase`,
    };
  }
  const ledger = await readRecommendationLedger(root);
  const res = applyRecommendationTransition(ledger, id, action, toPhase, new Date());
  if (!res.ok) return res;
  // writeIntelligenceLedgers handles atomic JSON + RECOMMENDATIONS.md re-render
  // (Slice 15 annotated form), so we don't need a separate rerender call.
  const evidenceLedger = await readEvidenceLedger(root);
  await writeIntelligenceLedgers(root, res.ledger, evidenceLedger);
  return res;
}

export async function runRecommendationPromotion(
  root: string,
  id: string,
  changes: RecommendationPromotionChanges,
): Promise<RecommendationTransitionResult> {
  const now = new Date();
  const ledger = await readRecommendationLedger(root);
  const res = applyRecommendationPromotion(ledger, id, changes, now);
  if (!res.ok) return res;
  // Phase 102: a promotion to a terminal status (shipped/rejected) auto-archives
  // the rec in the same atomic write, when `recommendations.autoArchive` is on.
  let outLedger = res.ledger;
  const reason = autoArchiveReasonForPromotion(changes.status);
  if (reason && (await resolveAutoArchive(root))) {
    const archived = archiveRecommendation(outLedger, id, reason, now);
    if (archived.ok) outLedger = archived.ledger;
  }
  const evidenceLedger = await readEvidenceLedger(root);
  await writeIntelligenceLedgers(root, outLedger, evidenceLedger);
  return { ok: true, ledger: outLedger };
}

// Phase 145: settle→rec hook. Move every `converted` rec whose phase just settled
// (`convertedToPhaseId === phaseId`) to `settle-pending` — NOT archived, so it
// stays visible in `cadence recommendation list`/`show` as a reminder to confirm
// shipping (`cadence recommendation promote <id> --status=shipped --ref ...`).
// Replaces phase 102's `runAutoArchiveConvertedForPhase`, which archived
// (`converted-settled`) at this point instead; that archive reason stays valid
// in `ArchiveReasonZ` for old ledgers but is no longer produced. Returns the
// moved ids ([] when none match). The caller (settle service) invokes this
// best-effort, config-gated (`recommendations.autoArchive`).
export async function runAdvanceConvertedToSettlePendingForPhase(
  root: string,
  phaseId: string,
): Promise<string[]> {
  const now = new Date();
  const ledger = await readRecommendationLedger(root);
  const targets = ledger.recommendations.filter(
    (r) => r.status === 'converted' && r.convertedToPhaseId === phaseId,
  );
  if (targets.length === 0) return [];
  const targetIds = new Set(targets.map((t) => t.id));
  const updatedAt = now.toISOString();
  const outLedger: RecommendationLedger = {
    schemaVersion: 1,
    recommendations: ledger.recommendations.map((r) =>
      targetIds.has(r.id) ? { ...r, status: 'settle-pending', updatedAt } : r,
    ),
    archived: ledger.archived,
  };
  const evidenceLedger = await readEvidenceLedger(root);
  await writeIntelligenceLedgers(root, outLedger, evidenceLedger);
  return targets.map((t) => t.id);
}

// Phase 101 (v1.24): I/O wrappers for soft-archival. Read → pure transform →
// single atomic `writeIntelligenceLedgers` (JSON + RECOMMENDATIONS.md re-render).
export async function runRecommendationArchive(
  root: string,
  id: string,
  reason: ArchiveReason,
): Promise<RecommendationTransitionResult> {
  const ledger = await readRecommendationLedger(root);
  const res = archiveRecommendation(ledger, id, reason, new Date());
  if (!res.ok) return res;
  const evidenceLedger = await readEvidenceLedger(root);
  await writeIntelligenceLedgers(root, res.ledger, evidenceLedger);
  return res;
}

export async function runRecommendationUnarchive(
  root: string,
  id: string,
): Promise<RecommendationTransitionResult> {
  const ledger = await readRecommendationLedger(root);
  const res = unarchiveRecommendation(ledger, id, new Date());
  if (!res.ok) return res;
  const evidenceLedger = await readEvidenceLedger(root);
  await writeIntelligenceLedgers(root, res.ledger, evidenceLedger);
  return res;
}
