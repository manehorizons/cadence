import type { Command } from 'commander';
import { runInspect } from '../../intelligence/inspect.js';
import { renderStrategyMd } from '../../intelligence/render-inspection.js';

export function registerInspectCommand(program: Command): void {
  program
    .command('inspect')
    .description('Scan the project and synthesize strategic status (read-only)')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const inspection = await runInspect(process.cwd());
        if (opts.json) {
          process.stdout.write(JSON.stringify(inspection) + '\n');
        } else {
          process.stdout.write(renderStrategyMd(inspection));
        }
      } catch (err) {
        process.stderr.write(
          `inspect failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
