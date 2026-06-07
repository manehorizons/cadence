import type { EmitLevel, LogFormat, LogLevel, LogRecord } from '@manehorizons/cadence-types';
import { LOG_LEVEL_SEVERITY } from '@manehorizons/cadence-types';
import { formatJson, formatPretty } from './format.js';
import { resolveLogLevel, resolveLogFormat } from './resolve.js';

/**
 * The structured diagnostic logger (Phase 80, Post-v1.0 observability).
 *
 * Additive and default-OFF: writes only to **stderr** (never stdout — that is
 * the MCP protocol channel and the `--json` CLI channel), and emits nothing
 * unless a level above `silent` is configured. The write sink and clock are
 * injectable so tests stay deterministic and the stdout invariant is provable.
 *
 * Seams obtain a context-bound logger via `.child({ seam: 'gate' })`.
 */

/** Runtime dependencies of a {@link Logger}. */
export interface LoggerDeps {
  level: LogLevel;
  format: LogFormat;
  /** Receives one fully-formatted line per emitted record. */
  write: (line: string) => void;
  /** Returns the timestamp stamped on each record (ISO-8601 by convention). */
  now: () => string;
}

export class Logger {
  private readonly deps: LoggerDeps;
  private readonly bound: Record<string, unknown>;
  private readonly seam: string | undefined;

  constructor(deps: LoggerDeps, bound: Record<string, unknown> = {}, seam?: string) {
    this.deps = deps;
    this.bound = bound;
    this.seam = seam;
  }

  /** Derive a child logger with additional bound context. A `seam` in `ctx`
   *  sets/overrides the seam tag; all other keys merge into `fields`. The
   *  parent is never mutated. */
  child(ctx: { seam?: string } & Record<string, unknown>): Logger {
    const { seam, ...rest } = ctx;
    return new Logger(this.deps, { ...this.bound, ...rest }, seam ?? this.seam);
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.emit('error', msg, fields);
  }
  warn(msg: string, fields?: Record<string, unknown>): void {
    this.emit('warn', msg, fields);
  }
  info(msg: string, fields?: Record<string, unknown>): void {
    this.emit('info', msg, fields);
  }
  debug(msg: string, fields?: Record<string, unknown>): void {
    this.emit('debug', msg, fields);
  }
  trace(msg: string, fields?: Record<string, unknown>): void {
    this.emit('trace', msg, fields);
  }

  private emit(level: EmitLevel, msg: string, fields?: Record<string, unknown>): void {
    // silent (severity 0) blocks everything; otherwise emit when at/below threshold.
    if (LOG_LEVEL_SEVERITY[level] > LOG_LEVEL_SEVERITY[this.deps.level]) return;

    const merged = { ...this.bound, ...(fields ?? {}) };
    const record: LogRecord = {
      level,
      msg,
      time: this.deps.now(),
      ...(this.seam !== undefined ? { seam: this.seam } : {}),
      ...(Object.keys(merged).length > 0 ? { fields: merged } : {}),
    };
    this.deps.write(this.deps.format === 'json' ? formatJson(record) : formatPretty(record));
  }
}

/** Options for {@link createLogger}. Anything omitted is resolved from the
 *  environment / sensible defaults. */
export interface CreateLoggerOptions {
  /** Force the level (skips env/config resolution). */
  level?: LogLevel;
  /** Force the format (skips env/config resolution). */
  format?: LogFormat;
  /** `config.logging.level` for resolution when `level` is not forced. */
  configLevel?: LogLevel;
  /** `config.logging.format` for resolution when `format` is not forced. */
  configFormat?: LogFormat;
  /** Environment source (defaults to `process.env`). */
  env?: Record<string, string | undefined>;
  /** Whether the diagnostic stream is a TTY (defaults to `process.stderr.isTTY`). */
  isTTY?: boolean;
  /** Write sink (defaults to a line-terminated `process.stderr.write`). */
  write?: (line: string) => void;
  /** Clock (defaults to `() => new Date().toISOString()`). */
  now?: () => string;
}

/** Construct a {@link Logger}, resolving level/format via env > config > default. */
export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const env = opts.env ?? process.env;
  const level = opts.level ?? resolveLogLevel({ env: env.CADENCE_LOG_LEVEL, config: opts.configLevel });
  const format =
    opts.format ??
    resolveLogFormat({
      env: env.CADENCE_LOG_FORMAT,
      config: opts.configFormat,
      isTTY: opts.isTTY ?? Boolean(process.stderr.isTTY),
    });
  const write = opts.write ?? ((line: string) => void process.stderr.write(`${line}\n`));
  const now = opts.now ?? (() => new Date().toISOString());
  return new Logger({ level, format, write, now });
}

let singleton: Logger | undefined;

/** The lazily-created process-wide logger. Seams use
 *  `getLogger().child({ seam })`. Phase 81 wires the seams; the entrypoint can
 *  call {@link setLogger} once config is loaded to apply `config.logging`. */
export function getLogger(): Logger {
  if (singleton === undefined) singleton = createLogger();
  return singleton;
}

/** Replace the process-wide logger (entrypoint config wiring; tests). */
export function setLogger(logger: Logger): void {
  singleton = logger;
}

/** Clear the process-wide logger so the next {@link getLogger} rebuilds it. */
export function resetLogger(): void {
  singleton = undefined;
}
