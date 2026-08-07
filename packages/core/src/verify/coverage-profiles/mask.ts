/**
 * Generic string/comment masking (phase 167, T1).
 *
 * Walks `text` once against a per-profile `LanguageSyntax` table,
 * classifying every character as code / string / comment, and derives two
 * masks from that classification:
 *  - `computeCodeMask` — `1` only for genuine code characters, `0` for
 *    string OR comment content. Used by block-boundary strategies
 *    (`./strategies.ts`) and assertion-pattern testing (`./engine.ts`) so
 *    delimiter characters and assertion tokens inside strings or comments
 *    never affect span resolution — the direct generalization of the
 *    `code`/`sq`/`dq`/`tpl`/`line`/`block` state machine the original
 *    `test-spans.ts` hardcoded for JS/TS only.
 *  - `computeCommentMask` — `1` for code OR string content, `0` only for
 *    comment content. Used for opener matching (`./engine.ts`), where a
 *    profile's opener may legitimately need to match through a quoted
 *    title (e.g. `do-end-keyword`'s `it 'title' do`); only comment content
 *    is never legitimately part of an opener's own syntax (phase 167, T3
 *    review finding: an opener pattern requiring an interior literal was
 *    spoofable by a comment placed inside a function signature).
 *
 * `LanguageSyntax.fencedStrings` (phase 167, T4 review) additionally
 * supports dynamic-fence string forms — Rust's raw strings
 * (`r"..."`/`r#"..."#`/`r##"..."##`/...) with no fixed hash-count bound.
 * `matchFence` resolves the close dynamically per match rather than via a
 * fixed enumerated `StringDelimiter` list, so there is no "beyond N hashes"
 * gap that could fall through to an unrelated, prematurely-closing
 * delimiter and expose a raw string's own content as live code.
 *
 * `LanguageSyntax.heredocs` (phase 167, T5 review) supports line-anchored,
 * dynamic-IDENTIFIER-fenced string forms — PHP's heredoc/nowdoc
 * (`<<<IDENT ... IDENT;`). `matchHeredocOpener`/`matchHeredocCloser` capture
 * the identifier at the open and require it to reappear alone (modulo
 * indentation) at the start of a later line to close — otherwise, an
 * unmasked heredoc's content could be, and was demonstrated to be, read as
 * live code and fabricate a span for text that was never a real test.
 *
 * `LanguageSyntax.regexLiterals` (phase 258) additionally teaches `classify()`
 * a JS/TS-specific regex-literal lexical category, opt-in per profile (set
 * only by `js-ts.ts` today). Without it, a paren, quote, or backtick inside
 * an unrecognized `/regex/` literal was read as a real structural character —
 * corrupting `strategies.ts`'s depth-aware paren matcher and/or flipping this
 * file into real string/template mode for the rest of the file. `classify()`
 * disambiguates a `/` as regex-open vs. division via `precedingTokenCategory`
 * against an explicitly enumerated preceding-token vocabulary (documented at
 * its own doc comment below); an out-of-vocabulary `/` resolves
 * conservatively like division (never a best-guess regex-open) and, since
 * that can still silently corrupt downstream content if the un-opened regex
 * itself contains a quote, is additionally surfaced as a `MaskDiagnostic` —
 * see `computeCodeMask`'s optional `diagnostics` parameter and
 * `findSpansForProfileWithDiagnostics` (`./engine.ts`), which `cadence verify
 * coverage --explain` renders instead of failing silently.
 */

import type { LanguageSyntax, FencedStringDelimiter, HeredocDelimiter } from './types.js';

/** `1` = code, `0` = inside a string or comment. Same length as the input text. */
export type CodeMask = Uint8Array;

type Mode =
  | { kind: 'code' }
  | { kind: 'line' }
  | { kind: 'block'; close: string }
  | { kind: 'string'; close: string; escape: string | null }
  | { kind: 'heredoc'; identifier: string }
  | { kind: 'regex'; inClass: boolean };

/** Per-character classification: distinguishes string content from comment content. */
type Kind = 'code' | 'string' | 'comment';

/**
 * `diagnostics`, when passed, is mutated in place: `classify()` pushes one
 * `MaskDiagnostic` per `'unknown'`-category `/` it encounters (phase 258,
 * T3). Optional and additive — every existing call site that omits it keeps
 * its exact prior behavior; the mask itself never changes based on whether a
 * sink was passed.
 */
export function computeCodeMask(
  text: string,
  syntax: LanguageSyntax,
  diagnostics?: MaskDiagnostic[],
): CodeMask {
  const kinds = classify(text, syntax, diagnostics);
  const mask = new Uint8Array(kinds.length);
  for (let i = 0; i < kinds.length; i++) mask[i] = kinds[i] === 'code' ? 1 : 0;
  return mask;
}

