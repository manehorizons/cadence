import { describe, expect, it } from 'vitest';
import { parseAcRefs } from '../../src/parse/ac-refs.js';

describe('parseAcRefs', () => {
  it('AC-1, AC-2: splits a clean comma-separated list', () => {
    expect(parseAcRefs('AC-1, AC-2, AC-3')).toEqual(['AC-1', 'AC-2', 'AC-3']);
  });

  it('AC-1, AC-2: does not drop an id followed by a trailing annotation', () => {
    // Regression: phase 150, found dogfooding phase 149 (issue #135). The
    // old exact-match implementation (`/^AC-\d+$/` after split+trim) dropped
    // 'AC-4' here because "AC-4 (core logic)" doesn't match the whole token.
    expect(parseAcRefs('AC-1, AC-2, AC-3, AC-4 (core logic)')).toEqual([
      'AC-1',
      'AC-2',
      'AC-3',
      'AC-4',
    ]);
  });

  it('AC-2: trailing annotation on a single-id field is tolerated', () => {
    expect(parseAcRefs('AC-4 (core logic)')).toEqual(['AC-4']);
  });

  it('AC-2: a non-AC token is excluded, not just trimmed', () => {
    expect(parseAcRefs('AC-1, not-an-ac, AC-2')).toEqual(['AC-1', 'AC-2']);
  });

  it('AC-2: a lowercase "ac-" token is excluded (format is not loosened)', () => {
    expect(parseAcRefs('AC-1, ac-2')).toEqual(['AC-1']);
  });

  it('AC-2: an empty done field yields an empty array', () => {
    expect(parseAcRefs('')).toEqual([]);
  });

  it('AC-2: whitespace-only tokens are excluded', () => {
    expect(parseAcRefs('AC-1,   ,AC-2')).toEqual(['AC-1', 'AC-2']);
  });
});
