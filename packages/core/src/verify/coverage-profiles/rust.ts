/**
 * Built-in rust profile (phase 167, T4) — `#[test]` functions (including
 * `#[should_panic]`-annotated ones, and those nested inside `#[cfg(test)]
 * mod tests { ... }` blocks) scanned with the `brace-delimited` strategy
 * (`./strategies.ts`).
 *
 * Opener design — why rust's discriminator needs neither
 * `openerRequiredLiteral` nor `openerMatchesStrings` (see the go profile's
 * module docstring, `./go.ts`, for the four-round review history those two
 * fields exist to close):
 *
 * Go's `*testing.T` requirement is a literal that must be found SOMEWHERE
 * inside an otherwise-unbounded parameter list (`func TestX(<anything>)`),
 * which is exactly the "search a wildcard span for a required substring"
 * shape that was spoofable three separate ways (a comment, a string/struct-
 * tag literal, a nested sub-expression's own closing paren). Rust's
 * `#[test]` attribute has no equivalent wildcard: it is a fixed, adjacent
 * token sequence that must appear immediately (modulo whitespace, comments,
 * and further stacked attributes) before `fn`. There is nothing for a
 * spoofed literal to hide inside — the opener pattern itself IS the
 * requirement, matched as a contiguous sequence, never searched for within
 * an unbounded span. So:
 *  - `openerRequiredLiteral` is not used: there is no separate "does this
 *    parameter list contain X" check to make paren-depth-aware, because the
 *    opener does not accept an unbounded parameter list at all — it requires
 *    the literal token `#[test]` up front, with no interior content to
 *    validate.
 *  - `openerMatchesStrings` is left at its default `false`: the opener never
 *    needs to see string content to recognize `#[test]` — comments AND
 *    strings both stay hidden from opener matching, which is what blocks a
 *    `// #[test]` commented-out attribute from ever matching (the `#` inside
 *    a `//` line comment is masked to a space in the opener-scan view before
 *    the regex ever runs — verified by this file's paired test suite).
 *
 * Attribute stacking, in either order, needs no special-casing in the
 * pattern itself: `findSpansForProfile` (`./engine.ts`) tries the opener at
 * EVERY code-mode, non-word-preceded position in the file, not just at the
 * first `#` of a stack. So for
 * ```
 * #[should_panic(expected = "boom")]
 * #[test]
 * fn foo() { ... }
 * ```
 * the engine simply fails to match at the `#[should_panic...]` position (the
 * pattern below requires the literal token `#[test]` first) and succeeds at
 * the `#[test]` position itself, regardless of what attributes preceded it.
 * `OPENER` only needs to describe what may follow `#[test]` — zero or more
 * further `#[...]` attributes — never what may precede it. This also means a
 * bare `#[should_panic]` with no `#[test]` anywhere never matches: there is
 * no `#[test]` token in the file for the scan loop to anchor on (AC-4
 * explicitly calls this out — `should_panic` alone does not make a function
 * a real test in Rust either).
 *
 * `#[cfg(test)] mod tests { ... }` needs no special handling for the same
 * reason table-driven Go subtests need none (`./go.ts`): the wrapping `mod`
 * item's own braces are just more brace-depth-tracked structure that the
 * `brace-delimited` strategy naturally folds around whatever the real
 * `#[test] fn` opener resolves to — verified directly by this file's paired
 * test suite (`coverage-profiles-rust.test.ts`), not merely asserted here.
 *
 * Assertion pattern: `assert!`, `assert_eq!`, `assert_ne!` — a fixed,
 * representative set (mirrors the go/js-ts profiles' own fixed-set
 * precedent). These are macros, not calls, so the pattern requires the `!`
 * before `(`; `debug_assert!`/`debug_assert_eq!`/`debug_assert_ne!` and
 * third-party assertion macros (e.g. `pretty_assertions::assert_eq!`) are
 * out of scope for this fixed set.
 *
 * String/comment table — the deliberate scope decisions and why:
 *  - `//` line comments, `/* *\/` block comments. Real Rust block comments
 *    NEST (`/* /* inner *\/ still commented *\/`); `mask.ts`'s block-comment
 *    mode is not nesting-aware (it closes at the first `*\/`), so a nested
 *    `/* *\/` pair is a documented, known limitation of this profile — under-
 *    masking here is false-negative-safe (worst case: content after a
 *    premature inner `*\/` is read as code, which can only ever cause a
 *    missed/truncated span, never a fabricated one).
 *  - `"..."` strings: default backslash escaping.
 *  - Raw strings `r"..."`, `r#"..."#`, `r##"..."##`, ... : real Rust allows
 *    an arbitrary hash count, and this profile now matches that exactly via
 *    `LanguageSyntax.fencedStrings` (`./mask.ts`, added by this task's
 *    review) rather than a fixed enumerated `StringDelimiter` list — an
 *    earlier version enumerated only 0–8 hashes, and a hash count beyond
 *    that fell through to the plain `"..."` delimiter, which could close
 *    early on a quote embedded in the raw string's own content and expose
 *    decoy text (e.g. a fake `assert!(...)`) as live code: a real,
 *    constructible false positive (phase 167, T4 review), not a
 *    hypothetical one. `fencedStrings`'s dynamic close removes the bound
 *    entirely. It also correctly leaves Rust's raw-identifier syntax
 *    (`r#type`, `r#match` — a fence run NOT followed by a quote) as
 *    ordinary code, never mistaken for a string open (`matchFence`'s
 *    quote-anchor check, `./mask.ts`). Raw strings have no escape mechanism
 *    (a bare `\` is a literal character); `matchFence` always uses
 *    `escape: null`, mirroring go's own raw-string rationale.
 *  - Char literals (`'x'`, `'\n'`, ...) are deliberately NOT included in
 *    this profile's string table at all — this is the one place Rust's
 *    lexical grammar is genuinely ambiguous under `mask.ts`'s plain
 *    substring-delimiter model (`open`/`close` are fixed strings, no
 *    lookahead). Rust also uses a bare `'` immediately followed by an
 *    identifier with NO closing `'` for a LIFETIME (`fn foo<'a>(x: &'a
 *    str)`), which is indistinguishable, under a naive symmetric `'...'`
 *    delimiter, from the START of an unterminated char literal: `mask.ts`
 *    would then scan forward for the next bare `'` ANYWHERE later in the
 *    file and mask everything in between as "string" content — silently
 *    hiding real code (including the actual `#[test]` opener and its
 *    assertions) behind a phantom string. That failure mode is exactly what
 *    phase 167's T3 review repeatedly found in a different guise: an
 *    over-eager match that swallows real code it shouldn't. Since `mask.ts`
 *    cannot be changed (out of this task's file boundary) and offers no
 *    lookahead primitive to disambiguate "one char then a closing quote"
 *    from "an identifier with no closing quote", the false-positive-averse
 *    choice is to leave `'` unmasked entirely: lifetimes are then always
 *    safe (never swallow anything), at the cost of a narrow, documented
 *    residual limitation — a char literal whose single character is itself
 *    structurally significant (`"`, `{`, `}`, `(`, `)`, or a comment-opener)
 *    is not masked and could perturb brace-depth tracking or (for `'"'`
 *    specifically) spuriously start real string-mode masking. This is
 *    verified false-negative-safe, not false-positive-unsafe: it can only
 *    ever narrow, truncate, or miss a span that a genuine `#[test]` opener
 *    already established, never fabricate one where no `#[test]` exists —
 *    but the practical cost is real, not merely theoretical: a char literal
 *    containing `{` or `}` inside an otherwise-valid `#[test]` function's
 *    body permanently unbalances `brace-delimited`'s own depth tracking,
 *    losing the ENTIRE span (0 spans, not a narrowed one) even though the
 *    function is real and does assert (phase 167, T4 review). This file's
 *    paired test suite covers two DISTINCT cases, both confirmed
 *    false-negative-safe: a lifetime followed by real, scannable code
 *    including a real assertion (the span resolves correctly — lifetimes
 *    alone are harmless), and a char literal containing `{` (the span is
 *    lost entirely — 0 spans, never a wrong/fabricated one).
 */

