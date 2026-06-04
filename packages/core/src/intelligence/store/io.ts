import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  AssumptionLedgerZ,
  EvidenceLedgerZ,
  IntelligenceDecisionLedgerZ,
  RecommendationLedgerZ,
  emptyAssumptionLedger,
  emptyEvidenceLedger,
  emptyIntelligenceDecisionLedger,
  emptyRecommendationLedger,
  type AssumptionLedger,
  type EvidenceLedger,
  type IntelligenceDecisionLedger,
  type RecommendationLedger,
} from '@manehorizons/cadence-types';
import { atomicWriteJSON, atomicWriteText } from '../../state/atomic-write.js';
import { renderRecommendationsMd } from '../render.js';
import { renderAssumptionsMd } from '../render-assumption.js';
import { renderDecisionsMd } from '../render-decision.js';
import {
  assumptionsMdPath,
  assumptionsPath,
  decisionsMdPath,
  decisionsPath,
  evidencePath,
  intelligenceDir,
  recommendationsMdPath,
  recommendationsPath,
} from './paths.js';

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

export async function writeIntelligenceLedgers(
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

export async function writeAssumptionLedger(root: string, ledger: AssumptionLedger): Promise<void> {
  AssumptionLedgerZ.parse(ledger);
  await mkdir(intelligenceDir(root), { recursive: true });
  await atomicWriteJSON(assumptionsPath(root), ledger);
  await atomicWriteText(assumptionsMdPath(root), renderAssumptionsMd(ledger));
}

export async function writeIntelligenceDecisionLedger(
  root: string,
  ledger: IntelligenceDecisionLedger,
): Promise<void> {
  IntelligenceDecisionLedgerZ.parse(ledger);
  await mkdir(intelligenceDir(root), { recursive: true });
  await atomicWriteJSON(decisionsPath(root), ledger);
  await atomicWriteText(decisionsMdPath(root), renderDecisionsMd(ledger));
}

export async function rerenderRecommendationsMdIfPresent(root: string): Promise<void> {
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