/**
 * `1` = code or string content, `0` = inside a comment. Same length as the
 * input text. Unlike `computeCodeMask`, string content is left visible —
 * used only for opener matching (`./engine.ts`), where a profile's opener
 * may legitimately need to match through a quoted title (e.g. the
 * `do-end-keyword` strategy's `it 'title' do`) — masking strings there would
 * break that legitimate design. Comment content is never legitimately part
 * of any opener's own syntax, so it stays masked.
 *
 * Deliberately does NOT accept a `diagnostics` sink (phase 258, T3, unlike
 * `computeCodeMask`): `findSpansForProfileWithDiagnostics` (`./engine.ts`)
 * collects `'unknown'`-preceding-token diagnostics from its `computeCodeMask`
 * call only. Both masks derive from the same `classify()` walk over the same
 * text, so a profile that set both `regexLiterals` and
 * `openerMatchesStrings` (none does today) would double-report every
 * occurrence if this accepted a sink too — collecting once, from the primary
 * mask, is the correct count regardless of how many masks a given profile
 * happens to compute.
 */
export function computeCommentMask(text: string, syntax: LanguageSyntax): CodeMask {
  const kinds = classify(text, syntax);
  const mask = new Uint8Array(kinds.length);
  for (let i = 0; i < kinds.length; i++) mask[i] = kinds[i] === 'comment' ? 0 : 1;
  return mask;
}

/**
 * Tries to match a `FencedStringDelimiter` at `i`: `prefix`, then zero or
 * more `fenceChar` repeats, then `quote`. Returns the matched open length
 * and the dynamically-computed close string (`quote` + the SAME number of
 * `fenceChar` repeats) on success, or `null` if the fence run isn't
 * immediately followed by `quote` (e.g. Rust's `r#type` raw-identifier
 * syntax — a fence run followed by a letter, never a fenced string).
 */
function matchFence(
  text: string,
  i: number,
  fence: FencedStringDelimiter,
): { openLen: number; close: string } | null {
  if (!text.startsWith(fence.prefix, i)) return null;
  let j = i + fence.prefix.length;
  let hashes = 0;
  while (fence.fenceChar.length > 0 && text.startsWith(fence.fenceChar, j)) {
    j += fence.fenceChar.length;
    hashes++;
  }
  if (!text.startsWith(fence.quote, j)) return null;
  const openLen = j + fence.quote.length - i;
  const close = fence.quote + fence.fenceChar.repeat(hashes);
  return { openLen, close };
}

function isIdentStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z_]/.test(ch);
}
function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

/**
 * Tries to match a `HeredocDelimiter`'s opener at `i`: `marker`, then
 * optional spaces/tabs, then an optional `"`/`'` quote, then an identifier,
 * then the matching quote (if one was opened), then the rest of the line up
 * to and including its terminating `\n` (content begins on the NEXT line —
 * real PHP requires the identifier to be immediately followed, modulo
 * trailing whitespace, by a newline). Returns `null` on any deviation
 * (e.g. no valid identifier, no newline before EOF) rather than guessing.
 */
function matchHeredocOpener(
  text: string,
  i: number,
  heredoc: HeredocDelimiter,
): { identifier: string; openLen: number } | null {
  if (!text.startsWith(heredoc.marker, i)) return null;
  let j = i + heredoc.marker.length;
  while (text[j] === ' ' || text[j] === '\t') j++;
  let quote: string | null = null;
  if (text[j] === '"' || text[j] === "'") {
    quote = text[j]!;
    j++;
  }
  const identStart = j;
  if (!isIdentStart(text[j])) return null;
  while (isIdentChar(text[j])) j++;
  const identifier = text.slice(identStart, j);
  if (quote !== null) {
    if (text[j] !== quote) return null;
    j++;
  }
  while (text[j] === ' ' || text[j] === '\t' || text[j] === '\r') j++;
  if (text[j] !== '\n') return null;
  j++;
  return { identifier, openLen: j - i };
}

/**
 * At a line-start position `i` (caller-verified), checks whether this line
 * closes the given heredoc: optional leading spaces/tabs (PHP 7.3+
 * "flexible heredoc syntax" allows an indented closing marker), then the
 * exact `identifier`, then a non-identifier character or EOF (so a LONGER
 * identifier sharing this one as a prefix never falsely closes it). Returns
 * the index just past the closing identifier, or `null` if this line isn't
 * the close.
 */
function matchHeredocCloser(text: string, i: number, identifier: string): number | null {
  let j = i;
  while (text[j] === ' ' || text[j] === '\t') j++;
  if (!text.startsWith(identifier, j)) return null;
  const after = j + identifier.length;
  if (isIdentChar(text[after])) return null;
  return after;
}

function isJsWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

/**
 * Valid JS/TS regex-literal flag characters this heuristic recognizes,
 * consumed (in any combination) immediately after a regex's closing `/`
 * (phase 258, T2 — see the DRAFT's "close at an unescaped `/` followed by
 * valid flag characters" wording).
 */
const REGEX_FLAG_CHARS = new Set(['g', 'i', 'm', 's', 'u', 'y', 'd', 'v']);

/**
 * T2's bounded, EXPLICITLY DOCUMENTED preceding-token vocabulary (phase
 * 258; this comment is AC-4's contract, not an implementation detail — a
 * later task, T3, treats it as the source of truth for what's in scope vs.
 * what should trigger a loud `--explain` diagnostic instead of a guess).
 * `precedingTokenCategory` below classifies the code-mode token immediately
 * before a candidate regex-open `/` into one of three buckets:
 *
 * `'regex'` (the `/` opens a regex literal) when the preceding token is:
 *  - a keyword: `return`, `typeof`, `instanceof`, `in`, `of`, `new`,
 *    `delete`, `void`, `throw`, `case`, `do`, `else`, `yield`
 *    (`REGEX_ELIGIBLE_KEYWORDS`) — matched CASE-SENSITIVELY: JS/TS keywords
 *    are always lowercase, so a same-spelled-but-differently-cased
 *    identifier (e.g. a `Return`/`New`/`Delete`/`Case` component name, common
 *    in this profile's own `.tsx` file type) is never actually that keyword
 *    and must not be treated as one
 *  - an operator character — the LAST character of a (possibly multi-char)
 *    operator token, e.g. `=>`, `===`, `&&`, `??`. Checking only the
 *    trailing character is NOT always sufficient, though: `+`/`-` collide
 *    with POSTFIX `++`/`--` (`count++ / 2` is division, not `count`
 *    followed by a prefix-`+`-then-regex `/2`), and `!` collides with
 *    POSTFIX TypeScript non-null assertion (`x! / 2` is division, not `x`
 *    followed by a prefix-negation `!/2` regex-open) — a lone trailing
 *    `+`/`-`/`!` is genuinely regex-eligible (prefix `+x`/`-x`, binary
 *    `a + /re/`, or prefix negation `!/re/`/`return !/re/`), but the
 *    POSTFIX form of each is division. `precedingTokenCategory` resolves
 *    both by looking one character deeper than the trailing character
 *    alone: `++`/`--` by checking the immediately adjacent character is the
 *    same character, and `!` by recursively classifying whatever precedes
 *    IT (chained `!!`/`!!!` recurse further, since each `!` in the chain
 *    could itself be postfix on the one before it)
 *    KNOWN, ACCEPTED LIMITATION (phase 258, review round 3, finding B —
 *    under-masking direction, the tolerable failure direction per this
 *    module's own invariant; deliberately NOT fixed): three or more
 *    CONSECUTIVE `+`/`-` characters immediately before a regex-eligible
 *    `/`, e.g. `a+++/b/;` or `a---/b/;`, can still misfire the `++`/`--`
 *    adjacency check. `text[j-1] === ch` only ever looks one character
 *    deeper, so it can't tell a genuine 3-run apart from `a++ +` (postfix
 *    `++` immediately followed by a separate prefix `+`) — real JS/TS
 *    tokenizes `a+++/b/` via maximal munch as `a`, `++`, `+`, `/b/` (i.e.
 *    `a++ + /b/`, a regex, not a division), but this heuristic reports
 *    `'division'` instead. Pathological and rarely-written; left as a
 *    documented gap rather than special-cased, per this file's
 *    false-positive-averse bias (guessing `'division'` wrong here just
 *    leaves a pre-existing defect unfixed for this specific shape, which is
 *    not a regression — see the `'unknown'` bucket's doc comment below for
 *    the same reasoning applied elsewhere).
 *  - an opening bracket: `(`, `[`, `{`
 *  - a separator: `,`, `;`
 *  - start-of-file / start-of-statement (no preceding code-mode token at
 *    all — only whitespace and/or comments back to the top of the file)
 *  (the last four all live in `REGEX_ELIGIBLE_PUNCT` below, plus the
 *  "no token at all" case handled directly in `precedingTokenCategory`)
 *
 * `'division'` (the `/` is a division operator, not a regex) when the
 * preceding token is:
 *  - an identifier or a number literal — any run of `[A-Za-z0-9_$]` that is
 *    NOT one of the keywords above
 *  - a closing bracket: `)`, `]`, `}` (`DIVISION_ELIGIBLE_CLOSE_PUNCT`) —
 *    deliberately including three real-JS ambiguities this masker-only
 *    heuristic resolves the SAME (safe, non-regex-opening) way regardless of
 *    which side of the ambiguity actually applies:
 *      - `}` closing a BLOCK STATEMENT rather than an object/value literal
 *        (e.g. `if (x) { foo(); }\n/regex/.test(y)`, where real JS treats
 *        that `/` as a regex-opening new statement, not division);
 *      - `)` closing a braceless control-flow condition rather than a call
 *        expression (e.g. `if (x) /regex/.test(y)`, same real-JS ambiguity,
 *        one bracket over);
 *      - `]` closing an array/index expression, analogous to both above.
 *    Disambiguating "value-literal/call close" from "control-flow-condition
 *    close" needs real parsing, which this masker-only heuristic
 *    deliberately does not attempt for any of the three — out of scope per
 *    the DRAFT's binding masker-only design decision, not an oversight. All
 *    three fail SAFE (silently resolve to division, never a best-guess
 *    regex-open) rather than loud — `'unknown'`'s diagnostic (below) does not
 *    cover this bucket, since these ARE confidently classified, just to the
 *    conservative side of a genuine ambiguity, and this is a pre-existing
 *    limitation this phase's masker-only heuristic never attempted to close,
 *    not a regression (whole-branch review, phase 258).
 *
 * `'unknown'` (out of vocabulary) for everything else — most notably, the
 * token immediately after a just-closed string OR regex literal (both are
 * tagged `'string'` `Kind` by `classify()`, so a completed value literal
 * isn't distinguishable from mid-string content by `Kind` alone without
 * re-scanning), or a punctuation character not listed above (e.g. `.`).
 * `classify()` resolves `'unknown'` the same way it resolves `'division'` —
 * i.e. conservatively does NOT open regex mode — since guessing regex-open
 * wrong risks masking real code as opaque regex content (a new, worse
 * failure mode). Phase 258, T3: this is no longer silent — `classify()` now
 * records a `MaskDiagnostic` (see below) for every `'unknown'` occurrence,
 * surfaced via `cadence verify coverage --explain` (`./engine.ts`,
 * `./coverage.ts`), so an actually-novel out-of-vocabulary gap is
 * diagnosable instead of invisible. The resolution itself (never open regex
 * mode) is unchanged — only its visibility changed.
 *
 * **Correction (phase 258, review round 4):** an earlier version of this
 * comment claimed guessing `'division'` wrong for an out-of-vocabulary case
 * "just leaves the pre-existing defect unfixed for that specific
 * unenumerated shape, which is not a regression." That is false when the
 * unenumerated regex's own content contains a `'`/`"`/`` ` `` — not opening
 * regex mode means that quote is read as a real string/template opener,
 * which then runs to the NEXT matching quote anywhere later in the file,
 * silently corrupting arbitrary downstream `it()`/`test()` blocks (the
 * `await`/`default` bug this round found and fixed reproduced exactly this:
 * an unenumerated keyword before `/['"]/`. corrupted a second, unrelated
 * block later in the file). The blast radius of an `'unknown'` misclassification is
 * therefore unbounded, not local — every keyword/punctuation category a
 * real preceding token can take must stay enumerated here, and T3's loud
 * `--explain` diagnostic (`MaskDiagnostic`, below) is what makes an
 * actually-novel gap visible instead of silent, not a substitute for keeping
 * this vocabulary complete.
 */
