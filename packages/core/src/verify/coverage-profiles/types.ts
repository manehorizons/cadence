/**
 * Shared types for the multi-language assertion-coverage engine (phase 167).
 *
 * A `LanguageProfile` parameterizes the shared scanner (`./engine.ts`): how a
 * test file's comment/string syntax is masked out of consideration, how a
 * test "opener" (e.g. `it(`, `func TestX(`, `def test_x(`) is recognized,
 * how the opener's block boundary is resolved (one of four `BlockStrategy`
 * primitives, `./strategies.ts`), and what counts as an assertion inside
 * that block. Built-in profiles live alongside this file (`./js-ts.ts`, and
 * later `./python.ts` / `./go.ts` / `./rust.ts` / `./php.ts`); the registry
 * (`./registry.ts`) maps file extensions to a profile.
 */

/** A single scanned test span: an opener's resolved block boundary. */
export interface TestSpan {
  /** Absolute index of the opener match start. */
  start: number;
  /** Absolute index of the block's closing boundary (inclusive). */
  end: number;
  /** True iff a code-mode assertion token appears inside the block. */
  hasAssertion: boolean;
  /** True iff the opener marks a test that does not run its body normally
   * (phase 169's "skip dodge" — e.g. js/ts's `it.skip`/`test.todo`), per
   * `LanguageProfile.isSkippedOpener`. Always `false` for a profile that
   * doesn't define one. */
  skipped: boolean;
}

/**
 * A string/char literal delimiter pair. Symmetric quotes (`'`, `"`, `` ` ``)
 * omit `close`. Longer delimiters (e.g. Python's `"""`) are tried before
 * shorter ones that share a prefix — the engine sorts by `open` length.
 */
export interface StringDelimiter {
  open: string;
  /** Defaults to `open` (symmetric) when omitted. */
  close?: string;
  /** Escape character recognized inside the string. `null` disables escape
   * handling entirely (e.g. raw strings). Defaults to `\`. */
  escape?: string | null;
}

export interface CommentSyntax {
  /** Line-comment openers, e.g. `['//']` or `['#']`. */
  line?: string[];
  /** Block-comment `[open, close]` pairs, e.g. `[['/*', '*\/']]`. */
  block?: Array<[string, string]>;
}

/**
 * A "fenced" string form whose open/close delimiters share a dynamically
 * repeated fence character between a fixed prefix and a fixed quote — Rust's
 * raw strings (`r"..."`, `r#"..."#`, `r##"..."##`, ... — any hash count, no
 * fixed upper bound in the language grammar) are the motivating case (phase
 * 167, T4 review: a fixed enumerated list of `StringDelimiter` entries for
 * hash counts 0–N left hash counts beyond N falling through to an unrelated
 * shorter delimiter, letting a quote embedded in the raw string's own
 * content close it early and expose decoy text as live code — exactly the
 * false-positive class the phase is meant to prevent). Unlike
 * `StringDelimiter`, `close` is computed at match time from however many
 * `fenceChar` repeats were actually found, so there is no bound to exceed.
 *
 * Distinguishing this from an unrelated identical-looking prefix (e.g.
 * Rust's raw-identifier syntax `r#type`, `r#match` — `r#` NOT followed by a
 * quote) is exactly why this is `quote`-anchored rather than a plain
 * prefix+fence match: a match requires the fence run to be immediately
 * followed by `quote`, so `r#type` (fence run followed by a letter) is
 * correctly never recognized as a fenced string at all and is left as
 * ordinary code.
 */
export interface FencedStringDelimiter {
  /** Literal text before the fence run, e.g. `'r'`. */
  prefix: string;
  /** The single character that may repeat any number of times (incl. zero)
   * between `prefix` and `quote`, e.g. `'#'`. */
  fenceChar: string;
  /** Literal quote character that must immediately follow the fence run to
   * open the string, e.g. `'"'`. Also closes it, preceded by the same
   * number of `fenceChar` repeats that opened it. */
  quote: string;
}

