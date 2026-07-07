import type { Draft } from '@manehorizons/cadence-types';
import { CadenceError } from '../errors.js';
import type { ProgressJson } from '../gates/types.js';

export interface Wave {
  wave: number;
  taskIds: string[];
}

/**
 * Task statuses treated as "already finished" — excluded from every wave.
 * Deliberately a LOCAL constant, not imported from Spec 1's
 * `checks/task-redundancy.ts` (same two values, `TERMINAL_TASK_STATUSES`):
 * that module lives on a separate, unmerged branch, and the two specs are
 * independently shippable — no cross-branch code dependency.
 */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['DONE', 'DONE_WITH_CONCERNS']);

/**
 * Computes wave-based dispatch groups from a DRAFT's task list.
 *
 * A single unified topological leveling pass over a combined prerequisite
 * graph: real `depends:` edges (a dependency already terminal is treated
 * as satisfied — dropped, not blocking) PLUS a synthetic prerequisite edge
 * from every earlier-declared remaining task to every later-declared one
 * that shares a `files:` entry (an implicit "must come after" edge, same
 * direction as declaration order). Levels are computed once, over BOTH
 * edge kinds together — NOT depends: leveling followed by a separate
 * files: veto pass. A two-pass design (level by depends:, then bump
 * files:-colliding tasks into whatever bucket happens to already exist at
 * the next index) can silently place a task in the same wave as — or even
 * ahead of — another task that depends on it, once a files: bump lands it
 * in a bucket some *unrelated* task already populated for a different
 * reason. Unifying both constraints into one leveling pass makes that
 * failure mode structurally impossible: a task's level is always strictly
 * greater than every one of its real-or-synthetic prerequisites', full
 * stop. Pure, synchronous, no I/O.
 */
export function computeWaves(draft: Draft, progress: ProgressJson): Wave[] {
  const allIds = new Set(draft.tasks.map((t) => t.id));
  const statusOf = (id: string): string => progress.tasks[id]?.status ?? 'PENDING';
  const remaining = draft.tasks.filter((t) => !TERMINAL_STATUSES.has(statusOf(t.id)));
  if (remaining.length === 0) return [];

  const remainingIds = new Set(remaining.map((t) => t.id));

  for (const t of remaining) {
    for (const dep of t.depends ?? []) {
      if (!allIds.has(dep)) {
        throw new CadenceError(`dispatch plan: task ${t.id} depends on unknown task '${dep}'`);
      }
    }
  }

  // Build the combined prerequisite graph. `prereqs.get(id)` is the set of
  // task ids that must be at a strictly lower level than `id`.
  const prereqs = new Map<string, Set<string>>();
  for (const t of remaining) prereqs.set(t.id, new Set());
  for (const t of remaining) {
    for (const dep of t.depends ?? []) {
      if (remainingIds.has(dep)) prereqs.get(t.id)!.add(dep);
    }
  }
  for (let i = 0; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const earlier = remaining[i]!;
      const later = remaining[j]!;
      if (earlier.files.some((f) => later.files.includes(f))) {
        prereqs.get(later.id)!.add(earlier.id);
      }
    }
  }

  const level = new Map<string, number>();
  const visiting = new Set<string>();
  function levelOf(id: string, path: string[]): number {
    const cached = level.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) {
      throw new CadenceError(
        `dispatch plan: dependency cycle detected: ${[...path, id].join(' -> ')}`,
      );
    }
    visiting.add(id);
    let lvl = 0;
    for (const dep of prereqs.get(id)!) {
      lvl = Math.max(lvl, levelOf(dep, [...path, id]) + 1);
    }
    visiting.delete(id);
    level.set(id, lvl);
    return lvl;
  }
  for (const t of remaining) levelOf(t.id, []);

  const maxLevel = Math.max(...remaining.map((t) => level.get(t.id)!));
  const buckets: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const t of remaining) buckets[level.get(t.id)!]!.push(t.id);

  return buckets
    .map((taskIds, idx) => ({ wave: idx + 1, taskIds }))
    .filter((w) => w.taskIds.length > 0);
}
