import { describe, it, expect } from 'vitest';
import { parseListFilterOptions, MAX_FILTER_REGEX_LENGTH } from '../../src/cli/list-filter.js';

const REC_CONFIG = {
  commandLabel: 'recommendation list',
  sortKeys: ['created', 'updated', 'priority', 'status', 'title', 'leverage', 'risk', 'confidence', 'decay'],
};

const NO_OPTS = { sortBy: undefined, filterRegex: undefined, filterRegexFlags: undefined };

describe('parseListFilterOptions', () => {
  it('returns empty parsed filters when nothing is passed', () => {
    const r = parseListFilterOptions(NO_OPTS, REC_CONFIG);
    expect(r).toEqual({ ok: true, value: { sortBy: undefined, regex: undefined } });
  });

  describe('--sort-by', () => {
    it('parses a bare key as ascending', () => {
      const r = parseListFilterOptions({ ...NO_OPTS, sortBy: 'created' }, REC_CONFIG);
      expect(r).toEqual({ ok: true, value: { sortBy: { key: 'created', dir: 'asc' }, regex: undefined } });
    });

    it('parses a key:desc suffix', () => {
      const r = parseListFilterOptions({ ...NO_OPTS, sortBy: 'priority:desc' }, REC_CONFIG);
      expect(r).toEqual({ ok: true, value: { sortBy: { key: 'priority', dir: 'desc' }, regex: undefined } });
    });

    it('rejects an unknown sort key with the allowed-list message', () => {
      const r = parseListFilterOptions({ ...NO_OPTS, sortBy: 'foo' }, REC_CONFIG);
      expect(r).toEqual({
        ok: false,
        error:
          'recommendation list failed: invalid sort key: foo (allowed: created, updated, priority, status, title, leverage, risk, confidence, decay)',
      });
    });

    it('rejects a malformed direction', () => {
      const r = parseListFilterOptions({ ...NO_OPTS, sortBy: 'created:xyz' }, REC_CONFIG);
      expect(r).toEqual({
        ok: false,
        error: "recommendation list failed: invalid sort direction: 'xyz' (use 'asc' or 'desc')",
      });
    });

    it('rejects an empty --sort-by value', () => {
      const r = parseListFilterOptions({ ...NO_OPTS, sortBy: '' }, REC_CONFIG);
      expect(r).toEqual({ ok: false, error: 'recommendation list failed: --sort-by requires a key' });
    });

    it('rejects a bare colon with no key', () => {
      const r = parseListFilterOptions({ ...NO_OPTS, sortBy: ':desc' }, REC_CONFIG);
      expect(r).toEqual({ ok: false, error: 'recommendation list failed: --sort-by requires a key' });
    });

    it('uses each subject\'s own allowed-key list and error prefix', () => {
      const r = parseListFilterOptions(
        { ...NO_OPTS, sortBy: 'foo' },
        { commandLabel: 'decision list', sortKeys: ['decided', 'status', 'title', 'rec'] },
      );
      expect(r).toEqual({
        ok: false,
        error: 'decision list failed: invalid sort key: foo (allowed: decided, status, title, rec)',
      });
    });
  });

  describe('--filter-regex', () => {
    it('compiles a valid pattern with no flags', () => {
      const r = parseListFilterOptions({ ...NO_OPTS, filterRegex: '^Add' }, REC_CONFIG);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.regex).toBeInstanceOf(RegExp);
        expect(r.value.regex?.source).toBe('^Add');
        expect(r.value.regex?.flags).toBe('');
      }
    });

    it('rejects an invalid pattern', () => {
      const r = parseListFilterOptions({ ...NO_OPTS, filterRegex: '[' }, REC_CONFIG);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toMatch(/^recommendation list failed: invalid regex: /);
      }
    });

    it('rejects a pattern exceeding the max length', () => {
      const overlong = 'a'.repeat(MAX_FILTER_REGEX_LENGTH + 1);
      const r = parseListFilterOptions({ ...NO_OPTS, filterRegex: overlong }, REC_CONFIG);
      expect(r).toEqual({
        ok: false,
        error: `recommendation list failed: --filter-regex pattern is too long: ${overlong.length} characters exceeds the maximum length of ${MAX_FILTER_REGEX_LENGTH}`,
      });
    });

    it('accepts a pattern at exactly the max length', () => {
      const pattern = 'a'.repeat(MAX_FILTER_REGEX_LENGTH);
      const r = parseListFilterOptions({ ...NO_OPTS, filterRegex: pattern }, REC_CONFIG);
      expect(r.ok).toBe(true);
    });
  });

  describe('--filter-regex-flags', () => {
    it('applies flags to the compiled regex', () => {
      const r = parseListFilterOptions(
        { ...NO_OPTS, filterRegex: '^cycle', filterRegexFlags: 'i' },
        REC_CONFIG,
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.regex?.flags).toBe('i');
    });

    it('accepts multiple distinct flags', () => {
      const r = parseListFilterOptions(
        { ...NO_OPTS, filterRegex: 'foo.bar', filterRegexFlags: 'is' },
        REC_CONFIG,
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect([...('is')].sort().join('')).toBe([...(r.value.regex?.flags ?? '')].sort().join(''));
    });

    it('refuses use without --filter-regex', () => {
      const r = parseListFilterOptions({ ...NO_OPTS, filterRegexFlags: 'i' }, REC_CONFIG);
      expect(r).toEqual({
        ok: false,
        error: 'recommendation list failed: --filter-regex-flags requires --filter-regex to also be set',
      });
    });

    it('rejects an empty value', () => {
      const r = parseListFilterOptions(
        { ...NO_OPTS, filterRegex: 'foo', filterRegexFlags: '' },
        REC_CONFIG,
      );
      expect(r).toEqual({
        ok: false,
        error: 'recommendation list failed: --filter-regex-flags requires a non-empty value',
      });
    });

    it('rejects an unsupported flag letter', () => {
      const r = parseListFilterOptions(
        { ...NO_OPTS, filterRegex: 'foo', filterRegexFlags: 'g' },
        REC_CONFIG,
      );
      expect(r).toEqual({
        ok: false,
        error: "recommendation list failed: invalid flag letter: 'g' (allowed: i, m, s, u)",
      });
    });

    it('rejects a duplicate flag letter', () => {
      const r = parseListFilterOptions(
        { ...NO_OPTS, filterRegex: 'foo', filterRegexFlags: 'ii' },
        REC_CONFIG,
      );
      expect(r).toEqual({
        ok: false,
        error: "recommendation list failed: duplicate flag letter: 'i'",
      });
    });
  });

  it('does not throw — every path returns a Result', () => {
    expect(() =>
      parseListFilterOptions({ sortBy: 'garbage', filterRegex: '(', filterRegexFlags: 'zz' }, REC_CONFIG),
    ).not.toThrow();
  });
});
