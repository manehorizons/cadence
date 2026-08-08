export type ConvergeVerdict = 'pass' | 'reloop' | 'escalate';

/**
 * Pure convergence classifier. Gate-agnostic — the caller supplies the
 * boolean (plan-review now; survey #4's settle-gate later) and the attempt
 * counters; this decides pass / reloop / escalate. No I/O.
 *
 * `attemptsSoFar` = count of FAILING reviews already recorded (>= 0).
 * `maxAttempts`   = > 0. With maxAttempts=3: fail→reloop(1)→reloop(2)→escalate(3).
 */
export function nextConvergence(
  pass: boolean,
  attemptsSoFar: number,
  maxAttempts: number,
): { verdict: ConvergeVerdict; attempt: number } {
  if (pass) return { verdict: 'pass', attempt: attemptsSoFar };
  const attempt = attemptsSoFar + 1;
  if (attempt >= maxAttempts) return { verdict: 'escalate', attempt };
  return { verdict: 'reloop', attempt };
}

/**
 * A history-entry shape shared by all 4 call sites' convergence sidecars
 * (`plan-review`, `code-review`, `spec-approve` x2). `model` is only present
 * when the verifier reported one; `bypassed` is only present when the
 * caller's already-computed bypass flag was true for this attempt.
 *
 * Phase 263 (T3): `providerSelection` is threaded the same way as `model` —
 * present only when the caller passed one. Only 3 of the 4 call sites
 * (`plan-review`, `spec-approve` x2 — the sidecar seams this phase persists
 * for) ever supply it; `code-review` (263-01 T4's file, not this phase's)
 * computes its own `providerSelection` INTO `flags.verifierIdentity` for
 * `GateProvenanceZ` instead, so its `runConvergentReview` call keeps omitting
 * this field, which is why it must stay optional here.
 */
export interface ConvergentReviewHistoryEntry {
  at: string;
  pass: boolean;
  findingsCount: number;
  provider: string;
  model?: string;
  providerSelection?: 'configured' | 'fallback';
  verdict: ConvergeVerdict;
  bypassed?: true;
}

/**
 * Everything `runConvergentReview` needs, gathered by the caller from its
 * own verify() result + sidecar read + already-computed bypass condition.
 * Deliberately generic over the verify-result shape: `pass` and
 * `findingsCount` are plain values (not the raw verifier result), since
 * `code-review` derives `pass` from HIGH-only findings rather than the
 * verifier's own pass/fail — see `collectHighFindings`, which this
 * primitive does not know about and must not.
 */
export interface RunConvergentReviewInput {
  /** Already-computed pass/fail for this attempt (post any site-specific
   *  filtering, e.g. code-review's HIGH-only filter). */
  pass: boolean;
  /** Already-computed finding count for this attempt (same caveat). */
  findingsCount: number;
  provider: string;
  model?: string;
  /** Phase 263 (T3): whether `provider` was the operator's actual configured
   *  choice or a silent fallback to mock, tagged upstream by
   *  `verify/verifier-factory.ts`'s universal configured/fallback
   *  computation and read here by exact name off the verify() result
   *  (`res.providerSelection`) — never derived independently. Optional: only
   *  present when the caller's verifier result actually carried the tag
   *  (every verifier built by `createVerifierFactory` does; a hand-built test
   *  fixture verifier does not). */
  providerSelection?: 'configured' | 'fallback';
  /** Prior failing-attempt count, read from the sidecar (0 if absent/corrupt/legacy). */
  attemptsSoFar: number;
  /** Prior history array, read from the sidecar (`[]` if absent/corrupt/legacy). Not mutated. */
  history: unknown[];
  maxAttempts: number;
  /** Already-computed bypass condition (e.g. code-review's `force === true ||
   *  allowCodeReviewFailure === true`) — this primitive does not re-derive it. */
  bypassed: boolean;
  /** Sidecar id field name, e.g. `'draftId'` or `'specId'`. */
  idField: string;
  idValue: string;
  /** Injectable clock for deterministic tests; defaults to `new Date().toISOString()`. */
  now?: () => string;
}

