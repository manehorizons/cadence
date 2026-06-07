import type { LogRecord } from '@manehorizons/cadence-types';

/**
 * Pure renderers for a {@link LogRecord} (Phase 80). No I/O, deterministic —
 * the logger picks one based on the resolved format and hands the result to its
 * write sink.
 */

/** One JSON object per record. Field order: time, level, seam?, msg, fields?. */
export function formatJson(record: LogRecord): string {
  const out: Record<string, unknown> = {
    time: record.time,
    level: record.level,
  };
  if (record.seam !== undefined) out.seam = record.seam;
  out.msg = record.msg;
  if (record.fields !== undefined) out.fields = record.fields;
  return JSON.stringify(out);
}

/** Single-line human-readable: `<time> <LEVEL> [seam] <msg> {fields}`. */
export function formatPretty(record: LogRecord): string {
  const seam = record.seam !== undefined ? ` [${record.seam}]` : '';
  const hasFields = record.fields !== undefined && Object.keys(record.fields).length > 0;
  const fields = hasFields ? ` ${JSON.stringify(record.fields)}` : '';
  return `${record.time} ${record.level.toUpperCase()}${seam} ${record.msg}${fields}`;
}
