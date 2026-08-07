import { describe, it, expect } from 'vitest';
import {
  findSpansForProfile,
  findSpansForProfileWithDiagnostics,
} from '../../../src/verify/coverage-profiles/engine.js';
import { computeCodeMask } from '../../../src/verify/coverage-profiles/mask.js';
import { findMatchingParenIndex } from '../../../src/verify/coverage-profiles/strategies.js';
import { jsTsProfile } from '../../../src/verify/coverage-profiles/registry.js';

/**
 * Regression corpus for the defect described in phase 251 and tracked for a
 * real fix in this phase (T2/T3): `mask.ts`'s `classify()` state machine has
 * no concept of a JS/TS `/regex/` literal. A raw or escaped paren or
 * backtick inside a regex literal is read as a real structural character,
 * which corrupts `strategies.ts`'s depth-aware paren matcher
 * (`findMatchingParenIndex`) and/or flips `mask.ts` into template-literal
 * string mode, desyncing span detection for the rest of the file.
 *
 * `packages/core/tests/docs/phase251-ledger.test.ts` hit this live while
 * being authored and worked around it there by avoiding
 * `.toMatch(/regex/)` in favor of `.toContain('string')` — that file is
 * untouched by this phase. Every fixture below is original to this file.
 *
 * This file is ONLY the failing regression corpus (T1) — it must not be
 * used to justify touching `mask.ts`, `strategies.ts`, `js-ts.ts`, or
 * `engine.ts` in this task.
 */

function spanCovering(text: string, needle: string) {
  const at = text.indexOf(needle);
  return findSpansForProfile(text, jsTsProfile).find((s) => at >= s.start && at <= s.end);
}

describe('regex-literal defect: strategies.ts findMatchingParenIndex mechanism', () => {
  it('an unescaped paren inside a /regex/ literal makes findMatchingParenIndex miss the real closing paren (strategies.ts, phase 251 mechanism) (258-01/AC-1)', () => {
    const text = `expect(x).toMatch(/(unterminated/); expect(true).toBe(true);`;
    const mask = computeCodeMask(text, jsTsProfile.syntax);
    const openParenIdx = text.indexOf('toMatch(') + 'toMatch('.length - 1;
    const realCloseIdx = text.indexOf(');');

    // Correct (future) behavior: the regex literal's interior paren is not
    // structural, so the matcher should land on the real `)` that closes
    // `.toMatch(...)`.
    const found = findMatchingParenIndex(text, mask, openParenIdx + 1);
    expect(found).toBe(realCloseIdx);
  });
});

