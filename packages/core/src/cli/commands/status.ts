import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { AnomalyEventZ, AnomalyTypeZ, type AnomalyEvent, type AnomalyType } from '@cadence/types';
import { loadStatus, renderStatus } from '../../status.js';
import { loadConfig } from '../../config/loader.js';

const DEFAULT_LOG = '.cadence/anomalies.log';

export function registerStatusCommand(program: Command): void {
  const cmd = program
    .command('status')
    .description('Show full loop context (phase, draft, tasks, ACs, next)');

  cmd
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      // Default action — runs only when no subcommand is given.
      try {
        const report = await loadStatus(process.cwd());
        if (opts.json) {
          process.stdout.write(JSON.stringify(report) + '\n');
        } else {
          process.stdout.write(renderStatus(report));
        }
      } catch (err) {
        process.stderr.write(
          `status failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('anomalies')
    .description('List recorded anomaly events from .cadence/anomalies.log')
    .option('--since <iso>', 'Only show events with ts >= this ISO8601 timestamp')
    .option('--type <type>', 'Filter by anomaly type (ac-blocked, ac-needs-context, coverage-bypassed, files-outside-boundary, verifier-failure, force-used)')
    .option('--limit <n>', 'Maximum number of events to show (newest first)', '20')
    .action(async (opts: { since?: string; type?: string; limit: string }) => {
      try {
        const cwd = process.cwd();
        const config = await loadConfig(cwd).catch(() => null);
        const rel = config?.notify.file ?? DEFAULT_LOG;
        const path = isAbsolute(rel) ? rel : join(cwd, rel);

        let sinceMs: number | null = null;
        if (opts.since !== undefined) {
          const parsed = Date.parse(opts.since);
          if (Number.isNaN(parsed)) {
            process.stderr.write(`status anomalies: invalid --since (not ISO8601): ${opts.since}\n`);
            process.exitCode = 1;
            return;
          }
          sinceMs = parsed;
        }

        if (opts.type !== undefined) {
          if (!AnomalyTypeZ.safeParse(opts.type).success) {
            process.stderr.write(
              `status anomalies: invalid --type "${opts.type}". Allowed: ${AnomalyTypeZ.options.join(' | ')}\n`,
            );
            process.exitCode = 1;
            return;
          }
        }

        if (!existsSync(path)) {
          process.stdout.write('No anomalies recorded.\n');
          return;
        }

        const raw = await readFile(path, 'utf8');
        const lines = raw.split('\n').filter((l) => l.length > 0);
        const events: AnomalyEvent[] = [];
        let bad = 0;
        for (const line of lines) {
          try {
            const parsed = AnomalyEventZ.safeParse(JSON.parse(line));
            if (parsed.success) events.push(parsed.data);
            else bad++;
          } catch {
            bad++;
          }
        }

        const kindFilter = opts.type as AnomalyType | undefined;
        const limit = Math.max(0, Number.parseInt(opts.limit, 10) || 20);
        let working: AnomalyEvent[] = kindFilter
          ? events.filter((e) => e.type === kindFilter)
          : events;
        if (sinceMs !== null) {
          working = working.filter((e) => Date.parse(e.ts) >= sinceMs!);
        }
        const filtered = working
          .reverse() // newest-first: file is append-only; tail = newest
          .slice(0, limit);

        if (filtered.length === 0) {
          process.stdout.write('No anomalies recorded.\n');
        } else {
          process.stdout.write(renderAnomalyTable(filtered));
        }
        if (bad > 0) process.stderr.write(`(${bad} unparseable lines skipped)\n`);
      } catch (err) {
        process.stderr.write(
          `status anomalies failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}

function renderAnomalyTable(events: AnomalyEvent[]): string {
  const headers = ['type', 'severity', 'message'];
  const rows = events.map((e) => [e.type, e.severity, e.message]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join('  ') + '\n';
  return line(headers) + line(headers.map((_, i) => '-'.repeat(widths[i]!))) + rows.map(line).join('');
}
