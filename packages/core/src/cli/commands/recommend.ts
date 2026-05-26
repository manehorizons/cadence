import type { Command } from 'commander';
import { runRecommend } from '../../intelligence/recommend.js';
import { renderRecommendMd } from '../../intelligence/render-recommend.js';

export function registerRecommendCommand(program: Command): void {
  program
    .command('recommend')
    .description(
      'Rank actionable strategic recommendations and advise the next move (read-only)',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const report = await runRecommend(process.cwd());
        if (opts.json) {
          process.stdout.write(JSON.stringify(report) + '\n');
        } else {
          process.stdout.write(renderRecommendMd(report));
        }
      } catch (err) {
        process.stderr.write(
          `recommend failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
