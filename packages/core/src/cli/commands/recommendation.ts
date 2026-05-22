import type { Command } from 'commander';
import {
  RecommendationPriorityZ,
  RecommendationReadinessZ,
} from '@cadence/types';
import {
  addRecommendation,
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  type AddRecommendationInput,
} from '../../intelligence/store.js';
import { renderRecommendationDetail } from '../../intelligence/render-recommendation-detail.js';

function csv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function registerRecommendationCommand(program: Command): void {
  const cmd = program
    .command('recommendation')
    .description('Manage CADENCE strategic-intelligence recommendations');

  cmd
    .command('add')
    .description('Add a manual strategic recommendation')
    .requiredOption('--title <title>', 'Recommendation title')
    .requiredOption('--summary <summary>', 'Recommendation summary')
    .option('--priority <priority>', 'low | medium | high | critical', 'medium')
    .option(
      '--readiness <readiness>',
      'raw-idea | needs-evidence | needs-decision | ready-for-milestone | ready-for-cadence-spec | blocked',
      'raw-idea',
    )
    .option('--area <areas>', 'Comma-separated affected areas')
    .option('--file <files>', 'Comma-separated affected file paths')
    .option('--evidence <summary>', 'Short evidence note')
    .action(
      async (opts: {
        title: string;
        summary: string;
        priority: string;
        readiness: string;
        area?: string;
        file?: string;
        evidence?: string;
      }) => {
        try {
          const priority = RecommendationPriorityZ.parse(opts.priority);
          const readiness = RecommendationReadinessZ.parse(opts.readiness);
          const input: AddRecommendationInput = {
            title: opts.title,
            summary: opts.summary,
            priority,
            readiness,
            affectedAreas: csv(opts.area),
            affectedFiles: csv(opts.file),
          };
          if (opts.evidence) input.evidenceSummary = opts.evidence;
          const rec = await addRecommendation(process.cwd(), input);
          process.stdout.write(`Added ${rec.id}: ${rec.title}\n`);
          process.stdout.write(`Next: cadence recommendation list\n`);
        } catch (err) {
          process.stderr.write(
            `recommendation add failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      },
    );

  cmd
    .command('show <id>')
    .description('Show a single recommendation with all linked assumptions, decisions, and evidence')
    .option('--open-assumptions-only', 'Filter assumptions to status=open only', false)
    .option('--active-decisions-only', 'Filter decisions to status=active only', false)
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .action(
      async (
        id: string,
        opts: {
          openAssumptionsOnly?: boolean;
          activeDecisionsOnly?: boolean;
          format?: string;
        },
      ) => {
        try {
          const format = opts.format ?? 'terminal';
          if (format !== 'terminal' && format !== 'json') {
            process.stderr.write(
              `recommendation show failed: unsupported format: ${format}\n`,
            );
            process.exitCode = 1;
            return;
          }
          const recLedger = await readRecommendationLedger(process.cwd());
          const rec = recLedger.recommendations.find((r) => r.id === id);
          if (!rec) {
            process.stderr.write(`recommendation ${id} not found\n`);
            process.exitCode = 1;
            return;
          }
          const evLedger = await readEvidenceLedger(process.cwd());
          const asLedger = await readAssumptionLedger(process.cwd());
          const decLedger = await readIntelligenceDecisionLedger(process.cwd());
          const evLinked = evLedger.evidence.filter((e) =>
            rec.evidenceIds.includes(e.id),
          );
          const asLinked = asLedger.assumptions.filter((a) =>
            rec.assumptionIds.includes(a.id),
          );
          const decLinked = decLedger.decisions.filter((d) =>
            rec.decisionIds.includes(d.id),
          );
          if (format === 'json') {
            const envelope = {
              recommendation: rec,
              linkedEvidence: evLinked,
              linkedAssumptions: asLinked,
              linkedDecisions: decLinked,
              filters: {
                openAssumptionsOnly: Boolean(opts.openAssumptionsOnly),
                activeDecisionsOnly: Boolean(opts.activeDecisionsOnly),
              },
            };
            process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
            return;
          }
          const renderOpts: {
            openAssumptionsOnly?: boolean;
            activeDecisionsOnly?: boolean;
          } = {};
          if (opts.openAssumptionsOnly) renderOpts.openAssumptionsOnly = true;
          if (opts.activeDecisionsOnly) renderOpts.activeDecisionsOnly = true;
          const md = renderRecommendationDetail(rec, evLinked, asLinked, decLinked, renderOpts);
          process.stdout.write(md);
          if (!md.endsWith('\n')) process.stdout.write('\n');
        } catch (err) {
          process.stderr.write(
            `recommendation show failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      },
    );

  cmd
    .command('list')
    .description('List recorded recommendations')
    .action(async () => {
      try {
        const ledger = await readRecommendationLedger(process.cwd());
        if (ledger.recommendations.length === 0) {
          process.stdout.write('No recommendations recorded.\n');
          return;
        }
        for (const rec of ledger.recommendations) {
          process.stdout.write(
            `${rec.id}  ${rec.priority}  ${rec.readiness}  ${rec.title}\n`,
          );
        }
      } catch (err) {
        process.stderr.write(
          `recommendation list failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