const REGEX_ELIGIBLE_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'default',
]);

/** Operator characters, opening brackets, and separators — see the doc
 * comment above. */
const REGEX_ELIGIBLE_PUNCT = new Set([
  '=',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '!',
  '&',
  '|',
  '^',
  '~',
  '?',
  ':',
  '(',
  '[',
  '{',
  ',',
  ';',
]);

/** Closing brackets — see the doc comment above. */
const DIVISION_ELIGIBLE_CLOSE_PUNCT = new Set([')', ']', '}']);

type PrecedingTokenCategory = 'regex' | 'division' | 'unknown';

/**
 * Phase 258, T3: describes one `/` whose preceding-token context fell into
 * `precedingTokenCategory`'s `'unknown'` bucket — outside T2's documented,
 * enumerated vocabulary (see that function's doc comment, and the
 * `'unknown'` bucket's own doc comment above it, for why silently guessing
 * here is unsafe). `classify()` still resolves `'unknown'` exactly the way
 * it always has — never opens regex mode, the false-positive-averse default
 * — this diagnostic only makes that resolution visible; it never changes
 * what character gets classified as what. Surfaced via
 * `findSpansForProfileWithDiagnostics` (`./engine.ts`) and
 * `ExplainFileResult.maskDiagnostics` (`./coverage.ts`), rendered by
 * `cadence verify coverage --explain`.
 */
