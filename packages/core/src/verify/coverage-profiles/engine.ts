/**
 * Shared, profile-parameterized span-finding engine (phase 167, T1).
 *
 * Generalizes the original hardcoded JS/TS scanner (`test-spans.ts` pre-167)
 * into three composable pieces:
 *  1. `computeCodeMask` (`./mask.ts`) — string/comment-aware masking driven
 *     by a per-profile delimiter table.
 *  2. `resolveBlock` (`./strategies.ts`) — one of four block-boundary
 *     primitives (call-expression / brace-delimited / indentation-delimited
 *     / do-end-keyword).
 *  3. This module — finds opener matches at code-mode word boundaries and
 *     ties the two together, testing the profile's assertion pattern
 *     against only the block's code-mode text (mirrors the original
 *     scanner: characters inside strings/comments never reach the
 *     assertion regex).
 *
 * `findSpansForProfile` is strategy-agnostic and language-agnostic; every
 * built-in and custom `LanguageProfile` is scanned through this one
 * function.
 */

import { computeCodeMask, computeCommentMask } from './mask.js';
import type { CodeMask } from './mask.js';
import { resolveBlock, extractTopLevelParenText } from './strategies.js';
import type { LanguageProfile, TestSpan } from './types.js';

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

function stickyFlags(re: RegExp): string {
  return re.flags.includes('y') ? re.flags : re.flags + 'y';
}

/**
 * A view of `text` for opener matching only: every character NOT visible
 * under `visibleMask` is replaced with a space, which cannot satisfy any
 * opener pattern's requirement for a specific letter/digit/punctuation
 * substring, while `\n` is preserved so multi-line whitespace (`\s`) in an
 * opener still behaves correctly. Same length as `text`, so match indices
 * returned against this view are valid indices into `text`.
 *
 * `visibleMask` is `computeCodeMask` (comments AND strings hidden) by
 * default, or `computeCommentMask` (only comments hidden, strings visible)
 * when `profile.openerMatchesStrings` opts in — see that field's docstring
 * (`./types.ts`) for why both variants are needed and why hiding strings by
 * default is the false-positive-averse choice (phase 167, T3 review: an
 * opener pattern requiring an interior literal, e.g. go's `*testing\.T`
 * parameter-type check, was spoofable by placing that literal inside a
 * comment OR a string literal elsewhere in the same match — the match used
 * to run to completion on raw, unmasked text, and only the match *start*
 * position was ever checked against any mask).
 */
function buildOpenerScanText(text: string, visibleMask: CodeMask): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += visibleMask[i] || text[i] === '\n' ? text[i] : ' ';
  }
  return out;
}

/** Concatenate only the code-mode characters of `text[start..end]` inclusive. */
function codeOnlySlice(text: string, mask: Uint8Array, start: number, end: number): string {
  let out = '';
  const last = Math.min(end, text.length - 1);
  for (let i = start; i <= last; i++) {
    if (mask[i]) out += text[i];
  }
  return out;
}

export function findSpansForProfile(text: string, profile: LanguageProfile): TestSpan[] {
  const mask = computeCodeMask(text, profile.syntax);
  const openerVisibleMask = profile.openerMatchesStrings
    ? computeCommentMask(text, profile.syntax)
    : mask;
  const scanText = buildOpenerScanText(text, openerVisibleMask);
  const opener = new RegExp(profile.openerPattern.source, stickyFlags(profile.openerPattern));
  const n = text.length;
  const spans: TestSpan[] = [];

  let i = 0;
  while (i < n) {
    if (!mask[i] || isWordChar(text[i - 1])) {
      i++;
      continue;
    }

    opener.lastIndex = i;
    const m = opener.exec(scanText);
    if (m && m.index === i && m[0].length > 0) {
      let matchEnd = i + m[0].length;

      // `openerRequiredLiteral` (phase 167, T3 review round 3): the literal
      // must be found within the opener's own top-level parameter list only
      // — never satisfied by content nested inside a sub-expression's own
      // parens (e.g. a function-type parameter's own `(...)`), which is
      // excluded from `extractTopLevelParenText`'s output entirely (see the
      // field's docstring, `./types.ts`, for why embedding this requirement
      // directly inside `openerPattern`'s `[^)]*` wildcards is unsafe).
      if (profile.openerRequiredLiteral) {
        const topLevel = extractTopLevelParenText(text, mask, matchEnd);
        if (topLevel === null || !profile.openerRequiredLiteral.test(topLevel.text)) {
          i++;
          continue;
        }
        // Resume block resolution AFTER the parameter list's true closing
        // paren, not right after its opening one (phase 167, T3 review round
        // 4): `openerPattern` ends right after `(` so `extractTopLevelParenText`
        // has a well-defined depth-1 starting point, but `resolveBlock` must
        // not start scanning for a body-opening brace from INSIDE the still-
        // open parameter list — a `{`-bearing parameter type (e.g. an inline
        // `struct{...}` parameter) would otherwise be mistaken for the real
        // function body by `brace-delimited`'s own next-`{` search.
        matchEnd = topLevel.closeIdx + 1;
      }

      const block = resolveBlock(text, mask, profile, i, matchEnd);
      if (block) {
        const codeText = codeOnlySlice(text, mask, block.start, block.end);
        spans.push({
          start: i,
          end: block.end,
          hasAssertion: profile.assertionPattern.test(codeText),
          // Phase 169 (ported at merge time): `m` is the opener's own match
          // against the (possibly masked) scan text, so a profile's
          // `isSkippedOpener` inspects exactly the same capture groups the
          // opener regex itself produced — e.g. js/ts's modifier group.
          skipped: profile.isSkippedOpener?.(m) ?? false,
        });
        i = block.end + 1;
        continue;
      }
    }
    i++;
  }

  return spans;
}
