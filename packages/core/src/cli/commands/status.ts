import type { Command } from 'commander';
import { loadStatus, renderStatus } from '../../status.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show full loop context (phase, draft, tasks, ACs, next)')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const report = await loadStatus(process.cwd());
        if (opts.json) {
          process.stdout.write(JSON.stringify(report) + '\n');
        } else {
          process.stdout.write(renderStatus(report));
        }
      } catch (err) {
        process.stderr.write(
          `status failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
