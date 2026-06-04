import type { Command } from 'commander';
import { progressService } from '../../services/progress.js';
import { processIO } from '../../services/io.js';

export function registerProgressCommand(program: Command): void {
  program
    .command('progress')
    .description('Show single recommended next action')
    .action(async () => {
      const { exitCode } = await progressService(process.cwd(), processIO());
      if (exitCode) process.exitCode = exitCode;
    });
}
