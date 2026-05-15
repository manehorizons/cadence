import type { Command } from 'commander';
import { recordTaskOutcome } from '../../build/record.js';
import { LoopViolationError } from '../../errors.js';
import { emitLoopViolation } from '../../notify/loop-violation.js';

export function registerNeedsContextCommand(program: Command): void {
  program
    .command('needs-context <id>')
    .description('Shortcut for `cadence build task <id> --status=NEEDS_CONTEXT`')
    .option('--notes <n>', 'Notes', '')
    .action(async (taskId: string, opts: { notes: string }) => {
      try {
        await recordTaskOutcome(process.cwd(), taskId, 'NEEDS_CONTEXT', opts.notes);
        console.log(`Recorded ${taskId}: NEEDS_CONTEXT`);
      } catch (err) {
        process.stderr.write(
          `needs-context failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        if (err instanceof LoopViolationError) {
          await emitLoopViolation(process.cwd(), err, 'build.needs-context');
        }
        process.exitCode = 1;
      }
    });
}
