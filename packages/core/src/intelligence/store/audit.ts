import {
  emptyMilestoneLedger,
  type AssumptionLedger,
  type EvidenceLedger,
  type IntelligenceDecisionLedger,
  type MilestoneLedger,
  type RecommendationLedger,
} from '@thomas-powers-jr/cadence-types';

export type IntelligenceAuditFinding =
  | { kind: 'broken-assumption-link'; recId: string; assumptionId: string }
  | { kind: 'broken-decision-link'; recId: string; decisionId: string }
  | { kind: 'broken-evidence-link'; recId: string; evidenceId: string }
  | { kind: 'orphan-assumption'; assumptionId: string; missingRecId: string }
  | { kind: 'orphan-decision'; decisionId: string; missingRecId: string }
  | { kind: 'orphan-evidence'; evidenceId: string; missingRecId: string }
  | { kind: 'stale-supersededby'; decisionId: string; missingTargetId: string }
  | { kind: 'stale-converted-phase'; recommendationId: string; missingPhaseId: string }
  | { kind: 'orphan-milestone'; milestoneId: string; missingRecId: string };

export type IntelligenceAuditReport = {
  findings: IntelligenceAuditFinding[];
  byKind: Record<IntelligenceAuditFinding['kind'], IntelligenceAuditFinding[]>;
};

export const AUDIT_KINDS = [
  'broken-assumption-link',
  'broken-decision-link',
  'broken-evidence-link',
  'orphan-assumption',
  'orphan-decision',
  'orphan-evidence',
  'stale-supersededby',
  'stale-converted-phase',
  'orphan-milestone',
] as const;

export type AuditKind = (typeof AUDIT_KINDS)[number];

export function computeIntelligenceAudit(
  recLedger: RecommendationLedger,
  evLedger: EvidenceLedger,
  asLedger: AssumptionLedger,
  decLedger: IntelligenceDecisionLedger,
  existingPhaseIds: Set<string> = new Set(),
  milestoneLedger: MilestoneLedger = emptyMilestoneLedger(),
): IntelligenceAuditReport {
  const findings: IntelligenceAuditFinding[] = [];
  const recIds = new Set(recLedger.recommendations.map((r) => r.id));
  const evIds = new Set(evLedger.evidence.map((e) => e.id));
  const asIds = new Set(asLedger.assumptions.map((a) => a.id));
  const decIds = new Set(decLedger.decisions.map((d) => d.id));
  // Archived recs are recoverable via `unarchive` — only a genuinely deleted
  // rec id (in neither array) makes a milestone reference orphan (AC-3).
  const archivedRecIds = new Set((recLedger.archived ?? []).map((r) => r.id));

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

  // Slice 30: stale supersededBy refs (decision.supersededBy points to a missing decision id).
  for (const d of decLedger.decisions) {
    if (d.supersededBy !== undefined && !decIds.has(d.supersededBy)) {
      findings.push({
        kind: 'stale-supersededby',
        decisionId: d.id,
        missingTargetId: d.supersededBy,
      });
    }
  }

  // Slice 34.2: stale convertedToPhaseId refs (rec converted to a phase that
  // no longer exists on disk). Phase existence is a filesystem fact; the
  // caller pre-computes the set so `computeIntelligenceAudit` stays pure-sync.
  for (const r of recLedger.recommendations) {
    if (r.convertedToPhaseId !== undefined && !existingPhaseIds.has(r.convertedToPhaseId)) {
      findings.push({
        kind: 'stale-converted-phase',
        recommendationId: r.id,
        missingPhaseId: r.convertedToPhaseId,
      });
    }
  }

  // Phase 220 AC-3: a milestone's recommendationIds[] entry missing from BOTH
  // the live and archived recommendation arrays is a broken reference.
  for (const m of milestoneLedger.milestones) {
    for (const id of m.recommendationIds) {
      if (!recIds.has(id) && !archivedRecIds.has(id)) {
        findings.push({ kind: 'orphan-milestone', milestoneId: m.id, missingRecId: id });
      }
    }
  }

  const byKind = Object.fromEntries(
    AUDIT_KINDS.map((k) => [k, [] as IntelligenceAuditFinding[]]),
  ) as Record<IntelligenceAuditFinding['kind'], IntelligenceAuditFinding[]>;
  for (const f of findings) byKind[f.kind].push(f);

  return { findings, byKind };
}
