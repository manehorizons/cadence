import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeIntelligenceAudit,
  computeIntelligenceStats,
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  runIntelligenceReconcile,
} from '../../intelligence/store.js';
import { renderIntelligenceStats } from '../../intelligence/render-intelligence-stats.js';
import { renderIntelligenceAudit } from '../../intelligence/render-intelligence-audit.js';

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

  cmd
    .command('stats')
    .description('Summary counts across all 4 intelligence ledgers')
    .option('--by-rec', 'Per-rec breakdown table instead of aggregate view', false)
    .action(async (opts: { byRec?: boolean }) => {
      try {
        const root = process.cwd();
        const intelDir = join(root, '.cadence', 'intelligence');
        if (!existsSync(intelDir)) {
          process.stdout.write('No intelligence ledgers present.\n');
          return;
        }
        const recLedger = await readRecommendationLedger(root);
        const evLedger = await readEvidenceLedger(root);
        const asLedger = await readAssumptionLedger(root);
        const decLedger = await readIntelligenceDecisionLedger(root);
        if (
          recLedger.recommendations.length === 0 &&
          evLedger.evidence.length === 0 &&
          asLedger.assumptions.length === 0 &&
          decLedger.decisions.length === 0
        ) {
          process.stdout.write('No intelligence ledgers present.\n');
          return;
        }
        const stats = computeIntelligenceStats(
          recLedger,
          evLedger,
          asLedger,
          decLedger,
        );
        const renderOpts: { byRec?: boolean } = {};
        if (opts.byRec) renderOpts.byRec = true;
        const md = renderIntelligenceStats(stats, renderOpts);
        process.stdout.write(md);
        if (!md.endsWith('\n')) process.stdout.write('\n');
      } catch (err) {
        process.stderr.write(
          `intelligence stats failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('audit')
    .description(
      'Enumerate integrity issues (broken links + orphan subjects) across the intelligence layer',
    )
    .option('--quiet', 'Exit 0 even when findings are present (script-friendly)', false)
    .action(async (opts: { quiet?: boolean }) => {
      try {
        const root = process.cwd();
        const intelDir = join(root, '.cadence', 'intelligence');
        if (!existsSync(intelDir)) {
          process.stdout.write('No intelligence ledgers present.\n');
          return;
        }
        const recLedger = await readRecommendationLedger(root);
        const evLedger = await readEvidenceLedger(root);
        const asLedger = await readAssumptionLedger(root);
        const decLedger = await readIntelligenceDecisionLedger(root);
        if (
          recLedger.recommendations.length === 0 &&
          evLedger.evidence.length === 0 &&
          asLedger.assumptions.length === 0 &&
          decLedger.decisions.length === 0
        ) {
          process.stdout.write('No intelligence ledgers present.\n');
          return;
        }
        const report = computeIntelligenceAudit(
          recLedger,
          evLedger,
          asLedger,
          decLedger,
        );
        const md = renderIntelligenceAudit(report);
        process.stdout.write(md);
        if (!md.endsWith('\n')) process.stdout.write('\n');
        if (report.findings.length > 0 && !opts.quiet) {
          process.exitCode = 1;
        }
      } catch (err) {
        process.stderr.write(
          `intelligence audit failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
