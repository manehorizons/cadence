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
