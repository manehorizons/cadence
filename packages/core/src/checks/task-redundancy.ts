import { isAbsolute, relative } from 'node:path';
import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';

/** Task statuses treated as "already finished" — an edit touching either's files is flagged. */
export const TERMINAL_TASK_STATUSES: ReadonlySet<string> = new Set(['DONE', 'DONE_WITH_CONCERNS']);

/** The single line both emission points use for a redundant-work hit. */
export const redundantWorkMessage = (file: string, taskId: string, status: string): string =>
  `${file} belongs to ${taskId}, already ${status} — this edit looks like duplicate/redundant work`;

export interface TaskFileOwnership {
  taskId: string;
  files: string[];
}

export interface RedundancyCheckInput {
  /** Every DRAFT task's id + declared `files:`, in DRAFT order. */
  tasks: TaskFileOwnership[];
  /** task id -> status. A task with no entry is treated as PENDING (never flagged). */
  taskStatuses: Record<string, string>;
  /** Candidate files to test. Iterated as-given — caller owns dedup/order. */
  touchedFiles: Iterable<string>;
  /** Stamps each event's `ts`. */
  stamp: () => string;
  /** Merged into each event's `context` AFTER `file`/`taskId`/`status`. */
  extraContext?: Record<string, unknown>;
  /**
   * Repo root for path normalization. When set, declared + touched paths are
   * relativized to this root (and `\\`→`/`) before comparison, mirroring
   * `checks/boundary.ts`'s `root` param — an absolute touched path (from the
   * PreToolUse hook) matches a relative DRAFT `files:` declaration. The
   * ORIGINAL touched path is still what gets emitted.
   */
  root?: string;
  /** Severity stamped on every emitted event. Defaults to `'warn'`. */
  severity?: AnomalyEvent['severity'];
}

/**
 * Subagent task-redundancy monitoring — the single home for "does this
 * touched file belong to a task that's already finished" detection. Pure —
 * no I/O. Fires at three call sites: `handlePreToolEdit` (edit-time),
 * `handleSubagentResult` (SubagentStop safety net). One rule ("a touched
 * file owned by ANY terminal task is a redundant-work hit"), same shape as
 * `runBoundaryCheck` — a different axis (task status, not file boundary).
 */
export function runRedundancyCheck(input: RedundancyCheckInput): AnomalyEvent[] {
  const { root, severity = 'warn' } = input;
  const norm = (p: string): string => {
    const rel = root && isAbsolute(p) ? relative(root, p) : p;
    return rel.split('\\').join('/');
  };

  // file (normalized) -> owning task ids, in DRAFT declaration order.
  const ownersByFile = new Map<string, string[]>();
  for (const task of input.tasks) {
    for (const file of task.files) {
      const key = norm(file);
      const owners = ownersByFile.get(key) ?? [];
      owners.push(task.taskId);
      ownersByFile.set(key, owners);
    }
  }

  const events: AnomalyEvent[] = [];
  for (const file of input.touchedFiles) {
    const owners = ownersByFile.get(norm(file));
    if (!owners) continue;
    const terminalOwner = owners.find((id) => TERMINAL_TASK_STATUSES.has(input.taskStatuses[id] ?? 'PENDING'));
    if (!terminalOwner) continue;
    const status = input.taskStatuses[terminalOwner]!;
    events.push({
      type: 'redundant-task-work',
      severity,
      message: redundantWorkMessage(file, terminalOwner, status),
      context: { file, taskId: terminalOwner, status, ...input.extraContext },
      ts: input.stamp(),
    });
  }
  return events;
}