export interface MaskDiagnostic {
  /** Absolute char offset (into the scanned text) of the ambiguous `/`. */
  offset: number;
  /** Trimmed excerpt of source around `offset`, `\n` replaced with `\\n` for
   * single-line display. */
  snippet: string;
  /** Human-readable description of the out-of-vocabulary preceding token. */
  context: string;
}

/**
 * Builds the `MaskDiagnostic` for the out-of-vocabulary `/` at `i`. Re-walks
 * the same "skip code-mode whitespace and comment content" prefix
 * `precedingTokenCategory` performs internally — purely to describe the
 * token for the diagnostic message, never to reclassify it — so this only
 * ever runs on the rare 'unknown' path, never on `classify()`'s hot path.
 */
function describeUnknownPrecedingToken(text: string, kinds: Kind[], i: number): MaskDiagnostic {
  let j = i - 1;
  while (j >= 0) {
    if (kinds[j] === 'comment') {
      j--;
      continue;
    }
    const wsCh = text[j];
    if (kinds[j] === 'code' && (wsCh === ' ' || wsCh === '\t' || wsCh === '\r' || wsCh === '\n')) {
      j--;
      continue;
    }
    break;
  }
  let context: string;
  if (j < 0) {
    // Unreachable in practice today — start-of-file always resolves
    // 'regex' in `precedingTokenCategory`, never 'unknown' — kept as a
    // defensive fallback rather than assuming that can never change.
    context = 'start-of-file (no preceding code-mode token)';
  } else if (kinds[j] === 'string') {
    context =
      `immediately after a completed string, template, or regex literal ` +
      `(ending in ${JSON.stringify(text[j])}) — a just-closed literal isn't ` +
      `distinguishable from mid-literal content by kind alone`;
  } else {
    context =
      `immediately after the character ${JSON.stringify(text[j])}, which is ` +
      `outside the documented preceding-token vocabulary (see ` +
      `REGEX_ELIGIBLE_KEYWORDS/REGEX_ELIGIBLE_PUNCT/DIVISION_ELIGIBLE_CLOSE_PUNCT ` +
      `in mask.ts)`;
  }
  const snippetStart = Math.max(0, i - 20);
  const snippetEnd = Math.min(text.length, i + 20);
  const snippet = text.slice(snippetStart, snippetEnd).replace(/\n/g, '\\n');
  return { offset: i, snippet, context };
}

/**
 * Scans backward from `from` (inclusive), skipping code-mode whitespace and
 * comment content -- the same "not a real token boundary" skip
 * `precedingTokenCategory`'s own loop below performs -- but additionally
 * reports whether a raw `\n` was crossed along the way. Used by the postfix
 * `!` check (finding C, phase 258 review round 3) to detect TypeScript's
 * `[no LineTerminator here]` restriction on postfix `!`: a `\n` between an
 * operand and a `!` means the `!` can never be interpreted as postfix on
 * that operand, regardless of what token is eventually found further back.
 */
function skipBackwardTrackingNewline(
  text: string,
  kinds: Kind[],
  from: number,
): { j: number; crossedNewline: boolean } {
  let j = from;
  let crossedNewline = false;
  while (j >= 0) {
    if (kinds[j] === 'comment') {
      if (text[j] === '\n') crossedNewline = true;
      j--;
      continue;
    }
    const wsCh = text[j];
    if (kinds[j] === 'code' && (wsCh === ' ' || wsCh === '\t' || wsCh === '\r' || wsCh === '\n')) {
      if (wsCh === '\n') crossedNewline = true;
      j--;
      continue;
    }
    break;
  }
  return { j, crossedNewline };
}

/**
 * Classifies the code-mode token immediately preceding a candidate
 * regex-open `/` at position `i`, per the documented vocabulary above.
 * Whitespace and comment content are transparent when scanning backward —
 * neither is a real token boundary in JS/TS grammar, so e.g. a `return`
 * keyword separated from the `/` by only a block comment still counts as
 * the immediately preceding token once the comment is skipped over.
 */
