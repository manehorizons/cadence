import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  EvidenceLedgerZ,
  MilestoneLedgerZ,
  RecommendationLedgerZ,
  emptyEvidenceLedger,
  emptyMilestoneLedger,
  emptyRecommendationLedger,
  type Evidence,
  type EvidenceLedger,
  type MilestoneLedger,
  type Recommendation,
  type RecommendationLedger,
  type RecommendationPriority,
  type RecommendationReadiness,
} from '@cadence/types';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { renderRecommendationsMd } from './render.js';
import { renderMilestonesMd } from './render-milestone.js';

const INTELLIGENCE_DIR = '.cadence/intelligence';
const RECOMMENDATIONS_JSON = 'recommendations.json';
const EVIDENCE_JSON = 'evidence.json';
const RECOMMENDATIONS_MD = 'RECOMMENDATIONS.md';

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

function recommendationsMdPath(root: string): string {
  return join(intelligenceDir(root), RECOMMENDATIONS_MD);
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
