import type { Command } from 'commander';
import {
  type Recommendation,
  RecommendationDecayStateZ,
  RecommendationPriorityZ,
  RecommendationReadinessZ,
  RecommendationStatusZ,
} from '@cadence/types';
import {
  addRecommendation,
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  runRecommendationTransition,
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

type SortDir = 'asc' | 'desc';
type ParsedSort = { key: string; dir: SortDir } | { error: string };

function parseSortBy(raw: string): ParsedSort {
  if (raw.length === 0) return { error: '--sort-by requires a key' };
  const colon = raw.indexOf(':');
  if (colon === -1) return { key: raw, dir: 'asc' };
  const key = raw.slice(0, colon);
  const dirRaw = raw.slice(colon + 1);
  if (key.length === 0) return { error: '--sort-by requires a key' };
  if (dirRaw !== 'asc' && dirRaw !== 'desc') {
    return { error: `invalid sort direction: '${dirRaw}' (use 'asc' or 'desc')` };
  }
  return { key, dir: dirRaw };
}

const REC_SORT_KEYS = new Set([
  'created',
  'updated',
  'priority',
  'status',
  'title',
  'leverage',
  'risk',
  'confidence',
  'decay',
]);

function compareRec(a: Recommendation, b: Recommendation, key: string): number {
  switch (key) {
    case 'created':
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    case 'updated':
      return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    case 'title':
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    case 'leverage':
      return a.leverageScore - b.leverageScore;
    case 'risk':
      return a.riskScore - b.riskScore;
    case 'confidence':
      return a.confidence - b.confidence;
    case 'priority':
      return (
        RecommendationPriorityZ.options.indexOf(a.priority) -
        RecommendationPriorityZ.options.indexOf(b.priority)
      );
    case 'status':
      return (
        RecommendationStatusZ.options.indexOf(a.status) -
        RecommendationStatusZ.options.indexOf(b.status)
      );
    case 'decay':
      return (
        RecommendationDecayStateZ.options.indexOf(a.decayState) -
        RecommendationDecayStateZ.options.indexOf(b.decayState)
      );
    default:
      return 0;
  }
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
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option('--filter-status <status>', 'Filter to only entries with this status')
    .option('--filter-text <substr>', 'Case-insensitive substring search on title or summary')
    .option('--filter-regex <pattern>', 'Power-user regex filter on title or summary (always case-sensitive; use character classes like [Cc]ycle for case-insensitive). Mutually exclusive with --filter-text.')
    .option('--filter-converted-to <phaseId>', 'Reverse-lookup filter: only recommendations with convertedToPhaseId equal to <phaseId>. Implies status=converted (Slice 34.4).')
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: created, updated, priority, status, title, leverage, risk, confidence, decay.')
    .option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
    .option('--offset <n>', 'Skip the first N entries (after filters)')
    .option('--limit <n>', 'Cap output to first N entries (after filters)')
    .action(async (opts: { format?: string; filterStatus?: string; filterText?: string; filterRegex?: string; filterConvertedTo?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
      try {
        const format = opts.format ?? 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          process.stderr.write(
            `recommendation list failed: unsupported format: ${format}\n`,
          );
          process.exitCode = 1;
          return;
        }
        const ledger = await readRecommendationLedger(process.cwd());
        let entries = ledger.recommendations;
        if (opts.filterStatus !== undefined) {
          const parsed = RecommendationStatusZ.safeParse(opts.filterStatus);
          if (!parsed.success) {
            process.stderr.write(
              `recommendation list failed: invalid status: ${opts.filterStatus}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.filter((r) => r.status === parsed.data);
        }
        if (opts.filterText !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `recommendation list failed: cannot combine --filter-text and --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterText !== undefined) {
          const needle = opts.filterText.toLowerCase();
          entries = entries.filter(
            (r) =>
              r.title.toLowerCase().includes(needle) ||
              r.summary.toLowerCase().includes(needle),
          );
        }
        if (opts.filterRegex !== undefined) {
          let regex: RegExp;
          try {
            regex = new RegExp(opts.filterRegex);
          } catch (err) {
            process.stderr.write(
              `recommendation list failed: invalid regex: ${err instanceof Error ? err.message : String(err)}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.filter((r) => regex.test(r.title) || regex.test(r.summary));
        }
        if (opts.filterConvertedTo !== undefined) {
          entries = entries.filter((r) => r.convertedToPhaseId === opts.filterConvertedTo);
        }
        if (opts.sortBy !== undefined) {
          const parsed = parseSortBy(opts.sortBy);
          if ('error' in parsed) {
            process.stderr.write(`recommendation list failed: ${parsed.error}\n`);
            process.exitCode = 1;
            return;
          }
          if (!REC_SORT_KEYS.has(parsed.key)) {
            const allowed = [...REC_SORT_KEYS].join(', ');
            process.stderr.write(
              `recommendation list failed: invalid sort key: ${parsed.key} (allowed: ${allowed})\n`,
            );
            process.exitCode = 1;
            return;
          }
          const sortKey = parsed.key;
          const dir = parsed.dir;
          entries = entries.slice().sort((a, b) =>
            dir === 'desc' ? -compareRec(a, b, sortKey) : compareRec(a, b, sortKey),
          );
        }
        if (opts.reverse) {
          entries = entries.slice().reverse();
        }
        if (opts.offset !== undefined) {
          const n = Number(opts.offset);
          if (!Number.isInteger(n) || n < 0) {
            process.stderr.write(
              `recommendation list failed: invalid offset: ${opts.offset}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.slice(n);
        }
        if (opts.limit !== undefined) {
          const n = Number(opts.limit);
          if (!Number.isInteger(n) || n < 1) {
            process.stderr.write(
              `recommendation list failed: invalid limit: ${opts.limit}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.slice(0, n);
        }
        if (format === 'json') {
          process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
          return;
        }
        if (entries.length === 0) {
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.filterConvertedTo !== undefined) filterDims.push(`converted-to="${opts.filterConvertedTo}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
          const msg = filterDims.length > 0
            ? `No recommendations matching ${filterDims.join(', ')} recorded.\n`
            : 'No recommendations recorded.\n';
          process.stdout.write(msg);
          return;
        }
        for (const rec of entries) {
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

  cmd
    .command('convert <recId>')
    .description('Convert a recommendation into a CADENCE phase (Praxis Slice 34.1)')
    .requiredOption('--to-phase <phaseId>', 'Phase id; must exist under .cadence/phases/')
    .action(async (recId: string, opts: { toPhase: string }) => {
      try {
        const res = await runRecommendationTransition(
          process.cwd(),
          recId,
          'convert',
          opts.toPhase,
        );
        if (!res.ok) {
          process.stderr.write(`recommendation convert refused: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        process.stdout.write(
          `recommendation ${recId} → converted (to ${opts.toPhase})\n`,
        );
      } catch (err) {
        process.stderr.write(
          `recommendation convert failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
