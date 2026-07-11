import { describe, it, expect } from 'vitest';
import { findTestSpans } from '../../src/verify/test-spans.js';
import { findSpansForProfile } from '../../src/verify/coverage-profiles/engine.js';
import { computeCodeMask } from '../../src/verify/coverage-profiles/mask.js';
import {
  getProfileForExtension,
  listProfiles,
  jsTsProfile,
} from '../../src/verify/coverage-profiles/registry.js';
import type { LanguageProfile } from '../../src/verify/coverage-profiles/types.js';

describe('shared coverage-profiles engine (phase 167 T1)', () => {
  it('re-expressed js/ts profile via the shared engine preserves call-expression span matching (AC-1)', () => {
    const t = `it('does X', () => { expect(1).toBe(1); });`;
    expect(findTestSpans(t).some((s) => s.hasAssertion)).toBe(true);
  });

  it('the js/ts profile is registered in the shared registry under .ts/.tsx/.js/.jsx and dispatch reads from it (AC-1)', () => {
    expect(getProfileForExtension('.ts')).toBe(jsTsProfile);
    expect(getProfileForExtension('.tsx')).toBe(jsTsProfile);
    expect(getProfileForExtension('.js')).toBe(jsTsProfile);
    expect(getProfileForExtension('.jsx')).toBe(jsTsProfile);
    expect(getProfileForExtension('js')).toBe(jsTsProfile); // extension without leading dot
    expect(listProfiles()).toContain(jsTsProfile);

    const spans = findSpansForProfile(`test('y (AC-1)', () => { assert(thing); });`, jsTsProfile);
    expect(spans.some((s) => s.hasAssertion)).toBe(true);
  });

  it('computeCodeMask marks string and comment interiors as non-code, matching js/ts syntax (AC-1)', () => {
    const text = `x // AC-1\ny = "AC-1" /* AC-1 */ z`;
    const mask = computeCodeMask(text, jsTsProfile.syntax);
    expect(mask.length).toBe(text.length);
    expect(mask[0]).toBe(1); // 'x' is code
    const codeChars = ['x', 'y', '=', 'z'];
    for (const ch of codeChars) {
      const idx = text.indexOf(ch);
      expect(mask[idx]).toBe(1);
    }
    // every occurrence of the AC-1 token itself is inside a string or comment
    let searchFrom = 0;
    let found = 0;
    for (;;) {
      const idx = text.indexOf('AC-1', searchFrom);
      if (idx === -1) break;
      found++;
      expect(mask[idx]).toBe(0);
      searchFrom = idx + 1;
    }
    expect(found).toBe(3);
  });

  describe('brace-delimited strategy primitive', () => {
    const braceProfile: LanguageProfile = {
      id: 'test-brace-fixture',
      extensions: ['.brace-fixture'],
      openerPattern: /func\s+Test\w+\s*\([^)]*\)\s*/y,
      assertionPattern: /\bt\.(?:Error|Fatal)\w*\b/,
      syntax: {
        comments: { line: ['//'], block: [['/*', '*/']] },
        strings: [{ open: '"' }],
      },
      strategy: 'brace-delimited',
    };

    it('finds a brace-bounded span around an asserting test function', () => {
      const t = `func TestFoo(t *testing.T) {\n  t.Errorf("bad")\n}`;
      const spans = findSpansForProfile(t, braceProfile);
      expect(spans.length).toBe(1);
      expect(spans[0]!.hasAssertion).toBe(true);
    });

    it('is string/comment aware: a fake assertion inside a string or comment does not qualify', () => {
      const t = `func TestBar(t *testing.T) {\n  x := "t.Error(fake)"\n  // t.Fatal(fake)\n}`;
      const spans = findSpansForProfile(t, braceProfile);
      expect(spans.length).toBe(1);
      expect(spans[0]!.hasAssertion).toBe(false);
    });

    it('yields zero spans (never a partial match) when no opening brace is ever found', () => {
      const t = `func TestFoo(t *testing.T)\n// no body follows`;
      const spans = findSpansForProfile(t, braceProfile);
      expect(spans.length).toBe(0);
    });

    it('an opener pattern requiring an interior literal cannot be spoofed by a comment OR a string inside the match, by default (phase 167 T3 review findings, both rounds)', () => {
      const spoofProfile: LanguageProfile = {
        ...braceProfile,
        // Only a real `*testing.T` parameter type should open a span — mirrors go.ts's real design.
        // No `openerMatchesStrings` set: defaults to false, so strings are hidden from opener matching too.
        openerPattern: /func\s+Test\w*\s*\([^)]*\*\s*testing\.T\b[^)]*\)\s*/y,
      };
      const spoofedViaComment = `func TestFake(\n  x SomeOtherType, /* not *testing.T at all */\n) {\n  t.Error("should never be reachable")\n}`;
      expect(findSpansForProfile(spoofedViaComment, spoofProfile).length).toBe(0);

      // Round 2 (T3 review of the round-1 fix): a string literal elsewhere in
      // the match must be blocked too, by default — not just comments.
      const spoofedViaString = `func TestFake2(x = "*testing.T") {\n  t.Error("should never be reachable")\n}`;
      expect(findSpansForProfile(spoofedViaString, spoofProfile).length).toBe(0);

      // Sanity: the real (non-spoofed) shape still matches correctly.
      const real = `func TestReal(t *testing.T) {\n  t.Error("real")\n}`;
      const spans = findSpansForProfile(real, spoofProfile);
      expect(spans.length).toBe(1);
      expect(spans[0]!.hasAssertion).toBe(true);
    });

    it('the recommended openerRequiredLiteral design also closes a THIRD vector: a literal nested inside a sub-expression\'s own parens (phase 167 T3 review, round 3)', () => {
      // The ad-hoc `spoofProfile` above embeds its required literal directly
      // inside `openerPattern`'s `[^)]*` wildcards — round 1/2-safe (via
      // masking) but NOT round-3-safe, because `[^)]*` is not paren-depth-
      // aware: a nested parenthesized sub-expression can supply its own,
      // earlier closing paren. `openerRequiredLiteral` is the recommended
      // fix — it checks TOP-LEVEL parameter-list text only, so a literal
      // nested inside a sub-expression's own parens can never satisfy it.
      const properProfile: LanguageProfile = {
        ...braceProfile,
        openerPattern: /func\s+Test\w*\s*\(/y, // ends right at the triggering '(', per convention
        openerRequiredLiteral: /\*\s*testing\.T\b/,
      };

      const spoofedViaNestedParens = `func TestSpoof(cb func(x *testing.T)) {\n  t.Error("never runs under go test")\n}`;
      expect(findSpansForProfile(spoofedViaNestedParens, properProfile).length).toBe(0);

      // Sanity: the real (non-spoofed) shape still matches correctly.
      const real = `func TestReal(t *testing.T) {\n  t.Error("real")\n}`;
      const spans = findSpansForProfile(real, properProfile);
      expect(spans.length).toBe(1);
      expect(spans[0]!.hasAssertion).toBe(true);
    });
  });

  describe('indentation-delimited strategy primitive', () => {
    const indentProfile: LanguageProfile = {
      id: 'test-indent-fixture',
      extensions: ['.indent-fixture'],
      openerPattern: /def\s+test_\w+\s*\([^)]*\)\s*:/y,
      assertionPattern: /\bassert\b/,
      syntax: {
        comments: { line: ['#'] },
        strings: [{ open: '"""' }, { open: "'''" }, { open: '"' }, { open: "'" }],
      },
      strategy: 'indentation-delimited',
    };

    it('bounds the span to the indented function body and separates sibling functions', () => {
      const t = `def test_ok():\n    assert 1 == 1\n\ndef test_next():\n    pass\n`;
      const spans = findSpansForProfile(t, indentProfile);
      expect(spans.length).toBe(2);
      expect(spans[0]!.hasAssertion).toBe(true);
      expect(spans[1]!.hasAssertion).toBe(false);
    });

    it('treats a docstring-only assertion mention as non-asserting (string-aware masking)', () => {
      const t = `def test_doc():\n    """mentions assert but is a docstring"""\n    x = 1\n`;
      const spans = findSpansForProfile(t, indentProfile);
      expect(spans.length).toBe(1);
      expect(spans[0]!.hasAssertion).toBe(false);
    });
  });

  describe('do-end-keyword strategy primitive (no built-in consumer yet, but a real generic primitive)', () => {
    const keywordProfile: LanguageProfile = {
      id: 'test-doend-fixture',
      extensions: ['.doend-fixture'],
      openerPattern: /it\s+['"][^'"]*['"]\s+do\b/y,
      assertionPattern: /\bexpect\s*\(/,
      syntax: {
        comments: { line: ['#'] },
        strings: [{ open: "'" }, { open: '"' }],
      },
      strategy: 'do-end-keyword',
      keyword: {
        blockOpenKeywords: ['do', 'if', 'unless', 'while', 'until', 'def', 'case', 'begin'],
        endKeyword: 'end',
      },
      // Opt-in: this opener's own syntax requires matching through the
      // quoted title (`it 'title' do`) as structural content, not
      // incidental spoofable text — see LanguageProfile.openerMatchesStrings.
      openerMatchesStrings: true,
    };

    it('resolves nested do/if/end blocks generically to the matching end keyword (AC-1)', () => {
      const t =
        `it 'does AC-1 things' do\n` +
        `  if true\n` +
        `    expect(1).to eq(1)\n` +
        `  end\n` +
        `end\n` +
        `describe 'other' do\n` +
        `  puts 'noop'\n` +
        `end`;
      const spans = findSpansForProfile(t, keywordProfile);
      expect(spans.length).toBe(1);
      expect(spans[0]!.hasAssertion).toBe(true);
      const acIdx = t.indexOf('AC-1');
      expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
      expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
    });

    it('is string/comment aware: fake end/do keywords inside a string or comment do not affect depth', () => {
      const t = `it 'x' do\n  y = "end do end"\n  # end\n  expect(y).to be_truthy\nend`;
      const spans = findSpansForProfile(t, keywordProfile);
      expect(spans.length).toBe(1);
      expect(spans[0]!.hasAssertion).toBe(true);
    });

    it('yields zero spans (never a partial match) when the closing keyword never appears', () => {
      const t = `it 'unterminated' do\n  expect(1).to eq(1)\n`;
      const spans = findSpansForProfile(t, keywordProfile);
      expect(spans.length).toBe(0);
    });
  });

  describe('call-expression strategy primitive (js/ts parity edge)', () => {
    it('yields zero spans (never a partial match) when the call is never closed', () => {
      const t = `it('missing close', () => { expect(1).toBe(1);`;
      const spans = findSpansForProfile(t, jsTsProfile);
      expect(spans.length).toBe(0);
    });
  });
});
