import type { Command } from 'commander';
import { runIntelligenceReconcile } from '../../intelligence/store.js';

export function registerIntelligenceCommand(program: Command): void {
  const cmd = program
    .command('intelligence')
    .description('CADENCE strategic-intelligence admin utilities');

  cmd
    .command('reconcile')
    .description(
      'Re-derive recommendation link arrays and re-render all intelligence MD files',
    )
    .action(async () => {
      try {
        const res = await runIntelligenceReconcile(process.cwd());
        if (!res.present) {
          process.stdout.write('No intelligence ledgers present.\n');
          return;
        }
        process.stdout.write(
          `Reconciled ${res.recommendations} recommendations, ${res.assumptions} assumptions, ${res.decisions} decisions.\n`,
        );
        process.stdout.write(
          'Updated: recommendations.json, RECOMMENDATIONS.md, ASSUMPTIONS.md, DECISIONS.md.\n',
        );
      } catch (err) {
        process.stderr.write(
          `intelligence reconcile failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
