/**
 * Built-in php profile (phase 167, T5) — recognizes BOTH PHP test shapes in
 * a single `LanguageProfile`:
 *  - Pest: `it('description', function () { expect($x)->toBe(1); });` /
 *    `test('description', function () { ... });` — closure-based.
 *  - PHPUnit: `public function testFoo(): void { $this->assertEquals(...); }`
 *    — method-based, typically inside `class FooTest extends TestCase { }`.
 *
 * ## The two-shape architectural problem, and why it resolves to ONE profile
 * using ONE strategy (`brace-delimited`), not two registrations
 *
 * `LanguageProfile` has exactly one `strategy` field, and `registry.ts`
 * (read directly before designing this file, per the task's Option A/B/C
 * framing) is a plain `Map<extension, profile>`: `registerProfile` calls
 * `registry.set(ext, profile)` per extension, so a SECOND registration for
 * `.php` would silently overwrite the first with no collision detection at
 * all (unlike T7's later custom-profile collision guard, which does not
 * exist yet for built-ins and is out of scope for this task regardless).
 * Registering two synthetic php sub-profiles (Option A) is therefore not
 * just architecturally ugly, it is actively broken: `getProfileForExtension`
 * would return only whichever profile happened to be registered LAST,
 * silently dropping the other shape's recognition entirely. This is a real
 * property of the current code, confirmed by reading `registry.ts`, not an
 * assumption.
 *
 * The fix is Option B: a single profile, `strategy: 'brace-delimited'`,
 * whose `openerPattern` is an alternation between the two shapes' headers —
 * and the crux insight that makes ONE strategy correct for BOTH shapes is
 * that Pest's `function () { ... }` closure body is *itself* a
 * brace-delimited block. `braceDelimitedBlock` (`./strategies.ts`) already
 * does exactly what both shapes need: scan forward from the opener header's
 * match end for the first code-mode `{`, then depth-track to the matching
 * `}`. For PHPUnit that `{` is the method body's own opening brace. For
 * Pest it is the closure literal's opening brace — `it(`/`test(`'s own
 * *call* parens are never brace-tracked at all (parens are irrelevant to
 * `braceDelimitedBlock`), so the resolved span is the closure body, which is
 * exactly where `expect(...)` assertions live. No engine, strategy, or
 * registry change was needed — this is a profile-design answer, not a T1
 * infrastructure gap, and nothing outside this file's boundary was touched.
 *
 * `findSpansForProfile` (`./engine.ts`) already supports "two different
 * opener shapes triggering at different positions in the same scan" for
 * free: it retries the opener pattern at every code-mode, non-word-preceded
 * index, so a Pest match earlier in a file and a PHPUnit match later in the
 * same file are found independently by the same linear pass (verified by
 * this file's paired test suite, "both shapes in the same file"). Nothing
 * about resolving PEST's block differently from PHPUNIT's block is needed
 * inside the engine, because — per the insight above — they resolve
 * IDENTICALLY once each alternative's header ends at the right place.
 *
 * ## Opener design: why each alternative ends exactly where it does
 *
 * PEST_OPENER requires the literal, contiguous sequence `it(` or `test(`,
 * then (masked-blank, i.e. the description string) a `,`, then `function`,
 * then the closure's own `(...)` parameter list, optionally followed by a
 * `use (...)` capture clause. It deliberately does NOT consume through to
 * the closure's `{` itself (mirroring the `call-expression` opener
 * convention of ending right at the triggering token, per `./types.ts`'s
 * `openerRequiredLiteral` docstring) — `braceDelimitedBlock`'s own forward
 * scan finds the closure's `{` from there, tolerating a return-type-less
 * closure signature exactly as-is.
 *
 * This profile does NOT set `openerMatchesStrings` (default `false`), so
 * the Pest description string is masked to blank space for opener matching,
 * same as every other masked region. This is a deliberate choice, not an
 * oversight: an earlier design considered requiring the opener to literally
 * see through the quoted description (`openerMatchesStrings: true`, the
 * same opt-in `do-end-keyword`'s `it 'title' do` legitimately uses, per
 * `./types.ts`) — but unlike that keyword-strategy case, this profile's
 * opener never needs to inspect the description text itself, only confirm a
 * `, function` shape follows it. Revealing string content to opener
 * matching would reopen exactly the spoof class phase 167's T3 review found
 * for go (round 2): a comma-then-`function`-then-parens sequence embedded
 * inside an UNRELATED string constant elsewhere in the file (e.g.
 * `$spoof = "it('fake', function () {";`) would become visible to the
 * opener regex and could match, with `braceDelimitedBlock` then walking
 * forward in REAL code past the string to whatever `{` happens to appear
 * next — attributing an unrelated block as the "test" body. Keeping strings
 * masked (the false-positive-averse default) means the opener can only ever
 * match `\s*` (a run of masked-blank characters, from whatever was really
 * there) between `(` and the required literal `,` — a string's inner
 * content, dollar-signs, braces, or anything else, can never itself supply
 * the `,`/`function`/`(`/`)` structural tokens the pattern requires, because
 * those tokens are masked away with everything else inside the string. This
 * file's paired test suite verifies this directly (spoofed nested
 * "it(...)"/"public function testX(...)" text inside a real string literal,
 * for both shapes, never produces an extra span).
 *
 * PHPUNIT_OPENER requires the literal, contiguous sequence `public`,
 * `function`, then a name starting with the literal (case-sensitive) prefix
 * `test`, ending right at the method's own `(`. No `openerRequiredLiteral`
 * check is needed the way go's `*testing.T` requirement needed one: unlike
 * a literal that must be found SOMEWHERE inside an unbounded parameter list
 * (exactly the wildcard-search shape that was spoofable three ways for go,
 * see `./go.ts`'s module docstring), PHPUnit's discriminator (`public`,
 * `function`, `test` prefix) is a fixed, adjacent token sequence matched
 * directly by the opener itself — there is no wildcard span for a spoofed
 * literal to hide inside. The unconsumed parameter list and optional return
 * type (`(...): void`) between the opener's match end and the real body's
 * `{` cannot themselves contain a `{` in ordinary PHP type-hint syntax (PHP
 * uses `[]` for array literals, not `{}`, since the curly-brace
 * array/string-offset syntax was removed in PHP 8), so — unlike go's round-4
 * regression — there is no `{`-bearing type-hint shape here that could
 * fool `braceDelimitedBlock`'s own "scan forward for the first `{`" search
 * into stopping early.
 *
 * Matching PHPUnit's own real-world discovery convention deliberately, not
 * inventing a stricter one: `public function testHelper($x) { return $x; }`
 * with no `$this->assert*` call still yields a span (with `hasAssertion:
 * false`) — PHPUnit's own reflection-based test discovery treats ANY public
 * method whose name starts with `test` as a real test method regardless of
 * whether it asserts anything, so this is correct recognition, not a false
 * positive (AC-5's "non-asserting test function still yields a span, just
 * with hasAssertion: false" case, mirrored from go/python/rust).
 *
 * `private`/`protected` methods and non-`test`-prefixed public methods are
 * never openers at all: the literal tokens `public` and `test` are both
 * required directly in the pattern, not searched for.
 *
 * ## Item 8 — why a plain `function test(...)`/`function it(...)` DEFINITION
 * or a bare, closure-less `test($x)`/`it($x)` CALL never matches
 *
 * PEST_OPENER requires the literal, contiguous sequence `, function` right
 * after the triggering `(` (modulo masked-blank whitespace from a
 * description string, per above). A genuine PHP function DEFINITION named
 * `test`/`it` (`function test($x) { ... }`) has no second, comma-separated,
 * literal `function`-keyword parameter — a parameter cannot literally be
 * named or typed as the reserved word `function` in valid PHP — so this is
 * a structural impossibility for ordinary code to satisfy by coincidence,
 * not merely an unlikely heuristic. The same reasoning excludes a bare call
 * with no closure at all (`test($x);` — no comma-then-`function` shape
 * present) and a single-argument closure with no description
 * (`test(function () { ... });` — no `,` between `(` and `function` at all).
 * This file's paired test suite verifies all three shapes explicitly yield
 * zero spans, per the task's explicit instruction to test this behavior
 * rather than merely assume it.
 *
 * Single-argument Pest closures with no description string are therefore a
 * documented, in-scope-per-AC exclusion (AC-5's Given clause specifies the
 * `it(...)`/`test(...)` closures paired with a description, matching real
 * Pest usage): out of scope for this fixed opener shape, same "fixed
 * representative set, not exhaustive grammar coverage" precedent already
 * established by every other built-in profile (go's testify subset, rust's
 * three assert macros, js/ts's fixed assertion set).
 *
 * ## String/comment table
 *
 * `//` and `#` line comments (both valid PHP line-comment openers), `/* *\/`
 * block comments (non-nesting, matching every other profile in this phase).
 * `'...'` single- and `"..."` double-quoted strings, both with default
 * backslash escaping — sufficient for masking purposes even though PHP's
 * *decoding* rules for the two forms differ (single-quoted strings only
 * recognize `\\` and `\'` as real escapes; everything else is two literal
 * characters): `mask.ts`'s generic "a backslash consumes itself and the next
 * character, never checking that pair for a closing delimiter" rule is
 * always safe for masking boundaries regardless of which escapes the target
 * language actually decodes, because it can only ever skip PAST a
 * would-be-closer, never fail to find a real one — the same reasoning
 * go/rust's own string tables already rely on. Double-quoted interpolation
 * (`"{$x}"`, `"$x"`) needs no special masking-table handling: once the
 * whole double-quoted literal is correctly classified as string content, its
 * embedded `{`/`}`/`$` characters are already invisible to code-mode
 * brace-depth tracking and opener/assertion matching, exactly as the task's
 * own guidance anticipated.
 *
 * ## Heredoc/nowdoc — masked via `LanguageSyntax.heredocs` (T5 review fix)
 *
 * `<<<EOT ... EOT;` / `<<<'EOT' ... EOT;` needs a fence whose close is the
 * SAME IDENTIFIER repeated at the start of a later line — structurally
 * different from `FencedStringDelimiter` (`./types.ts`), which is a
 * symmetric quote-anchored REPEATED-CHARACTER fence (Rust's `r#"..."#`), not
 * an arbitrary-identifier, line-anchored one. An earlier version of this
 * profile left heredoc/nowdoc entirely unmasked and documented it as an
 * out-of-scope, false-negative-safe gap — but empirical testing during
 * review found that framing was WRONG: a STANDALONE heredoc (not nested
 * inside any already-recognized real opener — e.g. a code-generation test's
 * expected-output fixture stored at file/const scope) whose body happens to
 * contain a complete, balanced-brace PHPUnit- or Pest-shaped snippet
 * genuinely and reproducibly produced a FABRICATED span with
 * `hasAssertion: true`, attributed to template/fixture text that was never
 * real code — a real, constructible false positive judged MORE reachable in
 * practice than T4's raw-string bound bug (heredocs are a common, everyday
 * PHP construct for exactly this kind of fixture/template data, unlike
 * Rust's rare 9+-hash raw strings), not less.
 *
 * `LanguageSyntax.heredocs` (`./types.ts`, `./mask.ts`) now closes this
 * generically: `matchHeredocOpener` captures the identifier at `<<<`/
 * `<<<"IDENT"`/`<<<'IDENT'`, and `matchHeredocCloser` requires that exact
 * identifier to reappear alone (modulo PHP 7.3+ flexible-syntax indentation)
 * at the start of a later line before the content is un-masked back to code
 * — a template/fixture heredoc's content is masked as string content for
 * its entire extent, exactly like any other string, so it can no longer
 * fabricate a span regardless of what test-shaped text it happens to
 * contain. Verified directly by this file's paired test suite: the
 * "standalone heredoc" fixture that used to pin the bug as expected
 * behavior now asserts the fix (zero fabricated spans).
 *
 * ## Assertion pattern
 *
 * `expect(` (Pest's fluent-chain entry point — matching the opener call
 * itself as "this block asserts" is the js/ts profile's own precedent for
 * `expect`, `./js-ts.ts`; PHP-specific chained methods like `->toBe(...)`/
 * `->toBeTrue(...)` need no individual enumeration) OR `$this->assert<Name>(`
 * (PHPUnit's fixed, representative set convention, mirroring go/rust's own
 * "fixed set this phase" precedent rather than enumerating every
 * `assertEquals`/`assertTrue`/`assertNull`/... individually).
 */

