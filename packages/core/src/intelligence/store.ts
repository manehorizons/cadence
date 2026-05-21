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
  await atomicWriteText(recommendationsMdPath(root), renderRecommendationsMd(ledger, evidenceLedger));
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
  return res;
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

const MILESTONES_JSON = 'milestones.json';
const MILESTONES_MD = 'MILESTONES.md';

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
