import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { TaskStatus } from '@manehorizons/cadence-types';
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
    }
  >;
}

export async function recordTaskOutcome(
  cwd: string,
  taskId: string,
  status: RecordableStatus,
  notes: string,
  perTaskVerify?: PerTaskVerifyRecord,
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
  progress.tasks[taskId] = {
    status,
    notes,
    touchedFiles: state.activeTask?.touchedFiles ?? [],
    updatedAt: new Date().toISOString(),
    ...(perTaskVerify ? { perTaskVerify } : {}),
  };
  await atomicWriteJSON(progPath, progress);
  state.activeTask = { id: taskId, status, touchedFiles: [] };
  // Phase 41.1 — commit() also refreshes STATE.md (was stale after build task).
  await backend.commit(state);
}
