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
    .option(
      '--top <n>',
      'show only the top N ranked recommendations (totals still report the full count)',
      (v) => Number.parseInt(v, 10),
    )
    .action(async (opts: { json?: boolean; scoutId?: string; top?: number }) => {
      if (opts.top !== undefined && (Number.isNaN(opts.top) || opts.top < 1)) {
        process.stderr.write('recommend: --top must be a positive integer\n');
        process.exitCode = 1;
        return;
      }
      const args: { json?: boolean; scoutId?: string; top?: number } = {};
      if (opts.json) args.json = true;
      if (opts.scoutId) args.scoutId = opts.scoutId;
      if (opts.top !== undefined) args.top = opts.top;
      const { exitCode } = await recommendService(
        process.cwd(),
        args,
        processIO(),
      );
      if (exitCode) process.exitCode = exitCode;
    });
}
