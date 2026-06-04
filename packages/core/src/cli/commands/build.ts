import type { Command } from 'commander';
import { buildTaskService } from '../../services/build-task.js';
import { processIO } from '../../services/io.js';

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
        const { exitCode } = await buildTaskService(
          process.cwd(),
          {
            taskId,
            status: opts.status,
            notes: opts.notes,
            ...(opts.allowPerTaskFailure !== undefined ? { allowPerTaskFailure: opts.allowPerTaskFailure } : {}),
          },
          processIO(),
        );
        if (exitCode) process.exitCode = exitCode;
      },
    );
}
