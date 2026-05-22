import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  AssumptionLedgerZ,
  EvidenceLedgerZ,
  IntelligenceDecisionLedgerZ,
  MilestoneLedgerZ,
  RecommendationLedgerZ,
  emptyAssumptionLedger,
  emptyEvidenceLedger,
  emptyIntelligenceDecisionLedger,
  emptyMilestoneLedger,
  emptyRecommendationLedger,
  type Assumption,
  type AssumptionLedger,
  type Evidence,
  type EvidenceLedger,
  type IntelligenceDecision,
  type IntelligenceDecisionLedger,
  type MilestoneLedger,
  type Recommendation,
  type RecommendationLedger,
  type RecommendationPriority,
  type RecommendationReadiness,
} from '@cadence/types';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { renderRecommendationsMd } from './render.js';
import { renderMilestonesMd } from './render-milestone.js';
import { renderAssumptionsMd } from './render-assumption.js';
import { renderDecisionsMd } from './render-decision.js';

const INTELLIGENCE_DIR = '.cadence/intelligence';
const RECOMMENDATIONS_JSON = 'recommendations.json';
const EVIDENCE_JSON = 'evidence.json';
const RECOMMENDATIONS_MD = 'RECOMMENDATIONS.md';
const ASSUMPTIONS_JSON = 'assumptions.json';
const DECISIONS_JSON = 'decisions.json';
const ASSUMPTIONS_MD = 'ASSUMPTIONS.md';
const DECISIONS_MD = 'DECISIONS.md';

export type AddRecommendationInput = {
  title: string;
  summary: string;
  priority: RecommendationPriority;
  readiness: RecommendationReadiness;
  affectedAreas: string[];
  affectedFiles: string[];
  evidenceSummary?: string;
};

export function intelligenceDir(root: string): string {
  return join(root, INTELLIGENCE_DIR);
}

function recommendationsPath(root: string): string {
  return join(intelligenceDir(root), RECOMMENDATIONS_JSON);
}

function evidencePath(root: string): string {
  return join(intelligenceDir(root), EVIDENCE_JSON);
}

function assumptionsPath(root: string): string {
  return join(intelligenceDir(root), ASSUMPTIONS_JSON);
}

function decisionsPath(root: string): string {
  return join(intelligenceDir(root), DECISIONS_JSON);
}

function recommendationsMdPath(root: string): string {
  return join(intelligenceDir(root), RECOMMENDATIONS_MD);
}

function assumptionsMdPath(root: string): string {
  return join(intelligenceDir(root), ASSUMPTIONS_MD);
}

function decisionsMdPath(root: string): string {
  return join(intelligenceDir(root), DECISIONS_MD);
}

export async function readRecommendationLedger(root: string): Promise<RecommendationLedger> {
  const path = recommendationsPath(root);
  if (!existsSync(path)) return emptyRecommendationLedger();
  const raw = await readFile(path, 'utf8');
  return RecommendationLedgerZ.parse(JSON.parse(raw));
}

export async function readEvidenceLedger(root: string): Promise<EvidenceLedger> {
  const path = evidencePath(root);
  if (!existsSync(path)) return emptyEvidenceLedger();
  const raw = await readFile(path, 'utf8');
  return EvidenceLedgerZ.parse(JSON.parse(raw));
}

export async function readAssumptionLedger(root: string): Promise<AssumptionLedger> {
  const path = assumptionsPath(root);
  if (!existsSync(path)) return emptyAssumptionLedger();
  const raw = await readFile(path, 'utf8');
  return AssumptionLedgerZ.parse(JSON.parse(raw));
}

export async function readIntelligenceDecisionLedger(
  root: string,
): Promise<IntelligenceDecisionLedger> {
  const path = decisionsPath(root);
  if (!existsSync(path)) return emptyIntelligenceDecisionLedger();
  const raw = await readFile(path, 'utf8');
  return IntelligenceDecisionLedgerZ.parse(JSON.parse(raw));
}

async function writeIntelligenceLedgers(
  root: string,
  ledger: RecommendationLedger,
  evidenceLedger: EvidenceLedger,
): Promise<void> {
  const dir = intelligenceDir(root);
  await mkdir(dir, { recursive: true });
  RecommendationLedgerZ.parse(ledger);
  EvidenceLedgerZ.parse(evidenceLedger);
  await atomicWriteJSON(recommendationsPath(root), ledger);
  await atomicWriteJSON(evidencePath(root), evidenceLedger);
  // Read sibling ledgers so the rec MD renders status-annotated link bullets (Slice 15).
  const asLedger = await readAssumptionLedger(root);
  const decLedger = await readIntelligenceDecisionLedger(root);
  await atomicWriteText(
    recommendationsMdPath(root),
    renderRecommendationsMd(ledger, evidenceLedger, asLedger, decLedger),
  );
}