import type { LanguageProfile } from './types.js';

/** Opener: `#[test]` then zero or more further stacked attributes (e.g.
 * `#[should_panic(expected = "...")]`), then `fn <name>(`. Matched at the
 * `#[test]` token itself regardless of what attributes precede it in source
 * — see module docstring. `[^\]]*` inside each further attribute's brackets
 * cannot skip past a real `]`: it excludes `]` from the character class
 * entirely, and any `]` that's part of a string argument is already masked
 * to a space in the opener-scan view, so only the attribute's own real
 * closing `]` can terminate the repetition. */
const OPENER = /#\[test\]\s*(?:#\[[^\]]*\]\s*)*fn\s+\w+\s*\(/y;

/** Assertion: `assert!`/`assert_eq!`/`assert_ne!` macro invocations. Fixed
 * set — see module docstring. `\b` before `assert` keeps a user identifier
 * like `my_assert!(...)` from qualifying (the character before `assert`
 * must be a non-word character). */
const ASSERTION = /\bassert(?:_eq|_ne)?!\s*\(/;

export const rustProfile: LanguageProfile = {
  id: 'rust',
  extensions: ['.rs'],
  openerPattern: OPENER,
  assertionPattern: ASSERTION,
  syntax: {
    comments: { line: ['//'], block: [['/*', '*/']] },
    strings: [{ open: '"' }],
    // Raw strings (`r"..."`, `r#"..."#`, `r##"..."##`, ...): a dynamic
    // fence, not a fixed enumerated bound — see module docstring (T4
    // review) for why an enumerated list was a real false-positive gap.
    // `quote`-anchoring also correctly leaves Rust's raw-identifier syntax
    // (`r#type`, `r#match` — a fence run NOT followed by a quote) as
    // ordinary code, never mistaken for a string open.
    fencedStrings: [{ prefix: 'r', fenceChar: '#', quote: '"' }],
  },
  strategy: 'brace-delimited',
};
