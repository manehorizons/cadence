import type { Command } from 'commander';
import { type IntelligenceDecision, IntelligenceDecisionZ } from '@manehorizons/cadence-types';
import {
  addIntelligenceDecision,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  runDecisionTransition,
  type AddIntelligenceDecisionInput,
  type DecisionTransitionAction,
} from '../../intelligence/store.js';
import { renderDecisionDetail } from '../../intelligence/render-decision-detail.js';
import { buildDecisionGraph } from '../../intelligence/graph-decision.js';
import { renderDecisionGraph } from '../../intelligence/render-decision-graph.js';

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

const DEC_SORT_KEYS = new Set(['decided', 'status', 'title', 'rec']);

const DEC_STATUS_ORDER: ReadonlyArray<IntelligenceDecision['status']> = [
  'active',
  'superseded',
  'rescinded',
];

function compareDec(a: IntelligenceDecision, b: IntelligenceDecision, key: string): number {
  switch (key) {
    case 'decided':
      return a.decidedAt < b.decidedAt ? -1 : a.decidedAt > b.decidedAt ? 1 : 0;
    case 'title':
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    case 'status':
      return DEC_STATUS_ORDER.indexOf(a.status) - DEC_STATUS_ORDER.indexOf(b.status);
    case 'rec': {
      const aHas = a.recommendationId !== undefined;
      const bHas = b.recommendationId !== undefined;
      if (!aHas && !bHas) return 0;
      if (!aHas) return 1;
      if (!bHas) return -1;
      const ar = a.recommendationId as string;
      const br = b.recommendationId as string;
      return ar < br ? -1 : ar > br ? 1 : 0;
    }
    default:
      return 0;
  }
}

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
        const md = renderDecisionDetail(dec, rec, decLedger);
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
    .command('graph <id>')
    .description('Show the supersession chain (ancestors + descendants) for a decision')
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .action(async (id: string, opts: { format?: string }) => {
      try {
        const format = opts.format ?? 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          process.stderr.write(
            `decision graph failed: unsupported format: ${format}\n`,
          );
          process.exitCode = 1;
          return;
        }
        const decLedger = await readIntelligenceDecisionLedger(process.cwd());
        const res = buildDecisionGraph(decLedger, id);
        if (!res.ok) {
          process.stderr.write(`decision graph failed: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        if (format === 'json') {
          process.stdout.write(JSON.stringify(res.graph, null, 2) + '\n');
          return;
        }
        const md = renderDecisionGraph(res.graph);
        process.stdout.write(md);
        if (!md.endsWith('\n')) process.stdout.write('\n');
      } catch (err) {
        process.stderr.write(
          `decision graph failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .description('List recorded decisions')
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option('--filter-status <status>', 'Filter to only entries with this status')
    .option('--filter-rec <recId>', 'Filter to only entries tied to this recommendation')
    .option('--include-untied', 'When combined with --filter-rec, also include decisions with no recommendationId')
    .option('--filter-text <substr>', 'Case-insensitive substring search on title or rationale. Mutually exclusive with --filter-text-exact and --filter-regex.')
    .option('--filter-text-exact <str>', 'Case-insensitive whole-field equality match on title or rationale. Mutually exclusive with --filter-text and --filter-regex.')
    .option('--filter-regex <pattern>', 'Power-user regex filter on title or rationale (always case-sensitive by default; use --filter-regex-flags for case-insensitive/multiline/dotAll, or character classes like [Cc]ycle for one-off case-insensitivity). Mutually exclusive with --filter-text and --filter-text-exact.')
    .option('--filter-regex-flags <flags>', 'RegExp flag letters to apply to --filter-regex. Allowed: i (case-insensitive), m (multiline ^/$), s (dotAll .), u (unicode). Requires --filter-regex.')
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: decided, status, title, rec.')
    .option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
    .option('--offset <n>', 'Skip the first N entries (after filters)')
    .option('--limit <n>', 'Cap output to first N entries (after filters)')
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; includeUntied?: boolean; filterText?: string; filterTextExact?: string; filterRegex?: string; filterRegexFlags?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
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
        let entries = ledger.decisions;
        if (opts.filterStatus !== undefined) {
          const parsed = IntelligenceDecisionZ.shape.status.safeParse(opts.filterStatus);
          if (!parsed.success) {
            process.stderr.write(
              `decision list failed: invalid status: ${opts.filterStatus}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.filter((d) => d.status === parsed.data);
        }
        if (opts.filterRec !== undefined) {
          // Slice 32: --include-untied softens the rec predicate to
          // "rec=X OR untied" rather than introducing a new filter stage.
          entries = entries.filter(
            (d) =>
              d.recommendationId === opts.filterRec ||
              (opts.includeUntied === true && d.recommendationId === undefined),
          );
        }
        if (opts.filterTextExact === '') {
          process.stderr.write(
            `decision list failed: --filter-text-exact requires a non-empty value\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterText !== undefined) {
          process.stderr.write(
            `decision list failed: cannot combine --filter-text-exact with --filter-text\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `decision list failed: cannot combine --filter-text-exact with --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterText !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `decision list failed: cannot combine --filter-text and --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterText !== undefined) {
          const needle = opts.filterText.toLowerCase();
          entries = entries.filter(
            (d) =>
              d.title.toLowerCase().includes(needle) ||
              d.rationale.toLowerCase().includes(needle),
          );
        }
        if (opts.filterRegexFlags !== undefined && opts.filterRegex === undefined) {
          process.stderr.write(
            `decision list failed: --filter-regex-flags requires --filter-regex to also be set\n`,
          );
          process.exitCode = 1;
          return;
        }
        let regexFlags: string | undefined;
        if (opts.filterRegexFlags !== undefined) {
          const parsed = parseRegexFlags(opts.filterRegexFlags);
          if ('error' in parsed) {
            process.stderr.write(`decision list failed: ${parsed.error}\n`);
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
              `decision list failed: invalid regex: ${err instanceof Error ? err.message : String(err)}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.filter((d) => regex.test(d.title) || regex.test(d.rationale));
        }
        if (opts.filterTextExact !== undefined) {
          const needle = opts.filterTextExact.toLowerCase();
          entries = entries.filter(
            (d) =>
              d.title.toLowerCase() === needle ||
              d.rationale.toLowerCase() === needle,
          );
        }
        if (opts.sortBy !== undefined) {
          const parsed = parseSortBy(opts.sortBy);
          if ('error' in parsed) {
            process.stderr.write(`decision list failed: ${parsed.error}\n`);
            process.exitCode = 1;
            return;
          }
          if (!DEC_SORT_KEYS.has(parsed.key)) {
            const allowed = [...DEC_SORT_KEYS].join(', ');
            process.stderr.write(
              `decision list failed: invalid sort key: ${parsed.key} (allowed: ${allowed})\n`,
            );
            process.exitCode = 1;
            return;
          }
          const sortKey = parsed.key;
          const dir = parsed.dir;
          entries = entries.slice().sort((a, b) =>
            dir === 'desc' ? -compareDec(a, b, sortKey) : compareDec(a, b, sortKey),
          );
        }
        if (opts.reverse) {
          entries = entries.slice().reverse();
        }
        if (opts.offset !== undefined) {
          const n = Number(opts.offset);
          if (!Number.isInteger(n) || n < 0) {
            process.stderr.write(
              `decision list failed: invalid offset: ${opts.offset}\n`,
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
              `decision list failed: invalid limit: ${opts.limit}\n`,
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
          if (opts.filterRec && opts.includeUntied) filterDims.push('untied=incl');
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.filterRegexFlags !== undefined) filterDims.push(`regex-flags="${opts.filterRegexFlags}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
          const msg = filterDims.length > 0
            ? `No decisions matching ${filterDims.join(', ')} recorded.\n`
            : 'No decisions recorded.\n';
          process.stdout.write(msg);
          return;
        }
        for (const d of entries) {
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

  cmd
    .command('supersede <id>')
    .description(DECISION_TRANSITION_DESCRIPTIONS.supersede)
    .option('--by <newId>', 'Decision that supersedes this one (optional FK)')
    .action(async (id: string, opts: { by?: string }) => {
      try {
        const res = await runDecisionTransition(process.cwd(), id, 'supersede', opts.by);
        if (!res.ok) {
          process.stderr.write(`decision supersede refused: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        const suffix = opts.by ? ` (by ${opts.by})` : '';
        process.stdout.write(
          `decision ${id} → ${DECISION_TRANSITION_PAST.supersede}${suffix}\n`,
        );
      } catch (err) {
        process.stderr.write(
          `decision supersede failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  for (const action of ['rescind', 'reactivate'] as const) {
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
