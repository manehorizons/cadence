import type { CadenceConfig, Task, TaskClass } from '@thomas-powers-jr/cadence-types';

/**
 * Per-wave context a task's dispatch verdict is computed against: which wave
 * it's in, and the resolved TaskClass of every task in that wave (including
 * the task itself) — used to measure the mechanical-batch trigger. Pure
 * data, supplied by the caller (packages/core/src/services/dispatch.ts).
 */
export interface WaveExecutionContext {
  wave: number;
  waveClasses: Record<string, TaskClass>;
}

/**
 * Pre-computed, caller-supplied measurements a verdict is derived from.
 * `contextUtilization` is ALWAYS null this phase (D-DQ3) — `tokenUtilization`
 * is a confirmed-fake synthetic counter (hooks/handlers.ts:73-74), so no real
 * context-utilization reading is wired into dispatch planning yet. The field
 * and its threshold arithmetic exist so the branch is real and tested, not
 * dead code waiting for a future wiring pass.
 */
export interface DispatchSignals {
  packetChars: number;
  declaredFileBytes: number;
  contextUtilization: number | null;
}

/** The classifier's verdict for one task: where it runs, on what model, and why. */
export interface ExecutionVerdict {
  execution: 'inline' | 'dispatch';
  modelClass: TaskClass;
  model: string;
  reasons: string[];
}

/** Byte cap applied per declared file when estimating a task's size weight. */
export const FILE_BYTES_CAP = 500_000;

/**
 * Heuristically classifies a task's execution weight from its declared
 * shape when no explicit `class:` is set. Pure — no I/O.
 *
 * PRECEDENCE FIX (corpus-measured 2026-08-14, 99 real task blocks across 17
 * phases): checking a file-count "mechanical" rule first misclassifies
 * tasks that have <=1 file but >=2 depends as mechanical, when they
 * actually need the accumulated context of everything they depend on and
 * are not cheap/batchable. So the depends-based complex rule is checked
 * FIRST, unconditionally, before the mechanical rule gets a look.
 */
export function heuristicTaskClass(task: Task): TaskClass {
  const fileCount = task.files.length;
  const dependsCount = task.depends?.length ?? 0;
  if (fileCount >= 4 || dependsCount >= 2) return 'complex';
  if (fileCount <= 1) return 'mechanical';
  return 'standard';
}

/** Resolves a task's effective class: a declared `class:` always wins over the heuristic (D-DQ1). */
export function resolveTaskClass(task: Task): TaskClass {
  return task.class ?? heuristicTaskClass(task);
}

/**
 * Computes the dispatch verdict for one task: whether it should be dispatched
 * to a subagent or run inline, which model class/model id applies, and the
 * human-readable reasons behind the dispatch decision. Pure — no I/O; every
 * external fact (config, wave context, size/context signals) is supplied by
 * the caller.
 */
export function classifyTaskExecution(
  task: Task,
  waveCtx: WaveExecutionContext,
  config: CadenceConfig,
  signals: DispatchSignals,
): ExecutionVerdict {
  const modelClass = resolveTaskClass(task);
  const reasons: string[] = [];

  const mechanicalCount = Object.values(waveCtx.waveClasses).filter((c) => c === 'mechanical').length;
  if (modelClass === 'mechanical' && mechanicalCount >= config.subagentPolicy.mechanicalBatchMin) {
    reasons.push(
      `mechanicalBatchMin: wave ${waveCtx.wave} has ${mechanicalCount} mechanical task(s) (threshold ${config.subagentPolicy.mechanicalBatchMin})`,
    );
  }

  const weight = Math.floor(signals.packetChars / 4) + Math.floor(signals.declaredFileBytes / 4);
  if (weight > config.subagentPolicy.largeTaskTokens) {
    reasons.push(
      `largeTaskTokens: estimated weight ~${weight} tokens (threshold ${config.subagentPolicy.largeTaskTokens})`,
    );
  }

  if (
    signals.contextUtilization !== null &&
    signals.contextUtilization >= config.subagentPolicy.contextBudgetThreshold
  ) {
    reasons.push(
      `contextBudgetThreshold: utilization ${signals.contextUtilization} (threshold ${config.subagentPolicy.contextBudgetThreshold})`,
    );
  }

  return {
    execution: reasons.length > 0 ? 'dispatch' : 'inline',
    modelClass,
    model: config.modelPerClass[modelClass],
    reasons,
  };
}
