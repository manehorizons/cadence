import type { TestRef } from './coverage.js';

/**
 * Phase 274 (T1) — unobservable-criteria classification.
 *
 * `gates/deep-verify.ts` judges every AC against a fixed observable surface —
 * `{acs, tests, diff, files}` (`deep-verify.ts:62-65`). Most ACs' Then-clauses
 * live entirely inside that surface. A small minority do not: their
 * satisfaction condition is the content of `SUMMARY.md`/`SUMMARY.json`
 * itself, which does not exist until *after* this very settle completes —
 * verifying it is structurally circular, not merely hard. This module is a
 * pure, dependency-injected classifier (no fs, no clock, no I/O — the same
 * pure-core/impure-shell split as `criteria-gap.ts` and the rest of
 * `verify/*`/`gates/*`) that recognizes that shape from an AC's text alone,
 * so a caller (T3, `gates/deep-verify.ts`) can route it to a distinct
 * `unobservable` verdict instead of a normal `fail`.
 *
 * Different axis from `criteria-gap.ts`: that module anchors a code-review
 * *finding* to the criterion it belongs to (finding → criterion). This
 * module classifies a *criterion* by whether it can be observed at all
 * (criterion → observability). Do not merge the two — `274-01-DRAFT.md`'s
 * Boundaries section says so explicitly.
 *
 * SAFETY (the load-bearing property; see `274-01-DRAFT.md`'s Boundaries):
 * the classifier's two failure directions are asymmetric. A false negative
 * (`observable` on something actually unobservable) just leaves a correct AC
 * as an ordinary `fail` — annoying, harmless. A false positive (`unobservable`
 * on something actually failing) silently excuses that failure from
 * deep-verify's offender list — a bypass generator. Every pattern below is
 * therefore narrow and structural, keyed to the literal phrasings the
 * DRAFT's Evidence note found in the real corpus, not a broad keyword sweep,
 * and every match additionally passes through two structural safety gates
 * (`isInsideQuotes`, `hasNegationInClause`, below) before it can flip the
 * verdict. The first-line guard is capitalization: this repo's DRAFT corpus
 * capitalizes "SUMMARY" only when naming the settle-time artifact
 * (`SUMMARY.md`/`SUMMARY.json`) and uses lowercase "summary" for ordinary
 * English — a command's own printed summary, `summary-writer.ts`, "a short
 * summary of X". Every documented false positive — including phase
 * 29-shakedown AC-1's "the post-init summary verbatim" (a homonym for
 * `cadence init`'s console output, not the artifact) — used the lowercase
 * spelling. Matching only the literal uppercase token closes that entire
 * false-positive class structurally, before any phrasal pattern is even
 * consulted. (Do not restate this as a corpus-wide occurrence count in a
 * comment — CLAUDE.md's "Hardcoded Count" failure mode: an earlier version
 * of this comment cited one, measured with a case-bucketing grep that
 * silently never matched all-caps "SUMMARY" at all, and reported the
 * opposite ratio of what a corrected measurement shows. The design
 * principle is what matters and needs no number to hold.) A second guard
 * catches quoted illustrative examples — a DRAFT describing this very
 * classifier's trigger phrases in prose (as `274-01-DRAFT.md`'s own AC-1
 * does, and D-G's v1.58 follow-up is expected to do again) is not itself
 * making a circular claim; a match whose token sits inside a quoted span is
 * skipped. A third guard catches negation — "does not reference this
 * phase's own SUMMARY" is not the self-reference it would be without the
 * "not"; a match with a negation word in its enclosing clause is skipped.
 * When no pattern matches, or a match is quoted/negated, the result is
 * always `observable` — there is no code path that defaults to
 * `unobservable`.
 */

/** Structural shape of an AC as fed to the classifier: its id (for the
 *  returned reason string) and its full Given/When/Then text. Deliberately
 *  narrow — the classifier does not need the parsed `AcceptanceCriterion`
 *  shape from `@thomas-powers-jr/cadence-types`, only enough text to pattern-match
 *  against, matching `criteria-gap.ts`'s precedent of declaring its own
 *  narrow structural type rather than depending on a wider shape it doesn't
 *  need. */
export interface ClassifiableAc {
  readonly id: string;
  readonly text: string;
}

/** `{ observable: true }` carries no reason — there is nothing to explain.
 *  `{ observable: false, reason }` is only ever returned on a clear,
 *  high-precision structural match (see the module doc's SAFETY note); the
 *  reason names the AC id, the matched pattern's plain-English description,
 *  and whether coverage exists (for a human reading `SUMMARY.md`'s eventual
 *  distinct rendering, T6). */
export type ObservabilityVerdict =
  | { readonly observable: true }
  | { readonly observable: false; readonly reason: string };

