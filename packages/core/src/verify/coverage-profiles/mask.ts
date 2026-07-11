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
 */

import type { LanguageSyntax, FencedStringDelimiter, HeredocDelimiter } from './types.js';

/** `1` = code, `0` = inside a string or comment. Same length as the input text. */
export type CodeMask = Uint8Array;

type Mode =
  | { kind: 'code' }
  | { kind: 'line' }
  | { kind: 'block'; close: string }
  | { kind: 'string'; close: string; escape: string | null }
  | { kind: 'heredoc'; identifier: string };

/** Per-character classification: distinguishes string content from comment content. */
type Kind = 'code' | 'string' | 'comment';

export function computeCodeMask(text: string, syntax: LanguageSyntax): CodeMask {
  const kinds = classify(text, syntax);
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

function classify(text: string, syntax: LanguageSyntax): Kind[] {
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
