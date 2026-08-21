import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  TaskStatusZ,
  type AnomalyEvent,
  type CadenceConfig,
  type Draft,
} from '@thomas-powers-jr/cadence-types';
import {
  recordTaskOutcome,
  type PerTaskVerifyRecord,
  type RecordableStatus,
} from '../build/record.js';
import { deriveTaskTouchedFiles } from '../build/task-touched-files.js';
import { findUnmatchedBoundaryPatterns, runBoundaryCheck } from '../checks/boundary.js';
import { runRedundancyCheck } from '../checks/task-redundancy.js';
import { LoopViolationError } from '../errors.js';
import { emitLoopViolation } from '../notify/loop-violation.js';
import { selectNotifier } from '../notify/factory.js';
import { loadConfig } from '../config/loader.js';
import { effectiveBoundaryEnforcement, effectiveGateSet } from '../gates/engine.js';
import { parseDraftMd } from '../parse/draft-parser.js';
import { SimpleStateBackend } from '../state/simple.js';
import { runPerTaskVerifyGate } from '../gates/per-task-verify.js';
import { buildBuildContext } from '../gates/build-context.js';
import { formatCommandError } from './format-command-error.js';
import type { CommandIO, CommandResult } from './io.js';

/** One PROGRESS.json row, read back defensively (best-effort, never throws). */
interface ProgressRow {
  status: string;
  touchedFiles?: string[];
  execution?: string;
}

/**
 * Best-effort PROGRESS.json read for the B2 boundary/redundancy step below.
 * Missing file or unparseable JSON both degrade to "no prior tasks recorded"
 * — this is diagnostic introspection, never a hard failure (house rule: "The
 * Throwing Observer").
 */
