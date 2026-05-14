import type { Command } from 'commander';
import { recordTaskOutcome } from '../../build/record.js';

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
        process.exitCode = 1;
      }
    });
}
