// packages/core/src/phases/liveness.ts
//
// Pure freshness assessor (phase 208). No I/O — the `PROGRESS.json` read and
// `state.json` lookup live in the impure `doctor` check (`checkPhaseFreshness`
// in `../doctor/run.ts`); this module just does the date math against an
// injected `now`, matching the repo's pure-seam style (`detectPhaseCollision`
// in `./collision.ts`, `resolveLogLevel`). It answers a narrow question: given
// each task's last-updated timestamp, could another session still be actively
// touching this phase right now?

/** A single task's freshness relative to the reference `now`. */
export interface TaskFreshness {
  /** The task id (e.g. `T1`) as recorded in `PROGRESS.json`. */
  taskId: string;
  /** The task's raw `updatedAt` ISO timestamp, unmodified. */
  updatedAt: string;
  /** `now - updatedAt` in milliseconds. Negative if `updatedAt` is in the future (clock skew). */
  ageMs: number;
}

export interface FreshnessResult {
  /** True when the freshest task's age is within `thresholdMs` (inclusive). */
  isFresh: boolean;
  /**
   * The least-stale task among all parseable entries, regardless of whether it
   * is within the threshold — `null` only when `tasks` is empty or every
   * `updatedAt` is unparseable. Callers decide what to do with a non-fresh
   * `freshest`; this function only reports facts.
   */
  freshest: TaskFreshness | null;
}

/**
 * Assess whether any task in `tasks` (task id → `updatedAt` ISO string) was
 * touched within `thresholdMs` of `now`. Entries with an unparseable
 * `updatedAt` are skipped rather than corrupting the result — this is a pure
 * fact-reporting function, not a validator, so it degrades quietly rather
 * than throwing on bad input.
 */
export function assessProgressFreshness(
  tasks: Readonly<Record<string, string>>,
  now: Date,
  thresholdMs: number,
): FreshnessResult {
  const nowMs = now.getTime();
  let freshest: TaskFreshness | null = null;

  for (const [taskId, updatedAt] of Object.entries(tasks)) {
    const ageMs = nowMs - new Date(updatedAt).getTime();
    if (!Number.isFinite(ageMs)) continue; // unparseable updatedAt — skip

    if (freshest === null || ageMs < freshest.ageMs) {
      freshest = { taskId, updatedAt, ageMs };
    }
  }

  return {
    isFresh: freshest !== null && freshest.ageMs <= thresholdMs,
    freshest,
  };
}
