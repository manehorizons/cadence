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
        summary: input.evidenceSummary,
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
  if (!target) return { ok: false, error: `recommendation ${id} not found` };
  if (!RECOMMENDATION_TRANSITION_ALLOWED[action].includes(target.status)) {
    return {
      ok: false,
      error: `cannot ${action} recommendation in status ${target.status}`,
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
 * terminal. Phase 100 adds one sanctioned exception handled below:
 * `converted → shipped` (a converted phase that later shipped).
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
  if (!target) return { ok: false, error: `recommendation ${id} not found` };
  if (changes.status === undefined && changes.readiness === undefined) {
    return {
      ok: false,
      error: 'nothing to promote: provide --status and/or --readiness',
    };
  }
  if (changes.status === 'converted') {
    return {
      ok: false,
      error:
        'cannot promote to converted — use `cadence recommendation convert` (it sets the phase link)',
    };
  }
  if (changes.status === 'settle-pending') {
    return {
      ok: false,
      error:
        'cannot promote to settle-pending — it is set automatically when a converted recommendation\'s phase settles',
    };
  }
  // Phase 100: `--ref` provenance is meaningful only for the shipped status.
  if (changes.shippedRef !== undefined && changes.status !== 'shipped') {
    return {
      ok: false,
      error: 'shippedRef (--ref) is only valid when promoting to shipped',
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
    return {
      ok: false,
      error: `cannot promote recommendation in terminal status ${target.status}`,
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
    return { ok: false, error: `recommendation ${id} not found in active recommendations` };
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
    return { ok: false, error: `recommendation ${id} not found in archived recommendations` };
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
    return { ok: false, error: `cannot convert: phase ${toPhase} not found` };
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
