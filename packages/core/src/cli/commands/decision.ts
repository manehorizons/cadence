import type { Command } from 'commander';
import type { IntelligenceDecision } from '@cadence/types';
import {
  addIntelligenceDecision,
  readIntelligenceDecisionLedger,
  runDecisionTransition,
  type AddIntelligenceDecisionInput,
  type DecisionTransitionAction,
} from '../../intelligence/store.js';

const DECISION_TRANSITION_DESCRIPTIONS: Record<DecisionTransitionAction, string> = {
  supersede: 'Mark an active decision superseded',
  rescind: 'Mark an active decision rescinded',
  reactivate: 'Reactivate a superseded or rescinded decision',
};

const DECISION_TRANSITION_PAST: Record<
  DecisionTransitionAction,
  IntelligenceDecision['status']
> = {
  supersede: 'superseded',
  rescind: 'rescinded',
  reactivate: 'active',
};

export function registerDecisionCommand(program: Command): void {
  const cmd = program
    .command('decision')
    .description('Manage CADENCE strategic-intelligence decisions');

  cmd
    .command('add')
    .description('Record an architectural decision (optionally tied to a recommendation)')
    .option('--rec <id>', 'Recommendation id this decision belongs to (optional)')
    .requiredOption('--title <title>', 'Short decision title')
    .requiredOption('--rationale <text>', 'Decision rationale')
    .action(async (opts: { rec?: string; title: string; rationale: string }) => {
      try {
        const input: AddIntelligenceDecisionInput = {
          title: opts.title,
          rationale: opts.rationale,
        };
        if (opts.rec) input.recommendationId = opts.rec;
        const d = await addIntelligenceDecision(process.cwd(), input);
        process.stdout.write(`Added ${d.id}: ${d.title}\n`);
        process.stdout.write(`Next: cadence decision list\n`);
      } catch (err) {
        process.stderr.write(
          `decision add failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .description('List recorded decisions')
    .action(async () => {
      try {
        const ledger = await readIntelligenceDecisionLedger(process.cwd());
        if (ledger.decisions.length === 0) {
          process.stdout.write('No decisions recorded.\n');
          return;
        }
        for (const d of ledger.decisions) {
          process.stdout.write(
            `${d.id}  ${d.status}  ${d.recommendationId ?? '—'}  ${d.title}\n`,
          );
        }
      } catch (err) {
        process.stderr.write(
          `decision list failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  for (const action of ['supersede', 'rescind', 'reactivate'] as const) {
    cmd
      .command(`${action} <id>`)
      .description(DECISION_TRANSITION_DESCRIPTIONS[action])
      .action(async (id: string) => {
        try {
          const res = await runDecisionTransition(process.cwd(), id, action);
          if (!res.ok) {
            process.stderr.write(`decision ${action} refused: ${res.error}\n`);
            process.exitCode = 1;
            return;
          }
          process.stdout.write(
            `decision ${id} → ${DECISION_TRANSITION_PAST[action]}\n`,
          );
        } catch (err) {
          process.stderr.write(
            `decision ${action} failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      });
  }
}
