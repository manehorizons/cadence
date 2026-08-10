export type ConvergeVerdict = 'pass' | 'reloop' | 'escalate';

/**
 * Phase 267 (267-01, fix round after a real `deep-verify` AC-1 refusal,
 * dec-20260810-002 amends dec-20260809-005): the value a mock-abstained
 * attempt's PERSISTED `verdict` reads as. Deliberately distinct from
 * `ConvergeVerdict` — `nextConvergence`'s return type never produces
 * `'abstained'` and callers' reloop/escalate branching (`nv.verdict`, the
 * value `runConvergentReview` returns separately in `RunConvergentReviewResult.nv`)
 * is untouched by this; only what gets WRITTEN to `historyEntry`/`sidecarJson`
 * is affected. See `ConvergentReviewHistoryEntry.verdict`'s doc comment for why.
 */
export type PersistedVerdict = ConvergeVerdict | 'abstained';

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
  /**
   * Phase 267 (267-01, dec-20260810-002 amends dec-20260809-005): forced
   * `false` when `mockAbstained` is set, regardless of the caller's fresh
   * `pass` input. dec-20260809-005's original shape kept `pass: true` here
   * for a mock-identified clean pass, reasoning it was inert legacy-reader
   * bookkeeping — a real `deep-verify` AC-1 refusal caught that this is
   * exactly the "persisted pass" AC-1 forbids (`pass: true` reads as an
   * affirmative pass to any consumer that doesn't know to check
   * `mockAbstained`). Verified safe to override: `draft-context.ts`'s
   * sidecar reader only ever consumes `prior.attempts` (a number) and
   * `prior.history` (an opaque, never-filtered-by-pass array) — no code
   * path reads `historyEntry.pass`/`verdict`/`sidecarJson.converged` back
   * for control flow. The value that DOES drive reloop/escalate is `nv`
   * (`RunConvergentReviewResult.nv`, computed from the fresh `pass` input
   * via `nextConvergence` before this override applies) — untouched by this
   * field, so convergence behavior is identical to before this change.
   */
  pass: boolean;
  findingsCount: number;
  provider: string;
  model?: string;
  providerSelection?: 'configured' | 'fallback';
  /**
   * Phase 267 (267-01, dec-20260810-002): `'abstained'` (never `'pass'`)
   * when `mockAbstained` is set — the direct sidecar analog of
   * `registry.ts`'s `status:'ran'` → `'skipped'` relabeling: the persisted
   * word a reader would see changes, not just a sibling flag added next to
   * an unqualified `'pass'`. `nv.verdict` (control-flow, returned
   * separately) is always the real `ConvergeVerdict` — this field alone
   * carries the wider `PersistedVerdict` type.
   */
  verdict: PersistedVerdict;
  bypassed?: true;
  /**
   * Phase 267 (267-01, T2, dec-20260809-005; corrected by dec-20260810-003):
   * present (`true`) only when the caller identified this attempt's resolved
   * provider as mock AND the review passed cleanly — mirrors `registry.ts`'s
   * `status:'skipped'` relabeling for `code-review`/`security-audit`'s
   * SUMMARY-level `GateProvenance`. Deliberately CALLER-computed (see
   * `RunConvergentReviewInput.mockAbstained` below), never derived here from
   * `provider === 'mock' && pass` — every call site computes its own flag
   * from its own local state, with zero shared logic between call sites.
   * This primitive backs FOUR sidecars: `plan-review`/`spec-review`/
   * `ui-spec-review` (never touch `GateProvenance`/SUMMARY at all — this
   * marker is their ONLY abstention record) and `code-review.ts`'s own
   * `CODE-REVIEW.json` (a SEPARATE persisted artifact from the SUMMARY-level
   * relabel registry.ts already performs for the same gate). dec-20260809-005
   * originally excluded `code-review.ts`'s call site from ever setting this
   * field, reasoning that the registry.ts-layer relabel alone satisfied
   * AC-1 for that gate — a real `deep-verify` pass caught that CODE-REVIEW.json
   * is independently readable and was persisting an unqualified `pass: true`
   * regardless of what SUMMARY.json said; dec-20260810-003 corrected this,
   * and `code-review.ts` now sets this field too. Never present for a
   * `pass: false` attempt — a refusal is never false confidence, regardless
   * of provider (dec-20260809-004), so it is never relabeled abstained
   * either.
   */
  mockAbstained?: true;
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
  /**
   * Phase 267 (267-01, T2, dec-20260809-005; corrected by dec-20260810-003):
   * already-computed `provider === 'mock' && pass === true` for this
   * attempt, supplied by all 4 call sites now (`plan-review.ts`,
   * `spec-approve.ts` x2, and `code-review.ts`) — each computes it locally
   * from its own already-resolved provider/pass, with no shared logic
   * between call sites. `code-review.ts` setting this affects ONLY its own
   * `CODE-REVIEW.json` sidecar via this primitive; it is fully independent
   * of, and does not change, the SEPARATE registry.ts-layer `status:'ran'`→
   * `'skipped'` relabel dec-20260809-004 established for the SUMMARY-level
   * `GateProvenance` entry that same gate also writes — both persisted
   * artifacts for `code-review` now correctly abstain, computed two
   * different ways for two different files, exactly as isolated as before.
   * Caller-computed (not derived from `provider` here) so this primitive
   * stays generic over all 4 call sites. Omit or `false` to leave
   * `historyEntry.mockAbstained` unset.
   */
  mockAbstained?: boolean;
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
    mockAbstained,
  } = input;
  const at = (input.now ?? (() => new Date().toISOString()))();
  const nv = nextConvergence(pass, attemptsSoFar, maxAttempts);
  // Phase 267 (267-01, dec-20260810-002): the PERSISTED pass/verdict only —
  // `nv` above (control flow: reloop/escalate/attempts counting) is computed
  // from the fresh `pass` input and returned separately, untouched by this.
  const persistedPass = mockAbstained ? false : pass;
  const persistedVerdict: PersistedVerdict = mockAbstained ? 'abstained' : nv.verdict;

  const historyEntry: ConvergentReviewHistoryEntry = {
    at,
    pass: persistedPass,
    findingsCount,
    provider,
    ...(model ? { model } : {}),
    ...(providerSelection ? { providerSelection } : {}),
    verdict: persistedVerdict,
    ...(bypassed ? { bypassed: true } : {}),
    ...(mockAbstained ? { mockAbstained: true } : {}),
  };
  const newHistory = [...history, historyEntry];

  const sidecarJson: Record<string, unknown> = {
    [idField]: idValue,
    converged: persistedPass,
    attempts: nv.verdict === 'pass' ? attemptsSoFar : nv.attempt,
    maxAttempts,
    history: newHistory,
    // legacy top-level fields preserved for old readers:
    pass: persistedPass,
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
