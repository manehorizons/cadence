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

export const IntelligenceDecisionZ = z.object({
  id: z.string().min(1),
  recommendationId: z.string().optional(),
  title: z.string().min(1),
  rationale: z.string().min(1),
  decidedAt: z.string().datetime({ offset: true }),
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
