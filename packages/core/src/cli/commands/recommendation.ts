import type { Command } from 'commander';
import {
  RecommendationPriorityZ,
  RecommendationReadinessZ,
} from '@cadence/types';
import {
  addRecommendation,
  readRecommendationLedger,
  type AddRecommendationInput,
} from '../../intelligence/store.js';

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
