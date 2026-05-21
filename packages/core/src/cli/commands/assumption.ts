import type { Command } from 'commander';
import type { Assumption } from '@cadence/types';
import {
  addAssumption,
  readAssumptionLedger,
  runAssumptionTransition,
  type AssumptionTransitionAction,
} from '../../intelligence/store.js';

const ASSUMPTION_TRANSITION_DESCRIPTIONS: Record<
  AssumptionTransitionAction,
  string
> = {
  validate: 'Mark an open assumption validated',
  reject: 'Mark an open assumption rejected',
  reopen: 'Reopen a validated or rejected assumption',
};

const ASSUMPTION_TRANSITION_PAST: Record<
  AssumptionTransitionAction,
  Assumption['status']
> = {
  validate: 'validated',
  reject: 'rejected',
  reopen: 'open',
};

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

  for (const action of ['validate', 'reject', 'reopen'] as const) {
    cmd
      .command(`${action} <id>`)
      .description(ASSUMPTION_TRANSITION_DESCRIPTIONS[action])
      .action(async (id: string) => {
        try {
          const res = await runAssumptionTransition(process.cwd(), id, action);
          if (!res.ok) {
            process.stderr.write(`assumption ${action} refused: ${res.error}\n`);
            process.exitCode = 1;
            return;
          }
          process.stdout.write(
            `assumption ${id} → ${ASSUMPTION_TRANSITION_PAST[action]}\n`,
          );
        } catch (err) {
          process.stderr.write(
            `assumption ${action} failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      });
  }
}
