import {
  IntelligenceDecisionLedgerZ,
  emptyIntelligenceDecisionLedger,
  type IntelligenceDecision,
  type IntelligenceDecisionLedger,
  type RecommendationLedger,
} from '@thomas-powers-jr/cadence-types';
import { atomicWriteText } from '../../state/atomic-write.js';
import { renderDecisionsMd } from '../render-decision.js';
import { readLedger, writeLedger, type SubjectLedgerSpec } from './ledger.js';
import { nextIntelligenceDecisionId } from './ids.js';
import { decisionsMdPath, decisionsPath } from './paths.js';
import {
  readAssumptionLedger,
  readEvidenceLedger,
  readRecommendationLedger,
  rerenderRecommendationsMdIfPresent,
  writeIntelligenceLedgers,
} from './io.js';
import { deriveRecommendationLinks } from './recommendations.js';

// The decision ledger's on-disk schema (packages/types/src/intelligence.ts)
// has no `archived` array — only recommendations soft-archives. `records()`
// maps that fixed-empty; `withRecords()` asserts nothing ever tries to
// smuggle archived records back in (nothing in this subject produces any).
export const decisionLedgerSpec: SubjectLedgerSpec<
  IntelligenceDecision,
  IntelligenceDecisionLedger,
  IntelligenceDecision['status']
> = {
  parse: (data) => IntelligenceDecisionLedgerZ.parse(data),
  empty: emptyIntelligenceDecisionLedger,
  idPrefix: 'dec',
  idOf: (d) => d.id,
  records: (ledger) => ({ live: ledger.decisions, archived: [] }),
  withRecords: (ledger, records) => {
    if (records.archived.length !== 0) {
      throw new Error('decision ledger has no archived array; refusing to drop non-empty archived records');
    }
    return { schemaVersion: 1, decisions: records.live };
  },
};

// Exported (not just used internally) because these are the canonical
// read/write functions for this subject — `io.ts` re-exports them rather
// than keeping its own hand-rolled copies (phase 220 T4).
export async function readIntelligenceDecisionLedger(
  root: string,
): Promise<IntelligenceDecisionLedger> {
  return readLedger(decisionLedgerSpec, decisionsPath(root));
}

export async function writeIntelligenceDecisionLedger(
  root: string,
  ledger: IntelligenceDecisionLedger,
): Promise<void> {
  await writeLedger(decisionLedgerSpec, decisionsPath(root), ledger, { mode: 0o600 });
  await atomicWriteText(decisionsMdPath(root), renderDecisionsMd(ledger));
}

export type AddIntelligenceDecisionInput = {
  recommendationId?: string;
  title: string;
  rationale: string;
};

export async function addIntelligenceDecision(
  root: string,
  input: AddIntelligenceDecisionInput,
): Promise<IntelligenceDecision> {
  let recLedger: RecommendationLedger | null = null;
  if (input.recommendationId !== undefined) {
    recLedger = await readRecommendationLedger(root);
    if (!recLedger.recommendations.some((r) => r.id === input.recommendationId)) {
      throw new Error(`unknown recommendation "${input.recommendationId}"`);
    }
  }
  const decLedger = await readIntelligenceDecisionLedger(root);
  const now = new Date();
  // Construct in schema-declaration order so the persisted JSON property
  // order matches what `IntelligenceDecisionLedgerZ.parse(...)` would produce
  // on reconcile. Keeps byte-equality between addIntelligenceDecision writes
  // and reconcile writes (relied on by Slice-17 AC-6).
  const out: IntelligenceDecision = {
    id: nextIntelligenceDecisionId(decLedger, now, recLedger ?? undefined),
    ...(input.recommendationId !== undefined ? { recommendationId: input.recommendationId } : {}),
    title: input.title,
    rationale: input.rationale,
    status: 'active',
    decidedAt: now.toISOString(),
    supersedes: [],
  };
  decLedger.decisions.push(out);
  // Slice 31: re-derive supersedes arrays across the whole ledger. New
  // decisions can't be referenced by older ones yet, but pre-Slice-31
  // ledgers being loaded for the first time benefit from the field
  // being populated explicitly on write.
  const derivedDec = deriveDecisionInverseLinks(decLedger);
  await writeIntelligenceDecisionLedger(root, derivedDec);
  if (input.recommendationId !== undefined && recLedger !== null) {
    const asLedger = await readAssumptionLedger(root);
    const evLedger = await readEvidenceLedger(root);
    const derivedRec = deriveRecommendationLinks(recLedger, asLedger, decLedger);
    await writeIntelligenceLedgers(root, derivedRec, evLedger);
  }
  return out;
}

