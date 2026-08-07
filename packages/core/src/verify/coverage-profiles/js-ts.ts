/**
 * Built-in js/ts profile (phase 167, T1) — the re-expression of the
 * original hardcoded scanner (pre-167 `test-spans.ts`) as one
 * `LanguageProfile` using the `call-expression` strategy. Byte-for-byte the
 * same opener/assertion patterns and comment/string table as before, so
 * `findTestSpans` (the thin wrapper in `../test-spans.ts`) produces
 * identical spans for identical input (AC-1 parity).
 *
 * `isSkippedOpener` (phase 169, ported onto this architecture at merge
 * time): `OPENER`'s modifier group is captured (not just matched) so a
 * `.skip`/`.todo`/`.failing` opener can be told apart from `.only`/
 * `.concurrent`, which execute normally and stay asserting-eligible. This
 * is what makes `test.skip('...', () => { expect(...) })` — an assertion
 * that never actually runs — correctly NOT count as qualifying coverage
 * (the "skip dodge").
 */

import type { LanguageProfile } from './types.js';

/** Opener: `it`/`test` optionally chained with a no-arg modifier, then `(`.
 * The modifier is captured (group 1) for `isSkippedOpener` below. */
const OPENER = /(?:it|test)(?:\.(only|skip|todo|concurrent|failing))?\s*\(/y;

/** Assertion tokens (code-mode text only). Fixed set, matches the original. */
const ASSERTION = /\bexpect\s*\(|\bassert\b|\.should\b/;

/** Modifiers that mean the test body is not run normally (the "skip dodge"). */
const SKIPPED_MODIFIERS = new Set(['skip', 'todo', 'failing']);

function isSkippedOpener(match: RegExpExecArray): boolean {
  const modifier = match[1];
  return modifier !== undefined && SKIPPED_MODIFIERS.has(modifier);
}

export const jsTsProfile: LanguageProfile = {
  id: 'js-ts',
  // `.mjs`/`.cjs`/`.mts`/`.cts` (Node's explicit-module-system extensions)
  // were missing from the original phase 167 list — a real regression from
  // pre-167 behavior, where `findTestSpans` ran unconditionally on every
  // glob-matched file regardless of extension. Post-167's per-extension
  // dispatch (`../coverage.ts`, T6) requires an exact match, so a `.mjs`
  // test file previously scanned fine and, without this entry, silently
  // produced zero spans instead — found by a live run of this repo's own
  // committed `examples/demo-test-gutting` (which configures
  // `testGlobs: ["**/*.test.mjs"]`) during final review.
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
  openerPattern: OPENER,
  assertionPattern: ASSERTION,
  syntax: {
    comments: { line: ['//'], block: [['/*', '*/']] },
    strings: [{ open: "'" }, { open: '"' }, { open: '`' }],
    // Phase 258, T2: teaches `classify()` (`./mask.ts`) to mask `/regex/`
    // literal content — without this, any of the three string delimiters
    // above (`'`/`"`/`` ` ``) appearing unescaped inside an unrecognized
    // regex literal desyncs the whole rest of the file's classification
    // (see `mask.ts`'s `REGEX_ELIGIBLE_KEYWORDS`/`REGEX_ELIGIBLE_PUNCT` doc
    // comment for the heuristic itself). js/ts-only: no other built-in
    // profile sets this.
    regexLiterals: true,
  },
  strategy: 'call-expression',
  isSkippedOpener,
};