/**
 * Case-sensitive anchor: the literal word "SUMMARY", optionally suffixed
 * `.md`/`.json`. No `i` flag — that case-sensitivity is the primary
 * false-positive guard described in the module doc above. Scanning stops
 * entirely (verdict `observable`) for any AC text that never spells the
 * artifact name in capitals, regardless of what other words appear in it.
 *
 * The trailing `(?!\.\w)` (code-review finding, phase 274): without it,
 * `SUMMARY.mdx`/`SUMMARY.yaml` — an unrelated file that merely starts with
 * the same seven letters — would fail the `.md`/`.json` suffix match, then
 * backtrack to a bare-word match on "SUMMARY" alone (the `\b` right after
 * "SUMMARY" is satisfied by the following `.`), wrongly anchoring the
 * classifier on a token that isn't the settle-time artifact at all. The
 * lookahead refuses ANY match — bare or suffixed — when "SUMMARY" is
 * immediately followed by `.` and another word character that isn't part of
 * a completed `.md`/`.json` suffix, so an unrecognized extension yields no
 * match rather than falling back to a bare one.
 */
const SUMMARY_TOKEN = /\bSUMMARY(?:\.(?:json|md)\b)?(?!\.\w)/g;

/** How far back to look for a cue phrase immediately preceding a SUMMARY
 *  token match. Kept short and *not* sentence-bounded on this side — every
 *  evidenced trigger phrase (`pasted into the`, `this phase's own`,
 *  `written`) sits directly adjacent to the token, never separated by a
 *  clause boundary. */
const WINDOW_BEFORE = 60;

/** How far forward to look for a cue phrase following a SUMMARY token match,
 *  before an unrelated `WRITTEN_VERBATIM_CAPTURE` scan below stops at the
 *  next sentence boundary. */
const WINDOW_AFTER = 120;

interface SummarySignal {
  /** Tests the text immediately before/after a confirmed-uppercase SUMMARY
   *  token match. Case-insensitive by design — only the SUMMARY token itself
   *  needs to be uppercase; the surrounding English prose is ordinary case. */
  readonly test: (before: string, after: string) => boolean;
  readonly describe: (acId: string) => string;
}

/** Phase 272 AC-7's shape: "this phase's own SUMMARY.json is inspected after
 *  settle" — an explicit self-reference to the artifact this very settle is
 *  producing. The strongest, least ambiguous signal in the corpus. */
const SELF_REFERENCE: SummarySignal = {
  test: (before) => /\b(?:this|the) phase'?s own\s*$/i.test(before),
  describe: (acId) =>
    `${acId} self-references "this phase's own SUMMARY" — an artifact ` +
    'that does not exist until after this very settle produces it',
};

/** Phase 272 AC-1/AC-4's shape: "...pasted into the SUMMARY". The DRAFT's
 *  own Evidence note quotes this exact phrase as the primary corpus signal.
 *  Deliberately zero-gap between "paste(d/s)" and "into the" — an earlier
 *  draft of this pattern allowed up to 40 chars between them, which could
 *  span a clause boundary (e.g. "...pasted into the test file and the
 *  result recorded into the SUMMARY" — not circular, the paste target is
 *  the test file). Both real corpus hits have the words directly adjacent,
 *  so requiring that costs zero recall while closing that gap. */
const PASTED_INTO: SummarySignal = {
  test: (before) => /\bpaste(?:d|s)?\s+into\s+the\s*$/i.test(before),
  describe: (acId) =>
    `${acId} requires content "pasted into the SUMMARY" — the artifact this ` +
    'settle is currently producing',
};

/** Phase 29-shakedown AC-2's shape: "...reaches a written SUMMARY, with
 *  every command and its verbatim output captured". Requires BOTH "written"
 *  immediately before the token AND "verbatim" + a "captur-" root within the
 *  same clause after it — either alone is far too weak a signal (plenty of
 *  legitimate ACs mention a written SUMMARY without it being their own
 *  verification target; plenty mention "verbatim" or "captured" for reasons
 *  unrelated to SUMMARY content at all). Requiring all three narrows this to
 *  exactly the evidenced genuine case. */
const WRITTEN_VERBATIM_CAPTURE: SummarySignal = {
  test: (before, after) =>
    /\bwritten\s*$/i.test(before) &&
    /\bverbatim\b/i.test(after) &&
    /\bcaptur(?:ed|ing|es)\b/i.test(after),
  describe: (acId) =>
    `${acId} requires a written SUMMARY that itself captures verbatim output — ` +
    'the SUMMARY is the artifact this settle produces',
};

const SIGNALS: readonly SummarySignal[] = [SELF_REFERENCE, PASTED_INTO, WRITTEN_VERBATIM_CAPTURE];

