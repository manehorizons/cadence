import type { Command } from 'commander';
import { type Assumption, AssumptionZ } from '@thomas-powers-jr/cadence-types';
import {
  readAssumptionLedger,
  readRecommendationLedger,
} from '../../intelligence/store/io.js';
import {
  addAssumption,
  runAssumptionTransition,
  type AssumptionTransitionAction,
} from '../../intelligence/store/assumptions.js';
import { renderAssumptionDetail } from '../../intelligence/render-assumption-detail.js';
import { parseListFilterOptions, MAX_FILTER_REGEX_LENGTH } from '../list-filter.js';

const ASN_SORT_KEYS = ['created', 'status', 'text', 'rec'] as const;

const ASN_STATUS_ORDER: ReadonlyArray<Assumption['status']> = [
  'open',
  'validated',
  'rejected',
];

function compareAsn(a: Assumption, b: Assumption, key: string): number {
  switch (key) {
    case 'created':
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    case 'text':
      return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
    case 'rec':
      return a.recommendationId < b.recommendationId
        ? -1
        : a.recommendationId > b.recommendationId
        ? 1
        : 0;
    case 'status':
      return ASN_STATUS_ORDER.indexOf(a.status) - ASN_STATUS_ORDER.indexOf(b.status);
    default:
      return 0;
  }
}

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
    .command('show <id>')
    .description('Show a single assumption with its tied recommendation cross-ref')
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .action(async (id: string, opts: { format?: string }) => {
      try {
        const format = opts.format ?? 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          process.stderr.write(
            `assumption show failed: unsupported format: ${format}\n`,
          );
          process.exitCode = 1;
          return;
        }
        const asLedger = await readAssumptionLedger(process.cwd());
        const as = asLedger.assumptions.find((a) => a.id === id);
        if (!as) {
          process.stderr.write(`assumption ${id} not found\n`);
          process.exitCode = 1;
          return;
        }
        const recLedger = await readRecommendationLedger(process.cwd());
        const rec = recLedger.recommendations.find(
          (r) => r.id === as.recommendationId,
        );
        if (format === 'json') {
          const envelope = { assumption: as, recommendation: rec ?? null };
          process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
          return;
        }
        const md = renderAssumptionDetail(as, rec);
        process.stdout.write(md);
        if (!md.endsWith('\n')) process.stdout.write('\n');
      } catch (err) {
        process.stderr.write(
          `assumption show failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .description('List recorded assumptions')
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option('--filter-status <status>', 'Filter to only entries with this status')
    .option('--filter-rec <recId>', 'Filter to only entries tied to this recommendation')
    .option('--filter-text <substr>', 'Case-insensitive substring search on text. Mutually exclusive with --filter-text-exact and --filter-regex.')
    .option('--filter-text-exact <str>', 'Case-insensitive whole-field equality match on text. Mutually exclusive with --filter-text and --filter-regex.')
    .option('--filter-regex <pattern>', `Power-user regex filter on text (always case-sensitive by default; use --filter-regex-flags for case-insensitive/multiline/dotAll, or character classes like [Cc]ycle for one-off case-insensitivity). Mutually exclusive with --filter-text and --filter-text-exact. Max length ${MAX_FILTER_REGEX_LENGTH} characters.`)
    .option('--filter-regex-flags <flags>', 'RegExp flag letters to apply to --filter-regex. Allowed: i (case-insensitive), m (multiline ^/$), s (dotAll .), u (unicode). Requires --filter-regex.')
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: created, status, text, rec.')
    .option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
    .option('--offset <n>', 'Skip the first N entries (after filters)')
    .option('--limit <n>', 'Cap output to first N entries (after filters)')
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; filterText?: string; filterTextExact?: string; filterRegex?: string; filterRegexFlags?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
      try {
        const format = opts.format ?? 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          process.stderr.write(
            `assumption list failed: unsupported format: ${format}\n`,
          );
          process.exitCode = 1;
          return;
        }
        const ledger = await readAssumptionLedger(process.cwd());
        let entries = ledger.assumptions;
        if (opts.filterStatus !== undefined) {
          const parsed = AssumptionZ.shape.status.safeParse(opts.filterStatus);
          if (!parsed.success) {
            process.stderr.write(
              `assumption list failed: invalid status: ${opts.filterStatus}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.filter((a) => a.status === parsed.data);
        }
        if (opts.filterRec !== undefined) {
          entries = entries.filter((a) => a.recommendationId === opts.filterRec);
        }
        if (opts.filterTextExact === '') {
          process.stderr.write(
            `assumption list failed: --filter-text-exact requires a non-empty value\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterText !== undefined) {
          process.stderr.write(
            `assumption list failed: cannot combine --filter-text-exact with --filter-text\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `assumption list failed: cannot combine --filter-text-exact with --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterText !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `assumption list failed: cannot combine --filter-text and --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterText !== undefined) {
          const needle = opts.filterText.toLowerCase();
          entries = entries.filter((a) => a.text.toLowerCase().includes(needle));
        }
        const listFilters = parseListFilterOptions(
          { sortBy: opts.sortBy, filterRegex: opts.filterRegex, filterRegexFlags: opts.filterRegexFlags },
          { commandLabel: 'assumption list', sortKeys: ASN_SORT_KEYS },
        );
        if (!listFilters.ok) {
          process.stderr.write(`${listFilters.error}\n`);
          process.exitCode = 1;
          return;
        }
        if (listFilters.value.regex !== undefined) {
          const regex = listFilters.value.regex;
          entries = entries.filter((a) => regex.test(a.text));
        }
        if (opts.filterTextExact !== undefined) {
          const needle = opts.filterTextExact.toLowerCase();
          entries = entries.filter((a) => a.text.toLowerCase() === needle);
        }
        if (listFilters.value.sortBy !== undefined) {
          const { key: sortKey, dir } = listFilters.value.sortBy;
          entries = entries.slice().sort((a, b) =>
            dir === 'desc' ? -compareAsn(a, b, sortKey) : compareAsn(a, b, sortKey),
          );
        }
        if (opts.reverse) {
          entries = entries.slice().reverse();
        }
        if (opts.offset !== undefined) {
          const n = Number(opts.offset);
          if (!Number.isInteger(n) || n < 0) {
            process.stderr.write(
              `assumption list failed: invalid offset: ${opts.offset}\n`,
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
              `assumption list failed: invalid limit: ${opts.limit}\n`,
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
          if (opts.filterRec) filterDims.push(`rec=${opts.filterRec}`);
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.filterRegexFlags !== undefined) filterDims.push(`regex-flags="${opts.filterRegexFlags}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
          const msg = filterDims.length > 0
            ? `No assumptions matching ${filterDims.join(', ')} recorded.\n`
            : 'No assumptions recorded.\n';
          process.stdout.write(msg);
          return;
        }
        for (const a of entries) {
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
