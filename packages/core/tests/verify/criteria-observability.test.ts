import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyAcObservability } from '../../src/verify/criteria-observability.js';
import type { ClassifiableAc } from '../../src/verify/criteria-observability.js';
import type { TestRef } from '../../src/verify/coverage.js';
import { parseDraftMd } from '../../src/parse/draft-parser.js';

/**
 * Phase 274 (T2) — the fixture corpus for `classifyAcObservability` (T1,
 * `src/verify/criteria-observability.ts`).
 *
 * Process note on "proven red" (274-01-DRAFT.md's T2 action text says
 * "run and confirm every fixture fails (classifier doesn't exist yet)
 * before T.3 wires anything in"): T1 was already built and independently
 * reviewed twice, in this same phase build, before this task ran — the
 * classifier under test already exists on disk, so a literal red run
 * against a nonexistent module is not achievable from this point forward.
 * The adaptation (recorded in this task's dispatch report, not restated
 * here as a corpus number per the Hardcoded-Count failure mode): every
 * fixture's expected classification was pre-declared, by manual trace
 * against T1's actual regexes, BEFORE this file was ever executed once —
 * then the suite was run and actual results compared against that
 * pre-declared table. This preserves a genuine prediction-vs-outcome
 * comparison instead of fixtures massaged to match whatever T1 happens to
 * emit.
 *
 * Ten fixtures total: five synthetic canonical shapes (feeding AC-1) plus
 * two real-corpus replay groups drawn verbatim from committed DRAFTs —
 * phase 272's AC-1/AC-4/AC-7 (feeding AC-2) and phase 29-shakedown's
 * AC-1/AC-2 (feeding AC-3). Every replay fixture's `text` is built via the
 * exact `[given, when, then].join('\n')` production join T1's own JSDoc
 * documents — not a paraphrase, not a hand-typed re-transcription.
 *
 * Deliberately no phase-qualified `274-01/AC-N` token appears anywhere in
 * this header comment or in any `describe()` title below: this repo's
 * `scanTestCoverage` (assertion mode) dedups by `${acId}@${file}` and keeps
 * only the *first* textual occurrence per AC id per file
 * (`src/verify/coverage.ts:140-142`) — a qualified mention sitting outside a
 * genuinely asserting `it()`/`test()` span, if it came first in file order,
 * would silently consume that slot and drop every real reference below it.
 *
 * That same dedup rule turned out to have a second, sharper edge this file
 * originally missed: it keys on `${acId}@${file}` alone, with no line
 * number — so *multiple* asserting `it()` blocks in this one file, each
 * legitimately carrying the same qualified token, collide with each other
 * just as badly as a stray describe()-title mention would. Confirmed
 * empirically (a real, non-mock deep-verify gate refused settle over
 * exactly this, twice) and by direct inspection of `scanTestCoverage`'s
 * output: only each AC's first occurrence in this file ever reached
 * deep-verify's `tests[id]` — every other genuinely asserting `it()` for
 * that same AC was silently invisible to it. Fixed by consolidating each
 * AC's per-file assertions into exactly one `it()` below — same assertions,
 * same rigor, one token occurrence per (AC, file). (This paragraph itself
 * follows the same "AC-N", not "AC-1"/"AC-2"/etc., placeholder discipline as
 * the paragraph above, for the same reason — a literal qualified instance
 * here would be this file's new first occurrence and re-break exactly what
 * it describes.) The scanner's dedup rule itself is a pre-existing,
 * repo-wide gap (any test suite with two `it()`s sharing an AC token in one
 * file hits this) — out of this phase's scope to fix; filed as a follow-up
 * recommendation.
 */

// packages/core/tests/verify -> repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function classifiableAc(id: string, text: string): ClassifiableAc {
  return { id, text };
}

const NO_COVERAGE: readonly TestRef[] = [];

function testRef(file: string, line: number, snippet: string): TestRef {
  return { file, line, snippet };
}

/**
 * Reads a real, committed DRAFT.md and returns AC `acId`'s
 * `[given, when, then].join('\n')` text — the exact production join T1's
 * `classifyAcObservability` JSDoc documents, and the same shape T3 will
 * build at the `gates/deep-verify.ts` call site. Throws (rather than
 * returning an empty string) if the AC is missing, so a stale fixture
 * fails loudly instead of vacuously passing on empty text.
 */
function realAcText(relDraftPath: string, acId: string): string {
  const raw = readFileSync(join(REPO_ROOT, relDraftPath), 'utf8');
  const draft = parseDraftMd(raw);
  const ac = draft.acceptanceCriteria.find((a) => a.id === acId);
  if (!ac) {
    throw new Error(`${relDraftPath} has no ${acId} — fixture is stale`);
  }
  return [ac.given, ac.when, ac.then].join('\n');
}

