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
    .action(async (opts: { json?: boolean }) => {
      const { exitCode } = await recommendService(
        process.cwd(),
        opts.json ? { json: true } : {},
        processIO(),
      );
      if (exitCode) process.exitCode = exitCode;
    });
}