/**
 * Structured, pure result of one convergent-review attempt: the
 * pass/reloop/escalate verdict, the history entry appended for this
 * attempt, and the full legacy-preserving sidecar JSON object (byte-shape
 * identical to what `plan-review.ts`/`code-review.ts`/`spec-approve.ts`
 * write today). The caller decides how to serialize (`JSON.stringify(...,
 * null, 2) + '\n'`) and write it (via `ctx` port or plain fs), and maps
 * `nv.verdict` + `bypassed` onto its own return type and `*Unconverged`
 * emit call.
 */
export interface RunConvergentReviewResult {
  nv: { verdict: ConvergeVerdict; attempt: number };
  historyEntry: ConvergentReviewHistoryEntry;
  /** Full history array (prior entries + the new one), ready to embed in `sidecarJson`. */
  history: unknown[];
  sidecarJson: Record<string, unknown>;
}

/**
 * Pure convergent-review primitive (phase 225 extraction). Given the
 * caller's already-computed pass/findings/bypass for this attempt plus the
 * prior sidecar state, computes the next convergence verdict, builds the
 * history entry, and assembles the exact legacy-preserving sidecar JSON
 * shape all 4 call sites write today. No I/O: does not call the verifier,
 * does not read or write any sidecar, does not print or emit anything —
 * those stay the caller's responsibility so this composes with both the
 * `ctx`-ported gates (`plan-review.ts`, `code-review.ts`) and the plain-fs
 * `spec-approve.ts` service.
 */
export function runConvergentReview(input: RunConvergentReviewInput): RunConvergentReviewResult {
  const {
    pass,
    findingsCount,
    provider,
    model,
    providerSelection,
    attemptsSoFar,
    history,
    maxAttempts,
    bypassed,
    idField,
    idValue,
  } = input;
  const at = (input.now ?? (() => new Date().toISOString()))();
  const nv = nextConvergence(pass, attemptsSoFar, maxAttempts);

  const historyEntry: ConvergentReviewHistoryEntry = {
    at,
    pass,
    findingsCount,
    provider,
    ...(model ? { model } : {}),
    ...(providerSelection ? { providerSelection } : {}),
    verdict: nv.verdict,
    ...(bypassed ? { bypassed: true } : {}),
  };
  const newHistory = [...history, historyEntry];

  const sidecarJson: Record<string, unknown> = {
    [idField]: idValue,
    converged: pass,
    attempts: nv.verdict === 'pass' ? attemptsSoFar : nv.attempt,
    maxAttempts,
    history: newHistory,
    // legacy top-level fields preserved for old readers:
    pass,
    provider,
    ...(model ? { model } : {}),
    ...(providerSelection ? { providerSelection } : {}),
    findings: findingsCount,
    at,
  };

  return { nv, historyEntry, history: newHistory, sidecarJson };
}

/**
 * Phase 263 (T3): reads `providerSelection` off a verify()-family result by
 * exact name, for the three sidecar-seam call sites
 * (`gates/plan-review.ts`, `services/spec-approve.ts` x2) to pass into
 * `runConvergentReview` above. `PlanReviewResult`/`SpecReviewResult`/
 * `UiSpecReviewResult` (published from `verify/plan-review.ts`,
 * `verify/spec-review.ts`, `verify/ui-spec-review.ts` — all outside this
 * phase's file scope) do not themselves declare `providerSelection` in their
 * TypeScript interfaces; they don't need to, because every real verifier
 * built by `createVerifierFactory` tags its result with the property at
 * runtime (`verify/verifier-factory.ts`'s `tagProviderSelection`) regardless
 * of what the family's own result interface says. This reader's parameter
 * type is a minimal structural shape (not `PlanReviewResult` etc.) — TS
 * accepts any of the three concrete result types here because an absent
 * optional property is assignment-compatible, without requiring a cast or a
 * change to those three untouched interfaces. `provider: string` is included
 * so the parameter type isn't "weak" (all-optional), which would otherwise
 * make this argument-type check reject an object with no overlapping
 * members.
 */
export function readProviderSelection(res: {
  provider: string;
  providerSelection?: 'configured' | 'fallback';
}): 'configured' | 'fallback' | undefined {
  return res.providerSelection;
}
