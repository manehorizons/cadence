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
 */
export interface ConvergentReviewHistoryEntry {
  at: string;
  pass: boolean;
  findingsCount: number;
  provider: string;
  model?: string;
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
    findings: findingsCount,
    at,
  };

  return { nv, historyEntry, history: newHistory, sidecarJson };
}
