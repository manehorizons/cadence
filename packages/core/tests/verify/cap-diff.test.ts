import { describe, it, expect } from 'vitest';
import { capDiff } from '../../src/verify/cap-diff.js';

// AC-2: oversized diff is truncated with an honest marker; small diff passes through.

describe('capDiff (AC-2)', () => {
  it('passes a diff under the cap through unchanged', () => {
    const r = capDiff('abc', 10);
    expect(r).toEqual({ diff: 'abc', truncated: false, originalBytes: 3 });
  });

  it('passes a diff exactly at the cap through unchanged', () => {
    const r = capDiff('abcde', 5);
    expect(r).toEqual({ diff: 'abcde', truncated: false, originalBytes: 5 });
  });

  it('truncates a diff over the cap and appends an honest marker', () => {
    const raw = 'a'.repeat(100);
    const r = capDiff(raw, 40);
    expect(r.truncated).toBe(true);
    expect(r.originalBytes).toBe(100);
    expect(r.diff).toBe('a'.repeat(40) + '\n[diff truncated: 40 of 100 bytes]');
  });

  it('truncates when over the cap by a single byte', () => {
    const r = capDiff('abcdef', 5);
    expect(r.truncated).toBe(true);
    expect(r.diff.startsWith('abcde')).toBe(true);
    expect(r.diff).toContain('[diff truncated: 5 of 6 bytes]');
  });

  it('counts bytes, not UTF-16 code units, for multibyte content', () => {
    // '€' is 3 UTF-8 bytes; 4 of them = 12 bytes.
    const raw = '€'.repeat(4);
    const r = capDiff(raw, 1000);
    expect(r.truncated).toBe(false);
    expect(r.originalBytes).toBe(12);
    expect(r.diff).toBe(raw);
  });
});
