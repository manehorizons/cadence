import type { Command } from 'commander';
import { nextService } from '../../services/next.js';
import { processIO } from '../../services/io.js';

export function registerNextCommand(program: Command): void {
  program
    .command('next')
    .description('Show ranked legal next moves at the current loop position')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      const args: { json?: boolean } = {};
      if (opts.json) args.json = true;
      const { exitCode } = await nextService(process.cwd(), args, processIO());
      if (exitCode) process.exitCode = exitCode;
    });
}
