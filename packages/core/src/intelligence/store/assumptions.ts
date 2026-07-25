import {
  AssumptionLedgerZ,
  emptyAssumptionLedger,
  type Assumption,
  type AssumptionLedger,
} from '@manehorizons/cadence-types';
import { atomicWriteText } from '../../state/atomic-write.js';
import { renderAssumptionsMd } from '../render-assumption.js';
import { readLedger, writeLedger, type SubjectLedgerSpec } from './ledger.js';
import { nextAssumptionId } from './ids.js';
import { assumptionsMdPath, assumptionsPath } from './paths.js';
import {
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  rerenderRecommendationsMdIfPresent,
  writeIntelligenceLedgers,
} from './io.js';
import { deriveRecommendationLinks } from './recommendations.js';

// The assumption ledger's on-disk schema (packages/types/src/intelligence.ts)
// has no `archived` array — only recommendations soft-archives. `records()`
// maps that fixed-empty; `withRecords()` asserts nothing ever tries to smuggle
// archived records back in (nothing in this subject produces any).
export const assumptionLedgerSpec: SubjectLedgerSpec<Assumption, AssumptionLedger, Assumption['status']> = {
  parse: (data) => AssumptionLedgerZ.parse(data),
  empty: emptyAssumptionLedger,
  idPrefix: 'as',
  idOf: (a) => a.id,
  records: (ledger) => ({ live: ledger.assumptions, archived: [] }),
  withRecords: (ledger, records) => {
    if (records.archived.length !== 0) {
      throw new Error('assumption ledger has no archived array; refusing to drop non-empty archived records');
    }
    return { schemaVersion: 1, assumptions: records.live };
  },
};

// Exported (not just used internally) because these are the canonical
// read/write functions for this subject — `io.ts` re-exports them rather
// than keeping its own hand-rolled copies (phase 220 T4).
export async function readAssumptionLedger(root: string): Promise<AssumptionLedger> {
  return readLedger(assumptionLedgerSpec, assumptionsPath(root));
}

export async function writeAssumptionLedger(root: string, ledger: AssumptionLedger): Promise<void> {
  await writeLedger(assumptionLedgerSpec, assumptionsPath(root), ledger, { mode: 0o600 });
  await atomicWriteText(assumptionsMdPath(root), renderAssumptionsMd(ledger));
}

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
    id: nextAssumptionId(asLedger, now, recLedger),
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
