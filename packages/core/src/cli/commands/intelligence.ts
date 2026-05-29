import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AUDIT_KINDS,
  computeIntelligenceAudit,
  computeIntelligenceStats,
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  runIntelligenceReconcile,
  type AuditKind,
  type IntelligenceAuditReport,
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
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .action(async (opts: { byRec?: boolean; format?: string }) => {
      try {
        const format = opts.format ?? 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          process.stderr.write(
            `intelligence stats failed: unsupported format: ${format}\n`,
          );
          process.exitCode = 1;
          return;
        }
        const root = process.cwd();
        const intelDir = join(root, '.cadence', 'intelligence');
        if (!existsSync(intelDir)) {
          if (format === 'json') {
            process.stdout.write('null\n');
          } else {
            process.stdout.write('No intelligence ledgers present.\n');
          }
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
          if (format === 'json') {
            process.stdout.write('null\n');
          } else {
            process.stdout.write('No intelligence ledgers present.\n');
          }
          return;
        }
        const stats = computeIntelligenceStats(
          recLedger,
          evLedger,
          asLedger,
          decLedger,
        );
        if (format === 'json') {
          process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
          return;
        }
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
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option(
      '--filter-kind <kind>',
      `Filter audit findings to a single finding kind. Allowed: ${AUDIT_KINDS.join(', ')}.`,
    )
    .action(async (opts: { quiet?: boolean; format?: string; filterKind?: string }) => {
      try {
        const format = opts.format ?? 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          process.stderr.write(
            `intelligence audit failed: unsupported format: ${format}\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (
          opts.filterKind !== undefined &&
          !(AUDIT_KINDS as readonly string[]).includes(opts.filterKind)
        ) {
          process.stderr.write(
            `intelligence audit failed: invalid kind: '${opts.filterKind}' (allowed: ${AUDIT_KINDS.join(', ')})\n`,
          );
          process.exitCode = 1;
          return;
        }
        const root = process.cwd();
        const intelDir = join(root, '.cadence', 'intelligence');
        if (!existsSync(intelDir)) {
          if (format === 'json') {
            process.stdout.write('null\n');
          } else {
            process.stdout.write('No intelligence ledgers present.\n');
          }
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
          if (format === 'json') {
            process.stdout.write('null\n');
          } else {
            process.stdout.write('No intelligence ledgers present.\n');
          }
          return;
        }
        // Slice 34.2: pre-compute set of existing phase dirs so
        // computeIntelligenceAudit stays pure-sync. Missing .cadence/phases dir
        // is benign (empty set → all converted refs surface as stale, which is
        // the correct signal when no phases exist).
        let existingPhaseIds: Set<string>;
        try {
          const entries = await readdir(join(root, '.cadence/phases'), { withFileTypes: true });
          existingPhaseIds = new Set(
            entries.filter((e) => e.isDirectory()).map((e) => e.name),
          );
        } catch {
          existingPhaseIds = new Set();
        }
        const report = computeIntelligenceAudit(
          recLedger,
          evLedger,
          asLedger,
          decLedger,
          existingPhaseIds,
        );
        const filterKind = opts.filterKind as AuditKind | undefined;
        const view: IntelligenceAuditReport =
          filterKind === undefined
            ? report
            : {
                findings: report.byKind[filterKind],
                byKind: Object.fromEntries(
                  AUDIT_KINDS.map((k) => [k, k === filterKind ? report.byKind[k] : []]),
                ) as IntelligenceAuditReport['byKind'],
              };
        if (format === 'json') {
          process.stdout.write(JSON.stringify(view, null, 2) + '\n');
        } else {
          const md = renderIntelligenceAudit(
            view,
            filterKind === undefined ? undefined : { filterKind },
          );
          process.stdout.write(md);
          if (!md.endsWith('\n')) process.stdout.write('\n');
        }
        if (view.findings.length > 0 && !opts.quiet) {
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
