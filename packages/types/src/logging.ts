import { z } from 'zod';

/**
 * Operational logging types for CADENCE's structured diagnostic logger
 * (Phase 80, Post-v1.0 observability vector). Pure data layer — no I/O, no
 * runtime. The writer + formatters live in `cadence-core`.
 *
 * Distinct from `state.skillAudit` "telemetry" (DESIGN.md §11), which records
 * user behavior; this is operator-facing diagnostics.
 */

/** Ordered log levels. `silent` (severity 0) emits nothing; severity rises
 *  through `trace`. A logger at level L emits a record iff the record's
 *  severity is ≥ 1 and ≤ severity(L). */
export const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'trace'] as const;

export const LogLevelZ = z.enum(LOG_LEVELS);
export type LogLevel = z.infer<typeof LogLevelZ>;

/** Diagnostic rendering format. `pretty` = single-line human readable;
 *  `json` = one JSON object per record. */
export const LogFormatZ = z.enum(['pretty', 'json']);
export type LogFormat = z.infer<typeof LogFormatZ>;

/** Numeric severity per level. Higher = more verbose. `silent` is 0. */
export const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

/** Levels at which a record can actually be emitted (everything but `silent`). */
export type EmitLevel = Exclude<LogLevel, 'silent'>;

/** A single structured log record. Emitted to stderr by the core logger. */
export interface LogRecord {
  /** Severity of this record (never `silent`). */
  level: EmitLevel;
  /** Optional seam tag bound via `logger.child({ seam })` (e.g. `gate`, `hook`, `verify`). */
  seam?: string;
  /** Human-readable message. */
  msg: string;
  /** Optional structured context merged from `.child()` bindings + the call site. */
  fields?: Record<string, unknown>;
  /** ISO-8601 timestamp. */
  time: string;
}
