import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { TaskStatus } from '@thomas-powers-jr/cadence-types';
import { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteJSON } from '../state/atomic-write.js';
import { LoopViolationError } from '../errors.js';

export type RecordableStatus = Exclude<TaskStatus, 'PENDING' | 'IN_PROGRESS'>;

/**
 * Phase 24.2 — per-task verifier verdict attached to a task row when
 * the `'per-task-verify'` gate fires. `bypassed` is true when the user
 * passed `--allow-per-task-failure` to record a `refuse` verdict anyway.
 */
export interface PerTaskVerifyRecord {
  verdict: 'pass' | 'concerns' | 'refuse';
  reason: string;
  provider: string;
  model?: string;
  bypassed?: boolean;
}

interface ProgressJson {
  draftId: string;
  tasks: Record<
    string,
    {
      status: string;
      notes: string;
      touchedFiles: string[];
      updatedAt: string;
      perTaskVerify?: PerTaskVerifyRecord;
      /** Phase 280 (280-01, T8): dispatch-contract additions — how the task
       *  was executed, whether it ran in an isolated worktree, and the model
       *  class it was dispatched under. All optional/additive; populated by
       *  T11's real wiring in `build-task.ts`, not by this file. */
      execution?: 'inline' | 'dispatch';
      isolation?: 'worktree' | 'none';
      modelClass?: 'mechanical' | 'standard' | 'complex';
    }
  >;
}

/**
 * Phase 280 (280-01, T8): additive options bag replacing the old trailing
 * `perTaskVerify?: PerTaskVerifyRecord` positional param. `perTaskVerify`
 * keeps its exact old meaning; the rest are new dispatch-contract fields a
 * future caller (T11, in `build-task.ts`) will populate from git-derived
 * touched files (`deriveTaskTouchedFiles`, T7) and dispatch metadata — this
 * file only needs to be ABLE to accept and record them.
 */
export interface RecordTaskOutcomeOptions {
  perTaskVerify?: PerTaskVerifyRecord;
  /** When present (including an empty array), used INSTEAD OF the
   *  hook-accumulated `state.activeTask.touchedFiles` self-report for
   *  `progress.tasks[taskId].touchedFiles`. When absent (undefined), the
   *  self-report fallback is unchanged. Never blended with the self-report. */
  gitTouchedFiles?: string[];
  execution?: 'inline' | 'dispatch';
  isolation?: 'worktree' | 'none';
  modelClass?: 'mechanical' | 'standard' | 'complex';
}

export async function recordTaskOutcome(
  cwd: string,
  taskId: string,
  status: RecordableStatus,
  notes: string,
  options?: RecordTaskOutcomeOptions,
): Promise<void> {
  const backend = new SimpleStateBackend(cwd);
  const state = await backend.readState();
  if (state.loopPosition !== 'BUILD' || !state.activeDraft || !state.activePhase) {
    throw new LoopViolationError(
      'task outcome can only be recorded while loopPosition=BUILD with an active draft',
      { expected: 'BUILD', actual: state.loopPosition },
    );
  }
  const progPath = join(
    cwd,
    '.cadence/phases',
    state.activePhase,
    `${state.activeDraft}-PROGRESS.json`,
  );
  let progress: ProgressJson;
  if (existsSync(progPath)) {
    progress = JSON.parse(await readFile(progPath, 'utf8')) as ProgressJson;
  } else {
    progress = { draftId: state.activeDraft, tasks: {} };
  }
  const prior = progress.tasks[taskId];
  progress.tasks[taskId] = {
    status,
    notes,
    touchedFiles: options?.gitTouchedFiles ?? state.activeTask?.touchedFiles ?? [],
    updatedAt: new Date().toISOString(),
    ...(options?.perTaskVerify ? { perTaskVerify: options.perTaskVerify } : {}),
    // Phase 280 (280-01, T8 fix round): a re-record that omits execution/
    // isolation/modelClass must preserve the prior row's values rather than
    // dropping them -- AC-2 requires the dispatch-scoped boundary escalation
    // to "never de-escalate", which depends on a task's execution:'dispatch'
    // marker surviving every subsequent re-record of that same task.
    ...(options?.execution
      ? { execution: options.execution }
      : prior?.execution
        ? { execution: prior.execution }
        : {}),
    ...(options?.isolation
      ? { isolation: options.isolation }
      : prior?.isolation
        ? { isolation: prior.isolation }
        : {}),
    ...(options?.modelClass
      ? { modelClass: options.modelClass }
      : prior?.modelClass
        ? { modelClass: prior.modelClass }
        : {}),
  };
  await atomicWriteJSON(progPath, progress);
  state.activeTask = { id: taskId, status, touchedFiles: [] };
  // Phase 41.1 — commit() also refreshes STATE.md (was stale after build task).
  await backend.commit(state);
}
