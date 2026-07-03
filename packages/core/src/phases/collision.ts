// packages/core/src/phases/collision.ts
//
// Pure phase-collision detector (v1.18, phase 83). No I/O — the worktree/upstream
// reads live in the impure `occupancy.ts` collector. This module just does the
// numeric set math, so it is trivially unit-testable, matching the repo's
// pure-seam style (`buildAnthropicClientConfig`, `resolveLogLevel`).

/** A phase number claimed somewhere CADENCE can observe. */
export interface Occupancy {
  /** The leading numeric token of the phase dir name (`30-auth` → 30). */
  number: number;
  /** The full phase-directory name (e.g. `30-auth`), not just the parsed number. */
  name: string;
  /** Where the claim was observed. `local` is this worktree's own `.cadence/phases/`. */
  source: 'local' | 'sibling' | 'upstream';
  /** Human-readable origin — a worktree path or `origin/<ref>`. */
  location: string;
}

export interface CollisionResult {
  collides: boolean;
  conflicts: Occupancy[];
  /** `max(target, ...observed) + 1` — monotonic, not lowest-gap. */
  nextFree: number;
}

/**
 * The collision key is the **leading numeric token** of a phase dir name, NOT
 * the full slug — so `30-auth` and `30-cache` both normalize to `30` and
 * collide. Non-numeric / unparseable names return `null` and are ignored.
 */
export function phaseNumber(dirName: string): number | null {
  const m = /^(\d+)/.exec(dirName);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Detect whether `target` collides with any observed occupancy. A collision is
 * pure numeric equality, ignoring any source in `opts.excludeSources` — the
 * settle backstop passes `['local']` to drop self (the active phase lives in the
 * local worktree, so a cross-worktree collision is sibling/upstream only).
 * Exclusion is by SOURCE, not number: self and a genuine sibling collision share
 * the same number, so a number-based exclusion would also hide the sibling.
 * `nextFree` is `max(target, ...all observed numbers) + 1` — every observed
 * number counts toward the next free slot, even excluded-source ones.
 *
 * A further, narrower exemption (issue #129) layers on top of `excludeSources`:
 * an `upstream` occupancy at `target` is NOT a conflict when its `name` exactly
 * matches a `local` occupancy's `name` at the same number — this is the
 * worktree's own phase directory, already pushed to `origin/<ref>`, showing up
 * as if it were a foreign upstream claim. An `upstream` occupancy whose `name`
 * differs (same number, different slug) is still a genuine foreign conflict.
 * `sibling` occupancies are deliberately NOT exempted by this — only `upstream`.
 */
export function detectPhaseCollision(
  target: number,
  occupancies: readonly Occupancy[],
  opts?: { excludeSources?: Occupancy['source'][] },
): CollisionResult {
  const excluded = new Set(opts?.excludeSources ?? []);
  const localNames = new Set(
    occupancies.filter((o) => o.number === target && o.source === 'local').map((o) => o.name),
  );
  const conflicts = occupancies.filter((o) => {
    if (o.number !== target || excluded.has(o.source)) return false;
    if (o.source === 'upstream' && localNames.has(o.name)) return false;
    return true;
  });
  const maxObserved = occupancies.reduce((max, o) => (o.number > max ? o.number : max), target);
  return {
    collides: conflicts.length > 0,
    conflicts,
    nextFree: maxObserved + 1,
  };
}
