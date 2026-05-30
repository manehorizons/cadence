import type { Command } from 'commander';
import { type Assumption, AssumptionZ } from '@manehorizons/cadence-types';
import {
  addAssumption,
  readAssumptionLedger,
  readRecommendationLedger,
  runAssumptionTransition,
  type AssumptionTransitionAction,
} from '../../intelligence/store.js';
import { renderAssumptionDetail } from '../../intelligence/render-assumption-detail.js';

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

const ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 's', 'u']);

function parseRegexFlags(raw: string): { flags: string } | { error: string } {
  if (raw.length === 0) return { error: '--filter-regex-flags requires a non-empty value' };
  const seen = new Set<string>();
  for (const ch of raw) {
    if (!ALLOWED_REGEX_FLAGS.has(ch)) {
      return { error: `invalid flag letter: '${ch}' (allowed: i, m, s, u)` };
    }
    if (seen.has(ch)) {
      return { error: `duplicate flag letter: '${ch}'` };
    }
    seen.add(ch);
  }
  return { flags: raw };
}

const ASN_SORT_KEYS = new Set(['created', 'status', 'text', 'rec']);

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
    .option('--filter-regex <pattern>', 'Power-user regex filter on text (always case-sensitive by default; use --filter-regex-flags for case-insensitive/multiline/dotAll, or character classes like [Cc]ycle for one-off case-insensitivity). Mutually exclusive with --filter-text and --filter-text-exact.')
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
        if (opts.filterRegexFlags !== undefined && opts.filterRegex === undefined) {
          process.stderr.write(
            `assumption list failed: --filter-regex-flags requires --filter-regex to also be set\n`,
          );
          process.exitCode = 1;
          return;
        }
        let regexFlags: string | undefined;
        if (opts.filterRegexFlags !== undefined) {
          const parsed = parseRegexFlags(opts.filterRegexFlags);
          if ('error' in parsed) {
            process.stderr.write(`assumption list failed: ${parsed.error}\n`);
            process.exitCode = 1;
            return;
          }
          regexFlags = parsed.flags;
        }
        if (opts.filterRegex !== undefined) {
          let regex: RegExp;
          try {
            regex = new RegExp(opts.filterRegex, regexFlags);
          } catch (err) {
            process.stderr.write(
              `assumption list failed: invalid regex: ${err instanceof Error ? err.message : String(err)}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.filter((a) => regex.test(a.text));
        }
        if (opts.filterTextExact !== undefined) {
          const needle = opts.filterTextExact.toLowerCase();
          entries = entries.filter((a) => a.text.toLowerCase() === needle);
        }
        if (opts.sortBy !== undefined) {
          const parsed = parseSortBy(opts.sortBy);
          if ('error' in parsed) {
            process.stderr.write(`assumption list failed: ${parsed.error}\n`);
            process.exitCode = 1;
            return;
          }
          if (!ASN_SORT_KEYS.has(parsed.key)) {
            const allowed = [...ASN_SORT_KEYS].join(', ');
            process.stderr.write(
              `assumption list failed: invalid sort key: ${parsed.key} (allowed: ${allowed})\n`,
            );
            process.exitCode = 1;
            return;
          }
          const sortKey = parsed.key;
          const dir = parsed.dir;
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