describe('T2 fixture corpus — five canonical observability shapes for AC-1', () => {
  // Consolidated into a single `it()`, per this file's header comment above
  // (found via a real, non-mock deep-verify refusal: "covers only the
  // observable test-ref fixture; no referenced test asserts the complete
  // five-fixture corpus"). Six separate asserting blocks previously meant
  // only the first fixture (AC-F1) ever reached deep-verify's visible test
  // list for this AC. One `it()` walking all six fixtures keeps every
  // assertion below byte-identical, just executed in one block instead of
  // six, so the single surviving coverage ref's snippet actually names the
  // whole corpus.
  it('274-01/AC-1: every fixture in the five-shape corpus (plus the code-review-finding SUMMARY-extension guard) classifies as expected', () => {
    const cases: ReadonlyArray<{
      readonly id: string;
      readonly text: string;
      readonly coverage: readonly TestRef[];
      readonly expectObservable: boolean;
      readonly expectedReasonFragment?: string;
    }> = [
      {
        id: 'AC-F1',
        text: [
          'a pure function `sum(a, b)` exists in `src/math.ts`',
          '`sum(2, 3)` is called',
          'it returns `5`, asserted by a unit test',
        ].join('\n'),
        coverage: [testRef('packages/core/tests/math.test.ts', 12, 'expect(sum(2, 3)).toBe(5)')],
        expectObservable: true,
      },
      {
        id: 'AC-F2',
        text: [
          'the settle-time code-review gate has run',
          'settle completes',
          'the finding count is pasted into the SUMMARY',
        ].join('\n'),
        coverage: NO_COVERAGE,
        expectObservable: false,
        expectedReasonFragment: 'pasted into the SUMMARY',
      },
      {
        id: 'AC-F3',
        text: [
          'this phase settles at tier: complex',
          "this phase's own SUMMARY.json is inspected after settle",
          'its gate-provenance entry records the expected values',
        ].join('\n'),
        coverage: NO_COVERAGE,
        expectObservable: false,
        expectedReasonFragment: "this phase's own SUMMARY",
      },
      {
        id: 'AC-F4',
        text: [
          '`Logger` currently writes debug output to stdout',
          'this phase removes the stdout write',
          'the diff shows the write call deleted, with no replacement stdout write anywhere in the changed files',
        ].join('\n'),
        coverage: NO_COVERAGE,
        expectObservable: true,
      },
      {
        id: 'AC-F5',
        text: [
          "T2's fixture corpus documents this classifier's canonical shapes",
          'an AC\'s prose illustrates the trigger phrase as a quoted example: a shape described as "pasted into the SUMMARY"',
          'the classifier does not fire on the quoted illustrative phrase, and this AC itself is verified by its own linked test',
        ].join('\n'),
        coverage: [
          testRef(
            'packages/core/tests/verify/criteria-observability.test.ts',
            1,
            'boundary case: quoted trigger phrase must not fire',
          ),
        ],
        expectObservable: true,
      },
      {
        id: 'AC-F6',
        text: [
          'a new doc file `docs/SUMMARY.mdx` exists in the repo',
          'the build runs',
          'the docs site renders `SUMMARY.mdx` and a separate `nav/SUMMARY.yaml` without error, asserted by a test',
        ].join('\n'),
        coverage: [
          testRef('packages/core/tests/docs/summary-mdx.test.ts', 1, 'renders SUMMARY.mdx without error'),
        ],
        expectObservable: true,
      },
      {
        // Code-review finding (real, non-mock pass during this phase's own
        // settle): `NEGATION_CLAUSE_SPAN` was originally 200 — narrow enough
        // that a genuine negation sitting more than 200 chars before the
        // token, but still in the same undelimited clause, was invisible to
        // `hasNegationInClause`, producing a false `unobservable` on text
        // that explicitly says the opposite. This fixture's "not" sits ~250
        // chars before the trigger phrase, no `.`/`\n` in between — reverting
        // the span constant to 200 makes this fixture fail (verified directly
        // before this test was written).
        id: 'AC-F7',
        text: [
          "this acceptance criterion does not, under any circumstances, in any settle run, whether triggered manually via the CLI or automatically through a scheduled pipeline job that periodically re-verifies the full historical corpus for drift, ever depend on or reference this phase's own SUMMARY",
        ].join('\n'),
        coverage: NO_COVERAGE,
        expectObservable: true,
      },
    ];

    for (const c of cases) {
      const verdict = classifyAcObservability(classifiableAc(c.id, c.text), c.coverage);
      expect(verdict.observable, `fixture ${c.id}`).toBe(c.expectObservable);
      if (!verdict.observable && c.expectedReasonFragment !== undefined) {
        expect(verdict.reason).toContain(c.expectedReasonFragment);
      }
    }
  });
});