/** Slice `text` forward from `start`, stopped at the first sentence boundary
 *  (`.` or newline) or `WINDOW_AFTER` chars, whichever comes first. Only
 *  used by `WRITTEN_VERBATIM_CAPTURE`, which needs to correlate two cue
 *  words within the *same* clause — stopping at a sentence boundary keeps
 *  it from stitching together two unrelated sentences into a false match. */
function afterWindow(text: string, start: number): string {
  const raw = text.slice(start, start + WINDOW_AFTER);
  const boundary = raw.search(/[.\n]/);
  return boundary === -1 ? raw : raw.slice(0, boundary);
}

/** How far a negation word ("not", "never", ...) may sit from a candidate
 *  match before it stops counting as guarding that match — bounded by the
 *  enclosing clause (a `.` or `\n` boundary), capped at this many chars in
 *  either direction so a negation many sentences away can't suppress an
 *  unrelated, later genuine match. Wider than `WINDOW_BEFORE`/`WINDOW_AFTER`
 *  on purpose: unlike the cue-phrase windows (which key off tight, evidenced
 *  adjacency), a negating word can legitimately sit anywhere earlier in the
 *  same clause ("this AC does **not** reference this phase's own SUMMARY"
 *  puts "not" ~30 chars before the token; a differently-worded disclaimer
 *  could put it further back). Erring toward a wider negation scan is the
 *  safe direction — it can only produce MORE `observable` verdicts, never a
 *  false `unobservable` one (see the module doc's SAFETY note).
 *
 *  Code-review finding (a real, non-mock pass during this phase's own
 *  settle): the original value here was 200 — narrow enough that a genuine
 *  negation sitting *earlier in the same clause* than that, but still before
 *  the nearest `.`/`\n` boundary, was invisible to `hasNegationInClause`
 *  below (the pre-slice at `tokenStart - NEGATION_CLAUSE_SPAN` truncates the
 *  search window before the boundary search even runs, so a real clause
 *  boundary past that point is never found, and the negation before it is
 *  silently missed) — exactly the dangerous direction this module's SAFETY
 *  note warns about: a false `unobservable` on a clause that actually says
 *  the opposite. Raised an order of magnitude, comfortably larger than any
 *  realistic single Given/When/Then clause in this repo's DRAFT corpus,
 *  while still guarding against a negation many *sentences* away (the
 *  property this constant exists to preserve). */
const NEGATION_CLAUSE_SPAN = 2000;

const NEGATION_RE = /\b(?:not|never|no longer|without)\b|n't\b/i;

/** Symmetric quote characters (same glyph opens and closes): a match's token
 *  is "inside" one of these if an odd number of that character appears
 *  earlier in `text`. Straight single-quote `'` is deliberately excluded —
 *  it is also this corpus's apostrophe ("phase's", "T.2's", "AC-7's"),
 *  wildly overloaded, and pairing it positionally would be unreliable in
 *  both directions. Curly “smart” quotes (distinct open/close glyphs) are
 *  handled separately below via nesting-depth tracking, not this list. */
const SYMMETRIC_QUOTE_CHARS: readonly string[] = ['"', '`'];

/** Curly "smart" quote pairs — distinct open/close glyphs, so nesting depth
 *  (not simple parity) determines whether an index sits inside one. */
const CURLY_QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [['“', '”']];

/**
 * True when `index` (typically a SUMMARY token's start) falls inside a
 * quoted span of `text`. Guards against exactly the shape `274-01-DRAFT.md`'s
 * own AC-1 uses to *illustrate* this classifier's trigger phrases in prose
 * (`a SUMMARY-content-anchored AC in the "pasted into the SUMMARY" shape`) —
 * a quoted example is not itself a circular claim, and a DRAFT describing
 * this classifier is expected to keep doing this (D-G's v1.58 follow-up).
 * Deliberately generous: an unmatched trailing open quote is treated as
 * open through the rest of `text` rather than ignored, which can only widen
 * how much gets skipped — the safe direction (toward `observable`).
 */
function isInsideQuotes(text: string, index: number): boolean {
  const before = text.slice(0, index);
  for (const ch of SYMMETRIC_QUOTE_CHARS) {
    let count = 0;
    for (const c of before) if (c === ch) count++;
    if (count % 2 === 1) return true;
  }
  for (const [open, close] of CURLY_QUOTE_PAIRS) {
    let depth = 0;
    for (const c of before) {
      if (c === open) depth++;
      else if (c === close && depth > 0) depth--;
    }
    if (depth > 0) return true;
  }
  return false;
}

