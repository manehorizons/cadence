import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { renderRecommendationsMd } from './render.js';

const INTELLIGENCE_DIR = '.cadence/intelligence';
const RECOMMENDATIONS_JSON = 'recommendations.json';
const RECOMMENDATIONS_MD = 'RECOMMENDATIONS.md';

export type RecommendationPriority = 'low' | 'medium' | 'high' | 'critical';
export type RecommendationReadiness =
  | 'raw-idea'
  | 'needs-evidence'
  | 'needs-decision'
  | 'ready-for-milestone'
  | 'ready-for-cadence-spec'
  | 'blocked';

export type Recommendation = {
  id: string;
  title: string;
  summary: string;
  source: 'manual' | 'code-analysis' | 'impact' | 'cadence' | 'session';
  status: 'candidate' | 'accepted' | 'deferred' | 'rejected' | 'converted';
  readiness: RecommendationReadiness;
  priority: RecommendationPriority;
  leverageScore: number;
  riskScore: number;
  confidence: number;
  decayState: 'fresh' | 'aging' | 'stale' | 'superseded' | 'contradicted' | 'needs-revalidation';
  affectedAreas: string[];
  affectedFiles: string[];
  suggestedMilestoneId?: string;
  suggestedBackendAction?: string;
  evidenceIds: string[];
  assumptionIds: string[];
  decisionIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type RecommendationLedger = {
  schemaVersion: 1;
  recommendations: Recommendation[];
};

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

function emptyRecommendationLedger(): RecommendationLedger {
  return { schemaVersion: 1, recommendations: [] };
}

function parseRecommendationLedger(value: unknown): RecommendationLedger {
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((value as { recommendations?: unknown }).recommendations)
  ) {
    throw new Error('Invalid recommendation ledger');
  }
  return value as RecommendationLedger;
}

export async function readRecommendationLedger(root: string): Promise<RecommendationLedger> {
  const path = recommendationsPath(root);
  if (!existsSync(path)) return emptyRecommendationLedger();
  const raw = await readFile(path, 'utf8');
  return parseRecommendationLedger(JSON.parse(raw));
}

async function writeRecommendationLedger(root: string, ledger: RecommendationLedger): Promise<void> {
  const dir = intelligenceDir(root);
  await mkdir(dir, { recursive: true });
  parseRecommendationLedger(ledger);
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
