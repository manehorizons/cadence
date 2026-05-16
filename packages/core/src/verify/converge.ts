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
