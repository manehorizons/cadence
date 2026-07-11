/**
 * Block-boundary strategy primitives (phase 167, T1).
 *
 * Each strategy resolves the extent of a test "block" given where its
 * opener matched (`./engine.ts` finds opener matches and dispatches here).
 * A strategy returns `null` — never a partial or best-guess span — when it
 * cannot positively resolve a boundary (e.g. an unmatched paren, no opening
 * brace before EOF): unrecognized shapes yield zero spans, per the phase's
 * false-positive-averse invariant.
 *
 * All strategies consult the `CodeMask` so structural characters (parens,
 * braces, keywords) inside strings/comments are ignored.
 */

import type { CodeMask } from './mask.js';
import type { LanguageProfile } from './types.js';

export interface ResolvedBlock {
  /** Index where the block's code-only content begins (exclusive of the opener). */
  start: number;
  /** Index of the block's closing boundary (inclusive). */
  end: number;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

/**
 * Depth-aware paren matcher, shared by `call-expression` and by the engine's
 * `openerRequiredLiteral` check (`./engine.ts`, phase 167 T3 review round 3):
 * given a position just past an already-open `(` (depth 1), tracks paren
 * depth over code-mode characters only and returns the index of the
 * matching `)`, or `null` if it's never closed. Never a partial/best-guess
 * result — the false-positive-averse invariant applies here too, since a
 * caller using this to bound a required-literal search must not silently
 * accept an unbalanced signature as if it were balanced.
 */
export function findMatchingParenIndex(text: string, mask: CodeMask, afterOpenParen: number): number | null {
  const n = text.length;
  let depth = 1;
  let i = afterOpenParen;
  while (i < n) {
    if (mask[i]) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    i++;
  }
  return null;
}

export interface TopLevelParenText {
  /** Only the depth-1 (top-level, non-nested) code-mode characters between
   * the parens — content inside any nested `(...)` sub-expression is
   * dropped entirely (a single space is inserted where it was, so two
   * top-level tokens straddling a dropped nested region can never
   * accidentally concatenate into a false match). */
  text: string;
  /** Index of the matching top-level `)`. */
  closeIdx: number;
}

/**
 * Like `findMatchingParenIndex`, but also extracts the top-level-only text
 * (phase 167, T3 review round 3): given a position just past an already-open
 * `(` (depth 1), tracks paren depth over code-mode characters and returns
 * both the matching `)` index and a string containing ONLY the characters
 * seen while at depth 1 — i.e. content belonging to a NESTED parenthesized
 * sub-expression (e.g. a function-type parameter that itself has its own
 * `(...)`) is excluded. This is what makes `openerRequiredLiteral`
 * (`./engine.ts`) safe: testing a literal against "everything between the
 * outer parens" would still let a nested sub-expression's own interior
 * satisfy the requirement even once the outer parens are correctly matched;
 * testing against top-level-only text means the literal must genuinely be
 * part of THIS parameter list's own, unnested parameter types.
 */
export function extractTopLevelParenText(
  text: string,
  mask: CodeMask,
  afterOpenParen: number,
): TopLevelParenText | null {
  const n = text.length;
  let depth = 1;
  let i = afterOpenParen;
  let out = '';
  while (i < n) {
    if (mask[i]) {
      const c = text[i];
      if (c === '(') {
        if (depth === 1) out += ' ';
        depth++;
      } else if (c === ')') {
        depth--;
        if (depth === 0) return { text: out, closeIdx: i };
      } else if (depth === 1) {
        out += c;
      }
    }
    i++;
  }
  return null;
}

/**
 * `call-expression`: the opener match already consumed the triggering `(`
 * (`matchEnd` sits just past it). Track paren depth over code-mode
 * characters only until it returns to zero.
 */
function callExpressionBlock(text: string, mask: CodeMask, matchEnd: number): ResolvedBlock | null {
  const closeIdx = findMatchingParenIndex(text, mask, matchEnd);
  return closeIdx === null ? null : { start: matchEnd, end: closeIdx };
}

/**
 * `brace-delimited`: scan forward from the opener header's match end for the
 * first code-mode `{`, then track brace depth to the matching `}`.
 */
function braceDelimitedBlock(text: string, mask: CodeMask, matchEnd: number): ResolvedBlock | null {
  const n = text.length;
  let i = matchEnd;
  while (i < n && !(mask[i] && text[i] === '{')) i++;
  if (i >= n) return null;

  const bodyStart = i + 1;
  let depth = 1;
  i++;
  while (i < n) {
    if (mask[i]) {
      const c = text[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return { start: bodyStart, end: i };
      }
    }
    i++;
  }
  return null;
}

/**
 * `indentation-delimited`: the block extends through every subsequent line
 * more indented than the opener's own line, absorbing blank lines only when
 * a still-more-indented line follows them; the first line at or below the
 * opener's indentation (that isn't blank) ends the block. Always resolves
 * (at minimum, the opener's own header line) — an indentation block never
 * has a "not found" case the way a bracket/keyword closer does.
 */
function indentationDelimitedBlock(
  text: string,
  matchStart: number,
  matchEnd: number,
): ResolvedBlock {
  const n = text.length;

  let lineStart = matchStart;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  const indent = matchStart - lineStart;

  // End of the opener's own line.
  let i = matchEnd;
  while (i < n && text[i] !== '\n') i++;
  let blockEnd = i > matchEnd ? i - 1 : matchEnd;
  i = i < n ? i + 1 : i;

  while (i < n) {
    let lineEnd = i;
    while (lineEnd < n && text[lineEnd] !== '\n') lineEnd++;
    const line = text.slice(i, lineEnd);

    if (line.trim() === '') {
      // Blank line: tentatively skip; only committed if more content follows.
      i = lineEnd < n ? lineEnd + 1 : lineEnd;
      continue;
    }

    let lineIndent = 0;
    while (lineIndent < line.length && (line[lineIndent] === ' ' || line[lineIndent] === '\t')) {
      lineIndent++;
    }
    if (lineIndent <= indent) break;

    blockEnd = lineEnd > i ? lineEnd - 1 : i;
    i = lineEnd < n ? lineEnd + 1 : lineEnd;
  }

  return { start: matchEnd, end: blockEnd };
}

/**
 * `do-end-keyword`: the opener match ends in a block-opening keyword (e.g.
 * `do`), so depth starts at 1. Scan forward token-by-token over code-mode
 * text; any word in `keyword.blockOpenKeywords` increments depth, and
 * `keyword.endKeyword` decrements it — when depth returns to zero, that
 * `end` token closes the block. Matching is case-insensitive and generic:
 * it does not special-case any one language's statement-modifier forms
 * (e.g. Ruby's `foo if bar`), which is a documented limitation left to the
 * profile's fixture design, not the primitive.
 */
function doEndKeywordBlock(
  text: string,
  mask: CodeMask,
  profile: LanguageProfile,
  matchEnd: number,
): ResolvedBlock | null {
  const cfg = profile.keyword;
  if (!cfg) return null;
  const openSet = new Set(cfg.blockOpenKeywords.map((k) => k.toLowerCase()));
  const endKw = cfg.endKeyword.toLowerCase();

  const n = text.length;
  let depth = 1;
  let i = matchEnd;
  while (i < n) {
    if (!mask[i]) {
      i++;
      continue;
    }
    const c = text[i]!;
    if (/[A-Za-z_]/.test(c) && !isWordChar(text[i - 1])) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(text[j]!)) j++;
      const word = text.slice(i, j).toLowerCase();
      if (word === endKw) {
        depth--;
        if (depth === 0) return { start: matchEnd, end: j - 1 };
      } else if (openSet.has(word)) {
        depth++;
      }
      i = j;
      continue;
    }
    i++;
  }
  return null;
}

export function resolveBlock(
  text: string,
  mask: CodeMask,
  profile: LanguageProfile,
  matchStart: number,
  matchEnd: number,
): ResolvedBlock | null {
  switch (profile.strategy) {
    case 'call-expression':
      return callExpressionBlock(text, mask, matchEnd);
    case 'brace-delimited':
      return braceDelimitedBlock(text, mask, matchEnd);
    case 'indentation-delimited':
      return indentationDelimitedBlock(text, matchStart, matchEnd);
    case 'do-end-keyword':
      return doEndKeywordBlock(text, mask, profile, matchEnd);
    default: {
      const exhaustive: never = profile.strategy;
      return exhaustive;
    }
  }
}