export type DecisionTransitionAction = 'supersede' | 'rescind' | 'reactivate';

export type DecisionTransitionResult =
  | { ok: true; ledger: IntelligenceDecisionLedger }
  | { ok: false; error: string };

const DECISION_TRANSITION_ALLOWED: Record<
  DecisionTransitionAction,
  IntelligenceDecision['status'][]
> = {
  supersede: ['active'],
  rescind: ['active'],
  reactivate: ['superseded', 'rescinded'],
};

const DECISION_TRANSITION_NEXT: Record<
  DecisionTransitionAction,
  IntelligenceDecision['status']
> = {
  supersede: 'superseded',
  rescind: 'rescinded',
  reactivate: 'active',
};

function walkSupersededByChain(
  ledger: IntelligenceDecisionLedger,
  startId: string,
  forbid: string,
): { ok: true; chain: string[] } | { ok: false; chain: string[] } {
  const chain: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = startId;
  while (cursor) {
    if (cursor === forbid) return { ok: false, chain };
    if (seen.has(cursor)) return { ok: true, chain };
    seen.add(cursor);
    chain.push(cursor);
    const node = ledger.decisions.find((d) => d.id === cursor);
    cursor = node?.supersededBy;
  }
  return { ok: true, chain };
}

// Slice 31: pure helper. For every decision D in the ledger, recompute
// D.supersedes from current supersededBy values — the inverse-link of
// Slice 28's edge. Mirrors Slice 11's deriveRecommendationLinks shape
// but operates within one ledger. Idempotent.
export function deriveDecisionInverseLinks(
  ledger: IntelligenceDecisionLedger,
): IntelligenceDecisionLedger {
  return {
    schemaVersion: 1,
    decisions: ledger.decisions.map((d) => ({
      ...d,
      supersedes: ledger.decisions
        .filter((other) => other.supersededBy === d.id)
        .map((other) => other.id),
    })),
  };
}

export function applyDecisionTransition(
  ledger: IntelligenceDecisionLedger,
  id: string,
  action: DecisionTransitionAction,
  by?: string,
  _now?: Date,
): DecisionTransitionResult {
  const target = ledger.decisions.find((d) => d.id === id);
  if (!target) return { ok: false, error: `decision ${id} not found` };

  if (!DECISION_TRANSITION_ALLOWED[action].includes(target.status)) {
    return {
      ok: false,
      error: `cannot ${action} decision in status ${target.status}`,
    };
  }

  if (action === 'supersede' && by !== undefined) {
    if (by === id) {
      return {
        ok: false,
        error: 'cannot supersede: decision cannot supersede itself',
      };
    }
    const replacement = ledger.decisions.find((d) => d.id === by);
    if (!replacement) {
      return {
        ok: false,
        error: `cannot supersede: decision ${by} not found`,
      };
    }
    const walk = walkSupersededByChain(ledger, by, id);
    if (!walk.ok) {
      return {
        ok: false,
        error: `cannot supersede: would create cycle (${[...walk.chain, id].join(' → ')})`,
      };
    }
  }

  const nextStatus: IntelligenceDecision['status'] =
    DECISION_TRANSITION_NEXT[action];
  const ledgerOut: IntelligenceDecisionLedger = {
    schemaVersion: 1,
    decisions: ledger.decisions.map((d) => {
      if (d.id !== id) return d;
      const updated: IntelligenceDecision = { ...d, status: nextStatus };
      if (action === 'supersede') {
        if (by !== undefined) updated.supersededBy = by;
      } else if (action === 'reactivate') {
        delete updated.supersededBy;
      }
      return updated;
    }),
  };
  // Slice 31: re-derive supersedes arrays so the returned ledger is fully
  // consistent (target's supersededBy update propagates to the replacement's
  // supersedes array, and reactivate-cleared targets drop out).
  return { ok: true, ledger: deriveDecisionInverseLinks(ledgerOut) };
}

export async function runDecisionTransition(
  root: string,
  id: string,
  action: DecisionTransitionAction,
  by?: string,
): Promise<DecisionTransitionResult> {
  const ledger = await readIntelligenceDecisionLedger(root);
  const res = applyDecisionTransition(ledger, id, action, by, new Date());
  if (!res.ok) return res;
  await writeIntelligenceDecisionLedger(root, res.ledger);
  // Slice 15: propagate status change into RECOMMENDATIONS.md annotated bullets.
  await rerenderRecommendationsMdIfPresent(root);
  return res;
}
