import type { Command } from 'commander';
import { recordTaskOutcome } from '../../build/record.js';
import { LoopViolationError } from '../../errors.js';
import { emitLoopViolation } from '../../notify/loop-violation.js';

export function registerDoneCommand(program: Command): void {
  program
    .command('done <id>')
    .description('Shortcut for `cadence build task <id> --status=DONE`')
    .option('--notes <n>', 'Notes', '')
    .action(async (taskId: string, opts: { notes: string }) => {
      try {
        await recordTaskOutcome(process.cwd(), taskId, 'DONE', opts.notes);
        console.log(`Recorded ${taskId}: DONE`);
      } catch (err) {
        process.stderr.write(
          `done failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        if (err instanceof LoopViolationError) {
          await emitLoopViolation(process.cwd(), err, 'build.done');
        }
        process.exitCode = 1;
      }
    });
}
