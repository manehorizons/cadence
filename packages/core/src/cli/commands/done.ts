import type { Command } from 'commander';
import { buildTaskService } from '../../services/build-task.js';
import { processIO } from '../../services/io.js';

/**
 * `cadence done <id>` is a true alias for `cadence build task <id>
 * --status=DONE` (D-N, dec-20260815-005): it delegates entirely to
 * `buildTaskService`, which already runs the per-task-verify gate and the
 * record-time boundary/redundancy check, prints its own success/failure
 * output via `io`, and handles `LoopViolationError` internally (emitting the
 * violation notice and returning `exitCode: 1` rather than throwing). No
 * bypass flags are added here — a caller needing `--allow-per-task-failure`
 * or `--allow-boundary-breach` must use `build task` directly.
 *
 * `anomalySource: 'build.done'` (D-N3, dec-20260815-007) preserves this
 * command's own pre-existing `loop-violation` anomaly tag — distinct from
 * `build task`'s `'build.task'` default — through the delegation.
 */
export function registerDoneCommand(program: Command): void {
  program
    .command('done <id>')
    .description('Shortcut for `cadence build task <id> --status=DONE`')
    .option('--notes <n>', 'Notes', '')
    .action(async (taskId: string, opts: { notes: string }) => {
      const io = processIO();
      const { exitCode } = await buildTaskService(
        process.cwd(),
        { taskId, status: 'DONE', notes: opts.notes, anomalySource: 'build.done' },
        io,
      );
      if (exitCode) process.exitCode = exitCode;
    });
}
