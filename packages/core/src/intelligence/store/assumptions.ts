import {
  type Assumption,
  type AssumptionLedger,
} from '@manehorizons/cadence-types';
import { nextAssumptionId } from './ids.js';
import {
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  rerenderRecommendationsMdIfPresent,
  writeAssumptionLedger,
  writeIntelligenceLedgers,
} from './io.js';
import { deriveRecommendationLinks } from './recommendations.js';

export type AddAssumptionInput = {
  recommendationId: string;
  text: string;
};

export async function addAssumption(
  root: string,
  input: AddAssumptionInput,
): Promise<Assumption> {
  const recLedger = await readRecommendationLedger(root);
  if (!recLedger.recommendations.some((r) => r.id === input.recommendationId)) {
    throw new Error(`unknown recommendation "${input.recommendationId}"`);
  }
  const asLedger = await readAssumptionLedger(root);
  const now = new Date();
  const a: Assumption = {
    id: nextAssumptionId(asLedger, now),
    recommendationId: input.recommendationId,
    text: input.text,
    status: 'open',
    createdAt: now.toISOString(),
  };
  asLedger.assumptions.push(a);
  await writeAssumptionLedger(root, asLedger);
  const decLedger = await readIntelligenceDecisionLedger(root);
  const evLedger = await readEvidenceLedger(root);
  const derivedRec = deriveRecommendationLinks(recLedger, asLedger, decLedger);
  await writeIntelligenceLedgers(root, derivedRec, evLedger);
  return a;
}

export type AssumptionTransitionAction = 'validate' | 'reject' | 'reopen';

export type AssumptionTransitionResult =
  | { ok: true; ledger: AssumptionLedger }
  | { ok: false; error: string };

const ASSUMPTION_TRANSITION_ALLOWED: Record<
  AssumptionTransitionAction,
  Assumption['status'][]
> = {
  validate: ['open'],
  reject: ['open'],
  reopen: ['validated', 'rejected'],
};

const ASSUMPTION_TRANSITION_NEXT: Record<
  AssumptionTransitionAction,
  Assumption['status']
> = {
  validate: 'validated',
  reject: 'rejected',
  reopen: 'open',
};

export function applyAssumptionTransition(
  ledger: AssumptionLedger,
  id: string,
  action: AssumptionTransitionAction,
  _now?: Date,
): AssumptionTransitionResult {
  const target = ledger.assumptions.find((a) => a.id === id);
  if (!target) return { ok: false, error: `assumption ${id} not found` };

  if (!ASSUMPTION_TRANSITION_ALLOWED[action].includes(target.status)) {
    return {
      ok: false,
      error: `cannot ${action} assumption in status ${target.status}`,
    };
  }

  const nextStatus: Assumption['status'] = ASSUMPTION_TRANSITION_NEXT[action];
  const ledgerOut: AssumptionLedger = {
    schemaVersion: 1,
    assumptions: ledger.assumptions.map((a) =>
      a.id === id ? { ...a, status: nextStatus } : a,
    ),
  };
  return { ok: true, ledger: ledgerOut };
}

export async function runAssumptionTransition(
  root: string,
  id: string,
  action: AssumptionTransitionAction,
): Promise<AssumptionTransitionResult> {
  const ledger = await readAssumptionLedger(root);
  const res = applyAssumptionTransition(ledger, id, action, new Date());
  if (!res.ok) return res;
  await writeAssumptionLedger(root, res.ledger);
  // Slice 15: propagate status change into RECOMMENDATIONS.md annotated bullets.
  await rerenderRecommendationsMdIfPresent(root);
  return res;
}
