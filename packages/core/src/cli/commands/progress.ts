import type { Command } from 'commander';
import { progressService } from '../../services/progress.js';
import { processIO } from '../../services/io.js';

export function registerProgressCommand(program: Command): void {
  program
    .command('progress')
    .description('Show single recommended next action')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      const args: { json?: boolean } = {};
      if (opts.json) args.json = true;
      const { exitCode } = await progressService(process.cwd(), processIO(), args);
      if (exitCode) process.exitCode = exitCode;
    });
}
