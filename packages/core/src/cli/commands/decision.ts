import type { Command } from 'commander';
import type { IntelligenceDecision } from '@cadence/types';
import {
  addIntelligenceDecision,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  runDecisionTransition,
  type AddIntelligenceDecisionInput,
  type DecisionTransitionAction,
} from '../../intelligence/store.js';
import { renderDecisionDetail } from '../../intelligence/render-decision-detail.js';

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
    .command('show <id>')
    .description('Show a single decision with its tied recommendation cross-ref')
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .action(async (id: string, opts: { format?: string }) => {
      try {
        const format = opts.format ?? 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          process.stderr.write(
            `decision show failed: unsupported format: ${format}\n`,
          );
          process.exitCode = 1;
          return;
        }
        const decLedger = await readIntelligenceDecisionLedger(process.cwd());
        const dec = decLedger.decisions.find((d) => d.id === id);
        if (!dec) {
          process.stderr.write(`decision ${id} not found\n`);
          process.exitCode = 1;
          return;
        }
        let rec = undefined;
        if (dec.recommendationId) {
          const recLedger = await readRecommendationLedger(process.cwd());
          rec = recLedger.recommendations.find(
            (r) => r.id === dec.recommendationId,
          );
        }
        if (format === 'json') {
          const envelope = { decision: dec, recommendation: rec ?? null };
          process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
          return;
        }
        const md = renderDecisionDetail(dec, rec);
        process.stdout.write(md);
        if (!md.endsWith('\n')) process.stdout.write('\n');
      } catch (err) {
        process.stderr.write(
          `decision show failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .description('List recorded decisions')
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .action(async (opts: { format?: string }) => {
      try {
        const format = opts.format ?? 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          process.stderr.write(
            `decision list failed: unsupported format: ${format}\n`,
          );
          process.exitCode = 1;
          return;
        }
        const ledger = await readIntelligenceDecisionLedger(process.cwd());
        if (format === 'json') {
          process.stdout.write(JSON.stringify(ledger.decisions, null, 2) + '\n');
          return;
        }
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