function slugDate(now: Date): string {
  return now.toISOString().slice(0, 10).replaceAll('-', '');
}

function nextRecommendationId(ledger: RecommendationLedger, now: Date): string {
  const prefix = `rec-${slugDate(now)}-`;
  const max = ledger.recommendations
    .map((r) => r.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function nextEvidenceId(ledger: EvidenceLedger, now: Date): string {
  const prefix = `ev-${slugDate(now)}-`;
  const max = ledger.evidence
    .map((ev) => ev.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function nextAssumptionId(ledger: AssumptionLedger, now: Date): string {
  const prefix = `as-${slugDate(now)}-`;
  const max = ledger.assumptions
    .map((a) => a.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function nextIntelligenceDecisionId(
  ledger: IntelligenceDecisionLedger,
  now: Date,
): string {
  const prefix = `dec-${slugDate(now)}-`;
  const max = ledger.decisions
    .map((d) => d.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

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

export type AddAssumptionInput = {
  recommendationId: string;
  text: string;
};

async function writeAssumptionLedger(root: string, ledger: AssumptionLedger): Promise<void> {
  AssumptionLedgerZ.parse(ledger);
  await mkdir(intelligenceDir(root), { recursive: true });
  await atomicWriteJSON(assumptionsPath(root), ledger);
  await atomicWriteText(assumptionsMdPath(root), renderAssumptionsMd(ledger));
}

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

async function rerenderRecommendationsMdIfPresent(root: string): Promise<void> {
  if (!existsSync(recommendationsPath(root))) return;
  const recLedger = await readRecommendationLedger(root);
  const evLedger = await readEvidenceLedger(root);
  const asLedger = await readAssumptionLedger(root);
  const decLedger = await readIntelligenceDecisionLedger(root);
  await atomicWriteText(
    recommendationsMdPath(root),
    renderRecommendationsMd(recLedger, evLedger, asLedger, decLedger),
  );
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

export type AddIntelligenceDecisionInput = {
  recommendationId?: string;
  title: string;
  rationale: string;
};

async function writeIntelligenceDecisionLedger(
  root: string,
  ledger: IntelligenceDecisionLedger,
): Promise<void> {
  IntelligenceDecisionLedgerZ.parse(ledger);
  await mkdir(intelligenceDir(root), { recursive: true });
  await atomicWriteJSON(decisionsPath(root), ledger);
  await atomicWriteText(decisionsMdPath(root), renderDecisionsMd(ledger));
}

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
  const out: IntelligenceDecision = {
    id: nextIntelligenceDecisionId(decLedger, now),
    title: input.title,
    rationale: input.rationale,
    status: 'active',
    decidedAt: now.toISOString(),
  };
  if (input.recommendationId !== undefined) out.recommendationId = input.recommendationId;
  decLedger.decisions.push(out);
  await writeIntelligenceDecisionLedger(root, decLedger);
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
  return { ok: true, ledger: ledgerOut };
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

const MILESTONES_JSON = 'milestones.json';
const MILESTONES_MD = 'MILESTONES.md';

export type IntelligenceStats = {
  recommendations: {
    total: number;
    byStatus: Record<Recommendation['status'], number>;
    byReadiness: Record<Recommendation['readiness'], number>;
  };
  evidence: {
    total: number;
    byKind: Record<Evidence['kind'], number>;
  };
  assumptions: {
    total: number;
    byStatus: Record<Assumption['status'], number>;
  };
  decisions: {
    total: number;
    byStatus: Record<IntelligenceDecision['status'], number>;
    untied: number;
  };
  links: {
    brokenAssumptionLinks: number;
    brokenDecisionLinks: number;
    brokenEvidenceLinks: number;
  };
  perRec: Array<{
    id: string;
    title: string;
    status: Recommendation['status'];
    assumptionsByStatus: Record<Assumption['status'], number>;
    decisionsByStatus: Record<IntelligenceDecision['status'], number>;
    evidenceCount: number;
  }>;
};

const REC_STATUSES: Recommendation['status'][] = [
  'candidate',
  'accepted',
  'deferred',
  'rejected',
  'converted',
];
const REC_READINESSES: Recommendation['readiness'][] = [
  'raw-idea',
  'needs-evidence',
  'needs-decision',
  'ready-for-milestone',
  'ready-for-cadence-spec',
  'blocked',
];
const EV_KINDS: Evidence['kind'][] = ['file', 'command', 'cadence-artifact', 'note'];
const AS_STATUSES: Assumption['status'][] = ['open', 'validated', 'rejected'];
const DEC_STATUSES: IntelligenceDecision['status'][] = [
  'active',
  'superseded',
  'rescinded',
];

export function computeIntelligenceStats(
  recLedger: RecommendationLedger,
  evLedger: EvidenceLedger,
  asLedger: AssumptionLedger,
  decLedger: IntelligenceDecisionLedger,
): IntelligenceStats {
  const recByStatus = Object.fromEntries(
    REC_STATUSES.map((s) => [s, 0]),
  ) as Record<Recommendation['status'], number>;
  const recByReadiness = Object.fromEntries(
    REC_READINESSES.map((r) => [r, 0]),
  ) as Record<Recommendation['readiness'], number>;
  for (const r of recLedger.recommendations) {
    recByStatus[r.status]++;
    recByReadiness[r.readiness]++;
  }

  const evByKind = Object.fromEntries(
    EV_KINDS.map((k) => [k, 0]),
  ) as Record<Evidence['kind'], number>;
  for (const ev of evLedger.evidence) evByKind[ev.kind]++;

  const asByStatus = Object.fromEntries(
    AS_STATUSES.map((s) => [s, 0]),
  ) as Record<Assumption['status'], number>;
  for (const a of asLedger.assumptions) asByStatus[a.status]++;

  const decByStatus = Object.fromEntries(
    DEC_STATUSES.map((s) => [s, 0]),
  ) as Record<IntelligenceDecision['status'], number>;
  let decUntied = 0;
  for (const d of decLedger.decisions) {
    decByStatus[d.status]++;
    if (d.recommendationId === undefined) decUntied++;
  }

  const asById = new Map(asLedger.assumptions.map((a) => [a.id, a] as const));
  const decById = new Map(decLedger.decisions.map((d) => [d.id, d] as const));
  const evById = new Map(evLedger.evidence.map((e) => [e.id, e] as const));

  let brokenAssumptionLinks = 0;
  let brokenDecisionLinks = 0;
  let brokenEvidenceLinks = 0;
  for (const r of recLedger.recommendations) {
    for (const id of r.assumptionIds) if (!asById.has(id)) brokenAssumptionLinks++;
    for (const id of r.decisionIds) if (!decById.has(id)) brokenDecisionLinks++;
    for (const id of r.evidenceIds) if (!evById.has(id)) brokenEvidenceLinks++;
  }

  const perRec: IntelligenceStats['perRec'] = recLedger.recommendations.map((r) => {
    const ascount = Object.fromEntries(
      AS_STATUSES.map((s) => [s, 0]),
    ) as Record<Assumption['status'], number>;
    const dccount = Object.fromEntries(
      DEC_STATUSES.map((s) => [s, 0]),
    ) as Record<IntelligenceDecision['status'], number>;
    for (const id of r.assumptionIds) {
      const a = asById.get(id);
      if (a) ascount[a.status]++;
    }
    for (const id of r.decisionIds) {
      const d = decById.get(id);
      if (d) dccount[d.status]++;
    }
    let evCount = 0;
    for (const id of r.evidenceIds) if (evById.has(id)) evCount++;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      assumptionsByStatus: ascount,
      decisionsByStatus: dccount,
      evidenceCount: evCount,
    };
  });

  return {
    recommendations: {
      total: recLedger.recommendations.length,
      byStatus: recByStatus,
      byReadiness: recByReadiness,
    },
    evidence: { total: evLedger.evidence.length, byKind: evByKind },
    assumptions: {
      total: asLedger.assumptions.length,
      byStatus: asByStatus,
    },
    decisions: {
      total: decLedger.decisions.length,
      byStatus: decByStatus,
      untied: decUntied,
    },
    links: { brokenAssumptionLinks, brokenDecisionLinks, brokenEvidenceLinks },
    perRec,
  };
}

export type IntelligenceAuditFinding =
  | { kind: 'broken-assumption-link'; recId: string; assumptionId: string }
  | { kind: 'broken-decision-link'; recId: string; decisionId: string }
  | { kind: 'broken-evidence-link'; recId: string; evidenceId: string }
  | { kind: 'orphan-assumption'; assumptionId: string; missingRecId: string }
  | { kind: 'orphan-decision'; decisionId: string; missingRecId: string }
  | { kind: 'orphan-evidence'; evidenceId: string; missingRecId: string };

export type IntelligenceAuditReport = {
  findings: IntelligenceAuditFinding[];
  byKind: Record<IntelligenceAuditFinding['kind'], IntelligenceAuditFinding[]>;
};

const AUDIT_KINDS = [
  'broken-assumption-link',
  'broken-decision-link',
  'broken-evidence-link',
  'orphan-assumption',
  'orphan-decision',
  'orphan-evidence',
] as const;

export function computeIntelligenceAudit(
  recLedger: RecommendationLedger,
  evLedger: EvidenceLedger,
  asLedger: AssumptionLedger,
  decLedger: IntelligenceDecisionLedger,
): IntelligenceAuditReport {
  const findings: IntelligenceAuditFinding[] = [];
  const recIds = new Set(recLedger.recommendations.map((r) => r.id));
  const evIds = new Set(evLedger.evidence.map((e) => e.id));
  const asIds = new Set(asLedger.assumptions.map((a) => a.id));
  const decIds = new Set(decLedger.decisions.map((d) => d.id));

  for (const r of recLedger.recommendations) {
    for (const id of r.assumptionIds) {
      if (!asIds.has(id)) {
        findings.push({ kind: 'broken-assumption-link', recId: r.id, assumptionId: id });
      }
    }
    for (const id of r.decisionIds) {
      if (!decIds.has(id)) {
        findings.push({ kind: 'broken-decision-link', recId: r.id, decisionId: id });
      }
    }
    for (const id of r.evidenceIds) {
      if (!evIds.has(id)) {
        findings.push({ kind: 'broken-evidence-link', recId: r.id, evidenceId: id });
      }
    }
  }

  for (const a of asLedger.assumptions) {
    if (!recIds.has(a.recommendationId)) {
      findings.push({
        kind: 'orphan-assumption',
        assumptionId: a.id,
        missingRecId: a.recommendationId,
      });
    }
  }

  for (const d of decLedger.decisions) {
    if (d.recommendationId !== undefined && !recIds.has(d.recommendationId)) {
      findings.push({
        kind: 'orphan-decision',
        decisionId: d.id,
        missingRecId: d.recommendationId,
      });
    }
  }

  for (const ev of evLedger.evidence) {
    if (!recIds.has(ev.recommendationId)) {
      findings.push({
        kind: 'orphan-evidence',
        evidenceId: ev.id,
        missingRecId: ev.recommendationId,
      });
    }
  }

  const byKind = Object.fromEntries(
    AUDIT_KINDS.map((k) => [k, [] as IntelligenceAuditFinding[]]),
  ) as Record<IntelligenceAuditFinding['kind'], IntelligenceAuditFinding[]>;
  for (const f of findings) byKind[f.kind].push(f);

  return { findings, byKind };
}

export type IntelligenceReconcileResult = {
  present: boolean;
  recommendations: number;
  assumptions: number;
  decisions: number;
};

export async function runIntelligenceReconcile(
  root: string,
): Promise<IntelligenceReconcileResult> {
  const recExists = existsSync(recommendationsPath(root));
  const evExists = existsSync(evidencePath(root));
  const asExists = existsSync(assumptionsPath(root));
  const decExists = existsSync(decisionsPath(root));
  if (!recExists && !evExists && !asExists && !decExists) {
    return { present: false, recommendations: 0, assumptions: 0, decisions: 0 };
  }
  const recLedger = await readRecommendationLedger(root);
  const evLedger = await readEvidenceLedger(root);
  const asLedger = await readAssumptionLedger(root);
  const decLedger = await readIntelligenceDecisionLedger(root);
  // Re-derive rec link arrays from current subject ledgers (idempotent if already correct).
  const derivedRec = deriveRecommendationLinks(recLedger, asLedger, decLedger);
  // writeIntelligenceLedgers handles atomic JSON + RECOMMENDATIONS.md re-render (Slice 15 annotated form).
  await writeIntelligenceLedgers(root, derivedRec, evLedger);
  // Re-render subject MDs from current ledgers (source-of-truth JSON untouched).
  await mkdir(intelligenceDir(root), { recursive: true });
  await atomicWriteText(assumptionsMdPath(root), renderAssumptionsMd(asLedger));
  await atomicWriteText(decisionsMdPath(root), renderDecisionsMd(decLedger));
  return {
    present: true,
    recommendations: derivedRec.recommendations.length,
    assumptions: asLedger.assumptions.length,
    decisions: decLedger.decisions.length,
  };
}

function milestonesPath(root: string): string {
  return join(intelligenceDir(root), MILESTONES_JSON);
}


export async function readMilestoneLedger(
  root: string,
): Promise<MilestoneLedger> {
  const path = milestonesPath(root);
  if (!existsSync(path)) return emptyMilestoneLedger();
  const raw = await readFile(path, 'utf8');
  return MilestoneLedgerZ.parse(JSON.parse(raw));
}

export async function writeMilestoneLedger(
  root: string,
  ledger: MilestoneLedger,
): Promise<void> {
  const dir = intelligenceDir(root);
  await mkdir(dir, { recursive: true });
  MilestoneLedgerZ.parse(ledger);
  await atomicWriteJSON(join(dir, MILESTONES_JSON), ledger);
  await atomicWriteText(join(dir, MILESTONES_MD), renderMilestonesMd(ledger));
}
