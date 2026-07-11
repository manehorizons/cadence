/**
 * Built-in go profile (phase 167, T3) — `func TestX(t *testing.T)` test
 * functions scanned with the `brace-delimited` strategy (`./strategies.ts`).
 *
 * Opener convention: Go's real-world test convention is
 * `func TestXxx(t *testing.T) { ... }` — an exported (or at least
 * capitalized/underscore/digit-prefixed) name immediately after `Test`, with
 * a parameter whose declared type is literally `*testing.T` (not just any
 * identifier — this keeps the opener from false-positive-matching, say, a
 * plain helper `func TestData(x int) {}` that merely starts with `Test`).
 * `go vet` itself flags a lowercase letter directly after `Test` as a
 * malformed test name, so requiring `[A-Z0-9_]` (or nothing at all) as the
 * next character mirrors the real convention rather than inventing one.
 *
 * The `*testing.T` requirement is enforced via `openerRequiredLiteral`
 * (`./types.ts`), NOT embedded inside `openerPattern` itself (phase 167, T3
 * review round 3): an earlier version used a `[^)]*\*\s*testing\.T\b[^)]*\)`
 * idiom directly in the opener regex, which is not paren-depth-aware — a
 * nested parenthesized sub-expression (e.g. a function-type parameter with
 * its own `(...)`, as in `func TestSpoof(cb func(x *testing.T))`) could
 * supply an early, unrelated closing paren that let the wildcard "find" the
 * literal and terminate before ever reaching the signature's own true
 * closing paren — a real false positive reachable via ordinary, valid,
 * non-malicious Go (e.g. a fixture-builder helper accepting a `func(t
 * *testing.T)` callback), not just deliberate spoofing. `openerPattern` now
 * ends right after the triggering `(` (the same convention `call-expression`
 * openers use); the engine separately extracts the TOP-LEVEL parameter-list
 * text only (nested sub-expression interiors excluded, `./types.ts`'s
 * `openerRequiredLiteral` docstring) and tests `*testing.T` against that —
 * tolerating the exact parameter name (`t`, or anything else), incidental
 * whitespace/formatting, and multi-line signatures, exactly as the old
 * `[^)]*` wildcards did, but only within this signature's own unnested
 * parameter list.
 *
 * `brace-delimited` then scans forward from AFTER the parameter list's true
 * closing paren (not from right after the opening `(`) for the first
 * code-mode `{` and depth-tracks to the matching `}` — the engine
 * repositions its internal scan point to `extractTopLevelParenText`'s
 * `closeIdx + 1` once the literal check above passes (`./engine.ts`). This
 * matters because `openerPattern` itself ends at the opening `(`: without
 * the repositioning, a `{`-bearing parameter type occurring anywhere in the
 * parameter list — e.g. an inline `struct{...}` parameter, or the common
 * `map[K]struct{}` idiom — would be mistaken by `brace-delimited`'s own
 * "find the next `{`" search for the real function body, truncating the
 * span to end inside the parameter list and silently losing any assertion
 * in the real body (phase 167, T3 review round 4 — a regression introduced
 * by round 3's opener-shortening fix, not present in the original design).
 * Verified by this file's paired test suite (`coverage-profiles-go.test.ts`,
 * search "round 4").
 *
 * Subtests and table-driven tests need no special handling: `t.Run("name",
 * func(t *testing.T) { ... })` is just another `{...}` nested inside the
 * outer function's braces (an anonymous `func(...)` closure never matches
 * this profile's opener — it isn't named `TestXxx` — so it is never
 * mistaken for a second, independent test-function opener). Brace-depth
 * tracking naturally folds the subtest's or table entry's body into the
 * outer span. Verified directly by this file's paired test suite
 * (`coverage-profiles-go.test.ts`), not merely asserted here.
 *
 * Assertion pattern: a fixed, representative set — `t.Error`/`t.Errorf`/
 * `t.Fatal`/`t.Fatalf` (the stdlib `testing` forms) plus the common testify
 * shapes `assert.<Method>(...)` / `require.<Method>(...)` — mirrors the
 * js/ts profile's own "fixed set this phase" precedent
 * (`../test-spans.ts`'s original docstring). Other testify entry points
 * (e.g. suite-style `s.Assert().Equal(...)`) are out of scope for this
 * fixed set.
 *
 * String/comment table: `//` line comments, `/* *\/` block comments,
 * Go's three literal forms —
 *   - `"..."` interpreted strings: default backslash escaping applies.
 *   - `` `...` `` raw strings: Go raw strings support **no** escape
 *     mechanism at all (a backslash is a literal character, and there is no
 *     way to embed a backtick). `escape: null` is used here specifically so
 *     `mask.ts`'s generic string-mode escape handling (which otherwise
 *     always treats a bare `\` as "skip it and the next character") is
 *     turned off for this delimiter — `StringDelimiter.escape` already
 *     supports this per-delimiter (see `./types.ts`), so no change to
 *     `mask.ts` itself was needed or made.
 *   - `'x'` rune literals: included as a single-char delimiter (default
 *     backslash escaping, since a rune literal can legitimately contain an
 *     escaped quote like `'\''` or an escape sequence like `'\n'`). A rune
 *     literal's content is 1–3 source characters either way, so masking it
 *     as a tiny "string" region is low-risk and simply keeps an apostrophe
 *     from being misread as unbalanced code.
 *
 * `openerRequiredLiteral` above closes three independently found spoof
 * vectors (phase 167, T3 review, all three rounds): a fake `*testing.T`
 * inside a `/* ... *\/` comment in the parameter list; one inside any string
 * literal (including a struct-tag string on an anonymous-struct parameter,
 * e.g. `func TestFake(t struct{ Tag string \`x:"*testing.T"\` }) {...}`,
 * otherwise valid Go); and one nested inside a sub-expression's own parens
 * (e.g. `func TestSpoof(cb func(x *testing.T))`). This profile does not set
 * `openerMatchesStrings` (`./types.ts`), so comments AND string content are
 * both hidden from opener-header matching too, not just from the required-
 * literal check.
 */

import type { LanguageProfile } from './types.js';

/** Opener header only: `func Test<Name>(` — ends right at the triggering
 * `(`, per `openerRequiredLiteral`'s convention (see module docstring and
 * `./types.ts`). The `*testing.T` parameter-type requirement is enforced
 * separately, against this signature's own top-level parameter list only. */
const OPENER = /func\s+Test(?:[A-Z0-9_]\w*)?\s*\(/y;

/** The required parameter-type fragment, tested against the opener's
 * top-level parameter-list text only (see module docstring). */
const REQUIRED_PARAM = /\*\s*testing\.T\b/;

/** Assertion: stdlib `t.Error*`/`t.Fatal*` plus testify `assert.*`/`require.*`
 * method calls. Fixed set — see module docstring. */
const ASSERTION = /\bt\.(?:Error|Errorf|Fatal|Fatalf)\s*\(|\b(?:assert|require)\.[A-Za-z_]\w*\s*\(/;

export const goProfile: LanguageProfile = {
  id: 'go',
  extensions: ['.go'],
  openerPattern: OPENER,
  openerRequiredLiteral: REQUIRED_PARAM,
  assertionPattern: ASSERTION,
  syntax: {
    comments: { line: ['//'], block: [['/*', '*/']] },
    strings: [{ open: '`', escape: null }, { open: '"' }, { open: "'" }],
  },
  strategy: 'brace-delimited',
};
