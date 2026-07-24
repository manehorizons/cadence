import type { Command } from 'commander';
import { processIO } from '../../services/io.js';
import { computeRetroRollup, scanRetroArtifacts } from '../../services/retro-rollup.js';
import { renderRetroRollup } from '../../parse/render-retro-rollup.js';
import {
  matchFrictionToRecommendations,
  recordFrictionEvidence,
  type FrictionBucket,
} from '../../services/retro-feedback.js';
import { readEvidenceLedger, readRecommendationLedger } from '../../intelligence/store/io.js';

/** Phase 212 T3: the exact three `RetroRollup` frequency dimensions, same
 * order and names T1 (`matchFrictionToRecommendations`) iterates. */
const FRICTION_BUCKETS: readonly FrictionBucket[] = [
  'bypasses',
  'roughTaskStatuses',
  'findingCategories',
];

/**
 * AC-4: one printed/JSON-emitted line per (recurring friction entry ×
 * matched recommendation) pair, plus one line per friction entry that
 * matched zero recommendations (`outcome: 'no-match'`, no
 * `recommendationId`). `'error'` covers T1's defensive
 * `recordFrictionEvidence` error outcome (a match whose recommendationId
 * wasn't found in the supplied ledger) — not expected in normal operation
 * since matches and writes share the same recommendation snapshot, but
 * surfaced loudly rather than silently dropped per this repo's "no quiet
 * fallback" convention.
 */
interface FeedbackOutcomeEntry {
  frictionKey: string;
  frictionBucket: FrictionBucket;
  outcome: 'wrote' | 'skipped-already-recorded' | 'no-match' | 'error';
  recommendationId?: string;
  evidenceId?: string;
  error?: string;
}

function renderFeedbackLine(entry: FeedbackOutcomeEntry): string {
  const tag = `[${entry.frictionBucket}] "${entry.frictionKey}"`;
  switch (entry.outcome) {
    case 'wrote':
      return `wrote evidence: ${tag} -> recommendation ${entry.recommendationId} (evidence ${entry.evidenceId})`;
    case 'skipped-already-recorded':
      return `already recorded (skipped, no new evidence): ${tag} -> recommendation ${entry.recommendationId}`;
    case 'error':
      return `error: ${tag} -> recommendation ${entry.recommendationId}: ${entry.error}`;
    case 'no-match':
    default:
      return `no matching recommendation: ${tag}`;
  }
}

export function registerRetroCommand(program: Command): void {
  const cmd = program
    .command('retro')
    .description('Cross-phase rollup of recurring retro friction (gate bypasses, rough tasks, findings)')
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .action(async (opts: { format?: string }) => {
      try {
        const format = opts.format ?? 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          process.stderr.write(`retro failed: unsupported format: ${format}\n`);
          process.exitCode = 1;
          return;
        }
        const io = processIO();
        const entries = await scanRetroArtifacts(process.cwd(), io);
        if (entries.length === 0) {
          if (format === 'json') {
            process.stdout.write('null\n');
          } else {
            process.stdout.write('No retro artifacts found.\n');
          }
          return;
        }
        const rollup = computeRetroRollup(entries);
        if (format === 'json') {
          process.stdout.write(JSON.stringify(rollup, null, 2) + '\n');
          return;
        }
        const md = renderRetroRollup(rollup);
        process.stdout.write(md);
        if (!md.endsWith('\n')) process.stdout.write('\n');
      } catch (err) {
        process.stderr.write(`retro failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });

  cmd
    .command('feedback')
    .description(
      'Match recurring retro friction to recommendations and record it as evidence, boosting Praxis scores',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const root = process.cwd();
        const io = processIO();
        const entries = await scanRetroArtifacts(root, io);
        // Boundaries: recompute the rollup on demand, same as bare `cadence
        // retro` — never persisted. `computeRetroRollup` tolerates an empty
        // `entries` array (all buckets come back empty), so this is safe to
        // call even when no retro artifacts exist at all.
        const rollup = computeRetroRollup(entries);

        const totalRecurring =
          rollup.bypasses.recurring.length +
          rollup.roughTaskStatuses.recurring.length +
          rollup.findingCategories.recurring.length;

        // AC-4 point 4: no recurring friction at all -> clear message, exit
        // 0, no ledger reads/writes beyond the scan+rollup already done.
        if (totalRecurring === 0) {
          if (opts.json) {
            process.stdout.write('[]\n');
          } else {
            process.stdout.write('No recurring friction found.\n');
          }
          return;
        }

        const recLedger = await readRecommendationLedger(root);
        const evidenceLedger = await readEvidenceLedger(root);
        const matches = matchFrictionToRecommendations(rollup, recLedger.recommendations);
        const results = await recordFrictionEvidence(
          root,
          matches,
          recLedger.recommendations,
          evidenceLedger,
        );

        const outcomeEntries: FeedbackOutcomeEntry[] = [];
        for (const bucket of FRICTION_BUCKETS) {
          for (const entry of rollup[bucket].recurring) {
            const entryMatches = matches.filter(
              (m) => m.frictionBucket === bucket && m.frictionKey === entry.key,
            );
            if (entryMatches.length === 0) {
              // No recommendation's affectedAreas/affectedFiles overlapped
              // this friction entry — never call the writer for it.
              outcomeEntries.push({
                frictionKey: entry.key,
                frictionBucket: bucket,
                outcome: 'no-match',
              });
              continue;
            }
            for (const match of entryMatches) {
              const result = results.find(
                (r) =>
                  r.frictionBucket === bucket &&
                  r.frictionKey === entry.key &&
                  r.recommendationId === match.recommendationId,
              );
              // Every match fed into recordFrictionEvidence produces exactly
              // one result — this is defensive, never expected to miss.
              if (!result) continue;
              outcomeEntries.push({
                frictionKey: entry.key,
                frictionBucket: bucket,
                outcome: result.outcome,
                recommendationId: result.recommendationId,
                ...(result.evidenceId !== undefined ? { evidenceId: result.evidenceId } : {}),
                ...(result.error !== undefined ? { error: result.error } : {}),
              });
            }
          }
        }

        if (opts.json) {
          process.stdout.write(JSON.stringify(outcomeEntries) + '\n');
        } else {
          for (const entry of outcomeEntries) {
            process.stdout.write(renderFeedbackLine(entry) + '\n');
          }
        }
      } catch (err) {
        process.stderr.write(
          `retro feedback failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