import type { LanguageProfile } from './types.js';

/** Pest opener: `it(`/`test(` through the closure's own parameter list
 * (optionally followed by a `use (...)` clause). Ends right after the
 * closure's `(...)`, NOT at its `{` — `brace-delimited` finds that `{` by
 * its own forward scan. Requires the literal `, function` sequence (see
 * module docstring for why this is a structural, not heuristic, guard). */
const PEST_OPENER_SRC =
  String.raw`\b(?:it|test)\s*\(\s*,\s*function\s*\([^()]*\)\s*(?:use\s*\([^()]*\)\s*)?`;

/** PHPUnit opener: `public function test<Name>(` — ends right at the
 * triggering `(`. See module docstring for why `private`/`protected` and
 * non-`test`-prefixed methods structurally never match. */
const PHPUNIT_OPENER_SRC = String.raw`\bpublic\s+function\s+test\w*\s*\(`;

const OPENER = new RegExp(`(?:${PEST_OPENER_SRC})|(?:${PHPUNIT_OPENER_SRC})`, 'y');

/** Assertion: Pest's `expect(` entry point (mirrors js/ts's own `expect`
 * precedent) or PHPUnit's `$this->assert<Name>(` fixed-set convention. */
const ASSERTION = /\bexpect\s*\(|\$this->assert\w+\s*\(/;

export const phpProfile: LanguageProfile = {
  id: 'php',
  extensions: ['.php'],
  openerPattern: OPENER,
  assertionPattern: ASSERTION,
  syntax: {
    comments: { line: ['//', '#'], block: [['/*', '*/']] },
    strings: [{ open: "'" }, { open: '"' }],
    heredocs: [{ marker: '<<<' }],
  },
  strategy: 'brace-delimited',
};
