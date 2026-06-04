import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import {
  existsSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { AnomalyEventZ, AnomalyTypeZ, type AnomalyEvent, type AnomalyType } from '@manehorizons/cadence-types';
import { loadConfig } from '../../config/loader.js';
import { statusService } from '../../services/status.js';
import { processIO } from '../../services/io.js';

const DEFAULT_LOG = '.cadence/anomalies.log';

export function registerStatusCommand(program: Command): void {
  const cmd = program
    .command('status')
    .description('Show full loop context (phase, draft, tasks, ACs, next)');

  cmd
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      // Default action — runs only when no subcommand is given.
      const { exitCode } = await statusService(
        process.cwd(),
        opts.json ? { json: true } : {},
        processIO(),
      );
      if (exitCode) process.exitCode = exitCode;
    });

  cmd
    .command('anomalies')
    .description('List recorded anomaly events from .cadence/anomalies.log')
    .option('--since <iso>', 'Only show events with ts >= this ISO8601 timestamp')
    .option('--type <type>', 'Filter by anomaly type (ac-blocked, ac-needs-context, coverage-bypassed, files-outside-boundary, verifier-failure, force-used)')
    .option('--limit <n>', 'Maximum number of events to show', '20')
    .option(
      '--tail',
      'show the last N events oldest→newest (instead of the default newest-first list)',
    )
    .option(
      '--follow',
      'with --tail, keep the log open and stream new events as they are appended (Ctrl-C to stop; needs a TTY)',
    )
    .action(
      async (opts: {
        since?: string;
        type?: string;
        limit: string;
        tail?: boolean;
        follow?: boolean;
      }) => {
        try {
          const cwd = process.cwd();
          const config = await loadConfig(cwd).catch(() => null);
          const rel = config?.notify.file ?? DEFAULT_LOG;
          const path = isAbsolute(rel) ? rel : join(cwd, rel);

          let sinceMs: number | null = null;
          if (opts.since !== undefined) {
            const parsed = Date.parse(opts.since);
            if (Number.isNaN(parsed)) {
              process.stderr.write(
                `status anomalies: invalid --since (not ISO8601): ${opts.since}\n`,
              );
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
          const { events, bad } = parseAnomalyLines(raw);

          const kindFilter = opts.type as AnomalyType | undefined;
          const limit = Math.max(0, Number.parseInt(opts.limit, 10) || 20);
          const matches = (e: AnomalyEvent): boolean =>
            (!kindFilter || e.type === kindFilter) &&
            (sinceMs === null || Date.parse(e.ts) >= sinceMs);
          const working = events.filter(matches);

          if (opts.tail) {
            const slice = tailSelect(working, limit);
            process.stdout.write(
              slice.length === 0
                ? 'No anomalies recorded.\n'
                : renderAnomalyTable(slice),
            );
          } else {
            const slice = working.slice().reverse().slice(0, limit);
            process.stdout.write(
              slice.length === 0
                ? 'No anomalies recorded.\n'
                : renderAnomalyTable(slice),
            );
          }
          if (bad > 0)
            process.stderr.write(`(${bad} unparseable lines skipped)\n`);

          if (!opts.follow) return;

          const canFollow =
            process.stdout.isTTY === true ||
            process.env.CADENCE_FORCE_FOLLOW === '1';
          if (!canFollow) {
            process.stderr.write(
              'status anomalies: --follow needs a TTY; showing one-shot tail.\n',
            );
            return;
          }

          await followAnomalies(path, Buffer.byteLength(raw, 'utf8'), matches);
        } catch (err) {
          process.stderr.write(
            `status anomalies failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      },
    );
}

/** Parse an NDJSON anomaly log body into validated events + bad-line count. */
export function parseAnomalyLines(raw: string): {
  events: AnomalyEvent[];
  bad: number;
} {
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
  return { events, bad };
}

/** Last `limit` events in chronological order (oldest→newest). */
export function tailSelect(
  events: AnomalyEvent[],
  limit: number,
): AnomalyEvent[] {
  if (limit <= 0) return [];
  return events.slice(-limit);
}

function formatAnomalyRow(e: AnomalyEvent): string {
  return `${e.type}  ${e.severity}  ${e.message}\n`;
}

/**
 * Follow loop: poll the file every 200ms, read only the appended
 * `offset..end` slice via a held fd, parse complete lines, print matching
 * rows (no header). Clears on SIGINT and exits 0. Handles truncation
 * (size < offset → reset). Resolves only on SIGINT.
 */
function followAnomalies(
  path: string,
  startOffset: number,
  matches: (e: AnomalyEvent) => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    let offset = startOffset;
    let carry = '';
    const fd = openSync(path, 'r');
    const tick = (): void => {
      let size: number;
      try {
        size = statSync(path).size;
      } catch {
        return;
      }
      if (size < offset) {
        offset = 0;
        carry = '';
      }
      if (size <= offset) return;
      const len = size - offset;
      const buf = Buffer.alloc(len);
      const bytes = readSync(fd, buf, 0, len, offset);
      offset += bytes;
      carry += buf.toString('utf8', 0, bytes);
      const parts = carry.split('\n');
      carry = parts.pop() ?? '';
      for (const line of parts) {
        if (line.length === 0) continue;
        try {
          const parsed = AnomalyEventZ.safeParse(JSON.parse(line));
          if (parsed.success && matches(parsed.data)) {
            process.stdout.write(formatAnomalyRow(parsed.data));
          }
        } catch {
          /* skip malformed appended line */
        }
      }
    };
    const timer = setInterval(tick, 200);
    let stopTimer: NodeJS.Timeout | undefined;
    const stop = (): void => {
      clearInterval(timer);
      if (stopTimer) clearTimeout(stopTimer);
      try {
        closeSync(fd);
      } catch {
        /* already closed */
      }
      process.off('SIGINT', stop);
      resolve();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    // Test seam: SIGINT delivery to a child is not portable (Windows has no
    // real signals for programmatic kill). `CADENCE_FOLLOW_STOP_AFTER_MS`
    // lets tests exercise the streaming + clean-exit path deterministically.
    const stopAfter = process.env.CADENCE_FOLLOW_STOP_AFTER_MS;
    if (stopAfter !== undefined) {
      const ms = Number.parseInt(stopAfter, 10);
      if (!Number.isNaN(ms) && ms >= 0) stopTimer = setTimeout(stop, ms);
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