function precedingTokenCategory(text: string, kinds: Kind[], i: number): PrecedingTokenCategory {
  let j = i - 1;
  while (j >= 0) {
    if (kinds[j] === 'comment') {
      j--;
      continue;
    }
    const wsCh = text[j];
    if (kinds[j] === 'code' && (wsCh === ' ' || wsCh === '\t' || wsCh === '\r' || wsCh === '\n')) {
      j--;
      continue;
    }
    break;
  }
  if (j < 0) return 'regex'; // start-of-file

  // A completed string OR (since regex content is also tagged 'string'
  // below) a completed regex literal immediately precedes `i` — out of
  // vocabulary, see the doc comment above.
  if (kinds[j] === 'string') return 'unknown';

  const ch = text[j]!;
  if (isJsWordChar(ch)) {
    let start = j;
    while (start > 0 && isJsWordChar(text[start - 1]) && kinds[start - 1] === 'code') start--;
    // Case-sensitive on purpose: JS/TS keywords are always lowercase, so an
    // identifier that merely shares a keyword's spelling in a different
    // case (e.g. a `Return`/`New`/`Delete`/`Case` component name) is never
    // actually that keyword.
    const word = text.slice(start, j + 1);
    return REGEX_ELIGIBLE_KEYWORDS.has(word) ? 'regex' : 'division';
  }
  if (DIVISION_ELIGIBLE_CLOSE_PUNCT.has(ch)) return 'division';

  // Postfix `++`/`--` (e.g. `count++ / 2`) is always division context --
  // a PREFIX `++`/`--` must be followed by a reference, never by `/`, so
  // there is no ambiguity to resolve here. `REGEX_ELIGIBLE_PUNCT` below
  // treats a lone trailing `+`/`-` as regex-eligible (correct for prefix
  // `+x`/`-x` or binary `a + /regex/`), but a single-character lookback
  // can't tell a lone `+`/`-` apart from the second character of a
  // `++`/`--` token -- check the immediately adjacent character first.
  // Phase 258, review round 3, finding C investigation: does THIS check
  // have the same newline-crossing vulnerability as postfix `!` below? The
  // top-level skip-loop above already crossed any whitespace/newlines to
  // land on `ch` here (that's how e.g. `x\n++/re/` even reaches this
  // branch), so -- unlike `!`'s recursive lookback -- there's no SECOND,
  // deeper scan for this sub-check to guard: the postfix determination
  // itself is a single-index comparison (`text[j - 1] === ch`), not a scan,
  // so there's nowhere for a newline-tracking guard to slot in. More to the
  // point, even a hypothetical newline-aware version of this check could
  // never produce a DIFFERENT, correct answer: real ASI splits
  // `operand\n++` into `operand;` followed by a fresh statement whose
  // `++`/`--` is PREFIX -- but prefix `++`/`--` can only legally apply to a
  // simple assignment target (an early SyntaxError otherwise), and a regex
  // literal is never a valid one. So `\n++/regex/` / `\n--/regex/` can
  // never appear in syntactically valid JS/TS source in the first place:
  // whenever `++`/`--` immediately precedes a regex-eligible `/`, in ANY
  // real file this scanner will ever see, it MUST be the postfix reading
  // (division) -- newline or not. Unlike `!` (where prefix negation of a
  // regex, e.g. `!/re/.test(x)`, is completely ordinary, valid code), there
  // is no valid-code case here this check needs to distinguish, so it is
  // left unchanged.
  if ((ch === '+' || ch === '-') && j > 0 && text[j - 1] === ch && kinds[j - 1] === 'code') {
    return 'division';
  }

  // Postfix `!` (TypeScript non-null assertion, e.g. `x!`, `arr[0]!`,
  // `fn()!`) is division context; prefix `!` (logical negation, e.g.
  // `!/abc/`, `!!/abc/`, `return !/abc/`) is regex-eligible. Both end in
  // `!`, so the trailing character alone can't distinguish them -- resolve
  // one level deeper by classifying the token that precedes THIS `!` the
  // same way a preceding token before `/` would be classified. If that
  // puts a `/` in division context (identifier, number, or closing
  // bracket precedes the `!`), this `!` is postfix. Anything else (keyword,
  // operator, opening bracket, separator, or start-of-file/statement) means
  // this `!` is itself prefix, so treat it like any other regex-eligible
  // operator. Recursing on `j` (the `!`'s own position) naturally handles
  // chained `!!`/`!!!` too, since each additional `!` could itself be
  // postfix on the one before it.
  if (ch === '!') {
    // Finding C: TypeScript's postfix `!` carries a `[no LineTerminator
    // here]` grammar restriction, identical in spirit to postfix
    // `++`/`--`'s ASI rule above -- it can never be postfix on an
    // expression from a PREVIOUS line. Left unguarded, the recursive
    // lookback below treats a raw `\n` as just another skippable
    // whitespace character and can land on a token two (or more) lines up,
    // wrongly concluding division when the grammar FORCES this `!` to be
    // prefix. If a `\n` separates this `!` from its own nearest preceding
    // non-whitespace/non-comment code-mode character, short-circuit to
    // prefix (regex-eligible) directly, without even considering what
    // token is further back.
    if (skipBackwardTrackingNewline(text, kinds, j - 1).crossedNewline) return 'regex';
    // Finding A: only an explicit `'regex'` result from the recursive call
    // propagates as `'regex'` here -- `'division'` AND `'unknown'` both
    // resolve to `'division'`, matching this module's own documented
    // invariant (see the `'unknown'` bucket's doc comment above) that
    // guessing regex-open wrong is the worse failure direction. The
    // previous, inverted ternary let `'unknown'` silently fall through to
    // `'regex'` (only an explicit `'division'` result was excluded) --
    // reachable e.g. immediately after a closed template literal
    // (`` tag`x`! ``), whose closing backtick is tagged `Kind === 'string'`
    // and therefore resolves to `'unknown'`, not `'division'`, one level
    // deeper.
    return precedingTokenCategory(text, kinds, j) === 'regex' ? 'regex' : 'division';
  }

  if (REGEX_ELIGIBLE_PUNCT.has(ch)) return 'regex';
  return 'unknown';
}

