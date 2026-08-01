/**
 * Phase 234 — the published kernel / verifier / consumer contract.
 *
 * The boundary this module names is not new: it has been ~80% built and
 * unnamed, spread across `VerifierPorts` (`gates/types.ts`),
 * `DraftVerifierPorts` (`gates/draft-types.ts`), `BuildVerifierPorts`
 * (`gates/build-types.ts`), and two ungoverned direct factory imports in
 * `services/spec-approve.ts`. This module states it once, generically, so
 * every verifier-backed gate is expressed against one contract and consumers
 * never reach into `verify/` internals.
 *
 * Layering: this sits ABOVE `verify/verifier-factory.ts`. That module owns
 * *which* provider (`mock` / `anthropic` / `local` / `host-cli`) a verifier
 * family resolves to; this module owns *what a verifier is allowed to be*
 * from the kernel's point of view. Nothing here duplicates the factory, and
 * nothing here is gate-specific: `VerifierPort` carries no per-gate branch,
 * no per-gate member, and no per-gate name. The only gate-shaped content is
 * the type re-export block at the bottom, which exists so a consumer imports
 * `contracts/` instead of `verify/`.
 */

import type { Finding as SummaryFinding } from '@manehorizons/cadence-types';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * The three roles the assurance boundary is drawn between (the fourth role in
 * the design, *client*, is anything driving CADENCE through the public CLI —
 * it has exactly the authority a human at a terminal has and therefore needs
 * no contract here).
 *
 * - `kernel`   — owns phase state, the evidence ladder, the refusal floor,
 *                assurance computation, the SUMMARY schema, and the exit
 *                code. Not pluggable: a component that can detect an unearned
 *                settle must not be uninstallable.
 * - `verifier` — may produce evidence and may vote refuse. May never produce
 *                pass.
 * - `consumer` — read-only over settled artifacts (Check Runs, SARIF,
 *                dashboards, devlogs). Observes after the fact, so it neither
 *                blocks nor passes.
 */
export const CONTRACT_ROLES = ['kernel', 'verifier', 'consumer'] as const;

/** One of the three roles in {@link CONTRACT_ROLES}. */
export type ContractRole = (typeof CONTRACT_ROLES)[number];

/**
 * The governing rule of the boundary — the *pass* asymmetry, which is the half
 * that holds universally: approval is not delegable.
 *
 * Blocking authority is deliberately NOT stated here as a universal, because
 * it is not one: it is a per-role property (see `canBlock` below). A verifier
 * may refuse; a consumer, being read-only over already-settled artifacts, has
 * nothing left to refuse. What every plugin shares is the inability to call
 * green.
 */
export const GOVERNING_RULE =
  'no plugin can pass — only the kernel calls green; refusal authority is per-role';

/** The authority one role holds. Data, so the rule is assertable, not prose. */
export interface RoleAuthority {
  readonly role: ContractRole;
  /** Can an implementation of this role be swapped/installed by a consumer? */
  readonly pluggable: boolean;
  /**
   * May this role refuse — i.e. turn a settle/approve into a refusal? True for
   * the kernel and for verifiers (which act while the verdict is still open),
   * false for consumers (which only observe settled artifacts). Anything that
   * may pass may also block; the converse does not hold.
   */
  readonly canBlock: boolean;
  /** May this role call green? True for the kernel and nothing else. */
  readonly canPass: boolean;
}

/**
 * The authority table. Every pluggable role has `canPass: false` — that is
 * {@link GOVERNING_RULE} stated as data rather than as a comment, and it is
 * what a new role has to satisfy to be added here.
 */
export const ROLE_AUTHORITY: Readonly<Record<ContractRole, RoleAuthority>> = {
  kernel: { role: 'kernel', pluggable: false, canBlock: true, canPass: true },
  verifier: { role: 'verifier', pluggable: true, canBlock: true, canPass: false },
  consumer: { role: 'consumer', pluggable: true, canBlock: false, canPass: false },
};

// ---------------------------------------------------------------------------
// The verifier port
// ---------------------------------------------------------------------------

/**
 * Per-call options every verifier may accept and must tolerate being omitted.
 * Optional on the port rather than per family: of the seven verifier-backed
 * gates, only `security-audit`'s port threaded a `traceId`/`AbortSignal`
 * before Phase 234 (Phase 184) — every other port, `deep-verify` included,
 * was declared arity-1 and its call sites still pass a single argument
 * (`gates/deep-verify.ts`). Note the distinction: the underlying `Verifier`
 * interface backing `deep-verify` (`verify/verifier.ts`) does accept `opts`,
 * but the injected *port* did not expose it. Putting `opts?` here rather than
 * on individual families is what lets one shape cover all seven — a
 * narrower-arity implementation is assignable to the wider signature, so this
 * is one contract, not a special case.
 */
export interface VerifierCallOptions {
  /** External cancellation for providers that do I/O. */
  readonly signal?: AbortSignal;
  /** Per-run correlation id for logging. */
  readonly traceId?: string;
}

