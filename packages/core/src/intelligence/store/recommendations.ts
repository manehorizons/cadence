import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type AssumptionLedger,
  type Evidence,
  type IntelligenceDecisionLedger,
  type Recommendation,
  type RecommendationLedger,
  type RecommendationPriority,
  type RecommendationReadiness,
  type RecommendationStatus,
} from '@manehorizons/cadence-types';
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
  // Phase 100: `--ref` provenance is meaningful only for the shipped status.
  if (changes.shippedRef !== undefined && changes.status !== 'shipped') {
    return {
      ok: false,
      error: 'shippedRef (--ref) is only valid when promoting to shipped',
    };
  }
  // Phase 100: `converted → shipped` is the sole transition out of an otherwise
  // terminal status (a converted phase whose work later landed).
  const convertedToShipped =
    changes.status === 'shipped' && target.status === 'converted';
  if (!PROMOTABLE_FROM.has(target.status) && !convertedToShipped) {
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
  };
  return { ok: true, ledger: ledgerOut };
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
  const ledger = await readRecommendationLedger(root);
  const res = applyRecommendationPromotion(ledger, id, changes, new Date());
  if (!res.ok) return res;
  const evidenceLedger = await readEvidenceLedger(root);
  await writeIntelligenceLedgers(root, res.ledger, evidenceLedger);
  return res;
}
