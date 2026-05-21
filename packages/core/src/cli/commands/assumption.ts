import type { Command } from 'commander';
import {
  addAssumption,
  readAssumptionLedger,
} from '../../intelligence/store.js';

export function registerAssumptionCommand(program: Command): void {
  const cmd = program
    .command('assumption')
    .description('Manage CADENCE strategic-intelligence assumptions');

  cmd
    .command('add')
    .description('Add a manual assumption tied to a recommendation')
    .requiredOption('--rec <id>', 'Recommendation id this assumption belongs to')
    .requiredOption('--text <text>', 'Assumption statement')
    .action(async (opts: { rec: string; text: string }) => {
      try {
        const a = await addAssumption(process.cwd(), {
          recommendationId: opts.rec,
          text: opts.text,
        });
        process.stdout.write(`Added ${a.id}: ${a.text}\n`);
        process.stdout.write(`Next: cadence assumption list\n`);
      } catch (err) {
        process.stderr.write(
          `assumption add failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .description('List recorded assumptions')
    .action(async () => {
      try {
        const ledger = await readAssumptionLedger(process.cwd());
        if (ledger.assumptions.length === 0) {
          process.stdout.write('No assumptions recorded.\n');
          return;
        }
        for (const a of ledger.assumptions) {
          process.stdout.write(`${a.id}  ${a.status}  ${a.recommendationId}  ${a.text}\n`);
        }
      } catch (err) {
        process.stderr.write(
          `assumption list failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
