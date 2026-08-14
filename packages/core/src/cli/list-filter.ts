// Shared `--sort-by` / `--filter-regex` / `--filter-regex-flags` parsing and
// validation for the `recommendation list` / `decision list` / `assumption
// list` commands. Each subject supplies its own allowed sort-key set and an
// error-message label; everything else — flag/pattern validation, error
// wording, and cross-option checks — is identical across all three.

export type SortDirection = 'asc' | 'desc';

export interface ParsedSortBy {
  key: string;
  dir: SortDirection;
}

export interface ParsedListFilters {
  sortBy: ParsedSortBy | undefined;
  regex: RegExp | undefined;
}

export type ListFilterResult =
  | { ok: true; value: ParsedListFilters }
  | { ok: false; error: string };

export interface ListFilterConfig {
  /** e.g. "recommendation list" — errors are prefixed "<commandLabel> failed: ...". */
  commandLabel: string;
  /** This subject's allowed --sort-by keys, in the order shown in error messages. */
  sortKeys: readonly string[];
}

export interface RawListFilterOptions {
  sortBy: string | undefined;
  filterRegex: string | undefined;
  filterRegexFlags: string | undefined;
}

export const MAX_FILTER_REGEX_LENGTH = 200;

const ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 's', 'u']);

function parseSortByRaw(raw: string): ParsedSortBy | { error: string } {
  if (raw.length === 0) return { error: '--sort-by requires a key' };
  const colon = raw.indexOf(':');
  if (colon === -1) return { key: raw, dir: 'asc' };
  const key = raw.slice(0, colon);
  const dirRaw = raw.slice(colon + 1);
  if (key.length === 0) return { error: '--sort-by requires a key' };
  if (dirRaw !== 'asc' && dirRaw !== 'desc') {
    return { error: `invalid sort direction: '${dirRaw}' (use 'asc' or 'desc')` };
  }
  return { key, dir: dirRaw };
}

function parseRegexFlags(raw: string): { flags: string } | { error: string } {
  if (raw.length === 0) return { error: '--filter-regex-flags requires a non-empty value' };
  const seen = new Set<string>();
  for (const ch of raw) {
    if (!ALLOWED_REGEX_FLAGS.has(ch)) {
      return { error: `invalid flag letter: '${ch}' (allowed: i, m, s, u)` };
    }
    if (seen.has(ch)) {
      return { error: `duplicate flag letter: '${ch}'` };
    }
    seen.add(ch);
  }
  return { flags: raw };
}

function validateFilterRegexLength(pattern: string): string | undefined {
  if (pattern.length > MAX_FILTER_REGEX_LENGTH) {
    return `--filter-regex pattern is too long: ${pattern.length} characters exceeds the maximum length of ${MAX_FILTER_REGEX_LENGTH}`;
  }
  return undefined;
}

interface QuantifierMatch {
  consumed: number;
  /** Whether this quantifier permits 2+ repetitions (as opposed to `?` / `{0,1}`). */
  repeats: boolean;
}

/** Matches a `*`, `+`, `?`, or `{m}` / `{m,}` / `{m,n}` quantifier starting at `pattern[i]`. */
function matchQuantifierAt(pattern: string, i: number): QuantifierMatch | undefined {
  const c = pattern.charAt(i);
  if (c === '*' || c === '+') return { consumed: 1, repeats: true };
  if (c === '?') return { consumed: 1, repeats: false };
  if (c === '{') {
    let j = i + 1;
    let body = '';
    while (j < pattern.length && pattern.charAt(j) !== '}') {
      body += pattern.charAt(j);
      j++;
    }
    if (j >= pattern.length || !/^\d+(,\d*)?$/.test(body)) return undefined;
    const consumed = j - i + 1;
    const commaIdx = body.indexOf(',');
    if (commaIdx === -1) return { consumed, repeats: Number(body) >= 2 };
    const maxPart = body.slice(commaIdx + 1);
    return { consumed, repeats: maxPart === '' || Number(maxPart) >= 2 };
  }
  return undefined;
}

