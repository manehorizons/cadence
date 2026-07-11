/**
 * Pure, string/comment-aware finder for `it()`/`test()` call spans (phase 108).
 *
 * Used by the `assertion` coverageMode to decide whether an `AC-N` token sits
 * inside a test that actually asserts. Deterministic, offline, no AST.
 *
 * Phase 167 (T1): the character-scan engine that used to live here was
 * generalized into a shared, profile-parameterized engine
 * (`./coverage-profiles/engine.ts`) so other languages can reuse it. This
 * file is now a thin wrapper: `findTestSpans` always scans with the js/ts
 * profile (`./coverage-profiles/js-ts.ts`), registered in the shared
 * registry (`./coverage-profiles/registry.ts`) under `.ts`/`.tsx`/`.js`/
 * `.jsx`. Callers here don't pass a filename, so real per-file profile
 * dispatch across languages is wired by the coverage gate in T6, not here —
 * this function's signature is unchanged and its behavior is unchanged for
 * every input covered by the pre-167 test suite (the engine recovers on some
 * adversarial malformed input, e.g. an unclosed `it(` call, where the old
 * hand-rolled scanner silently swallowed the rest of the file).
 *
 * Known best-effort edges (documented, not closed): regex literals and
 * template-literal `${…}` interiors with unbalanced parens; the curried
 * `it.each(table)(title, fn)` form (its `.each(…)` args are not the test body).
 * The gate is opt-in and always relaxable via coverageMode 'mention',
 * --allow-missing-coverage, or --force.
 *
 * `TestSpan.skipped` (phase 169, ported onto this architecture at merge
 * time): true when the opener's modifier is `skip`/`todo`/`failing` — the
 * test does not run its body normally, so an intact assertion inside it must
 * not count as qualifying coverage (the "skip dodge"). `only`/`concurrent`
 * stay asserting-eligible since they execute normally. Implemented generically
 * via `LanguageProfile.isSkippedOpener` (`./coverage-profiles/types.ts`) so
 * other profiles can add their own skip-modifier concept later (e.g. Go's
 * `t.Skip()`, Python's `@pytest.mark.skip`) without touching this file or
 * the shared engine again — only js/ts implements it today, matching
 * phase 169's original scope.
 */

import { findSpansForProfile } from './coverage-profiles/engine.js';
import { jsTsProfile } from './coverage-profiles/registry.js';
import type { TestSpan } from './coverage-profiles/types.js';

export type { TestSpan };

export function findTestSpans(text: string): TestSpan[] {
  return findSpansForProfile(text, jsTsProfile);
}
