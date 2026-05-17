import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  RecommendationLedgerZ,
  emptyRecommendationLedger,
  type Recommendation,
  type RecommendationLedger,
  type RecommendationPriority,
  type RecommendationReadiness,
} from '@cadence/types';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { renderRecommendationsMd } from './render.js';

const INTELLIGENCE_DIR = '.cadence/intelligence';
const RECOMMENDATIONS_JSON = 'recommendations.json';
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

function recommendationsMdPath(root: string): string {
  return join(intelligenceDir(root), RECOMMENDATIONS_MD);
}

export async function readRecommendationLedger(root: string): Promise<RecommendationLedger> {
  const path = recommendationsPath(root);
  if (!existsSync(path)) return emptyRecommendationLedger();
  const raw = await readFile(path, 'utf8');
  return RecommendationLedgerZ.parse(JSON.parse(raw));
}

async function writeRecommendationLedger(root: string, ledger: RecommendationLedger): Promise<void> {
  const dir = intelligenceDir(root);
  await mkdir(dir, { recursive: true });
  RecommendationLedgerZ.parse(ledger);
  await atomicWriteJSON(recommendationsPath(root), ledger);
  await atomicWriteText(recommendationsMdPath(root), renderRecommendationsMd(ledger));
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

export async function addRecommendation(
  root: string,
  input: AddRecommendationInput,
): Promise<Recommendation> {
  const ledger = await readRecommendationLedger(root);
  const now = new Date();
  const ts = now.toISOString();
  const rec: Recommendation = {
    id: nextRecommendationId(ledger, now),
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
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: ts,
    updatedAt: ts,
  };
  ledger.recommendations.push(rec);
  await writeRecommendationLedger(root, ledger);
  return rec;
}
