import { describe, it, expect } from 'vitest';
import {
  LOG_LEVELS,
  LogLevelZ,
  LogFormatZ,
  LOG_LEVEL_SEVERITY,
  type LogLevel,
  type LogRecord,
} from '../src/logging.js';

describe('logging types (AC-1)', () => {
  it('AC-1: exports the six ordered log levels', () => {
    expect(LOG_LEVELS).toEqual(['silent', 'error', 'warn', 'info', 'debug', 'trace']);
  });

  it('AC-1: LogLevelZ accepts every level and rejects unknowns', () => {
    for (const lvl of LOG_LEVELS) {
      expect(LogLevelZ.parse(lvl)).toBe(lvl);
    }
    expect(LogLevelZ.safeParse('verbose').success).toBe(false);
    expect(LogLevelZ.safeParse('').success).toBe(false);
  });

  it('AC-1: LogFormatZ accepts pretty | json only', () => {
    expect(LogFormatZ.parse('pretty')).toBe('pretty');
    expect(LogFormatZ.parse('json')).toBe('json');
    expect(LogFormatZ.safeParse('xml').success).toBe(false);
  });

  it('AC-1: severity is monotonic with silent = 0', () => {
    expect(LOG_LEVEL_SEVERITY.silent).toBe(0);
    const ordered: LogLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];
    for (let i = 1; i < ordered.length; i++) {
      expect(LOG_LEVEL_SEVERITY[ordered[i]!]).toBeGreaterThan(LOG_LEVEL_SEVERITY[ordered[i - 1]!]);
    }
  });

  it('AC-1: a LogRecord is structurally typed (compile + shape)', () => {
    const r: LogRecord = {
      level: 'info',
      seam: 'gate',
      msg: 'hello',
      fields: { ac: 'AC-1' },
      time: '2026-06-07T00:00:00.000Z',
    };
    expect(r.level).toBe('info');
    expect(r.seam).toBe('gate');
    // seam + fields are optional
    const minimal: LogRecord = { level: 'error', msg: 'boom', time: r.time };
    expect(minimal.seam).toBeUndefined();
  });
});
