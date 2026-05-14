import type { Command } from 'commander';
import { recordTaskOutcome } from '../../build/record.js';

export function registerDoneCommand(program: Command): void {
  program
    .command('done <id>')
    .description('Shortcut for `keel build task <id> --status=DONE`')
    .option('--notes <n>', 'Notes', '')
    .action(async (taskId: string, opts: { notes: string }) => {
      try {
        await recordTaskOutcome(process.cwd(), taskId, 'DONE', opts.notes);
        console.log(`Recorded ${taskId}: DONE`);
      } catch (err) {
        process.stderr.write(
          `done failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
