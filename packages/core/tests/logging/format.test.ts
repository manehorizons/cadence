import { describe, it, expect } from 'vitest';
import type { LogRecord } from '@manehorizons/cadence-types';
import { formatJson, formatPretty } from '../../src/logging/format.js';

const base: LogRecord = {
  level: 'info',
  msg: 'hello world',
  time: '2026-06-07T00:00:00.000Z',
};

describe('logging formatters (AC-2)', () => {
  it('AC-2: formatJson emits valid parseable JSON carrying the record fields', () => {
    const parsed = JSON.parse(formatJson({ ...base, seam: 'gate', fields: { ac: 'AC-2', n: 1 } }));
    expect(parsed).toMatchObject({
      level: 'info',
      msg: 'hello world',
      seam: 'gate',
      time: base.time,
      fields: { ac: 'AC-2', n: 1 },
    });
  });

  it('AC-2: formatJson omits seam/fields when absent', () => {
    const parsed = JSON.parse(formatJson(base));
    expect(parsed.seam).toBeUndefined();
    expect(parsed.fields).toBeUndefined();
    expect(parsed).toMatchObject({ level: 'info', msg: 'hello world', time: base.time });
  });

  it('AC-2: formatPretty is a single human-readable line with level, time, seam, msg', () => {
    const out = formatPretty({ ...base, seam: 'hook', fields: { ac: 'AC-2' } });
    expect(out).not.toContain('\n');
    expect(out).toContain('INFO');
    expect(out).toContain(base.time);
    expect(out).toContain('hook');
    expect(out).toContain('hello world');
  });

  it('AC-2: formatters are deterministic and side-effect free', () => {
    const r: LogRecord = { ...base, fields: { ac: 'AC-2' } };
    expect(formatJson(r)).toBe(formatJson(r));
    expect(formatPretty(r)).toBe(formatPretty(r));
  });
});
