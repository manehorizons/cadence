import type { Command } from 'commander';
import { recommendService } from '../../services/recommend.js';
import { processIO } from '../../services/io.js';

export function registerRecommendCommand(program: Command): void {
  program
    .command('recommend')
    .description(
      'Rank actionable strategic recommendations and advise the next move (read-only)',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .option('--scout-id <id>', 'narrow the report to one scout session cluster')
    .action(async (opts: { json?: boolean; scoutId?: string }) => {
      const args: { json?: boolean; scoutId?: string } = {};
      if (opts.json) args.json = true;
      if (opts.scoutId) args.scoutId = opts.scoutId;
      const { exitCode } = await recommendService(
        process.cwd(),
        args,
        processIO(),
      );
      if (exitCode) process.exitCode = exitCode;
    });
}
