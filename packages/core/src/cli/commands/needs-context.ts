import type { Command } from 'commander';
import { recordTaskOutcome } from '../../build/record.js';

export function registerNeedsContextCommand(program: Command): void {
  program
    .command('needs-context <id>')
    .description('Shortcut for `keel build task <id> --status=NEEDS_CONTEXT`')
    .option('--notes <n>', 'Notes', '')
    .action(async (taskId: string, opts: { notes: string }) => {
      try {
        await recordTaskOutcome(process.cwd(), taskId, 'NEEDS_CONTEXT', opts.notes);
        console.log(`Recorded ${taskId}: NEEDS_CONTEXT`);
      } catch (err) {
        process.stderr.write(
          `needs-context failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