/**
 * True when a negation word appears in the clause enclosing the token span
 * `[tokenStart, tokenEnd)` — bounded by the nearest `.`/`\n` on each side
 * (or `NEGATION_CLAUSE_SPAN` chars, whichever is closer), so it only ever
 * looks at the current clause. Guards against `274-01-DRAFT.md`'s own AC-6
 * Then-clause ("this AC does **not** reference this phase's own
 * `SUMMARY.json`'s gate-provenance entry") — without this guard the
 * `SELF_REFERENCE` signal would fire on exactly the disclaimer sentence
 * meant to say the opposite.
 */
function hasNegationInClause(text: string, tokenStart: number, tokenEnd: number): boolean {
  const beforeStart = Math.max(0, tokenStart - NEGATION_CLAUSE_SPAN);
  const beforeSlice = text.slice(beforeStart, tokenStart);
  const lastBoundary = Math.max(beforeSlice.lastIndexOf('.'), beforeSlice.lastIndexOf('\n'));
  const clauseStart = lastBoundary === -1 ? beforeStart : beforeStart + lastBoundary + 1;

  const afterEnd = Math.min(text.length, tokenEnd + NEGATION_CLAUSE_SPAN);
  const afterSlice = text.slice(tokenEnd, afterEnd);
  const nextBoundary = afterSlice.search(/[.\n]/);
  const clauseEnd = nextBoundary === -1 ? afterEnd : tokenEnd + nextBoundary;

  return NEGATION_RE.test(text.slice(clauseStart, clauseEnd));
}

/**
 * Scan `text` for every occurrence of a capitalized SUMMARY token, skip any
 * that sits inside a quoted illustrative example or a negated clause, and
 * test the rest against every known signal. Returns the first surviving
 * match's plain-English description, or `undefined` if nothing survived —
 * the only two outcomes, matching the module doc's "no path defaults to
 * unobservable" guarantee.
 */
function findCircularSummaryReference(text: string, acId: string): string | undefined {
  SUMMARY_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SUMMARY_TOKEN.exec(text)) !== null) {
    const tokenEnd = match.index + match[0].length;
    if (isInsideQuotes(text, match.index) || hasNegationInClause(text, match.index, tokenEnd)) {
      continue;
    }
    const before = text.slice(Math.max(0, match.index - WINDOW_BEFORE), match.index);
    const after = afterWindow(text, tokenEnd);
    for (const signal of SIGNALS) {
      if (signal.test(before, after)) return signal.describe(acId);
    }
  }
  return undefined;
}

/**
 * Classify whether `ac`'s criterion text depends on content outside
 * deep-verify's observable surface (`{acs, tests, diff, files}`). Scans
 * `ac.text` as a whole (not just a Then-clause) — phase 272 AC-7's genuine
 * signal actually sits in its When-clause ("this phase's own SUMMARY.json is
 * inspected"), so the caller must feed all three clauses in, not just Then.
 * `deep-verify.ts:29-34`'s production `VerifyAc` shape is `{id, given, when,
 * then}`, not a single `text` string — T3, when wiring this in, must build
 * `text` as `[given, when, then].join('\n')` (newline, not space or a
 * sentence-joining separator): that is the exact join this module was
 * validated against for the AC-7 fixture, and newline-joining keeps
 * `WRITTEN_VERBATIM_CAPTURE`'s same-clause correlation (`afterWindow` stops
 * at `.`/`\n`) from stitching two unrelated clauses together into a false
 * match — a different separator is untested and could move behavior in the
 * unsafe (false-positive) direction.
 *
 * `coverage` is accepted (the caller already has it computed per-AC for
 * `deep-verify.ts`'s existing `tests` map) but deliberately never used to
 * flip a match to `observable`: phase 272's real AC-1 and AC-4 both have
 * genuine, qualifying linked tests (`packages/core/tests/gates/
 * assurance-record-encoding.test.ts`, `packages/core/tests/docs/
 * phase272-assurance-correctness.test.ts`) and must STILL classify
 * `unobservable`, because a test asserting the token exists is not the same
 * as a test that can observe SUMMARY.json content that doesn't exist yet —
 * coverage presence is not evidence against genuine circularity. It is only
 * folded into the returned `reason` string, for a human reading the
 * eventual distinct SUMMARY rendering (T6).
 */
export function classifyAcObservability(
  ac: ClassifiableAc,
  coverage: readonly TestRef[],
): ObservabilityVerdict {
  const signal = findCircularSummaryReference(ac.text, ac.id);
  if (signal === undefined) {
    return { observable: true };
  }
  const coverageNote =
    coverage.length === 0
      ? 'no linked test coverage'
      : `${coverage.length} linked test ref(s), but none can observe unwritten content`;
  return { observable: false, reason: `${signal} (${coverageNote}).` };
}
