import type {
  AnomalyEvent,
  DeepVerdict,
  Draft,
} from '@manehorizons/cadence-types';
import type { ProgressFile } from '../status.js';
import type { InteractiveVerdict } from '../verify/interactive.js';
import { runBoundaryCheck } from '../checks/boundary.js';
import { parseAcRefs } from '../parse/ac-refs.js';

export interface CollectAnomaliesContext {
  draft: Draft;
  progress: ProgressFile;
  /** True iff `--allow-missing-coverage` was used AND `test-coverage` was in the gate set. */
  coverageBypassed: boolean;
  /** True iff `--force` was set on settle. */
  force: boolean;
  /**
   * Phase 187: true iff `--allow-auto-complex` was used AND `gateSet.softCap`
   * was true (auto profile x complex tier, DESIGN.md §4 M2). Records the
   * override into `gateBypasses` instead of leaving it as a stderr-only notice.
   */
  autoComplexOverride?: boolean;
  /** Per-AC deep verifier verdicts (Phase 15), if --deep / deep-verify gate ran. */
  deepVerify?: Record<string, DeepVerdict> | undefined;
  /** Per-AC interactive verdicts (Phase 16), if --interactive / interactive-verdict gate ran. */
  interactiveVerify?: Record<string, InteractiveVerdict> | undefined;
  /** Populated when the deep verifier transport itself failed (network/parse/etc). */
  verifierFailure?: { message: string; provider?: string } | undefined;
  /**
   * Phase 47 — repo root, forwarded to the boundary check so absolute
   * `touchedFiles` (recorded by the PreToolUse hook) are relativized before
   * comparison against the DRAFT's relative `files:` declarations. Optional:
   * when omitted, the boundary check falls back to exact-string matching.
   */
  root?: string | undefined;
}

export interface CollectAnomaliesOptions {
  /** Test seam: stand in for `() => new Date()`. Production callers omit it. */
  now?: () => Date;
}

/**
 * Walks settle context and emits typed anomaly events for the auto / standard
 * profile. Pure — no I/O. Each event is stamped with `ts` from `opts.now`
 * (defaults to wall-clock).
 */
export function collectAnomalies(
  ctx: CollectAnomaliesContext,
  opts: CollectAnomaliesOptions = {},
): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  const nowFn = opts.now ?? (() => new Date());
  const stamp = () => nowFn().toISOString();

  // ac-blocked / ac-needs-context — one event per task in the affected state.
  for (const task of ctx.draft.tasks) {
    const status = ctx.progress.tasks[task.id]?.status;
    const acs = parseAcRefs(task.done);
    if (status === 'BLOCKED') {
      events.push({
        type: 'ac-blocked',
        severity: 'warn',
        message: `${task.id} BLOCKED (${acs.length > 0 ? acs.join(', ') : 'no ACs linked'})`,
        context: { taskId: task.id, taskName: task.name, acs },
        ts: stamp(),
      });
    } else if (status === 'NEEDS_CONTEXT') {
      events.push({
        type: 'ac-needs-context',
        severity: 'warn',
        message: `${task.id} NEEDS_CONTEXT (${acs.length > 0 ? acs.join(', ') : 'no ACs linked'})`,
        context: {
          taskId: task.id,
          taskName: task.name,
          acs,
          notes: ctx.progress.tasks[task.id]?.notes ?? '',
        },
        ts: stamp(),
      });
    }
  }

  // coverage-bypassed — single event when bypass flag flipped a gate that was active.
  if (ctx.coverageBypassed) {
    events.push({
      type: 'coverage-bypassed',
      severity: 'warn',
      message: 'test-coverage gate bypassed via --allow-missing-coverage',
      context: {},
      ts: stamp(),
    });
  }

  // auto-complex-override — single event when --allow-auto-complex bypassed
  // the auto x complex soft cap (DESIGN.md §4 M2).
  if (ctx.autoComplexOverride) {
    events.push({
      type: 'auto-complex-override',
      severity: 'warn',
      message: 'auto × complex soft cap bypassed via --allow-auto-complex (DESIGN.md §4 M2)',
      context: {},
      ts: stamp(),
    });
  }

  // files-outside-boundary — one event per touched file that is not in any
  // task's declared `files:` list. Detection shared with the PreToolEdit hook
  // via checks/boundary (Phase 43.1); the deduped Set keeps settle's behavior.
  const touched = new Set<string>();
  for (const entry of Object.values(ctx.progress.tasks)) {
    for (const f of entry.touchedFiles ?? []) touched.add(f);
  }
  events.push(
    ...runBoundaryCheck({
      declaredFiles: ctx.draft.tasks.flatMap((t) => t.files),
      touchedFiles: touched,
      stamp,
      ...(ctx.root !== undefined ? { root: ctx.root } : {}),
    }),
  );

  // verifier-failure — emitted when the deep verifier transport itself blew up.
  if (ctx.verifierFailure) {
    events.push({
      type: 'verifier-failure',
      severity: 'error',
      message: `deep verifier failed: ${ctx.verifierFailure.message}`,
      context: {
        message: ctx.verifierFailure.message,
        ...(ctx.verifierFailure.provider ? { provider: ctx.verifierFailure.provider } : {}),
      },
      ts: stamp(),
    });
  }

  // force-used — emitted when --force was set AND something it would have
  // bypassed actually failed (structural, deep, or interactive).
  if (ctx.force) {
    const failedAcs: string[] = [];
    const reasons: string[] = [];

    // structural: any AC whose linked tasks include BLOCKED/NEEDS_CONTEXT, or
    // that has no linked tasks at all.
    for (const ac of ctx.draft.acceptanceCriteria) {
      const linked = ctx.draft.tasks.filter((t) =>
        parseAcRefs(t.done).includes(ac.id),
      );
      if (linked.length === 0) {
        failedAcs.push(ac.id);
        continue;
      }
      const linkedStatuses = linked.map(
        (t) => ctx.progress.tasks[t.id]?.status ?? 'PENDING',
      );
      if (
        linkedStatuses.some((s) => s === 'BLOCKED' || s === 'NEEDS_CONTEXT')
      ) {
        failedAcs.push(ac.id);
      }
    }
    if (failedAcs.length > 0) reasons.push(`structural: ${failedAcs.join(', ')}`);

    if (ctx.deepVerify) {
      const failed = Object.entries(ctx.deepVerify)
        .filter(([, v]) => v.pass === false)
        .map(([id]) => id);
      if (failed.length > 0) reasons.push(`deep: ${failed.join(', ')}`);
    }
    if (ctx.interactiveVerify) {
      const failed = Object.entries(ctx.interactiveVerify)
        .filter(([, v]) => v.verdict === 'fail')
        .map(([id]) => id);
      if (failed.length > 0) reasons.push(`interactive: ${failed.join(', ')}`);
    }
    if (reasons.length > 0) {
      events.push({
        type: 'force-used',
        severity: 'error',
        message: `settle --force bypassed failing verdicts (${reasons.join('; ')})`,
        context: { reasons },
        ts: stamp(),
      });
    }
  }

  return events;
}
