import type { PerTaskVerifyRecord } from '../build/record.js';
import type { BuildGateImpl, BuildProducts } from './build-types.js';
import type { GateResult } from './types.js';

/**
 * Per-task verifier gate (Phase 24.2). Extracted from build.ts (Phase 39.7).
 * Fires only when `'per-task-verify'` is in the effective gate set (the router
 * only calls it on DONE outcomes). Resolves the task's declared files, diffs
 * them via `ctx.diff`, runs the verifier, and returns a `PerTaskVerifyRecord`
 * the router threads into `recordTaskOutcome`. A refuse halts the record write
 * (router sets `exitCode = 1`), unchanged. Reaches git/verifier/notifier only
 * through `ctx` ports.
 */
export const runPerTaskVerifyGate: BuildGateImpl = async (
  ctx,
): Promise<GateResult<BuildProducts>> => {
  if (!ctx.gateSet.gates.includes('per-task-verify')) return { outcome: 'pass' };

  const task = ctx.draft.tasks.find((t) => t.id === ctx.taskId);
  const files = task?.files ?? [];
  const diff = ctx.diff(files);
  const verdict = await ctx.verifiers.perTask.verify({
    taskId: ctx.taskId,
    files,
    diff,
  });
  const refused = verdict.verdict === 'refuse';
  const bypassed = refused && ctx.opts.allowPerTaskFailure === true;

  if (refused && !ctx.opts.allowPerTaskFailure) {
    ctx.io.err(
      `per-task-verify refused: ${verdict.reason}\n` +
        'Pass --allow-per-task-failure to record DONE anyway.\n',
    );
    await ctx.emit.perTaskFail({
      taskId: ctx.taskId,
      provider: verdict.provider,
      reason: verdict.reason,
      bypassed: false,
    });
    return { outcome: 'refuse' };
  }
  if (refused && ctx.opts.allowPerTaskFailure) {
    ctx.io.err(
      'per-task-verify: --allow-per-task-failure set; proceeding past refuse verdict.\n',
    );
    await ctx.emit.perTaskFail({
      taskId: ctx.taskId,
      provider: verdict.provider,
      reason: verdict.reason,
      bypassed: true,
    });
  }

  const perTaskRecord: PerTaskVerifyRecord = {
    verdict: verdict.verdict,
    reason: verdict.reason,
    provider: verdict.provider,
    ...(verdict.model ? { model: verdict.model } : {}),
    ...(bypassed ? { bypassed: true } : {}),
  };
  return { outcome: 'pass', summaryPatch: { perTaskRecord } };
};
