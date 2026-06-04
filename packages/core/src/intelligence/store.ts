// Barrel for the intelligence store (phase 54). Implementation lives in focused
// modules under `./store/`; this re-exports exactly the pre-split public surface
// so every `intelligence/store.js` import resolves unchanged. Internal helpers
// (paths, id gen, ledger writers) stay private.
export { intelligenceDir } from './store/paths.js';
export {
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
} from './store/io.js';

export {
  addRecommendation,
  applyRecommendationTransition,
  deriveRecommendationLinks,
  runRecommendationTransition,
} from './store/recommendations.js';
export type {
  AddRecommendationInput,
  RecommendationTransitionAction,
  RecommendationTransitionResult,
} from './store/recommendations.js';

export {
  addAssumption,
  applyAssumptionTransition,
  runAssumptionTransition,
} from './store/assumptions.js';
export type {
  AddAssumptionInput,
  AssumptionTransitionAction,
  AssumptionTransitionResult,
} from './store/assumptions.js';

export {
  addIntelligenceDecision,
  applyDecisionTransition,
  deriveDecisionInverseLinks,
  runDecisionTransition,
} from './store/decisions.js';
export type {
  AddIntelligenceDecisionInput,
  DecisionTransitionAction,
  DecisionTransitionResult,
} from './store/decisions.js';

export { computeIntelligenceStats } from './store/stats.js';
export type { IntelligenceStats } from './store/stats.js';
export { AUDIT_KINDS, computeIntelligenceAudit } from './store/audit.js';
export type {
  AuditKind,
  IntelligenceAuditFinding,
  IntelligenceAuditReport,
} from './store/audit.js';

export { runIntelligenceReconcile } from './store/reconcile.js';
export type { IntelligenceReconcileResult } from './store/reconcile.js';
export { readMilestoneLedger, writeMilestoneLedger } from './store/milestones.js';
