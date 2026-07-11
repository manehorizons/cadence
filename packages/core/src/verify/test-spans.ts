/**
 * Pure, string/comment-aware finder for `it()`/`test()` call spans (phase 108).
 *
 * Used by the `assertion` coverageMode to decide whether an `AC-N` token sits
 * inside a test that actually asserts. Deterministic, offline, no AST: a single
 * character scan that skips the interiors of strings and comments so that
 * parens inside a test title (`it('foo (bar)', …)`) do not throw off matching.
 *
 * Known best-effort edges (documented, not closed): regex literals and
 * template-literal `${…}` interiors with unbalanced parens; the curried
 * `it.each(table)(title, fn)` form (its `.each(…)` args are not the test body).
 * The gate is opt-in and always relaxable via coverageMode 'mention',
 * --allow-missing-coverage, or --force.
 */

export interface TestSpan {
  /** Absolute index of the opener identifier (`it` / `test`). */
  start: number;
  /** Absolute index of the call's matching `)`. */
  end: number;
  /** True iff a code-mode assertion token appears inside the call. */
  hasAssertion: boolean;
  /** True iff the opener's modifier is `skip`, `todo`, or `failing` (the test does not run its body normally). */
  skipped: boolean;
}

type ScanState = 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block';

/** Opener: `it`/`test` optionally chained with a no-arg modifier, then `(`. */
const OPENER_AT =
  /(?:it|test)(?:\.(only|skip|todo|concurrent|failing))?\s*\(/y;

/** Modifiers that mean the test body is not run normally (the "skip dodge"). */
const SKIPPED_MODIFIERS = new Set(['skip', 'todo', 'failing']);

/** Assertion tokens (code-mode text only). Fixed set this phase. */
const ASSERTION_RE = /\bexpect\s*\(|\bassert\b|\.should\b/;

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

export function findTestSpans(text: string): TestSpan[] {
  const spans: TestSpan[] = [];
  const n = text.length;
  let state: ScanState = 'code';
  let active: { start: number; depth: number; code: string; skipped: boolean } | null = null;
  let i = 0;

  while (i < n) {
    const c = text[i]!;
    const c2 = text[i + 1];

    if (state === 'sq') { if (c === '\\') { i += 2; continue; } if (c === "'") state = 'code'; i++; continue; }
    if (state === 'dq') { if (c === '\\') { i += 2; continue; } if (c === '"') state = 'code'; i++; continue; }
    if (state === 'tpl') { if (c === '\\') { i += 2; continue; } if (c === '`') state = 'code'; i++; continue; }
    if (state === 'line') { if (c === '\n') state = 'code'; i++; continue; }
    if (state === 'block') { if (c === '*' && c2 === '/') { state = 'code'; i += 2; continue; } i++; continue; }

    // state === 'code'
    if (c === '/' && c2 === '/') { state = 'line'; i += 2; continue; }
    if (c === '/' && c2 === '*') { state = 'block'; i += 2; continue; }
    if (c === "'") { state = 'sq'; i++; continue; }
    if (c === '"') { state = 'dq'; i++; continue; }
    if (c === '`') { state = 'tpl'; i++; continue; }

    if (active) {
      if (c === '(') active.depth++;
      else if (c === ')') {
        active.depth--;
        if (active.depth === 0) {
          spans.push({
            start: active.start,
            end: i,
            hasAssertion: ASSERTION_RE.test(active.code),
            skipped: active.skipped,
          });
          active = null;
          i++;
          continue;
        }
      }
      active.code += c;
      i++;
      continue;
    }

    // Not in a span: try to match an opener at a word boundary.
    if ((c === 'i' || c === 't') && !isWordChar(text[i - 1])) {
      OPENER_AT.lastIndex = i;
      const m = OPENER_AT.exec(text);
      if (m && m.index === i) {
        const modifier = m[1];
        active = {
          start: i,
          depth: 1,
          code: '',
          skipped: modifier !== undefined && SKIPPED_MODIFIERS.has(modifier),
        };
        i = i + m[0].length; // position just past the opening '('
        continue;
      }
    }
    i++;
  }

  return spans;
}