/**
 * A line-anchored, dynamic-identifier-fenced string form — PHP's
 * heredoc/nowdoc (`<<<IDENT ... IDENT;`, `<<<"IDENT" ... IDENT;`,
 * `<<<'IDENT' ... IDENT;`) is the motivating case (phase 167, T5 review: an
 * earlier version left heredoc entirely unmasked, and a STANDALONE heredoc
 * — not nested inside any already-recognized test opener — whose content
 * happened to look like a balanced, test-shaped snippet produced a
 * genuinely fabricated span; demonstrated reachable in realistic PHP code,
 * e.g. a code-generation/scaffolding test's expected-output fixture).
 *
 * Unlike `FencedStringDelimiter` (whose close is anchored to a REPEATED
 * CHARACTER count), a heredoc's close is anchored to an arbitrary
 * IDENTIFIER captured at the open, appearing alone (optionally indented,
 * per PHP 7.3+ "flexible heredoc syntax") at the start of a later line.
 */
export interface HeredocDelimiter {
  /** Literal marker introducing a heredoc/nowdoc, e.g. `'<<<'` for PHP. */
  marker: string;
}

/** Per-language comment/string delimiter table used to mask non-code text. */
export interface LanguageSyntax {
  comments: CommentSyntax;
  strings: StringDelimiter[];
  /** Optional dynamic-fence string forms — see `FencedStringDelimiter`. */
  fencedStrings?: FencedStringDelimiter[];
  /** Optional line-anchored dynamic-identifier string forms — see `HeredocDelimiter`. */
  heredocs?: HeredocDelimiter[];
  /**
   * Opts a profile into `classify()`'s (`./mask.ts`) JS/TS-style `/regex/`
   * literal masking (phase 258, T2). `false`/unset by default and left
   * unset by every built-in profile except `js-ts` and by
   * `compileSyntax`'s custom-profile compilation (`./custom.ts`) — `/` means
   * division, a path separator, or nothing at all in most of the other
   * languages this scanner supports, so this stays an explicit js/ts-only
   * opt-in rather than a default every profile inherits (see `js-ts.ts` for
   * the one profile that sets it, and `mask.ts` for the heuristic itself).
   */
  regexLiterals?: boolean;
}

/**
 * The four block-boundary strategies (phase 167 AC-1..AC-5, T1):
 * - `call-expression`: opener regex ends in `(`; depth-tracked to the
 *   matching `)` (js/ts today).
 * - `brace-delimited`: opener regex matches a header; the first code-mode
 *   `{` after it opens a depth-tracked block to the matching `}` (go/rust/
 *   PHPUnit-shaped languages).
 * - `indentation-delimited`: opener regex matches a header line; the block
 *   extends through subsequent lines more indented than the opener (python).
 * - `do-end-keyword`: opener regex ends in a block-opening keyword (e.g.
 *   `do`); the block extends to the matching `end`-family keyword, tracking
 *   nested opener/closer keyword pairs generically (ruby/elixir-style
 *   languages — no built-in profile ships this yet, but the strategy is a
 *   real, generically usable primitive exercised by custom-profile fixtures).
 */
export type BlockStrategy =
  | 'call-expression'
  | 'brace-delimited'
  | 'indentation-delimited'
  | 'do-end-keyword';

/** Config required only when `strategy === 'do-end-keyword'`. */
export interface KeywordStrategyConfig {
  /** Keywords that open a further nested block needing its own closer. */
  blockOpenKeywords: string[];
  /** The keyword that closes the innermost currently-open block. */
  endKeyword: string;
}

