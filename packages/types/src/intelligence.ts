import { z } from 'zod';

export const RecommendationSourceZ = z.enum([
  'manual',
  'code-analysis',
  'impact',
  'cadence',
  'session',
]);
export type RecommendationSource = z.infer<typeof RecommendationSourceZ>;

export const RecommendationStatusZ = z.enum([
  'candidate',
  'accepted',
  'deferred',
  'rejected',
  'converted',
]);
export type RecommendationStatus = z.infer<typeof RecommendationStatusZ>;

export const RecommendationReadinessZ = z.enum([
  'raw-idea',
  'needs-evidence',
  'needs-decision',
  'ready-for-milestone',
  'ready-for-cadence-spec',
  'blocked',
]);
export type RecommendationReadiness = z.infer<typeof RecommendationReadinessZ>;

export const RecommendationPriorityZ = z.enum(['low', 'medium', 'high', 'critical']);
export type RecommendationPriority = z.infer<typeof RecommendationPriorityZ>;

export const RecommendationDecayStateZ = z.enum([
  'fresh',
  'aging',
  'stale',
  'superseded',
  'contradicted',
  'needs-revalidation',
]);
export type RecommendationDecayState = z.infer<typeof RecommendationDecayStateZ>;

export const RecommendationZ = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  source: RecommendationSourceZ,
  status: RecommendationStatusZ,
  readiness: RecommendationReadinessZ,
  priority: RecommendationPriorityZ,
  leverageScore: z.number().min(0).max(10),
  riskScore: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1),
  decayState: RecommendationDecayStateZ,
  affectedAreas: z.array(z.string()),
  affectedFiles: z.array(z.string()),
  suggestedMilestoneId: z.string().optional(),
  suggestedBackendAction: z.string().optional(),
  evidenceIds: z.array(z.string()),
  assumptionIds: z.array(z.string()),
  decisionIds: z.array(z.string()),
  // Slice 34.1: exact-optional FK to the CADENCE phase this rec was converted
  // into. Set only by `cadence recommendation convert`; never auto-derived.
  convertedToPhaseId: z.string().optional(),
  // Phase 61: optional grouping key linking the N recs landed by one
  // `/cadence-scout` session. Loose validation (non-empty string); the
  // `scout-YYYYMMDD-HHMM` convention lives in the scout prompt + docs, not here.
  scoutId: z.string().min(1).optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Recommendation = z.infer<typeof RecommendationZ>;

export const EvidenceZ = z.object({
  id: z.string().min(1),
  recommendationId: z.string().min(1),
  kind: z.enum(['file', 'command', 'cadence-artifact', 'note']),
  summary: z.string().min(1),
  path: z.string().optional(),
  command: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
});
export type Evidence = z.infer<typeof EvidenceZ>;

export const AssumptionZ = z.object({
  id: z.string().min(1),
  recommendationId: z.string().min(1),
  text: z.string().min(1),
  status: z.enum(['open', 'validated', 'rejected']),
  createdAt: z.string().datetime({ offset: true }),
});
export type Assumption = z.infer<typeof AssumptionZ>;

// Slice 31: `supersedes` is a derived inverse-link array. Always present
// (default []), recomputed on every write via deriveDecisionInverseLinks.
// Operators never set this directly; the supersession edge is owned by
// `supersededBy` (Slice 28).
export const IntelligenceDecisionZ = z.object({
  id: z.string().min(1),
  recommendationId: z.string().optional(),
  title: z.string().min(1),
  rationale: z.string().min(1),
  status: z.enum(['active', 'superseded', 'rescinded']).default('active'),
  decidedAt: z.string().datetime({ offset: true }),
  supersededBy: z.string().optional(),
  supersedes: z.array(z.string()).default([]),
});
export type IntelligenceDecision = z.infer<typeof IntelligenceDecisionZ>;

export const RecommendationLedgerZ = z.object({
  schemaVersion: z.literal(1),
  recommendations: z.array(RecommendationZ),
});
export type RecommendationLedger = z.infer<typeof RecommendationLedgerZ>;

export const EvidenceLedgerZ = z.object({
  schemaVersion: z.literal(1),
  evidence: z.array(EvidenceZ),
});
export type EvidenceLedger = z.infer<typeof EvidenceLedgerZ>;

export const AssumptionLedgerZ = z.object({
  schemaVersion: z.literal(1),
  assumptions: z.array(AssumptionZ),
});
export type AssumptionLedger = z.infer<typeof AssumptionLedgerZ>;

