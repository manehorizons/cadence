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
 * Computes wave-based dispatch groups from a DRAFT's task list: topological
 * leveling over `depends:` (a dependency already terminal is treated as
 * satisfied), then a `files:`-disjointness veto within each level (the
 * later-declared of two file-overlapping tasks is pushed to the next
 * level, cascading if it collides again there). Pure, synchronous, no I/O.
 */
export function computeWaves(draft: Draft, progress: ProgressJson): Wave[] {
  const allIds = new Set(draft.tasks.map((t) => t.id));
  const statusOf = (id: string): string => progress.tasks[id]?.status ?? 'PENDING';
  const remaining = draft.tasks.filter((t) => !TERMINAL_STATUSES.has(statusOf(t.id)));
  if (remaining.length === 0) return [];

  const remainingIds = new Set(remaining.map((t) => t.id));
  const byId = new Map(remaining.map((t) => [t.id, t]));

  for (const t of remaining) {
    for (const dep of t.depends ?? []) {
      if (!allIds.has(dep)) {
        throw new CadenceError(`dispatch plan: task ${t.id} depends on unknown task '${dep}'`);
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
    const task = byId.get(id)!;
    const blockingDeps = (task.depends ?? []).filter((d) => remainingIds.has(d));
    let lvl = 0;
    for (const dep of blockingDeps) {
      lvl = Math.max(lvl, levelOf(dep, [...path, id]) + 1);
    }
    visiting.delete(id);
    level.set(id, lvl);
    return lvl;
  }
  for (const t of remaining) levelOf(t.id, []);

  const maxRawLevel = Math.max(...remaining.map((t) => level.get(t.id)!));
  const buckets: string[][] = Array.from({ length: maxRawLevel + 1 }, () => []);
  for (const t of remaining) buckets[level.get(t.id)!]!.push(t.id);

  const claimedFilesByLevel: Set<string>[] = Array.from(
    { length: buckets.length },
    () => new Set<string>(),
  );
  for (let lvl = 0; lvl < buckets.length; lvl++) {
    let i = 0;
    while (i < buckets[lvl]!.length) {
      const id = buckets[lvl]![i]!;
      const files = byId.get(id)!.files;
      const claimed = claimedFilesByLevel[lvl]!;
      const overlaps = files.some((f) => claimed.has(f));
      if (overlaps) {
        buckets[lvl]!.splice(i, 1);
        if (lvl + 1 === buckets.length) {
          buckets.push([]);
          claimedFilesByLevel.push(new Set<string>());
        }
        buckets[lvl + 1]!.push(id);
        continue;
      }
      for (const f of files) claimed.add(f);
      i++;
    }
  }

  return buckets
    .map((taskIds, idx) => ({ wave: idx + 1, taskIds }))
    .filter((w) => w.taskIds.length > 0);
}