async function readProgressRows(
  repoRoot: string,
  phase: string,
  draftId: string,
): Promise<Record<string, ProgressRow>> {
  const progPath = join(repoRoot, '.cadence/phases', phase, `${draftId}-PROGRESS.json`);
  if (!existsSync(progPath)) return {};
  try {
    const raw = JSON.parse(await readFile(progPath, 'utf8')) as {
      tasks?: Record<string, { status?: string; touchedFiles?: string[]; execution?: string }>;
    };
    const tasks = raw.tasks ?? {};
    const result: Record<string, ProgressRow> = {};
    for (const [id, row] of Object.entries(tasks)) {
      result[id] = {
        status: row.status ?? 'PENDING',
        ...(row.touchedFiles ? { touchedFiles: row.touchedFiles } : {}),
        ...(row.execution ? { execution: row.execution } : {}),
      };
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Heuristic "nearest owning task" for a stray file named in a block-mode
 * refusal message (AC-2): the task whose declared `files:` share the longest
 * leading directory-path prefix with the stray file. Ties keep the earliest
 * DRAFT-order task. Best-effort labeling only — not a correctness-bearing
 * computation, purely a human-facing pointer for where to look first.
 */
function nearestOwningTask(file: string, tasks: Draft['tasks']): string | undefined {
  const fileDir = file.split('/').slice(0, -1);
  let best: { taskId: string; score: number } | undefined;
  for (const task of tasks) {
    for (const declared of task.files) {
      const declaredDir = declared.split('/').slice(0, -1);
      let score = 0;
      while (
        score < fileDir.length &&
        score < declaredDir.length &&
        fileDir[score] === declaredDir[score]
      ) {
        score++;
      }
      if (!best || score > best.score) {
        best = { taskId: task.id, score };
      }
    }
  }
  return best?.taskId;
}

/**
 * `cadence build task <id>` — record a task outcome (runs the per-task verifier
 * gate on DONE). Faithful extraction of the former CLI action body.
 *
 * Phase 280 (280-01, T11) — full B2 wire-up: on `DONE`/`DONE_WITH_CONCERNS`
 * (independent of `runPerTaskVerifyGate`'s DONE-only gate above), derives the
 * real git-touched-files delta since the last recorded task and runs the
 * boundary + redundancy checks against it, before `recordTaskOutcome`. See
 * inline comments below for the exact skip/block/warn/bypass branching —
 * mirrors DRAFT 280-01 AC-2/AC-3/AC-4.
 */
export async function buildTaskService(
  repoRoot: string,
  args: {
    taskId: string;
    status?: string;
    notes?: string;
    allowPerTaskFailure?: boolean;
    /** Bypasses a block-mode boundary refusal only — never redundancy. */
    allowBoundaryBreach?: boolean;
    execution?: 'inline' | 'dispatch';
    isolation?: 'worktree' | 'none';
    modelClass?: 'mechanical' | 'standard' | 'complex';
    /**
     * `context.source` tag on the `loop-violation` anomaly emitted for a
     * `LoopViolationError` caught below (D-N3/dec-20260815-007). Defaults to
     * `'build.task'` — this command's own identity — so every caller that
     * omits it keeps today's behavior byte-for-byte; `done.ts` passes
     * `'build.done'` to preserve its own distinct, pre-existing tag once it
     * delegates here instead of calling `recordTaskOutcome` directly.
     */
    anomalySource?: string;
  },
  io: CommandIO,
): Promise<CommandResult> {
  const statusRaw = args.status ?? 'DONE';
  const notes = args.notes ?? '';
  const anomalySource = args.anomalySource ?? 'build.task';
  try {
    const statusParse = TaskStatusZ.safeParse(statusRaw);
    if (
      !statusParse.success ||
      statusParse.data === 'PENDING' ||
      statusParse.data === 'IN_PROGRESS'
    ) {
      io.err(
        `Invalid task status: ${statusRaw}. Allowed: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED\n`,
      );
      return { exitCode: 2 };
    }
    const status = statusParse.data as RecordableStatus;

    const backend = new SimpleStateBackend(repoRoot);
    const state = await backend.readState();
    let draft: Draft | undefined;
    if (state.activePhase && state.activeDraft) {
      const draftPath = join(
        repoRoot, '.cadence', 'phases', state.activePhase, `${state.activeDraft}-DRAFT.md`,
      );
      if (existsSync(draftPath)) {
        draft = parseDraftMd(await readFile(draftPath, 'utf8'));
        const validIds = draft.tasks.map((t) => t.id);
        if (!validIds.includes(args.taskId)) {
          io.err(
            `build task: unknown task id "${args.taskId}". ` +
              `Valid ids in ${state.activeDraft}-DRAFT.md: ${validIds.join(', ') || '(none)'}. ` +
              `Nothing recorded.\n`,
          );
          return { exitCode: 2 };
        }
      }
    }

    // Config is expensive-ish (fs read) and not every status needs it —
    // load lazily once, shared by the per-task-verify gate below and the
    // B2 boundary/redundancy step further down.
    let cachedConfig: CadenceConfig | undefined;
    const getConfig = async (): Promise<CadenceConfig> => {
      if (!cachedConfig) cachedConfig = await loadConfig(repoRoot);
      return cachedConfig;
    };

    let perTaskRecord: PerTaskVerifyRecord | undefined;
    if (status === 'DONE' && draft) {
      const cfg = await getConfig();
      const ctx = buildBuildContext({
        cwd: repoRoot,
        state,
        draft,
        config: cfg,
        gateSet: effectiveGateSet(state, cfg, draft),
        taskId: args.taskId,
        opts:
          args.allowPerTaskFailure !== undefined
            ? { allowPerTaskFailure: args.allowPerTaskFailure }
            : {},
      });
      const res = await runPerTaskVerifyGate(ctx);
      if (res.outcome === 'refuse') {
        return { exitCode: 1 };
      }
      perTaskRecord = res.summaryPatch?.perTaskRecord;
    }

    // Phase 280 (280-01, T11) — B2 full wire-up. Fires on DONE or
    // DONE_WITH_CONCERNS, independent of the DONE-only per-task-verify gate
    // above. `gitTouchedFiles` stays `undefined` on every skip branch so the
    // final `recordTaskOutcome` call below falls back to the unchanged
    // self-report path — never a silent blend (AC-3).
    let gitTouchedFiles: string[] | undefined;
    if (status === 'DONE' || status === 'DONE_WITH_CONCERNS') {
      const declaredFiles = draft ? draft.tasks.flatMap((t) => t.files) : [];
      if (draft === undefined || declaredFiles.length === 0) {
        // (1) No active draft, or no task anywhere declares `files:` — there
        // is no boundary to check against. Stated skip reason, self-report
        // fallback for touchedFiles (AC-3's two "skipped" Given clauses).
        io.err(
          `build task: boundary/redundancy check skipped — ${
            draft === undefined ? 'no active draft loaded' : 'no task declares files:'
          }\n`,
        );
      } else {
        const cfg = await getConfig();
        // Both guaranteed set: `draft` is only non-undefined when both were
        // truthy above.
        const phase = state.activePhase!;
        const draftId = state.activeDraft!;
        const priorTasks = await readProgressRows(repoRoot, phase, draftId);

        // (2) anyTaskDispatched = any previously-recorded row carries
        // execution:'dispatch', OR this call's own opts.execution does.
        const anyTaskDispatched =
          Object.values(priorTasks).some((t) => t.execution === 'dispatch') ||
          args.execution === 'dispatch';

        // First-sighting semantics: subtract files already attributed to a
        // previously-recorded task so a stray file is only ever flagged once.
        // Excludes args.taskId itself: on a re-record of the same task (e.g.
        // a fix-dispatch DONE -> DONE_WITH_CONCERNS), priorTasks already
        // contains that task's own row from its earlier recording. Without
        // this filter its own previously-attributed files get subtracted
        // from its own new delta, yielding an empty delta that silently
        // overwrites its ground-truth touchedFiles with [] (record.ts's
        // `options?.gitTouchedFiles ?? ...` treats [] as present, not
        // nullish).
        const previouslyRecorded = new Set<string>(
          Object.entries(priorTasks)
            .filter(([id]) => id !== args.taskId)
            .flatMap(([, t]) => t.touchedFiles ?? []),
        );
        const integrationRef = cfg.phaseGuard?.integrationRef ?? 'main';
        const { delta, baseRefResolved } = await deriveTaskTouchedFiles(
          repoRoot,
          integrationRef,
          previouslyRecorded,
        );

        if (!baseRefResolved && delta.length === 0) {
          // AC-4: no `.git` directory (or every git shell-out failed) —
          // `collectUnscopedTouchedFiles` came back with its empty
          // best-effort result. Skip the check, self-report fallback,
          // recording still succeeds.
          io.err(
            'build task: boundary/redundancy check skipped: git unavailable ' +
              '(no base ref resolved and no working-tree changes visible) — ' +
              'falling back to the self-reported touchedFiles\n',
          );
        } else {
          // (3) The step actually runs — ground-truth touchedFiles from here
          // on, regardless of what the checks below find.
          gitTouchedFiles = delta;

          const enforcement = effectiveBoundaryEnforcement(cfg, draft, { anyTaskDispatched });
          const stamp = (): string => new Date().toISOString();
          const boundaryEvents = runBoundaryCheck({
            declaredFiles,
            touchedFiles: delta,
            stamp,
            root: repoRoot,
            severity: enforcement === 'block' ? 'error' : 'warn',
          });

          // Phase 286-01 (dec-20260821-001, D-Y) -- separate, additive
          // advisory pass: a declared wildcard entry that matched zero
          // touched files. Deliberately independent of boundaryEvents/
          // blockRefusal below -- never merged into that array, never
          // gates the exit code, always printed regardless of whether a
          // genuine files-outside-boundary refusal also fires this run.
          const unmatchedPatternEvents = findUnmatchedBoundaryPatterns({
            declaredFiles,
            touchedFiles: delta,
            stamp,
            root: repoRoot,
          });
          for (const ev of unmatchedPatternEvents) {
            io.err(`build task: ${ev.message}\n`);
          }

          const taskStatuses: Record<string, string> = {};
          for (const [id, row] of Object.entries(priorTasks)) taskStatuses[id] = row.status;
          const redundancyEvents = runRedundancyCheck({
            tasks: draft.tasks.map((t) => ({ taskId: t.id, files: t.files })),
            taskStatuses,
            touchedFiles: delta,
            stamp,
            root: repoRoot,
          });

          const blockRefusal = enforcement === 'block' && boundaryEvents.length > 0;

          if (blockRefusal && args.allowBoundaryBreach !== true) {
            // (4) Block mode + a real finding + no bypass flag — refuse,
            // name each stray file and its nearest owning task, never call
            // recordTaskOutcome.
            for (const ev of boundaryEvents) {
              const file = String(ev.context.file ?? '');
              const owner = nearestOwningTask(file, draft.tasks);
              io.err(
                `build task: refused — ${file} touched but not declared in any task's files:` +
                  `${owner ? ` (nearest owning task: ${owner})` : ''}\n`,
              );
            }
            io.err(
              'build task: refused — boundaryEnforcement resolved to block and ' +
                `${boundaryEvents.length} file(s) outside the declared boundary were found. ` +
                'Pass --allow-boundary-breach to record anyway.\n',
            );
            return { exitCode: 1 };
          }

          const notifier = selectNotifier(cfg);

          if (blockRefusal) {
            // (5) --allow-boundary-breach set: loud and unconditional (the
            // "Convenient Bypass" house rule — bypasses are always recorded
            // and visible), regardless of anomaly-notify gate membership.
            // Carries bypass provenance on every emitted event.
            const bypassEvents: AnomalyEvent[] = boundaryEvents.map((ev) => ({
              ...ev,
              context: { ...ev.context, bypassed: true, taskId: args.taskId },
            }));
            try {
              await notifier.notify(bypassEvents);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              io.err(
                `build task: notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
              );
            }
            io.err(
              `build task: --allow-boundary-breach set; recording past ${bypassEvents.length} ` +
                'offending file(s).\n',
            );
          }

          // (6) Routine notifier plumbing: warn-severity boundary events
          // (only reached here when enforcement !== 'block', or block mode
          // found nothing) plus redundancy events (always warn-only, never
          // part of the block/bypass decision above) — gated on the
          // anomaly-notify gate, same as every other anomaly emission point.
          const routineEvents = blockRefusal
            ? redundancyEvents
            : [...boundaryEvents, ...redundancyEvents];
          if (
            routineEvents.length > 0 &&
            effectiveGateSet(state, cfg, draft).gates.includes('anomaly-notify')
          ) {
            try {
              await notifier.notify(routineEvents);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              io.err(
                `build task: notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
              );
            }
          }
        }
      }
    }

    await recordTaskOutcome(repoRoot, args.taskId, status, notes, {
      ...(perTaskRecord ? { perTaskVerify: perTaskRecord } : {}),
      ...(gitTouchedFiles !== undefined ? { gitTouchedFiles } : {}),
      ...(args.execution !== undefined ? { execution: args.execution } : {}),
      ...(args.isolation !== undefined ? { isolation: args.isolation } : {}),
      ...(args.modelClass !== undefined ? { modelClass: args.modelClass } : {}),
    });
    io.out(`Recorded ${args.taskId}: ${status}\n`);
    return { exitCode: 0, data: { taskId: args.taskId, status } };
  } catch (err) {
    io.err(`${formatCommandError('build task', err)}\n`);
    if (err instanceof LoopViolationError) {
      await emitLoopViolation(repoRoot, err, anomalySource);
    }
    return { exitCode: 1 };
  }
}
