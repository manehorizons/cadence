import type {
  Assumption,
  AssumptionLedger,
  Evidence,
  EvidenceLedger,
  IntelligenceDecision,
  IntelligenceDecisionLedger,
  MilestoneLedger,
  MilestoneStatus,
  Recommendation,
  RecommendationLedger,
} from '@thomas-powers-jr/cadence-types';
import { emptyMilestoneLedger, RecommendationStatusZ } from '@thomas-powers-jr/cadence-types';

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
  milestones: {
    total: number;
    byStatus: Record<MilestoneStatus, number>;
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

// Phase 145: derive from the schema instead of a hand-maintained list — this list
// had already silently missed 'shipped' (phase 100) before settle-pending was
// added; deriving it closes that class of drift for every future status too.
const REC_STATUSES: Recommendation['status'][] = [...RecommendationStatusZ.options];
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
const MIL_STATUSES: MilestoneStatus[] = [
  'proposed',
  'accepted',
  'exported',
  'deferred',
  'closed',
];

export function computeIntelligenceStats(
  recLedger: RecommendationLedger,
  evLedger: EvidenceLedger,
  asLedger: AssumptionLedger,
  decLedger: IntelligenceDecisionLedger,
  milestoneLedger: MilestoneLedger = emptyMilestoneLedger(),
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

  const milByStatus = Object.fromEntries(
    MIL_STATUSES.map((s) => [s, 0]),
  ) as Record<MilestoneStatus, number>;
  for (const m of milestoneLedger.milestones) milByStatus[m.status]++;

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
    milestones: {
      total: milestoneLedger.milestones.length,
      byStatus: milByStatus,
    },
    links: { brokenAssumptionLinks, brokenDecisionLinks, brokenEvidenceLinks },
    perRec,
  };
}