function classify(text: string, syntax: LanguageSyntax, diagnostics?: MaskDiagnostic[]): Kind[] {
  const n = text.length;
  const kinds: Kind[] = new Array(n);
  const lineOpeners = (syntax.comments.line ?? []).filter((s) => s.length > 0);
  const blockPairs = (syntax.comments.block ?? []).filter(([open]) => open.length > 0);
  const fencedStrings = (syntax.fencedStrings ?? []).filter((f) => f.prefix.length > 0);
  const heredocs = (syntax.heredocs ?? []).filter((h) => h.marker.length > 0);
  // Longest-open-first so e.g. Python's `"""` is tried before `"`.
  const strings = [...syntax.strings]
    .filter((s) => s.open.length > 0)
    .sort((a, b) => b.open.length - a.open.length);
  // Phase 258, T2: js/ts-only opt-in — see `LanguageSyntax.regexLiterals`'s
  // doc comment (`./types.ts`) and `REGEX_ELIGIBLE_KEYWORDS`/
  // `REGEX_ELIGIBLE_PUNCT` above.
  const regexLiteralsEnabled = syntax.regexLiterals === true;

  let mode: Mode = { kind: 'code' };
  let i = 0;

  const fill = (start: number, len: number, kind: Kind) => {
    for (let k = 0; k < len && start + k < n; k++) kinds[start + k] = kind;
  };

  while (i < n) {
    if (mode.kind === 'line') {
      kinds[i] = 'comment';
      if (text[i] === '\n') mode = { kind: 'code' };
      i++;
      continue;
    }

    if (mode.kind === 'block') {
      if (text.startsWith(mode.close, i)) {
        fill(i, mode.close.length, 'comment');
        i += mode.close.length;
        mode = { kind: 'code' };
        continue;
      }
      kinds[i] = 'comment';
      i++;
      continue;
    }

    if (mode.kind === 'string') {
      const ch = text[i];
      if (mode.escape !== null && ch === mode.escape) {
        fill(i, 2, 'string');
        i += 2;
        continue;
      }
      if (text.startsWith(mode.close, i)) {
        fill(i, mode.close.length, 'string');
        i += mode.close.length;
        mode = { kind: 'code' };
        continue;
      }
      kinds[i] = 'string';
      i++;
      continue;
    }

    if (mode.kind === 'heredoc') {
      const atLineStart = i === 0 || text[i - 1] === '\n';
      if (atLineStart) {
        const closeEnd = matchHeredocCloser(text, i, mode.identifier);
        if (closeEnd !== null) {
          fill(i, closeEnd - i, 'string');
          i = closeEnd;
          mode = { kind: 'code' };
          continue;
        }
      }
      kinds[i] = 'string';
      i++;
      continue;
    }

    if (mode.kind === 'regex') {
      const ch = text[i];
      if (ch === '\\') {
        fill(i, 2, 'string');
        i += 2;
        continue;
      }
      if (ch === '\n') {
        // A raw newline can never legally appear inside a real JS/TS regex
        // literal. Reaching one before a close means this position's
        // regex-open guess (made from the preceding-token heuristic alone,
        // see `precedingTokenCategory` above) was wrong — either it was
        // really a division after all, or the source has a genuine syntax
        // error. Per the profile's false-positive-averse invariant, fall
        // back to code mode at the newline rather than keep swallowing real
        // code as regex content: worst case this misses a span for content
        // between the open `/` and here, never a corrupted read of
        // whatever follows.
        kinds[i] = 'code';
        mode = { kind: 'code' };
        i++;
        continue;
      }
      if (ch === '[' && !mode.inClass) {
        kinds[i] = 'string';
        mode = { kind: 'regex', inClass: true };
        i++;
        continue;
      }
      if (ch === ']' && mode.inClass) {
        kinds[i] = 'string';
        mode = { kind: 'regex', inClass: false };
        i++;
        continue;
      }
      if (ch === '/' && !mode.inClass) {
        // The real close: an unescaped `/` outside an unescaped character
        // class. Consume it plus any immediately following flag characters
        // as part of the literal, then return to code mode.
        kinds[i] = 'string';
        i++;
        while (i < n && REGEX_FLAG_CHARS.has(text[i]!)) {
          kinds[i] = 'string';
          i++;
        }
        mode = { kind: 'code' };
        continue;
      }
      kinds[i] = 'string';
      i++;
      continue;
    }

    // mode.kind === 'code': check whether a non-code region opens here.
    let entered = false;

    for (const op of lineOpeners) {
      if (text.startsWith(op, i)) {
        fill(i, op.length, 'comment');
        mode = { kind: 'line' };
        i += op.length;
        entered = true;
        break;
      }
    }
    if (entered) continue;

    for (const [open, close] of blockPairs) {
      if (text.startsWith(open, i)) {
        fill(i, open.length, 'comment');
        mode = { kind: 'block', close };
        i += open.length;
        entered = true;
        break;
      }
    }
    if (entered) continue;

    // Regex literal (phase 258, T2; js/ts-only — gated by
    // `syntax.regexLiterals`, see `LanguageSyntax`'s doc comment): tried
    // before fixed-delimiter strings for the same "resolve early, keep
    // precedence explicit" reason as heredocs/fenced strings below — `/`
    // never collides with any of those forms' own open text. Only entered
    // when the preceding code-mode token is in T2's documented
    // regex-eligible vocabulary (`precedingTokenCategory` above); this is
    // what keeps a genuine division expression (`a / b`) from ever being
    // misread as a regex open.
    //
    // Phase 258, T3: the category is computed once, here, rather than
    // inline in the `if` condition, so the 'unknown' branch can also be
    // observed — `precedingTokenCategory` ALWAYS returns one of
    // 'regex'/'division'/'unknown', it never throws or leaves the question
    // open, so this hoist changes nothing about which branch runs; it only
    // adds a diagnostic hook to a branch that used to be silently
    // indistinguishable from 'division'. Diagnostics are recorded only when
    // a `diagnostics` sink was passed in (i.e. only when a caller asked for
    // them, e.g. `findSpansForProfileWithDiagnostics` via `computeCodeMask`)
    // — every other call site's classification is byte-for-byte unchanged.
    if (regexLiteralsEnabled && text[i] === '/') {
      const precedingCategory = precedingTokenCategory(text, kinds, i);
      if (precedingCategory === 'unknown' && diagnostics !== undefined) {
        diagnostics.push(describeUnknownPrecedingToken(text, kinds, i));
      }
      if (precedingCategory === 'regex') {
        kinds[i] = 'string';
        mode = { kind: 'regex', inClass: false };
        i++;
        entered = true;
      }
    }
    if (entered) continue;

    // Heredoc/nowdoc (e.g. PHP): tried before fixed-delimiter strings for
    // the same reason as fenced strings below — the marker (`<<<`) doesn't
    // collide with any fixed string delimiter's own open text, but trying
    // it early keeps precedence explicit and consistent.
    for (const h of heredocs) {
      const m = matchHeredocOpener(text, i, h);
      if (m) {
        fill(i, m.openLen, 'string');
        mode = { kind: 'heredoc', identifier: m.identifier };
        i += m.openLen;
        entered = true;
        break;
      }
    }
    if (entered) continue;

    // Fenced strings (e.g. Rust raw strings) before fixed-delimiter strings:
    // a fence run's `prefix` (e.g. `r`) may itself collide positionally with
    // an unrelated shorter delimiter, so resolving the dynamic fence first
    // (or determining it doesn't apply, per `matchFence`'s quote-anchor
    // check) avoids ever falling through to a delimiter that could close
    // early on content the real fenced string's own dynamic close would
    // have protected.
    for (const f of fencedStrings) {
      const m = matchFence(text, i, f);
      if (m) {
        fill(i, m.openLen, 'string');
        mode = { kind: 'string', close: m.close, escape: null };
        i += m.openLen;
        entered = true;
        break;
      }
    }
    if (entered) continue;

    for (const s of strings) {
      if (text.startsWith(s.open, i)) {
        fill(i, s.open.length, 'string');
        const close = s.close ?? s.open;
        const escape = s.escape === undefined ? '\\' : s.escape;
        mode = { kind: 'string', close, escape };
        i += s.open.length;
        entered = true;
        break;
      }
    }
    if (entered) continue;

    kinds[i] = 'code';
    i++;
  }

  return kinds;
}
