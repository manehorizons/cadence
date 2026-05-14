import type { Command } from 'commander';
import { TaskStatusZ } from '@cadence/types';
import { recordTaskOutcome, type RecordableStatus } from '../../build/record.js';

export function registerBuildCommand(program: Command): void {
  const cmd = program.command('build').description('BUILD phase task tracking');

  cmd
    .command('task <id>')
    .description('Record outcome for task <id>')
    .option('--status <s>', 'DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED', 'DONE')
    .option('--notes <n>', 'Notes', '')
    .action(async (taskId: string, opts: { status: string; notes: string }) => {
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
        await recordTaskOutcome(
          process.cwd(),
          taskId,
          statusParse.data as RecordableStatus,
          opts.notes,
        );
        console.log(`Recorded ${taskId}: ${statusParse.data}`);
      } catch (err) {
        process.stderr.write(
          `build task failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