export const IntelligenceDecisionLedgerZ = z.object({
  schemaVersion: z.literal(1),
  decisions: z.array(IntelligenceDecisionZ),
});
export type IntelligenceDecisionLedger = z.infer<typeof IntelligenceDecisionLedgerZ>;

export function emptyRecommendationLedger(): RecommendationLedger {
  return { schemaVersion: 1, recommendations: [] };
}

export function emptyEvidenceLedger(): EvidenceLedger {
  return { schemaVersion: 1, evidence: [] };
}

export function emptyAssumptionLedger(): AssumptionLedger {
  return { schemaVersion: 1, assumptions: [] };
}

export function emptyIntelligenceDecisionLedger(): IntelligenceDecisionLedger {
  return { schemaVersion: 1, decisions: [] };
}

export const RepoScanZ = z.object({
  git: z.object({
    available: z.boolean(),
    branch: z.string().optional(),
    dirty: z.boolean().optional(),
    ahead: z.number().int().optional(),
    behind: z.number().int().optional(),
    recentCommits: z.array(z.string()).optional(),
  }),
  pkg: z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    workspaces: z.boolean().optional(),
    scripts: z.object({
      test: z.boolean().optional(),
      build: z.boolean().optional(),
      lint: z.boolean().optional(),
      typecheck: z.boolean().optional(),
    }),
  }),
  docs: z.object({
    readme: z.boolean(),
    design: z.boolean(),
    roadmap: z.boolean(),
    changelog: z.boolean(),
    docsDir: z.boolean(),
  }),
  surfaces: z.object({ turbo: z.boolean() }),
  phases: z.object({ count: z.number().int(), latestId: z.string().optional() }),
});
export type RepoScan = z.infer<typeof RepoScanZ>;

export const BackendStatusZ = z.object({
  present: z.boolean(),
  kind: z.literal('cadence').nullable(),
  loopPosition: z.string().optional(),
  activePhase: z.string().nullable().optional(),
  activeDraft: z.string().nullable().optional(),
  activeSpec: z.string().nullable().optional(),
  profile: z.string().optional(),
  tier: z.string().nullable().optional(),
  legalActions: z.array(z.string()),
  artifacts: z
    .object({
      phaseCount: z.number().int(),
      roadmap: z.boolean(),
      state: z.boolean(),
      milestones: z.boolean(),
    })
    .optional(),
  stateError: z.string().optional(),
});
export type BackendStatus = z.infer<typeof BackendStatusZ>;

export const InspectionFlagCodeZ = z.enum([
  'git-dirty-or-diverged',
  'loop-state-inconsistent',
  'ledger-decay',
  'docs-missing',
]);
export type InspectionFlagCode = z.infer<typeof InspectionFlagCodeZ>;

export const InspectionFlagZ = z.object({
  code: InspectionFlagCodeZ,
  severity: z.enum(['info', 'warn']),
  message: z.string().min(1),
  evidence: z.string().optional(),
});
export type InspectionFlag = z.infer<typeof InspectionFlagZ>;

export const InspectionZ = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  repo: RepoScanZ,
  backend: BackendStatusZ,
  ledger: z.object({
    recommendations: z.number().int(),
    byDecay: z.record(z.string(), z.number().int()),
    evidence: z.number().int(),
  }),
  flags: z.array(InspectionFlagZ),
});
export type Inspection = z.infer<typeof InspectionZ>;

export const ScoreTermZ = z.object({
  label: z.string().min(1),
  value: z.number(),
});
export type ScoreTerm = z.infer<typeof ScoreTermZ>;

export const RecommendationRankZ = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  raw: z.number(),
  score: z.number().int().min(0).max(100),
  status: RecommendationStatusZ,
  readiness: RecommendationReadinessZ,
  priority: RecommendationPriorityZ,
  decayState: RecommendationDecayStateZ,
  terms: z.array(ScoreTermZ),
  suggestedBackendAction: z.string().optional(),
  // Phase 61: carried through from the recommendation so the report renderer
  // can show a `scout:` line and the `--scout-id` filter can scope the view.
  scoutId: z.string().min(1).optional(),
});
export type RecommendationRank = z.infer<typeof RecommendationRankZ>;

export const RecommendationAdvisoryZ = z.object({
  kind: z.enum(['finish-loop', 'top-recommendation', 'spec-new', 'empty']),
  primary: z.string().min(1),
  secondary: z.string().optional(),
});
export type RecommendationAdvisory = z.infer<typeof RecommendationAdvisoryZ>;