/**
 * Rejects the classic ReDoS shape — a repetition quantifier wrapped around a
 * group that itself contains one, e.g. `(a+)+` or `(a*)*` — the "star height
 * > 1" heuristic (`safe-regex`'s approach). This is a user-supplied pattern
 * (`--filter-regex`), so a crafted one can hang the CLI in catastrophic
 * backtracking; the check is intentionally conservative on this one shape
 * (it may reject a few benign-but-suspicious-shaped patterns) but does not
 * attempt to prove exact backtracking cost, and does not catch every
 * ReDoS-capable shape — e.g. ambiguous alternation under a quantifier like
 * `(a|a)+` has no nested quantifier and passes through undetected.
 */
function findUnsafeRegexReason(pattern: string): string | undefined {
  const groupHasRepetition: boolean[] = [];
  let i = 0;
  while (i < pattern.length) {
    const c = pattern.charAt(i);
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') {
      let j = i + 1;
      if (pattern.charAt(j) === '^') j++;
      if (pattern.charAt(j) === ']') j++;
      while (j < pattern.length && pattern.charAt(j) !== ']') {
        if (pattern.charAt(j) === '\\') j++;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === '(') {
      groupHasRepetition.push(false);
      i++;
      continue;
    }
    if (c === ')') {
      const innerHasRepetition = groupHasRepetition.pop() ?? false;
      i++;
      const q = matchQuantifierAt(pattern, i);
      if (q !== undefined) {
        if (innerHasRepetition && q.repeats) {
          return 'nested repetition can cause catastrophic backtracking (e.g. "(a+)+") — restructure the pattern so a quantifier does not wrap a group that itself repeats';
        }
        i += q.consumed;
      }
      const parentTop = groupHasRepetition.length - 1;
      if (parentTop >= 0 && (innerHasRepetition || (q?.repeats ?? false))) {
        groupHasRepetition[parentTop] = true;
      }
      continue;
    }
    const q = matchQuantifierAt(pattern, i);
    if (q !== undefined) {
      if (q.repeats) {
        const top = groupHasRepetition.length - 1;
        if (top >= 0) groupHasRepetition[top] = true;
      }
      i += q.consumed;
      continue;
    }
    i++;
  }
  return undefined;
}

/**
 * Parses and validates the `--sort-by` / `--filter-regex` /
 * `--filter-regex-flags` options as one unit. Pure: no I/O, no process
 * exit — callers translate a `{ ok: false }` result into their own
 * stderr write + exitCode convention.
 */
export function parseListFilterOptions(
  opts: RawListFilterOptions,
  config: ListFilterConfig,
): ListFilterResult {
  const fail = (detail: string): ListFilterResult => ({
    ok: false,
    error: `${config.commandLabel} failed: ${detail}`,
  });

  if (opts.filterRegexFlags !== undefined && opts.filterRegex === undefined) {
    return fail('--filter-regex-flags requires --filter-regex to also be set');
  }

  let regexFlags: string | undefined;
  if (opts.filterRegexFlags !== undefined) {
    const parsed = parseRegexFlags(opts.filterRegexFlags);
    if ('error' in parsed) return fail(parsed.error);
    regexFlags = parsed.flags;
  }

  let regex: RegExp | undefined;
  if (opts.filterRegex !== undefined) {
    const lengthError = validateFilterRegexLength(opts.filterRegex);
    if (lengthError !== undefined) return fail(lengthError);
    const unsafeReason = findUnsafeRegexReason(opts.filterRegex);
    if (unsafeReason !== undefined) return fail(`unsafe --filter-regex pattern: ${unsafeReason}`);
    try {
      regex = new RegExp(opts.filterRegex, regexFlags);
    } catch (err) {
      return fail(`invalid regex: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let sortBy: ParsedSortBy | undefined;
  if (opts.sortBy !== undefined) {
    const parsed = parseSortByRaw(opts.sortBy);
    if ('error' in parsed) return fail(parsed.error);
    if (!config.sortKeys.includes(parsed.key)) {
      return fail(`invalid sort key: ${parsed.key} (allowed: ${config.sortKeys.join(', ')})`);
    }
    sortBy = parsed;
  }

  return { ok: true, value: { sortBy, regex } };
}
