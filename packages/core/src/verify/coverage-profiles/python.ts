/**
 * Built-in python profile (phase 167, T2) — pytest-style test functions
 * scanned with the `indentation-delimited` strategy (`./strategies.ts`).
 *
 * Opener convention (pytest's real convention, documented per the T2 draft
 * action): a test "opener" is any `def test_<name>(...):` — module-level or
 * a method indented under any class (the enclosing class's own name is not
 * inspected; only the `test_` prefix on the `def` matters, since the
 * indentation strategy resolves each method's body relative to its own
 * line's indent regardless of what encloses it). A function whose name does
 * not start with `test_` (e.g. `def helper():`) is never treated as an
 * opener at all — pytest itself would not collect it either.
 *
 * String table order matters: `mask.ts` tries longer `open` delimiters
 * first, so Python's triple-quoted forms (`"""`, `'''`) are masked as a
 * single (already-multi-character) delimiter pair before the single-quote
 * forms are tried — `StringDelimiter.open`/`close` already support
 * multi-character delimiters (confirmed against T1's own
 * `coverage-profiles-engine.test.ts` indentation fixture, which uses the
 * same `"""`/`'''` forms), so docstrings mask their entire contents
 * (including embedded `#`, quotes, and assertion-looking text) without any
 * change to `mask.ts`/`types.ts`.
 *
 * Known best-effort edges (documented, not closed — false-negative-safe):
 * a signature with nested parens in a default argument (e.g.
 * `def test_x(a=dict(x=1)):`) does not match as an opener at all, since
 * `[^)]*` is not paren-depth-aware — this under-reports rather than
 * mis-bounds. A genuinely unclosed paren (a `SyntaxError` in real Python,
 * only reachable via a transiently mid-edit file) can merge two unrelated
 * functions into one span; this is a structural risk of any depth-unaware
 * opener scan, not unique to this profile.
 */

import type { LanguageProfile } from './types.js';

/** Opener: `[async ]def test_<name>(...):`. Class-based methods match
 * identically — indentation is resolved relative to the opener's own line,
 * not any enclosing class. The optional `async` prefix must be part of the
 * match (not just permitted before it): `indentation-delimited` computes
 * indent as `matchStart - lineStart`, so if the match started at `def`
 * instead of `async`, an `async def` line's indent would be miscomputed as
 * `len('async ')` too deep, truncating the body to just the header line. */
const OPENER = /(?:async\s+)?def\s+test_\w*\s*\([^)]*\)\s*:/y;

/** Assertion: a standalone `assert` statement (word-bounded so identifiers
 * like `assert_that` never falsely qualify). */
const ASSERTION = /\bassert\b/;

export const pythonProfile: LanguageProfile = {
  id: 'python',
  extensions: ['.py'],
  openerPattern: OPENER,
  assertionPattern: ASSERTION,
  syntax: {
    comments: { line: ['#'] },
    strings: [{ open: '"""' }, { open: "'''" }, { open: '"' }, { open: "'" }],
  },
  strategy: 'indentation-delimited',
};
