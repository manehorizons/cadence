import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TaskStatusZ, type Draft } from '@manehorizons/cadence-types';
import {
  recordTaskOutcome,
  type PerTaskVerifyRecord,
  type RecordableStatus,
} from '../build/record.js';
import { LoopViolationError } from '../errors.js';
import { emitLoopViolation } from '../notify/loop-violation.js';
import { loadConfig } from '../config/loader.js';
import { effectiveGateSet } from '../gates/engine.js';
import { parseDraftMd } from '../parse/draft-parser.js';
import { SimpleStateBackend } from '../state/simple.js';
import { runPerTaskVerifyGate } from '../gates/per-task-verify.js';
import { buildBuildContext } from '../gates/build-context.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence build task <id>` — record a task outcome (runs the per-task verifier
 * gate on DONE). Faithful extraction of the former CLI action body.
 */
export async function buildTaskService(
  repoRoot: string,
  args: { taskId: string; status?: string; notes?: string; allowPerTaskFailure?: boolean },
  io: CommandIO,
): Promise<CommandResult> {
  const statusRaw = args.status ?? 'DONE';
  const notes = args.notes ?? '';
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

    let perTaskRecord: PerTaskVerifyRecord | undefined;
    if (status === 'DONE' && draft) {
      const cfg = await loadConfig(repoRoot).catch(() => null);
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

    await recordTaskOutcome(repoRoot, args.taskId, status, notes, perTaskRecord);
    io.out(`Recorded ${args.taskId}: ${status}\n`);
    return { exitCode: 0, data: { taskId: args.taskId, status } };
  } catch (err) {
    io.err(`build task failed: ${err instanceof Error ? err.message : String(err)}\n`);
    if (err instanceof LoopViolationError) {
      await emitLoopViolation(repoRoot, err, 'build.task');
    }
    return { exitCode: 1 };
  }
}
