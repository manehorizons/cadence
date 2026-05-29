import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TaskStatusZ, type Draft } from '@cadence/types';
import {
  recordTaskOutcome,
  type PerTaskVerifyRecord,
  type RecordableStatus,
} from '../../build/record.js';
import { LoopViolationError } from '../../errors.js';
import { emitLoopViolation } from '../../notify/loop-violation.js';
import { loadConfig } from '../../config/loader.js';
import { effectiveGateSet } from '../../gates/engine.js';
import { parseDraftMd } from '../../parse/draft-parser.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { runPerTaskVerifyGate } from '../../gates/per-task-verify.js';
import { buildBuildContext } from '../../gates/build-context.js';

export function registerBuildCommand(program: Command): void {
  const cmd = program.command('build').description('BUILD phase task tracking');

  cmd
    .command('task <id>')
    .description('Record outcome for task <id>')
    .option('--status <s>', 'DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED', 'DONE')
    .option('--notes <n>', 'Notes', '')
    .option(
      '--allow-per-task-failure',
      'bypass the per-task verifier gate (Phase 24.2): record DONE even if the verifier refuses',
    )
    .action(
      async (
        taskId: string,
        opts: { status: string; notes: string; allowPerTaskFailure?: boolean },
      ) => {
        try {
          const statusParse = TaskStatusZ.safeParse(opts.status);
          if (
            !statusParse.success ||
            statusParse.data === 'PENDING' ||
            statusParse.data === 'IN_PROGRESS'
          ) {
            process.stderr.write(
              `Invalid task status: ${opts.status}. Allowed: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED\n`,
            );
            process.exitCode = 2;
            return;
          }
          const status = statusParse.data as RecordableStatus;
          const cwd = process.cwd();

          // Resolve the active DRAFT once. Phase 29.8 T3 task-id validation and
          // the per-task gate both need it; only when resolvable, else the
          // no-active-draft / loop-violation paths are handled downstream.
          const backend = new SimpleStateBackend(cwd);
          const state = await backend.readState();
          let draft: Draft | undefined;
          if (state.activePhase && state.activeDraft) {
            const draftPath = join(
              cwd, '.cadence', 'phases', state.activePhase, `${state.activeDraft}-DRAFT.md`,
            );
            if (existsSync(draftPath)) {
              draft = parseDraftMd(await readFile(draftPath, 'utf8'));
              const validIds = draft.tasks.map((t) => t.id);
              if (!validIds.includes(taskId)) {
                process.stderr.write(
                  `build task: unknown task id "${taskId}". ` +
                    `Valid ids in ${state.activeDraft}-DRAFT.md: ${validIds.join(', ') || '(none)'}. ` +
                    `Nothing recorded.\n`,
                );
                process.exitCode = 2;
                return;
              }
            }
          }

          // Phase 24.2 — per-task verifier gate. Fires only on DONE outcomes
          // when a DRAFT is resolvable; the gate membership-guards itself.
          let perTaskRecord: PerTaskVerifyRecord | undefined;
          if (status === 'DONE' && draft) {
            const cfg = await loadConfig(cwd).catch(() => null);
            const ctx = buildBuildContext({
              cwd,
              state,
              draft,
              config: cfg,
              gateSet: effectiveGateSet(state, cfg, draft),
              taskId,
              opts:
                opts.allowPerTaskFailure !== undefined
                  ? { allowPerTaskFailure: opts.allowPerTaskFailure }
                  : {},
            });
            const res = await runPerTaskVerifyGate(ctx);
            if (res.outcome === 'refuse') {
              process.exitCode = 1;
              return;
            }
            perTaskRecord = res.summaryPatch?.perTaskRecord;
          }

          await recordTaskOutcome(cwd, taskId, status, opts.notes, perTaskRecord);
          console.log(`Recorded ${taskId}: ${status}`);
        } catch (err) {
          process.stderr.write(
            `build task failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          if (err instanceof LoopViolationError) {
            await emitLoopViolation(process.cwd(), err, 'build.task');
          }
          process.exitCode = 1;
        }
      },
    );
}