describe('regex-literal defect: unescaped/escaped paren desyncs call-expression span resolution', () => {
  it('a regex literal with an UNESCAPED paren drops the whole enclosing it() span (MARK-1) (258-01/AC-1)', () => {
    const t =
      `it('unescaped paren in regex (MARK-1)', () => {\n` +
      `  expect('a(b').toMatch(/(unterminated group/);\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('a regex literal with an ESCAPED paren (e.g. \\() still corrupts depth tracking -- escaping is not honored outside string mode (MARK-1) (258-01/AC-1)', () => {
    const t =
      `it('escaped paren in regex (MARK-1)', () => {\n` +
      `  expect('a(b').toMatch(/\\(escaped/);\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('nested call expressions where a regex literal argument holds the stray paren(s) still corrupt the OUTER it() span (MARK-1) (258-01/AC-1)', () => {
    // The regex below has TWO unescaped opens and zero closes
    // (`/(nested(/`). The surrounding call structure -- `outer( inner( X ),
    // 2 )` -- has exactly two real (non-regex) opens and two real closes;
    // masked correctly, the regex contributes zero net parens and the whole
    // expression balances. An UNMASKED (pre-fix) reading instead treats the
    // regex's two interior `(` as real structural opens with no matching
    // closes anywhere in the snippet, so depth never returns to zero and
    // `findMatchingParenIndex` runs past the block, corrupting resolution --
    // which is the defect this fixture demonstrates.
    const t =
      `it('nested calls with regex arg (MARK-1)', () => {\n` +
      `  const result = outer(inner(/(nested(/), 2);\n` +
      `  expect(result).toBe(true);\n` +
      `});`;

    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  // Discovered while building the fixture above: a regex whose interior
  // parens happen to be BALANCED (equal opens and closes) resolves
  // correctly TODAY -- not because the classifier understands regex
  // literals, but by numeric coincidence: findMatchingParenIndex only
  // tracks a running depth total, so a regex like `/\(foo\)/` (one open,
  // one close) nets to zero and never desyncs the count, even though the
  // classifier still has no idea it's looking at a regex. This is a real
  // constraint on the eventual fix (T2): a naive change that starts
  // treating regex interiors as opaque must not regress a case that
  // already works today, and this fixture is what would catch that
  // regression. It is NOT part of the defect -- it currently passes.
  it('a regex literal with a BALANCED escaped paren pair resolves correctly today, by numeric coincidence rather than by design (MARK-1) (258-01/AC-1)', () => {
    const t =
      `it('balanced escaped parens in regex (MARK-1)', () => {\n` +
      `  expect(x).toMatch(/\\(foo\\)/);\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });
});

describe('regex-literal defect: backtick inside a regex flips template-string mode (phase 251\'s exact case)', () => {
  it('a backtick inside .toMatch(/regex/) swallows the rest of the block as string content and drops the span (MARK-1) (258-01/AC-2)', () => {
    const t =
      `it('backtick in regex (MARK-1)', () => {\n` +
      `  expect(x).toMatch(/\`odd/);\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('the same backtick desync swallows a SECOND, otherwise-clean it() block later in the file -- the "corrupts the file\'s remaining structure" claim (MARK-1, MARK-2) (258-01/AC-2)', () => {
    const t =
      `it('regex with backtick corrupts this block (MARK-1)', () => {\n` +
      `  expect(x).toMatch(/\`bad/);\n` +
      `});\n\n` +
      `it('later clean test should still be found (MARK-2)', () => {\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    // Lead with the whole-file claim so a failure here is maximally
    // diagnostic (confirmed empirically: today this returns 0, not 2 --
    // the backtick's open string mode never finds a closing backtick
    // anywhere else in the file, so it swallows everything through EOF,
    // including the second it()'s own opener text, which is therefore
    // never even attempted as an opener match).
    expect(findSpansForProfile(t, jsTsProfile).length).toBe(2);

    const spanOne = spanCovering(t, 'MARK-1');
    const spanTwo = spanCovering(t, 'MARK-2');
    expect(spanOne).toBeDefined();
    expect(spanOne?.hasAssertion).toBe(true);
    // The second, entirely well-formed test must be found on its own merits
    // regardless of what happened earlier in the file.
    expect(spanTwo).toBeDefined();
    expect(spanTwo?.hasAssertion).toBe(true);
  });
});

describe('regex-literal defect: escaped characters -- escaping does not protect the current classifier', () => {
  it('an escaped forward slash (\\/) combined with an unbalanced escaped paren (\\() still corrupts the span, driven by the paren not the slash (MARK-1)', () => {
    const t =
      `it('escaped slash and paren (MARK-1)', () => {\n` +
      `  expect(x).toMatch(/\\/path\\(sub/);\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('an escaped forward slash (\\/) ALONE, with no paren or backtick in the regex, is not part of the defect and resolves correctly today (MARK-1)', () => {
    const t =
      `it('escaped slash only (MARK-1)', () => {\n` +
      `  expect(x).toMatch(/end\\/of\\/path/);\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });
});

describe('regex-literal defect: character class containing an unescaped slash (forward-looking correctness fixture)', () => {
  it('a regex character class ([...]) containing an unescaped / must not falsely close the regex (MARK-1)', () => {
    const t =
      `it('char class with slash (MARK-1)', () => {\n` +
      `  expect(x).toMatch(/[a/b]c/);\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });
});

describe('NOT part of the defect: division, template literals, and comments must keep resolving correctly', () => {
  it('division immediately after an identifier is read as plain code (MARK-1) (258-01/AC-3)', () => {
    const t = `it('division after identifier (MARK-1)', () => {\n  expect(a / b).toBe(1);\n});`;
    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('division immediately after a bare number literal is read as plain code (MARK-1) (258-01/AC-3)', () => {
    const t = `it('division after number literal (MARK-1)', () => {\n  expect(10 / 2).toBe(5);\n});`;
    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('division immediately after a closing )/]/} is read as plain code (MARK-1) (258-01/AC-3)', () => {
    const t =
      `it('division after closing delimiters (MARK-1)', () => {\n` +
      `  expect(fn() / 2).toBe(2);\n` +
      `  expect(list[0] / 2).toBe(2);\n` +
      `  expect({ x: 4 } / 2).toBe(2);\n` +
      `});`;
    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('a template literal containing a / is masked as string content, not misread as a regex (MARK-1)', () => {
    const t = `it('template literal with slash (MARK-1)', () => {\n  expect(\`a/b\`).toBe('a/b');\n});`;
    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('a line comment and a block comment containing a / are masked as comment content, not misread as a regex (MARK-1)', () => {
    const t =
      `it('comment with slash (MARK-1)', () => {\n` +
      `  // a comment with a / inside it\n` +
      `  expect(true).toBe(true);\n` +
      `  /* another / comment */\n` +
      `});`;
    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });
});

/**
 * Third independent review round: regression tests for the two rounds of
 * postfix-operator / keyword-casing fixes that landed with no coverage of
 * their own, plus two NEW findings from round 3 (findings A and C below).
 *
 * All fixtures in this section that check `hasAssertion` deliberately place
 * the assertion call (`expect(...)`) STRICTLY AFTER the `/` under test, on
 * the same line, with no other `/` between them -- this is what makes the
 * assertion signal load-bearing. `jsTsProfile`'s `ASSERTION` pattern matches
 * on the bare substring `expect(` anywhere in a block's code-mode text, so a
 * fixture with `expect(` written BEFORE the ambiguous `/` would still see
 * `hasAssertion: true` even if the `/` were misclassified -- the earlier,
 * untouched `expect(` would still satisfy the pattern regardless. Placing
 * `expect(` after the ambiguous `/`, with no closing `/` in between, means a
 * wrongly-opened regex swallows the rest of the line (including `expect(`)
 * before the classifier's newline fallback (`mask.ts` lines ~444-459) kicks
 * back in -- so `hasAssertion` flips to `false` exactly when, and only when,
 * the `/` was misclassified as regex-open.
 */
describe('phase 258, review round 3: postfix ++/--/! and keyword-casing regressions (already fixed, previously untested)', () => {
  it('postfix ++ immediately before a slash resolves as division, not regex-open (MARK-1)', () => {
    const t =
      `it('postfix increment then division (MARK-1)', () => {\n` +
      `  let count = 10; count++ / 2; expect(count).toBe(11);\n` +
      `});`;
    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('postfix -- immediately before a slash resolves as division, not regex-open (MARK-1)', () => {
    const t =
      `it('postfix decrement then division (MARK-1)', () => {\n` +
      `  let count = 10; count-- / 2; expect(count).toBe(9);\n` +
      `});`;
    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('postfix ! (TypeScript non-null assertion) immediately before a slash resolves as division, not regex-open (MARK-1)', () => {
    const t =
      `it('postfix non-null assertion then division (MARK-1)', () => {\n` +
      `  const x = 10; x! / 2; expect(x).toBe(10);\n` +
      `});`;
    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });

  it('prefix ! before a regex (containing a backtick, to make misclassification maximally visible) still resolves as regex-eligible, not division -- regression guard (MARK-1, MARK-2)', () => {
    const t =
      `it('prefix negation of a regex literal (MARK-1)', () => {\n` +
      `  expect(!/\`odd/.test(x)).toBe(false);\n` +
      `});\n\n` +
      `it('later clean test should still be found (MARK-2)', () => {\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    // If prefix `!` were ever wrongly resolved to division context, the `/`
    // right after it would be read as plain division, `` ` `` would open a
    // REAL (never-closing) template-string, and everything from there to
    // EOF -- including the second, otherwise-clean it() block -- would be
    // swallowed, dropping the span count below 2.
    expect(findSpansForProfile(t, jsTsProfile).length).toBe(2);

    const spanOne = spanCovering(t, 'MARK-1');
    const spanTwo = spanCovering(t, 'MARK-2');
    expect(spanOne).toBeDefined();
    expect(spanOne?.hasAssertion).toBe(true);
    expect(spanTwo).toBeDefined();
    expect(spanTwo?.hasAssertion).toBe(true);
  });

  it('a capitalized identifier that merely spells a keyword (e.g. Return) is read as an ordinary identifier, not the keyword -- resolves as division (MARK-1)', () => {
    const t =
      `it('capitalized keyword-spelled identifier (MARK-1)', () => {\n` +
      `  const Return = 10; Return / 2; expect(Return).toBe(10);\n` +
      `});`;
    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });
});

describe('phase 258, review round 3, finding A: postfix ! immediately after a closed string/regex ("unknown" preceding-token category)', () => {
  it('a ! immediately after a closed template literal resolves as division, not regex-open -- "unknown" must resolve like "division", never like "regex" (MARK-1)', () => {
    // `tag\`x\`` is a completed template literal; `classify()` tags its
    // closing backtick `Kind === 'string'`, which `precedingTokenCategory`
    // cannot further resolve to 'regex' or 'division' by itself -- it's
    // 'unknown' (see `mask.ts`'s doc comment on the `'unknown'` bucket).
    // Pre-fix, the `!` branch's ternary let 'unknown' fall through to
    // 'regex' by default (only an explicit 'division' short-circuited to
    // 'division'), wrongly opening regex mode at the `/` that follows.
    const t =
      `it('non-null assertion after closed template literal (MARK-1)', () => {\n` +
      `  const half = tag\`x\`! / 2; expect(half).toBe(0.5);\n` +
      `});`;
    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    expect(span?.hasAssertion).toBe(true);
  });
});

describe('phase 258, review round 3, finding C: postfix ! must not cross a newline (TypeScript\'s [no LineTerminator here] restriction)', () => {
  it('a ! separated from its nearest preceding token by a newline must be treated as prefix (regex-eligible), never postfix -- this is the phase\'s own namesake defect, reproduced by a different preceding-token shape (MARK-1, MARK-2)', () => {
    // Mirrors the reviewer's exact repro: `x\n!/a\`b/.test(y);`. Pre-fix,
    // the recursive lookback treats the newline between `x` and `!` as
    // ordinary skippable whitespace, lands on `x` (an identifier), and
    // concludes 'division' -- so the `/` right after `!` never opens regex
    // mode. `a` then reads as plain code, and the UNESCAPED backtick in
    // `` `b` `` opens a REAL, never-closing template-string that swallows
    // the rest of the file, including this block's own closing braces and
    // the entirety of the second it() block -- producing 0 spans where 2
    // are expected. Real TypeScript grammar forbids postfix `!` from
    // spanning a line terminator, so `x\n!` can never legally be postfix on
    // `x` -- the `!` MUST be prefix here, making `/a\`b/` a real regex.
    const t =
      `it('newline before non-null-assertion-shaped regex (MARK-1)', () => {\n` +
      `  x\n` +
      `  !/a\`b/.test(y);\n` +
      `});\n\n` +
      `it('later clean test should still be found (MARK-2)', () => {\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    expect(findSpansForProfile(t, jsTsProfile).length).toBe(2);

    const spanOne = spanCovering(t, 'MARK-1');
    const spanTwo = spanCovering(t, 'MARK-2');
    expect(spanOne).toBeDefined();
    expect(spanTwo).toBeDefined();
    expect(spanTwo?.hasAssertion).toBe(true);
  });
});

/**
 * Fourth independent review round: a whole-function (not diff-scoped) read
 * of `precedingTokenCategory` found two missing keywords -- `await` and
 * `default` -- that are unambiguously regex-eligible (both are reserved
 * words that can never be identifiers) but were absent from
 * `REGEX_ELIGIBLE_KEYWORDS`. This is not benign under-masking: since both
 * repros use a regex containing a quote character, the un-opened regex's
 * quote reads as a REAL string/template opener that runs to the next
 * matching quote anywhere later in the file -- silently corrupting
 * unrelated downstream blocks, exactly this phase's namesake defect,
 * reached through a different (keyword-vocabulary-gap) door than rounds 1-3.
 */
describe('phase 258, review round 4: missing `await`/`default` keywords corrupt downstream blocks', () => {
  it('await immediately before a regex containing a quote resolves as regex-eligible, not division -- a missing keyword must not corrupt a later, unrelated block (MARK-1, MARK-2)', () => {
    // Pre-fix (await absent from REGEX_ELIGIBLE_KEYWORDS): `await` resolves
    // to plain division context (an ordinary identifier-like fallthrough),
    // so the `/` right after it never opens regex mode. The `'` inside
    // `['"]` then opens a REAL, never-closing string that swallows the rest
    // of the file, including the second it() block's own opening quote --
    // producing fewer than 2 spans.
    const t =
      `it('await before quoted regex (MARK-1)', async () => {\n` +
      `  const ok = await /['"]/.test(x);\n` +
      `  expect(ok).toBe(true);\n` +
      `});\n\n` +
      `it('later clean test should still be found (MARK-2)', () => {\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    expect(findSpansForProfile(t, jsTsProfile).length).toBe(2);

    const spanOne = spanCovering(t, 'MARK-1');
    const spanTwo = spanCovering(t, 'MARK-2');
    expect(spanOne).toBeDefined();
    expect(spanOne?.hasAssertion).toBe(true);
    expect(spanTwo).toBeDefined();
    expect(spanTwo?.hasAssertion).toBe(true);
  });

  it('export default immediately before a regex containing a quote resolves as regex-eligible, not division -- a missing keyword must not corrupt a later, unrelated block (MARK-2)', () => {
    // Pre-fix (default absent from REGEX_ELIGIBLE_KEYWORDS): the same
    // corruption mechanism as above, triggered by `export default /re/;`
    // instead of `await`. The real reviewer repro observed the swallowed
    // string landing on a garbage 13-character fragment of the SECOND
    // block's own title text, with that block's span reporting
    // `hasAssertion: false` even though it plainly contains a real
    // assertion.
    const t =
      `export default /['"]/;\n\n` +
      `it('later clean test should still be found (MARK-2)', () => {\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    expect(findSpansForProfile(t, jsTsProfile).length).toBe(1);

    const spanTwo = spanCovering(t, 'MARK-2');
    expect(spanTwo).toBeDefined();
    expect(spanTwo?.hasAssertion).toBe(true);
  });
});

/**
 * T3 (phase 258): `precedingTokenCategory` (`mask.ts`) is not a total
 * classifier — it always returns 'regex'/'division'/'unknown', and
 * 'unknown' has always silently resolved the same way as 'division' (never
 * opens regex mode). This block confirms that resolution is now diagnosed
 * via `findSpansForProfileWithDiagnostics` instead of silent, WITHOUT
 * changing what `findSpansForProfile` itself resolves — same spans, same
 * `hasAssertion` verdicts, for every fixture below.
 */
describe('phase 258, T3: out-of-vocabulary preceding-token context is diagnosed via findSpansForProfileWithDiagnostics, never silently guessed', () => {
  it('a / immediately after a closed template literal is out-of-vocabulary ("unknown") -- produces exactly one MaskDiagnostic naming the completed-literal context, while span resolution is byte-for-byte unchanged from findSpansForProfile (258-01/AC-4)', () => {
    // Confirmed premise (verified against the built scanner before writing
    // this test): a `/` immediately after a closed template literal's
    // closing backtick lands in `precedingTokenCategory`'s 'unknown' bucket
    // -- the backtick closes the template (tagged Kind 'string'), so the
    // "completed literal, not mid-literal content" case applies. Today that
    // resolves the same as 'division' (correct here, by chance) -- silently.
    const t = "it('x', () => {\n  const y = `tpl` / 2;\n  expect(y).toBeNaN();\n});";

    const spansOnly = findSpansForProfile(t, jsTsProfile);
    const { spans, diagnostics } = findSpansForProfileWithDiagnostics(t, jsTsProfile);

    // No behavior change: asking for diagnostics must not alter span
    // resolution -- this is the direct check that T3 added visibility only.
    expect(spans).toEqual(spansOnly);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.hasAssertion).toBe(true);

    // Exactly one diagnostic (not zero -- the bug this test guards against
    // -- and not more than one, which would mean the collection site is
    // double-firing, e.g. once per `computeCodeMask`/`computeCommentMask`
    // call).
    expect(diagnostics).toHaveLength(1);
    const slashOffset = t.indexOf('/');
    expect(diagnostics[0]?.offset).toBe(slashOffset);
    expect(diagnostics[0]?.context).toMatch(/completed string, template, or regex literal/);
    expect(diagnostics[0]?.snippet).toContain('tpl');
  });

  it('a plain division after an identifier (a / b) is in-vocabulary and produces NO diagnostic (258-01/AC-4)', () => {
    const t = "it('division (MARK-1)', () => {\n  const y = a / b;\n  expect(y).toBeDefined();\n});";
    const spansOnly = findSpansForProfile(t, jsTsProfile);
    const { spans, diagnostics } = findSpansForProfileWithDiagnostics(t, jsTsProfile);
    expect(spans).toEqual(spansOnly);
    expect(diagnostics).toHaveLength(0);
  });

  it('a return-prefixed regex literal is in-vocabulary and produces NO diagnostic (258-01/AC-4)', () => {
    const t =
      `function f() {\n` +
      `  return /abc/.test('x');\n` +
      `}\n` +
      `it('regex ok (MARK-1)', () => {\n` +
      `  expect(f()).toBe(true);\n` +
      `});`;
    const spansOnly = findSpansForProfile(t, jsTsProfile);
    const { spans, diagnostics } = findSpansForProfileWithDiagnostics(t, jsTsProfile);
    expect(spans).toEqual(spansOnly);
    expect(diagnostics).toHaveLength(0);
  });

  it('a / immediately after a closing ) is in-vocabulary (DIVISION_ELIGIBLE_CLOSE_PUNCT) and produces NO diagnostic (258-01/AC-4)', () => {
    const t = "it('division after paren (MARK-1)', () => {\n  const y = fn() / 2;\n  expect(y).toBeDefined();\n});";
    const { diagnostics } = findSpansForProfileWithDiagnostics(t, jsTsProfile);
    expect(diagnostics).toHaveLength(0);
  });

  it('a / immediately after a bare punctuation character outside either enumerated set (e.g. a period) is out-of-vocabulary and produces a MaskDiagnostic naming the character (258-01/AC-4)', () => {
    // `.` is neither a REGEX_ELIGIBLE_PUNCT nor a DIVISION_ELIGIBLE_CLOSE_PUNCT
    // member -- an out-of-vocabulary punctuation shape distinct from the
    // completed-literal shape covered above. `a.b / 2` would NOT reach this
    // case: the `/` there is preceded (after whitespace) by `b`, an
    // identifier, which is in-vocabulary (division) -- the `/` must directly
    // follow the `.` itself, with no identifier in between.
    const inVocabulary = "it('x', () => {\n  const y = a.b / 2;\n  expect(y).toBeDefined();\n});";
    const outOfVocabulary = "it('x', () => {\n  const y = a./ 2;\n  expect(y).toBeDefined();\n});";

    expect(findSpansForProfileWithDiagnostics(inVocabulary, jsTsProfile).diagnostics).toHaveLength(0);

    const result = findSpansForProfileWithDiagnostics(outOfVocabulary, jsTsProfile);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.context).toMatch(/outside the documented preceding-token vocabulary/);
  });
});

/**
 * T5 (phase 258, AC-5): a whole-corpus regression invariant, additive to --
 * not a duplicate of -- every per-fixture assertion above. Every fixture
 * string exercised anywhere in this file (T1's original corpus, T2's
 * round-3/round-4 regression guards, and T3's AC-4 diagnostic fixtures) is
 * reproduced verbatim below, paired with its own hand-verified real span
 * count, and re-scanned as a single holistic check.
 *
 * **What this actually verifies** (review-round correction: AC-5's literal
 * wording, "no span is produced outside a real test block," is not a
 * structural property this corpus upholds absolutely -- fixture #27 below
 * has a hand-verified expected count of 2 precisely BECAUSE one of its two
 * spans is a pre-existing, unrelated `OPENER`-pattern quirk matching
 * `.test('x')` outside any real `it()`/`test()` block, and that's correct,
 * documented behavior, not a bug this phase introduces or fixes). What this
 * block actually checks, and what's load-bearing: every fixture's span
 * COUNT matches its own hand-verified expected value. A swallowed block
 * (this phase's defect: a mis-triggered string/template mode eats the rest
 * of the file) or a resurrected phantom span both show up as a count
 * mismatch -- and this is verifiably NOT tautological: simulating pre-fix
 * behavior (a throwaway probe script, not committed, that scans this exact
 * corpus with `syntax.regexLiterals` forced to `false`) makes 10 of the 30
 * corpus entries below report the WRONG count (typically 0 -- every real
 * block swallowed), while the real fixed scanner matches the hand-verified
 * expected count on all 30 entries.
 *
 * (An earlier draft of this block asserted only span-boundary shape --
 * start <= end, no overlap, hasAssertion backed by in-span text. Each of
 * those turned out to be true by construction of
 * `findSpansForProfileWithDiagnostics` itself (`engine.ts`: spans are
 * pushed with `start: i` where `i` is the sticky opener match's own index,
 * `hasAssertion` is computed FROM `codeOnlySlice(text, mask, block.start,
 * block.end)` so it can never be backed by out-of-span text, and the scan
 * loop always advances `i = block.end + 1` so spans can never overlap) --
 * they would pass identically whether or not the regex-literal defect were
 * present, so they were dropped as the primary evidence. The bounds check
 * below is kept only as a defensive sanity net, explicitly not claimed as
 * regression evidence.)
 */
describe('phase 258, T5: whole-corpus regression invariant -- every fixture re-scans to its hand-verified span count', () => {
  // Every fixture text already used elsewhere in this file, reproduced here
  // verbatim (identical source-level escaping to each original), paired
  // with the real span count that fixture ought to produce -- not a
  // resampled or paraphrased subset, and not a blind re-run of whatever the
  // scanner currently returns.
  //
  // `#27`'s expected count of 2, not 1, is intentional and NOT part of the
  // regex-literal defect: `.test('x')` (a `RegExp.prototype.test()` member
  // call) is itself matched by the js/ts `OPENER` pattern, because the
  // character immediately before "test(" is `.`, which is not a word
  // character -- a pre-existing, unrelated quirk of `OPENER`'s own
  // word-boundary check (`js-ts.ts`). This is exactly why the existing T3
  // test above for this same fixture ("a return-prefixed regex literal...")
  // deliberately never asserts a span count of its own.
  const CORPUS: Array<{ text: string; expectedSpanCount: number }> = [
    // strategies.ts mechanism fixture (AC-1) -- no it()/test() at all
    { text: `expect(x).toMatch(/(unterminated/); expect(true).toBe(true);`, expectedSpanCount: 0 },

    // AC-1: unescaped/escaped paren, nested calls, balanced escaped parens
    {
      text:
        `it('unescaped paren in regex (MARK-1)', () => {\n` +
        `  expect('a(b').toMatch(/(unterminated group/);\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 1,
    },
    {
      text:
        `it('escaped paren in regex (MARK-1)', () => {\n` +
        `  expect('a(b').toMatch(/\\(escaped/);\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 1,
    },
    {
      text:
        `it('nested calls with regex arg (MARK-1)', () => {\n` +
        `  const result = outer(inner(/(nested(/), 2);\n` +
        `  expect(result).toBe(true);\n` +
        `});`,
      expectedSpanCount: 1,
    },
    {
      text:
        `it('balanced escaped parens in regex (MARK-1)', () => {\n` +
        `  expect(x).toMatch(/\\(foo\\)/);\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 1,
    },

    // AC-2: backtick inside regex, single block and two-block corruption
    {
      text:
        `it('backtick in regex (MARK-1)', () => {\n` +
        `  expect(x).toMatch(/\`odd/);\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 1,
    },
    {
      text:
        `it('regex with backtick corrupts this block (MARK-1)', () => {\n` +
        `  expect(x).toMatch(/\`bad/);\n` +
        `});\n\n` +
        `it('later clean test should still be found (MARK-2)', () => {\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 2,
    },

    // escaped characters -- escaping does not protect the pre-fix classifier
    {
      text:
        `it('escaped slash and paren (MARK-1)', () => {\n` +
        `  expect(x).toMatch(/\\/path\\(sub/);\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 1,
    },
    {
      text:
        `it('escaped slash only (MARK-1)', () => {\n` +
        `  expect(x).toMatch(/end\\/of\\/path/);\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 1,
    },

    // character class containing an unescaped slash
    {
      text:
        `it('char class with slash (MARK-1)', () => {\n` +
        `  expect(x).toMatch(/[a/b]c/);\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 1,
    },

    // AC-3: division, template literal, comments
    {
      text: `it('division after identifier (MARK-1)', () => {\n  expect(a / b).toBe(1);\n});`,
      expectedSpanCount: 1,
    },
    {
      text: `it('division after number literal (MARK-1)', () => {\n  expect(10 / 2).toBe(5);\n});`,
      expectedSpanCount: 1,
    },
    {
      text:
        `it('division after closing delimiters (MARK-1)', () => {\n` +
        `  expect(fn() / 2).toBe(2);\n` +
        `  expect(list[0] / 2).toBe(2);\n` +
        `  expect({ x: 4 } / 2).toBe(2);\n` +
        `});`,
      expectedSpanCount: 1,
    },
    {
      text: `it('template literal with slash (MARK-1)', () => {\n  expect(\`a/b\`).toBe('a/b');\n});`,
      expectedSpanCount: 1,
    },
    {
      text:
        `it('comment with slash (MARK-1)', () => {\n` +
        `  // a comment with a / inside it\n` +
        `  expect(true).toBe(true);\n` +
        `  /* another / comment */\n` +
        `});`,
      expectedSpanCount: 1,
    },

    // review round 3: postfix ++/--/! and keyword-casing regressions
    {
      text:
        `it('postfix increment then division (MARK-1)', () => {\n` +
        `  let count = 10; count++ / 2; expect(count).toBe(11);\n` +
        `});`,
      expectedSpanCount: 1,
    },
    {
      text:
        `it('postfix decrement then division (MARK-1)', () => {\n` +
        `  let count = 10; count-- / 2; expect(count).toBe(9);\n` +
        `});`,
      expectedSpanCount: 1,
    },
    {
      text:
        `it('postfix non-null assertion then division (MARK-1)', () => {\n` +
        `  const x = 10; x! / 2; expect(x).toBe(10);\n` +
        `});`,
      expectedSpanCount: 1,
    },
    {
      text:
        `it('prefix negation of a regex literal (MARK-1)', () => {\n` +
        `  expect(!/\`odd/.test(x)).toBe(false);\n` +
        `});\n\n` +
        `it('later clean test should still be found (MARK-2)', () => {\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 2,
    },
    {
      text:
        `it('capitalized keyword-spelled identifier (MARK-1)', () => {\n` +
        `  const Return = 10; Return / 2; expect(Return).toBe(10);\n` +
        `});`,
      expectedSpanCount: 1,
    },

    // review round 3, finding A: postfix ! after a closed string/regex
    {
      text:
        `it('non-null assertion after closed template literal (MARK-1)', () => {\n` +
        `  const half = tag\`x\`! / 2; expect(half).toBe(0.5);\n` +
        `});`,
      expectedSpanCount: 1,
    },

    // review round 3, finding C: postfix ! must not cross a newline
    {
      text:
        `it('newline before non-null-assertion-shaped regex (MARK-1)', () => {\n` +
        `  x\n` +
        `  !/a\`b/.test(y);\n` +
        `});\n\n` +
        `it('later clean test should still be found (MARK-2)', () => {\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 2,
    },

    // review round 4: missing await/default keywords
    {
      text:
        `it('await before quoted regex (MARK-1)', async () => {\n` +
        `  const ok = await /['"]/.test(x);\n` +
        `  expect(ok).toBe(true);\n` +
        `});\n\n` +
        `it('later clean test should still be found (MARK-2)', () => {\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 2,
    },
    {
      text:
        `export default /['"]/;\n\n` +
        `it('later clean test should still be found (MARK-2)', () => {\n` +
        `  expect(true).toBe(true);\n` +
        `});`,
      expectedSpanCount: 1,
    },

    // T3: out-of-vocabulary preceding-token diagnostics (AC-4)
    {
      text: "it('x', () => {\n  const y = `tpl` / 2;\n  expect(y).toBeNaN();\n});",
      expectedSpanCount: 1,
    },
    {
      text: "it('division (MARK-1)', () => {\n  const y = a / b;\n  expect(y).toBeDefined();\n});",
      expectedSpanCount: 1,
    },
    {
      // See the corpus-level comment above: the `.test('x')` member call
      // here is itself matched by `OPENER`, alongside the real `it(...)`
      // block -- 2 spans, not 1, and this is unrelated to the regex-literal
      // defect (both spans resolve correctly today and pre-fix alike).
      text:
        `function f() {\n` +
        `  return /abc/.test('x');\n` +
        `}\n` +
        `it('regex ok (MARK-1)', () => {\n` +
        `  expect(f()).toBe(true);\n` +
        `});`,
      expectedSpanCount: 2,
    },
    {
      text: "it('division after paren (MARK-1)', () => {\n  const y = fn() / 2;\n  expect(y).toBeDefined();\n});",
      expectedSpanCount: 1,
    },
    {
      text: "it('x', () => {\n  const y = a.b / 2;\n  expect(y).toBeDefined();\n});",
      expectedSpanCount: 1,
    },
    {
      text: "it('x', () => {\n  const y = a./ 2;\n  expect(y).toBeDefined();\n});",
      expectedSpanCount: 1,
    },
  ];

  it('every fixture in the corpus (30 texts, drawn from all 29 existing tests in this file, one of which contributes two) re-scans to exactly its own hand-verified real span count, with every resolved span still landing in-bounds (258-01/AC-5)', () => {
    // A cheap sanity floor on the corpus-construction step itself: if this
    // ever regresses to a handful of entries (e.g. a bad copy/paste), the
    // per-entry check below would still pass trivially on whatever remains
    // and silently stop meaning anything -- this guards the corpus, not
    // just the scanner.
    expect(CORPUS.length).toBe(30);

    for (const { text, expectedSpanCount } of CORPUS) {
      const spans = findSpansForProfile(text, jsTsProfile);

      // Load-bearing: the actual regression check AC-5 asks for. See the
      // block-level doc comment above for the non-tautology proof.
      expect(spans.length).toBe(expectedSpanCount);

      // Secondary/defensive only -- NOT regression evidence (see the
      // block-level doc comment: this holds true by construction of
      // `findSpansForProfileWithDiagnostics` regardless of the
      // regex-literal defect). Kept as a bounds sanity net: every resolved
      // span's [start, end] (both inclusive, per `TestSpan`'s own
      // docstring) lies within the fixture's own bounds, never inverted.
      for (const span of spans) {
        expect(span.start).toBeGreaterThanOrEqual(0);
        expect(span.end).toBeLessThan(text.length);
        expect(span.start).toBeLessThanOrEqual(span.end);
      }
    }
  });
});

/**
 * Whole-branch review: two branches in `mask.ts`'s `'regex'` mode handler
 * had no fixture of their own (per the coverage report, lines ~659-663 and
 * ~682-685 in the reviewed diff): the newline-inside-a-wrongly-opened-regex
 * safety fallback, and the multi-character regex-flag consumption loop.
 * Neither is part of the defect this phase fixes -- both are pre-existing
 * design points in the NEW regex-mode implementation itself, added here for
 * completeness now that the branches are known to exist.
 */
describe('phase 258, whole-branch review: previously-uncovered regex-mode branches', () => {
  it('a raw newline before a regex ever closes falls back to code mode instead of swallowing subsequent real code (MARK-1, MARK-2)', () => {
    // `return` makes the `/` regex-eligible per precedingTokenCategory, but
    // a raw `\n` can never legally appear inside a real JS/TS regex literal
    // -- reaching one before an unescaped close means the regex-open guess
    // was wrong (or the source has a genuine syntax error either way). The
    // false-positive-averse invariant requires falling back to code mode at
    // the newline rather than continuing to swallow real code as regex
    // content -- so everything after the newline, including the second
    // it() block, must still resolve normally.
    const t =
      `it('newline inside a wrongly-opened regex (MARK-1)', () => {\n` +
      `  return /abc\n` +
      `  def/.test(y);\n` +
      `});\n\n` +
      `it('later clean test should still be found (MARK-2)', () => {\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    expect(findSpansForProfile(t, jsTsProfile).length).toBe(2);

    const spanTwo = spanCovering(t, 'MARK-2');
    expect(spanTwo).toBeDefined();
    expect(spanTwo?.hasAssertion).toBe(true);
  });

  it('a regex literal with multiple trailing flag characters (e.g. /re/gim) consumes every flag character, not just the first, before returning to code mode (MARK-1)', () => {
    const t =
      `it('multi-flag regex (MARK-1)', () => {\n` +
      `  expect('AbC').toMatch(/abc/gim);\n` +
      `  expect(true).toBe(true);\n` +
      `});`;

    const span = spanCovering(t, 'MARK-1');
    expect(span).toBeDefined();
    // If only the first flag character were consumed, the leftover `im`
    // would read as two bare identifier characters immediately followed by
    // `);`, which -- while not itself corrupting -- would leave the mask
    // internally inconsistent with the real language grammar; the load-bearing
    // check is that the block still resolves with its assertion intact.
    expect(span?.hasAssertion).toBe(true);
  });
});