export interface LanguageProfile {
  /** Unique profile id, e.g. `'js-ts'`, `'python'`. */
  id: string;
  /** Lowercase file extensions this profile claims, e.g. `['.ts', '.tsx']`. */
  extensions: string[];
  /**
   * Opener pattern. Must be a sticky (`y` flag) regex — the engine tests it
   * at an exact index (a `y` flag is added automatically if missing). For
   * `call-expression` the match must include the triggering `(`. For the
   * other strategies the match covers the opener header only (e.g.
   * `def test_x(...):`, `func TestX(...)`, `it 'x' do`); the strategy scans
   * forward from the match end to resolve the actual block boundary.
   */
  openerPattern: RegExp;
  /** Assertion token pattern, tested against the block's code-only text. */
  assertionPattern: RegExp;
  /** Comment/string delimiter table used to mask non-code text. */
  syntax: LanguageSyntax;
  /** Which block-boundary primitive resolves this profile's opener. */
  strategy: BlockStrategy;
  /** Required iff `strategy === 'do-end-keyword'`. */
  keyword?: KeywordStrategyConfig;
  /**
   * Default `false`: the opener pattern is matched against a view where
   * BOTH comment and string content is hidden (replaced with spaces) — the
   * false-positive-averse default, since no built-in profile's opener needs
   * to see string content to correctly recognize a real test. Set `true`
   * only when the opener's own syntax legitimately spans a quoted string as
   * a structural part of its match (e.g. `do-end-keyword`'s `it 'title' do`
   * — the quotes there aren't incidental content, they're the framework's
   * own title-delimiter syntax). This is narrower than it looks: even with
   * `true`, comment content is still always hidden from opener matching —
   * only string content becomes visible (phase 167, T3 review: an opener
   * requiring an interior literal, like go's `*testing\.T` parameter-type
   * check, was spoofable via a string literal placed elsewhere in the same
   * match when strings were left visible by default).
   */
  openerMatchesStrings?: boolean;
  /**
   * Optional literal-inside-parens requirement, checked separately from
   * `openerPattern` using paren-depth-aware bounds (phase 167, T3 review,
   * round 3). Use this instead of embedding a required substring directly
   * inside `openerPattern` via a `[^)]*literal[^)]*\)` idiom — that idiom is
   * NOT paren-depth-aware, so a nested parenthesized sub-expression (e.g. a
   * function-type parameter that itself has a `)`, as in Go's
   * `func TestSpoof(cb func(x *testing.T))`) can supply an early, unrelated
   * closing paren that lets the wildcard "find" the literal and terminate
   * without the match ever reaching the opener's own true closing paren —
   * producing a false-positive span for a function whose real top-level
   * signature never contained the required literal at all.
   *
   * When set, `openerPattern` MUST end immediately after the triggering `(`
   * (the same convention `call-expression` uses for its own opener, even
   * for profiles using a different block strategy). The engine then extracts
   * the opener's TOP-LEVEL parameter-list text only
   * (`extractTopLevelParenText`, `./strategies.ts`) and tests this pattern
   * against that — content nested inside any sub-expression's own parens
   * (e.g. that function-type parameter's own `(x *testing.T)`) is dropped
   * entirely, not just bounded: the required literal must belong to THIS
   * parameter list's own, unnested parameter types, not to something the
   * parameter list merely happens to contain.
   */
  openerRequiredLiteral?: RegExp;
  /**
   * Optional (phase 169, ported onto this architecture at merge time):
   * given the opener regex's own match (the same `RegExpExecArray` the
   * engine already produced — inspect its capture groups directly, e.g.
   * js/ts's modifier group), decide whether this particular opener marks a
   * "skipped" test — one that does not run its body normally (js/ts's
   * `it.skip`/`test.todo`/`test.failing`; `only`/`concurrent` do NOT count,
   * since they execute normally). When set, `TestSpan.skipped` reflects the
   * result; when unset, every span from this profile has `skipped: false`.
   * No built-in profile besides js/ts implements this yet — it's a
   * genuinely per-language concept (Go's `t.Skip()`, Python's
   * `@pytest.mark.skip`, etc. would each need their own detection), left
   * for a future phase rather than guessed at here.
   */
  isSkippedOpener?: (openerMatch: RegExpExecArray) => boolean;
}