/**
 * The published verifier contract: one input in, one result out, async, with
 * optional per-call options.
 *
 * `I` and `R` are the family's own published input/result types (re-exported
 * below). Every verifier-backed gate — `deep-verify`, `code-review`,
 * `security-audit`, `plan-review`, `per-task-verify`, `spec-review`,
 * `ui-spec-review` — is `VerifierPort<I, R>` at some `I`/`R`, with nothing
 * added and nothing removed.
 *
 * A port deliberately does NOT carry `name`: the gate-side ports drop it, and
 * verifier identity reaches the SUMMARY through the result's `provider`/
 * `model` fields, not through the port surface. Use
 * {@link NamedVerifierPort} where a resolved implementation is meant.
 */
export interface VerifierPort<I, R> {
  verify(input: I, opts?: VerifierCallOptions): Promise<R>;
}

/**
 * A resolved verifier implementation — a port that also identifies itself.
 * Every family's interface is one of these; the factories return them, and the
 * kernel injects them as bare {@link VerifierPort}s. All seven are re-exported
 * below ({@link Verifier}, {@link CodeReviewVerifier},
 * {@link SecurityAuditVerifier}, {@link PlanReviewVerifier},
 * {@link PerTaskVerifier}, {@link SpecReviewVerifier},
 * {@link UiSpecReviewVerifier}), so naming one never requires importing a
 * `verify/` module.
 */
export interface NamedVerifierPort<I, R> extends VerifierPort<I, R> {
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Published verifier types
//
// Re-exported so a consumer never imports `../verify/*` for a type. Each
// family publishes its input, its result, every type reachable from that
// result (findings, severities, verdicts, usage), and its own interface — a
// consumer that can name a result must be able to name what is inside it, or
// the module fails its purpose. The contract itself stays generic over these.
// ---------------------------------------------------------------------------

/** deep-verify. */
export type {
  AcVerdict,
  Verifier,
  VerifyAc,
  VerifyInput,
  VerifyResult,
  VerifyTestRef,
  VerifyUsage,
} from '../verify/verifier.js';

/** code-review. Phase 236 (T5, D9) converged code-review's `Finding` onto the
 *  shared, persisted SUMMARY-schema `Finding` from `@manehorizons/cadence-types`
 *  (severity `critical|high|medium|low`) — it no longer declares its own
 *  divergent 3-severity type. `CodeReviewFinding`/`CodeReviewFindingSeverity`
 *  are kept as republished aliases of that same shared type, purely for
 *  backward name-compat with existing consumers (`gates/types.ts`,
 *  `notify/code-review.ts`); new code may import `Finding` directly from
 *  `@manehorizons/cadence-types` instead. */
export type {
  CodeReviewInput,
  CodeReviewResult,
  CodeReviewTaskRef,
  CodeReviewVerifier,
} from '../verify/code-review.js';
export type { Finding as CodeReviewFinding } from '@manehorizons/cadence-types';

/** The severity union of a {@link CodeReviewFinding}, derived rather than
 *  restated so it cannot drift from the schema (same convention as
 *  {@link SecurityAuditFindingSeverity} below). */
export type CodeReviewFindingSeverity = SummaryFinding['severity'];

/** security-audit. */
export type {
  SecurityAuditInput,
  SecurityAuditResult,
  SecurityAuditVerifier,
} from '../verify/security-audit.js';

/**
 * The element type of `SecurityAuditResult.findings`. It is the shared
 * SUMMARY-schema `Finding` from `@manehorizons/cadence-types` (severities
 * `critical | high | medium | low`), not code-review's — republished here so
 * naming the contents of a `SecurityAuditResult` needs no second import.
 */
export type { Finding as SecurityAuditFinding } from '@manehorizons/cadence-types';

/** The severity union of a {@link SecurityAuditFinding}, derived rather than
 *  restated so it cannot drift from the schema. */
export type SecurityAuditFindingSeverity = SummaryFinding['severity'];

/** plan-review. */
export type {
  PlanReviewFinding,
  PlanReviewInput,
  PlanReviewResult,
  PlanReviewSeverity,
  PlanReviewVerifier,
} from '../verify/plan-review.js';

/** per-task-verify. */
export type {
  PerTaskInput,
  PerTaskResult,
  PerTaskVerdict,
  PerTaskVerifier,
} from '../verify/per-task.js';

/** spec-review. */
export type {
  SpecReviewFinding,
  SpecReviewInput,
  SpecReviewResult,
  SpecReviewSeverity,
  SpecReviewVerifier,
} from '../verify/spec-review.js';

/** ui-spec-review. */
export type {
  UiSpecReviewFinding,
  UiSpecReviewInput,
  UiSpecReviewResult,
  UiSpecReviewSeverity,
  UiSpecReviewVerifier,
} from '../verify/ui-spec-review.js';

/**
 * The provider identity a verifier family resolves to
 * (`verify/verifier-factory.ts`). Re-exported for the same reason as the
 * input/result types: choosing or reporting a provider must not require
 * importing a `verify/` internal.
 */
export type { VerifierProvider } from '../verify/verifier-factory.js';
