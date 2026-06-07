import { LogLevelZ, LogFormatZ } from '@manehorizons/cadence-types';
import type { LogLevel, LogFormat } from '@manehorizons/cadence-types';

/**
 * Pure resolution of the effective log level / format (Phase 80, AC-5).
 * Precedence: env var > config value > default. Invalid env values are
 * ignored (safe-parse) rather than throwing — a typo in `CADENCE_LOG_LEVEL`
 * must never crash a command.
 */

export interface ResolveLevelInput {
  /** Raw `CADENCE_LOG_LEVEL` value (may be undefined / invalid). */
  env?: string | undefined;
  /** `config.logging.level`. */
  config?: LogLevel | undefined;
}

/** env > config > `silent`. */
export function resolveLogLevel(input: ResolveLevelInput): LogLevel {
  const fromEnv = LogLevelZ.safeParse(input.env);
  if (fromEnv.success) return fromEnv.data;
  if (input.config !== undefined) return input.config;
  return 'silent';
}

export interface ResolveFormatInput {
  /** Raw `CADENCE_LOG_FORMAT` value (may be undefined / invalid). */
  env?: string | undefined;
  /** `config.logging.format`. */
  config?: LogFormat | undefined;
  /** Whether the diagnostic stream (stderr) is a TTY. */
  isTTY?: boolean | undefined;
}

/** env > config > (`pretty` on a TTY, else `json`). */
export function resolveLogFormat(input: ResolveFormatInput): LogFormat {
  const fromEnv = LogFormatZ.safeParse(input.env);
  if (fromEnv.success) return fromEnv.data;
  if (input.config !== undefined) return input.config;
  return input.isTTY ? 'pretty' : 'json';
}