export const RecommendationReportZ = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  ranked: z.array(RecommendationRankZ),
  parked: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      status: RecommendationStatusZ,
      readiness: RecommendationReadinessZ,
    }),
  ),
  needsAttention: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      decayState: RecommendationDecayStateZ,
    }),
  ),
  advisory: RecommendationAdvisoryZ,
  totals: z.object({
    total: z.number().int(),
    ranked: z.number().int(),
    parked: z.number().int(),
    needsAttention: z.number().int(),
    excluded: z.number().int(),
  }),
});
export type RecommendationReport = z.infer<typeof RecommendationReportZ>;

export const MilestoneStatusZ = z.enum([
  'proposed',
  'accepted',
  'exported',
  'deferred',
  'closed',
]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusZ>;

export const MilestonePreMortemZ = z.object({
  likelyFailureModes: z.array(z.string()),
  hiddenDependencies: z.array(z.string()),
  driftRisks: z.array(z.string()),
  outOfScope: z.array(z.string()),
});
export type MilestonePreMortem = z.infer<typeof MilestonePreMortemZ>;

export const IntelligenceMilestoneZ = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objective: z.string().min(1),
  status: MilestoneStatusZ,
  recommendationIds: z.array(z.string().min(1)).min(1),
  preMortem: MilestonePreMortemZ,
  exportTargets: z.array(
    z.object({
      backend: z.literal('cadence'),
      artifactPath: z.string(),
      exportedAt: z.string().datetime({ offset: true }),
    }),
  ),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type IntelligenceMilestone = z.infer<typeof IntelligenceMilestoneZ>;

export const MilestoneLedgerZ = z.object({
  schemaVersion: z.literal(1),
  milestones: z.array(IntelligenceMilestoneZ),
});
export type MilestoneLedger = z.infer<typeof MilestoneLedgerZ>;

export function emptyMilestoneLedger(): MilestoneLedger {
  return { schemaVersion: 1, milestones: [] };
}

export const ContextScopeZ = z.enum(['phase', 'handoff', 'review', 'agent']);
export type ContextScope = z.infer<typeof ContextScopeZ>;

export const ContextRecZ = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  score: z.number().int(),
  status: RecommendationStatusZ,
  readiness: RecommendationReadinessZ,
  priority: RecommendationPriorityZ,
  suggestedBackendAction: z.string().optional(),
});
export type ContextRec = z.infer<typeof ContextRecZ>;

export const ContextPacketZ = z.object({
  schemaVersion: z.literal(1),
  scope: ContextScopeZ,
  generatedAt: z.string().datetime({ offset: true }),
  loop: z.object({
    present: z.boolean(),
    loopPosition: z.string().optional(),
    activePhase: z.string().nullable().optional(),
    activeDraft: z.string().nullable().optional(),
    activeSpec: z.string().nullable().optional(),
    tier: z.string().nullable().optional(),
    nextAction: z.string().optional(),
    stateError: z.string().optional(),
  }),
  recommendations: z.array(ContextRecZ),
  assumptions: z.array(
    z.object({
      id: z.string().min(1),
      recommendationId: z.string().min(1),
      text: z.string().min(1),
      status: z.literal('open'),
    }),
  ),
  decisions: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      rationale: z.string().min(1),
      recommendationId: z.string().optional(),
      status: z.literal('active'),
    }),
  ),
  files: z.array(
    z.object({
      path: z.string().min(1),
      why: z.string().min(1),
    }),
  ),
  needsAttention: z.array(ContextRecZ).optional(),
  totals: z.object({
    recommendations: z.number().int(),
    assumptions: z.number().int(),
    decisions: z.number().int(),
    files: z.number().int(),
    recommendationsOmitted: z.number().int(),
  }),
});
export type ContextPacket = z.infer<typeof ContextPacketZ>;

// Slice 29: `cadence decision graph <id>` output shapes.
// Pure output types — no Zod schemas (these are not persisted).
//
// `cycle: true` is exact-optional: set only when the walker truncated
// because the node had already been visited on the current path.
// `missingId` appears only on forward (descendant) links where the
// `supersededBy` field references an id absent from the ledger.

export type DecisionAncestor = {
  decision: IntelligenceDecision;
  ancestors: DecisionAncestor[];
  cycle?: true;
};

export type DecisionDescendant =
  | { decision: IntelligenceDecision; cycle?: true }
  | { missingId: string };

export type DecisionGraph = {
  decision: IntelligenceDecision;
  ancestors: DecisionAncestor[];
  descendants: DecisionDescendant[];
};