describe('phase 272 AC-1/AC-4/AC-7 replay (real deep-verify refusals, reclassified) for AC-2', () => {
  const DRAFT_REL = '.cadence/phases/272-assurance-record-correctness/272-01-DRAFT.md';
  const SUMMARY_REL = '.cadence/phases/272-assurance-record-correctness/272-01-SUMMARY.json';

  interface HistoricalDeepVerdict {
    pass: boolean;
    reason: string;
    provider?: string;
  }
  interface HistoricalSummary {
    deepVerify?: Record<string, HistoricalDeepVerdict>;
  }

  function readHistoricalDeepVerify(): Record<string, HistoricalDeepVerdict> {
    const raw = readFileSync(join(REPO_ROOT, SUMMARY_REL), 'utf8');
    const parsed = JSON.parse(raw) as HistoricalSummary;
    return parsed.deepVerify ?? {};
  }

  const historicalDeepVerify = readHistoricalDeepVerify();

  // Consolidated into one `it()` for the same dedup reason as the AC-1 block
  // above — a `for` loop previously produced two separate asserting blocks,
  // both carrying this AC's qualified token; the coverage scanner sees
  // static text, not the loop's runtime unrolling, so it counted exactly two
  // occurrences (one per block) and kept only the first regardless of how
  // many `acId` iterations ran under it.
  it('274-01/AC-2: for each of AC-1/AC-4/AC-7, the real historical verdict was pass:false, and the real DRAFT text now classifies unobservable, not fail', () => {
    for (const acId of ['AC-1', 'AC-4', 'AC-7'] as const) {
      // This grounds *why* these three ACs are the replay set: they really
      // did hit deep-verify's ordinary `fail` path at 272's real settle,
      // exactly the miscategorization the new `unobservable` state exists
      // to correct. Only a static read of the historical record — never a
      // live re-derivation of phase 272's outcome.
      expect(historicalDeepVerify[acId]?.pass, `${acId} historical pass`).toBe(false);

      const text = realAcText(DRAFT_REL, acId);
      // AC-7 genuinely has zero task `done:` linkage in the real DRAFT (its
      // Evidence note says so explicitly) — the true no-linkable-task shape.
      // AC-1/AC-4 do have real, qualifying coverage; T1's JSDoc documents
      // that coverage presence must NOT flip the verdict for either.
      const coverage: readonly TestRef[] =
        acId === 'AC-7'
          ? NO_COVERAGE
          : [
              testRef(
                'packages/core/tests/gates/assurance-record-encoding.test.ts',
                1,
                `${acId} regression assertion`,
              ),
            ];
      const verdict = classifyAcObservability({ id: acId, text }, coverage);
      expect(verdict.observable, `${acId} classification`).toBe(false);
      if (!verdict.observable) {
        // Pin the discriminating signal per the pre-declared table, not
        // just the boolean: AC-1/AC-4 hit PASTED_INTO ("pasted into the
        // SUMMARY"), AC-7 hits SELF_REFERENCE ("this phase's own SUMMARY").
        // Without this, AC-4 firing the wrong signal would still pass.
        const expectedFragment =
          acId === 'AC-7' ? "this phase's own SUMMARY" : 'pasted into the SUMMARY';
        expect(verdict.reason).toContain(expectedFragment);
      }
    }
  });
});

describe('phase 29-shakedown AC-1/AC-2 replay — named frozen fixtures, not a re-scanned count — for AC-3', () => {
  const DRAFT_REL = '.cadence/phases/29-shakedown/29-01-DRAFT.md';

  // Consolidated into one `it()` for the same dedup reason as the two blocks
  // above — deep-verify's real refusal on this exact AC ("the sole linked
  // test is for 29-shakedown AC-1's collision; no referenced assertion
  // proves AC-2 is unobservable") is the direct, empirical confirmation of
  // the coverage-scanner dedup bug: the AC-2 assertion below existed and
  // passed the whole time, it just never reached deep-verify's visible
  // surface because the AC-1 assertion earlier in the file consumed this
  // AC's one dedup slot.
  it("274-01/AC-3: 29-shakedown AC-1's real text (the observable, lowercase-homonym case) and AC-2's real text (the genuine circular-SUMMARY-reference case) both classify as expected", () => {
    const ac1Text = realAcText(DRAFT_REL, 'AC-1');
    const ac1Verdict = classifyAcObservability({ id: 'AC-1', text: ac1Text }, NO_COVERAGE);
    // "post-init summary" — lowercase homonym for `cadence init`'s console
    // output, not `SUMMARY.md` — must NOT fire the classifier.
    expect(ac1Verdict).toEqual({ observable: true });

    const ac2Text = realAcText(DRAFT_REL, 'AC-2');
    const ac2Verdict = classifyAcObservability({ id: 'AC-2', text: ac2Text }, NO_COVERAGE);
    expect(ac2Verdict.observable).toBe(false);
    if (!ac2Verdict.observable) {
      // Pins the discriminating signal: this is WRITTEN_VERBATIM_CAPTURE,
      // not PASTED_INTO or SELF_REFERENCE — the only fixture in this file
      // that exercises that third signal.
      expect(ac2Verdict.reason).toContain('written SUMMARY');
      expect(ac2Verdict.reason).toContain('verbatim');
    }
  });
});
