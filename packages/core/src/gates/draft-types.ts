import type {
  AnomalyEvent,
  CadenceConfig,
  CadenceState,
  Draft,
  GateSet,
} from '@manehorizons/cadence-types';
import type { CoherenceResult } from '../coherence/check.js';
import type { PlanReviewInput, PlanReviewResult } from '../verify/plan-review.js';
import type { Prompter } from '../verify/prompter.js';
import type { Interactivity } from './interactivity.js';
import type { ConvergenceSidecar, GateResult, IoPort } from './types.js';

/**
 * Draft-surface gate contract (Phase 39.7). Parallel to the settle
 * `SettleContext`/`GateImpl` but for gates that fire at `draft approve` time —
 * different inputs (a parsed DRAFT, no PROGRESS/SUMMARY/diff), different
 * collaborators. Reuses the shared `GateResult` shape from `./types.js`. The
 * draft command router owns context construction; gates reach git/verifier/
 * notifier/prompter/sidecar ONLY through these ports.
 */

/** The subset of `draft approve` flags the draft gates read. */
export interface DraftGateOpts {
  readonly allowAutoComplex?: boolean;
  /** commander's `--no-approve` → `approve === false` (bypass the manual gate). */
  readonly approve?: boolean;
  readonly allowPlanReviewFailure?: boolean;
}

/** Plan-review verifier port (Phase 39.7); lazily `selectPlanReviewVerifier`. */
export interface DraftVerifierPorts {
  readonly planReview: { verify(input: PlanReviewInput): Promise<PlanReviewResult> };
}

/** Notification collaborator for the draft gates. */
export interface DraftEmitPort {
  /** coherence-warn anomalies (Phase 23.2). The gate builds the events (it owns
   *  the `source` + timestamp); this wraps the selected notifier with the
   *  transport-fail stderr fallback. Membership gating is the gate's. */
  coherenceWarn(events: AnomalyEvent[]): Promise<void>;
  /** `auto-complex-override` anomaly (Phase 187 / T3): emitted when
   *  `--allow-auto-complex` bypasses the draft-approve soft cap (DESIGN.md
   *  §4 M2). Same transport-fail-tolerant wrapper as `coherenceWarn`;
   *  membership gating on `anomaly-notify` is the caller's. */
  autoComplexOverride(event: AnomalyEvent): Promise<void>;
  /** plan-review unconverged escalation anomaly (Phase 25.1 / 35.1). */
  planReviewUnconverged(info: {
    draftId: string;
    attempts: number;
    maxAttempts: number;
    findings: number;
    provider: string;
    model?: string;
    bypassed?: boolean;
  }): Promise<void>;
}

/**
 * Prompter collaborator for the manual approve gate (Phase 24.1). `create()`
 * builds the prompter (scripted via CADENCE_PROMPTER_SCRIPT, else StdinPrompter)
 * and may throw on a non-TTY — the gate turns that throw into a refusal with the
 * `manual-approve: …` message. The env/TTY construction policy lives in the
 * draft-side adapter.
 */
export interface DraftPrompterPort {
  create(): Prompter;
}

/** Everything a draft gate may read. Built once by the draft router. Readonly. */
export interface DraftGateContext {
  readonly cwd: string;
  readonly state: CadenceState;
  readonly draft: Draft;
  readonly config: CadenceConfig | null;
  readonly gateSet: GateSet;
  readonly phase: string;
  readonly id: string;
  readonly opts: DraftGateOpts;
  /** Phase 116: resolved non-TTY interactivity mode (`resolveInteractivity` over
   *  env + `process.stdin.isTTY`, computed by the draft-side adapter). `bypass`
   *  makes the manual approve gate auto-pass loudly instead of refusing on a
   *  non-TTY. Absent → treated as attempt-prompt (back-compat). */
  readonly interactivity?: Interactivity;
  /** Memoized `coherenceCheck(draft, state, projectMd)`; computed at most once
   *  per command so the blocker-refuse and warn-emit steps share one result. */
  coherence(): CoherenceResult;
  readonly verifiers: DraftVerifierPorts;
  readonly emit: DraftEmitPort;
  readonly prompter: DraftPrompterPort;
  /** Plan-review convergence sidecar (Phase 35.1) — `<id>-PLAN-REVIEW.json`. */
  readonly planReviewSidecar: ConvergenceSidecar;
  readonly io: IoPort;
}

export type DraftGateImpl = (ctx: DraftGateContext) => Promise<GateResult>;
