import type { Command } from 'commander';
import {
  type Recommendation,
  type RecommendationStatus,
  RecommendationDecayStateZ,
  RecommendationPriorityZ,
  RecommendationReadinessZ,
  RecommendationStatusZ,
} from '@thomas-powers-jr/cadence-types';
import {
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
} from '../../intelligence/store/io.js';
import {
  addRecommendation,
  addEvidenceToRecommendation,
  runRecommendationArchive,
  runRecommendationTransition,
  runRecommendationPromotion,
  runRecommendationUnarchive,
  type AddRecommendationInput,
  type RecommendationPromotionChanges,
} from '../../intelligence/store/recommendations.js';
import { renderRecommendationDetail } from '../../intelligence/render-recommendation-detail.js';
import { parseListFilterOptions, MAX_FILTER_REGEX_LENGTH } from '../list-filter.js';

// Statuses settable via `promote`. `converted` is excluded — owned by `convert`.
// `settle-pending` is excluded — owned by the settle hook (phase 145).
const PROMOTE_STATUSES: RecommendationStatus[] = RecommendationStatusZ.options.filter(
  (s) => s !== 'converted' && s !== 'settle-pending',
);

function csv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

const REC_SORT_KEYS = [
  'created',
  'updated',
  'priority',
  'status',
  'title',
  'leverage',
  'risk',
  'confidence',
  'decay',
] as const;

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
    .option(
      '--scout-id <id>',
      'Group this rec under a scout-session id (convention: scout-YYYYMMDD-HHMM)',
    )
    .action(
      async (opts: {
        title: string;
        summary: string;
        priority: string;
        readiness: string;
        area?: string;
        file?: string;
        evidence?: string;
        scoutId?: string;
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
          if (opts.scoutId) input.scoutId = opts.scoutId;
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
          // Phase 102: `show` is a lookup by id — find the rec whether it is live
          // or soft-archived, so an auto-archived (shipped/rejected/converted) rec
          // does not vanish from inspection.
          const rec =
            recLedger.recommendations.find((r) => r.id === id) ??
            recLedger.archived.find((r) => r.id === id);
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
    .option('--filter-text <substr>', 'Case-insensitive substring search on title or summary. Mutually exclusive with --filter-text-exact and --filter-regex.')
    .option('--filter-text-exact <str>', 'Case-insensitive whole-field equality match on title or summary. Mutually exclusive with --filter-text and --filter-regex.')
    .option('--filter-regex <pattern>', `Power-user regex filter on title or summary (always case-sensitive by default; use --filter-regex-flags for case-insensitive/multiline/dotAll, or character classes like [Cc]ycle for one-off case-insensitivity). Mutually exclusive with --filter-text and --filter-text-exact. Max length ${MAX_FILTER_REGEX_LENGTH} characters.`)
    .option('--filter-regex-flags <flags>', 'RegExp flag letters to apply to --filter-regex. Allowed: i (case-insensitive), m (multiline ^/$), s (dotAll .), u (unicode). Requires --filter-regex.')
    .option('--filter-converted-to <phaseId>', 'Reverse-lookup filter: only recommendations with convertedToPhaseId equal to <phaseId>. Implies status=converted (Slice 34.4).')
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: created, updated, priority, status, title, leverage, risk, confidence, decay.')
    .option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
    .option('--offset <n>', 'Skip the first N entries (after filters)')
    .option('--limit <n>', 'Cap output to first N entries (after filters)')
    .option('--archived', 'List soft-archived recommendations instead of the active set (Phase 101)')
    .action(async (opts: { format?: string; filterStatus?: string; filterText?: string; filterTextExact?: string; filterRegex?: string; filterRegexFlags?: string; filterConvertedTo?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string; archived?: boolean }) => {
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
        let entries = opts.archived ? ledger.archived : ledger.recommendations;
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
        if (opts.filterTextExact === '') {
          process.stderr.write(
            `recommendation list failed: --filter-text-exact requires a non-empty value\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterText !== undefined) {
          process.stderr.write(
            `recommendation list failed: cannot combine --filter-text-exact with --filter-text\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `recommendation list failed: cannot combine --filter-text-exact with --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
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
        const listFilters = parseListFilterOptions(
          { sortBy: opts.sortBy, filterRegex: opts.filterRegex, filterRegexFlags: opts.filterRegexFlags },
          { commandLabel: 'recommendation list', sortKeys: REC_SORT_KEYS },
        );
        if (!listFilters.ok) {
          process.stderr.write(`${listFilters.error}\n`);
          process.exitCode = 1;
          return;
        }
        if (listFilters.value.regex !== undefined) {
          const regex = listFilters.value.regex;
          entries = entries.filter((r) => regex.test(r.title) || regex.test(r.summary));
        }
        if (opts.filterTextExact !== undefined) {
          const needle = opts.filterTextExact.toLowerCase();
          entries = entries.filter(
            (r) =>
              r.title.toLowerCase() === needle ||
              r.summary.toLowerCase() === needle,
          );
        }
        if (opts.filterConvertedTo !== undefined) {
          entries = entries.filter((r) => r.convertedToPhaseId === opts.filterConvertedTo);
        }
        if (listFilters.value.sortBy !== undefined) {
          const { key: sortKey, dir } = listFilters.value.sortBy;
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
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.filterRegexFlags !== undefined) filterDims.push(`regex-flags="${opts.filterRegexFlags}"`);
          if (opts.filterConvertedTo !== undefined) filterDims.push(`converted-to="${opts.filterConvertedTo}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
          const noun = opts.archived ? 'archived recommendations' : 'recommendations';
          const msg = filterDims.length > 0
            ? `No ${noun} matching ${filterDims.join(', ')} recorded.\n`
            : `No ${noun} recorded.\n`;
          process.stdout.write(msg);
          // Phase 101: surface the archive even when the active list is empty.
          if (!opts.archived && ledger.archived.length > 0) {
            process.stdout.write(
              `\n(${ledger.archived.length} archived — see \`recommendation list --archived\`)\n`,
            );
          }
          return;
        }
        for (const rec of entries) {
          process.stdout.write(
            `${rec.id}  ${rec.priority}  ${rec.readiness}  ${rec.title}\n`,
          );
        }
        // Phase 101: footer hint that a soft-archive set exists (active list only).
        if (!opts.archived && ledger.archived.length > 0) {
          process.stdout.write(
            `\n(${ledger.archived.length} archived — see \`recommendation list --archived\`)\n`,
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

  cmd
    .command('promote <recId>')
    .description(
      'Advance a recommendation’s status and/or readiness (makes `milestone propose` reachable)',
    )
    .option('--status <status>', `New status. One of: ${PROMOTE_STATUSES.join(' | ')}`)
    .option(
      '--readiness <readiness>',
      `New readiness. One of: ${RecommendationReadinessZ.options.join(' | ')}`,
    )
    .option(
      '--ref <text>',
      'Freeform provenance for a shipped rec (e.g. "PR #70 / v1.22.1"). Only valid with --status=shipped.',
    )
    .action(
      async (recId: string, opts: { status?: string; readiness?: string; ref?: string }) => {
        try {
          const changes: RecommendationPromotionChanges = {};
          if (opts.status !== undefined) {
            if (!PROMOTE_STATUSES.includes(opts.status as RecommendationStatus)) {
              process.stderr.write(
                `recommendation promote: invalid --status "${opts.status}". Allowed: ${PROMOTE_STATUSES.join(' | ')}\n`,
              );
              process.exitCode = 1;
              return;
            }
            changes.status = opts.status as RecommendationStatus;
          }
          if (opts.readiness !== undefined) {
            const parsed = RecommendationReadinessZ.safeParse(opts.readiness);
            if (!parsed.success) {
              process.stderr.write(
                `recommendation promote: invalid --readiness "${opts.readiness}". Allowed: ${RecommendationReadinessZ.options.join(' | ')}\n`,
              );
              process.exitCode = 1;
              return;
            }
            changes.readiness = parsed.data;
          }
          if (opts.ref !== undefined) {
            changes.shippedRef = opts.ref;
          }
          if (changes.status === undefined && changes.readiness === undefined) {
            process.stderr.write(
              'recommendation promote: provide --status and/or --readiness\n',
            );
            process.exitCode = 1;
            return;
          }
          const res = await runRecommendationPromotion(
            process.cwd(),
            recId,
            changes,
          );
          if (!res.ok) {
            process.stderr.write(`recommendation promote refused: ${res.error}\n`);
            process.exitCode = 1;
            return;
          }
          const parts = [
            changes.status ? `status=${changes.status}` : null,
            changes.readiness ? `readiness=${changes.readiness}` : null,
            changes.shippedRef ? `ref=${changes.shippedRef}` : null,
          ]
            .filter(Boolean)
            .join(', ');
          process.stdout.write(`recommendation ${recId} promoted (${parts})\n`);
        } catch (err) {
          process.stderr.write(
            `recommendation promote failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      },
    );

  // Phase 101 (v1.24): manual soft-archival. `archive` moves any rec aside
  // (recoverable); `unarchive` restores it. Auto-archive on terminal events
  // arrives in phase 102.
  cmd
    .command('archive <recId>')
    .description('Soft-archive a recommendation (move it aside; recoverable via `unarchive`)')
    .action(async (recId: string) => {
      try {
        const res = await runRecommendationArchive(process.cwd(), recId, 'manual');
        if (!res.ok) {
          process.stderr.write(`recommendation archive refused: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        process.stdout.write(`recommendation ${recId} archived\n`);
      } catch (err) {
        process.stderr.write(
          `recommendation archive failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('unarchive <recId>')
    .description('Restore a soft-archived recommendation to the active set')
    .action(async (recId: string) => {
      try {
        const res = await runRecommendationUnarchive(process.cwd(), recId);
        if (!res.ok) {
          process.stderr.write(`recommendation unarchive refused: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        process.stdout.write(`recommendation ${recId} unarchived\n`);
      } catch (err) {
        process.stderr.write(
          `recommendation unarchive failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  // Phase 199 (T3): tied-record writer CLI surface — appends a note as
  // Evidence and links it into the recommendation's evidenceIds in one
  // atomic write (store-layer logic lives in addEvidenceToRecommendation).
  const evidenceCmd = cmd
    .command('evidence')
    .description('Manage evidence tied to a recommendation');

  evidenceCmd
    .command('add <recId>')
    .description('Add a note as evidence tied to a recommendation')
    .requiredOption('--note <text>', 'Evidence note text')
    .action(async (recId: string, opts: { note: string }) => {
      try {
        const result = await addEvidenceToRecommendation(process.cwd(), {
          recommendationId: recId,
          note: opts.note,
        });
        if (!result.ok) {
          process.stderr.write(
            `recommendation evidence add refused: ${result.error}\n`,
          );
          process.exitCode = 1;
          return;
        }
        process.stdout.write(
          `Added ${result.evidence.id} to ${recId}: ${result.evidence.summary}\n`,
        );
      } catch (err) {
        process.stderr.write(
          `recommendation evidence add failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
