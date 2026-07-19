import type {
  AssumptionLedger,
  EvidenceLedger,
  IntelligenceDecisionLedger,
  RecommendationLedger,
} from '@manehorizons/cadence-types';

function slugDate(now: Date): string {
  return now.toISOString().slice(0, 10).replaceAll('-', '');
}

export function nextRecommendationId(ledger: RecommendationLedger, now: Date): string {
  const prefix = `rec-${slugDate(now)}-`;
  const max = ledger.recommendations
    .map((r) => r.id)
    .concat(ledger.archived.map((r) => r.id))
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function nextEvidenceId(ledger: EvidenceLedger, now: Date): string {
  const prefix = `ev-${slugDate(now)}-`;
  const max = ledger.evidence
    .map((ev) => ev.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function nextAssumptionId(ledger: AssumptionLedger, now: Date): string {
  const prefix = `as-${slugDate(now)}-`;
  const max = ledger.assumptions
    .map((a) => a.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function nextIntelligenceDecisionId(
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
