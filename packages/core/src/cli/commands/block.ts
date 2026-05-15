import type { Command } from 'commander';
import { recordTaskOutcome } from '../../build/record.js';
import { LoopViolationError } from '../../errors.js';
import { emitLoopViolation } from '../../notify/loop-violation.js';

export function registerBlockCommand(program: Command): void {
  program
    .command('block <id>')
    .description('Shortcut for `cadence build task <id> --status=BLOCKED`')
    .option('--notes <n>', 'Notes', '')
    .action(async (taskId: string, opts: { notes: string }) => {
      try {
        await recordTaskOutcome(process.cwd(), taskId, 'BLOCKED', opts.notes);
        console.log(`Recorded ${taskId}: BLOCKED`);
      } catch (err) {
        process.stderr.write(
          `block failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        if (err instanceof LoopViolationError) {
          await emitLoopViolation(process.cwd(), err, 'build.block');
        }
        process.exitCode = 1;
      }
    });
}
