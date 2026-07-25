import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { atomicWriteText } from '../../state/atomic-write.js';
import { renderAssumptionsMd } from '../render-assumption.js';
import { renderDecisionsMd } from '../render-decision.js';
import {
  assumptionsMdPath,
  assumptionsPath,
  decisionsMdPath,
  decisionsPath,
  evidencePath,
  intelligenceDir,
  milestonesPath,
  recommendationsPath,
} from './paths.js';
import {
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  writeIntelligenceDecisionLedger,
  writeIntelligenceLedgers,
} from './io.js';
import { readMilestoneLedger } from './milestones.js';
import { deriveRecommendationLinks } from './recommendations.js';
import { deriveDecisionInverseLinks } from './decisions.js';

export type IntelligenceReconcileResult = {
  present: boolean;
  recommendations: number;
  assumptions: number;
  decisions: number;
  milestones: number;
};

export async function runIntelligenceReconcile(
  root: string,
): Promise<IntelligenceReconcileResult> {
  const recExists = existsSync(recommendationsPath(root));
  const evExists = existsSync(evidencePath(root));
  const asExists = existsSync(assumptionsPath(root));
  const decExists = existsSync(decisionsPath(root));
  const milExists = existsSync(milestonesPath(root));
  if (!recExists && !evExists && !asExists && !decExists && !milExists) {
    return { present: false, recommendations: 0, assumptions: 0, decisions: 0, milestones: 0 };
  }
  const recLedger = await readRecommendationLedger(root);
  const evLedger = await readEvidenceLedger(root);
  const asLedger = await readAssumptionLedger(root);
  const decLedger = await readIntelligenceDecisionLedger(root);
  // Milestones have no derived link arrays to re-render — read-only here,
  // included solely for count parity with the other four subjects (AC-3).
  const milLedger = await readMilestoneLedger(root);
  // Re-derive rec link arrays from current subject ledgers (idempotent if already correct).
  const derivedRec = deriveRecommendationLinks(recLedger, asLedger, decLedger);
  // Slice 31: re-derive decision inverse-links (supersedes arrays) from
  // current supersededBy values. Idempotent. Operator's "force re-derive"
  // command fixes any drift introduced by manual JSON edits.
  const derivedDec = deriveDecisionInverseLinks(decLedger);
  // writeIntelligenceLedgers handles atomic JSON + RECOMMENDATIONS.md re-render (Slice 15 annotated form).
  await writeIntelligenceLedgers(root, derivedRec, evLedger);
  await writeIntelligenceDecisionLedger(root, derivedDec);
  // Re-render subject MDs from current ledgers (source-of-truth JSON untouched).
  await mkdir(intelligenceDir(root), { recursive: true });
  await atomicWriteText(assumptionsMdPath(root), renderAssumptionsMd(asLedger));
  await atomicWriteText(decisionsMdPath(root), renderDecisionsMd(derivedDec));
  return {
    present: true,
    recommendations: derivedRec.recommendations.length,
    assumptions: asLedger.assumptions.length,
    decisions: derivedDec.decisions.length,
    milestones: milLedger.milestones.length,
  };
}
