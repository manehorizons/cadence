import { join } from 'node:path';

const INTELLIGENCE_DIR = '.cadence/intelligence';
const RECOMMENDATIONS_JSON = 'recommendations.json';
const EVIDENCE_JSON = 'evidence.json';
const RECOMMENDATIONS_MD = 'RECOMMENDATIONS.md';
const ASSUMPTIONS_JSON = 'assumptions.json';
const DECISIONS_JSON = 'decisions.json';
const ASSUMPTIONS_MD = 'ASSUMPTIONS.md';
const DECISIONS_MD = 'DECISIONS.md';
const MILESTONES_JSON = 'milestones.json';
const MILESTONES_MD = 'MILESTONES.md';

export function intelligenceDir(root: string): string {
  return join(root, INTELLIGENCE_DIR);
}

export function recommendationsPath(root: string): string {
  return join(intelligenceDir(root), RECOMMENDATIONS_JSON);
}

export function evidencePath(root: string): string {
  return join(intelligenceDir(root), EVIDENCE_JSON);
}

export function assumptionsPath(root: string): string {
  return join(intelligenceDir(root), ASSUMPTIONS_JSON);
}

export function decisionsPath(root: string): string {
  return join(intelligenceDir(root), DECISIONS_JSON);
}

export function recommendationsMdPath(root: string): string {
  return join(intelligenceDir(root), RECOMMENDATIONS_MD);
}

export function assumptionsMdPath(root: string): string {
  return join(intelligenceDir(root), ASSUMPTIONS_MD);
}

export function decisionsMdPath(root: string): string {
  return join(intelligenceDir(root), DECISIONS_MD);
}

export function milestonesPath(root: string): string {
  return join(intelligenceDir(root), MILESTONES_JSON);
}

export function milestonesMdPath(root: string): string {
  return join(intelligenceDir(root), MILESTONES_MD);
}
