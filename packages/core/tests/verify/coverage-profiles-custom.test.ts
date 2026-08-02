/**
 * `verification.coverageProfiles` compile/merge/scan behavior (phase 167,
 * T7, AC-7) — the pieces `packages/core/tests/config/coverage-profiles.test.ts`
 * doesn't cover: `compileCustomProfile`'s span-finding correctness via the
 * shared engine, `mergeCustomProfiles`'s cross-entry independence, and a
 * genuine Ruby-style `do-end-keyword` fixture proving the keyword strategy
 * (which ships in `./strategies.ts` with no built-in consumer) is usable
 * end-to-end through the real config → registry → engine path, not just
 * T1's own ad-hoc unit fixture.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { defaultConfig } from '@thomas-powers-jr/cadence-types';
import type { CoverageProfileConfig } from '@thomas-powers-jr/cadence-types';
import { loadConfig } from '../../src/config/loader.js';
import { scanTestCoverage, uncoveredAcs, weaklyLinkedAcs } from '../../src/verify/coverage.js';
import { mergeCustomProfiles, getProfileForExtension } from '../../src/verify/coverage-profiles/registry.js';
import { compileCustomProfile } from '../../src/verify/coverage-profiles/custom.js';
import { findSpansForProfile } from '../../src/verify/coverage-profiles/engine.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

/** Ruby-style RSpec `it 'title' do ... end` custom-profile config (AC-7's
 * required do-end-keyword fixture). `openerMatchesStrings: true` because the
 * opener's own syntax legitimately spans the quoted title, mirroring
 * `LanguageProfile.openerMatchesStrings`'s documented motivating case. */
const RUBY_PROFILE_CONFIG: CoverageProfileConfig = {
  id: 'ruby-rspec',
  extensions: ['.rb'],
  openerPattern: String.raw`\bit\s+'[^']*'\s+do\b`,
  assertionPattern: String.raw`\bexpect\s*\(`,
  strategy: 'do-end-keyword',
  keyword: { blockOpenKeywords: ['do'], endKeyword: 'end' },
  openerMatchesStrings: true,
  syntax: {
    comments: { line: ['#'], block: [] },
    strings: [{ open: "'" }, { open: '"' }],
  },
};

/**
 * Three `it '...' do ... end` blocks:
 *  1. A real assertion — must yield `hasAssertion: true`.
 *  2. An `expect(...)` that only exists inside a `#` comment — must yield
 *     `hasAssertion: false` (comment masking genuinely wired through).
 *  3. An `expect(...)` AND a full decoy `it 'decoy' do ... end` opener shape
 *     that only exist inside a string literal — must yield
 *     `hasAssertion: false` and must NOT fabricate a fourth span from the
 *     decoy opener text (string masking genuinely wired through, both for
 *     assertion-pattern testing and for opener/keyword-boundary scanning).
 */
const RUBY_SOURCE = [
  "it 'AC-7 real assertion' do",
  '  x = 1',
  '  expect(x).to eq(1)',
  'end',
  '',
  "it 'AC-7 fake assertion only in a comment' do",
  '  y = 2',
  '  # expect(y).to eq(2) -- commented out, must not count',
  'end',
  '',
  "it 'AC-7 fake assertion and fake opener only in a string' do",
  '  msg = "it \'decoy\' do expect(9).to eq(9) end -- none of this is real code"',
  '  z = 3',
  'end',
  '',
].join('\n');

describe('custom coverage profiles: compile + scan (phase 167 T7, AC-7)', () => {
  it('AC-7: a valid Ruby do-end-keyword custom profile compiles and yields a real qualifying span for a genuine asserting block', () => {
    const profile = compileCustomProfile(RUBY_PROFILE_CONFIG);
    const spans = findSpansForProfile(RUBY_SOURCE, profile);

    expect(spans).toHaveLength(3);
    expect(spans[0]?.hasAssertion).toBe(true);
    expect(spans[1]?.hasAssertion).toBe(false);
    expect(spans[2]?.hasAssertion).toBe(false);

    // The real assertion's span must actually bound the real `it` block —
    // the literal "AC-7 real assertion" title text falls inside it.
    const titleIdx = RUBY_SOURCE.indexOf('AC-7 real assertion');
    expect(spans[0]!.start).toBeLessThanOrEqual(titleIdx);
    expect(spans[0]!.end).toBeGreaterThan(RUBY_SOURCE.indexOf('expect(x).to eq(1)'));
  });

  it('AC-7: comment masking is genuinely wired through — a fake expect() in a comment never counts as an assertion', () => {
    const profile = compileCustomProfile(RUBY_PROFILE_CONFIG);
    const spans = findSpansForProfile(RUBY_SOURCE, profile);
    // Span index 1 is the "fake assertion only in a comment" block.
    expect(spans[1]?.hasAssertion).toBe(false);
  });

  it('AC-7: string masking is genuinely wired through — a fake expect() AND a fake full opener embedded in a string never count, and never fabricate an extra span', () => {
    const profile = compileCustomProfile(RUBY_PROFILE_CONFIG);
    const spans = findSpansForProfile(RUBY_SOURCE, profile);
    // Exactly 3 real openers in the source; the decoy "it 'decoy' do ... end"
    // sitting entirely inside a string literal must not produce a 4th span.
    expect(spans).toHaveLength(3);
    expect(spans[2]?.hasAssertion).toBe(false);
  });

  it('AC-7: an invalid regex string throws ConfigInvalidError naming the profile id and field (unit-level, mirrors the load-time test)', () => {
    expect(() =>
      compileCustomProfile({ ...RUBY_PROFILE_CONFIG, id: 'bad', openerPattern: '(unclosed[' }),
    ).toThrow(/bad/);
  });

  it('AC-7: a do-end-keyword profile missing keyword config throws, naming the profile', () => {
    const { keyword: _drop, ...withoutKeyword } = RUBY_PROFILE_CONFIG;
    expect(() => compileCustomProfile({ ...withoutKeyword, id: 'no-kw' })).toThrow(/no-kw/);
  });

  it('AC-7: two valid custom profiles for two different unclaimed extensions both load and work independently (no cross-contamination)', () => {
    const langA: CoverageProfileConfig = {
      id: 'lang-a',
      extensions: ['.langa-t7'],
      openerPattern: String.raw`\bcheck\s*\(`,
      assertionPattern: String.raw`\bverify\s*\(`,
      strategy: 'call-expression',
      syntax: { comments: { line: ['//'], block: [] }, strings: [{ open: '"' }] },
    };
    const langB: CoverageProfileConfig = {
      id: 'lang-b',
      extensions: ['.langb-t7'],
      openerPattern: String.raw`\bscenario\s*\(`,
      assertionPattern: String.raw`\bmust\s*\(`,
      strategy: 'call-expression',
      syntax: { comments: { line: ['#'], block: [] }, strings: [{ open: "'" }] },
    };
    mergeCustomProfiles([langA, langB]);

    const profileA = getProfileForExtension('.langa-t7');
    const profileB = getProfileForExtension('.langb-t7');
    expect(profileA?.id).toBe('lang-a');
    expect(profileB?.id).toBe('lang-b');

    // `call-expression` bounds the span to the opener's OWN parens (mirrors
    // js/ts: `it('x', () => { expect(...) })` nests its assertion inside
    // `it(`'s own closing paren) — so each fixture nests its assertion call
    // inside the opener's own parens, not in a trailing `{}` block.
    const sourceA = 'check(AC-7, verify(1))';
    const spansA = findSpansForProfile(sourceA, profileA!);
    expect(spansA).toHaveLength(1);
    expect(spansA[0]?.hasAssertion).toBe(true);

    const sourceB = 'scenario(AC-7, must(1))';
    const spansB = findSpansForProfile(sourceB, profileB!);
    expect(spansB).toHaveLength(1);
    expect(spansB[0]?.hasAssertion).toBe(true);

    // Cross-contamination check: profile A's assertion pattern (verify()) must
    // never match against language B's source, and vice versa.
    const spansA_scanningB = findSpansForProfile(sourceB, profileA!);
    expect(spansA_scanningB).toHaveLength(0);
    const spansB_scanningA = findSpansForProfile(sourceA, profileB!);
    expect(spansB_scanningA).toHaveLength(0);
  });
});

describe('custom coverage profiles: real end-to-end via loadConfig + scanTestCoverage (phase 167 T7, AC-7)', () => {
  it('AC-7: a Ruby .rb file, unsupported by any built-in profile, yields a qualifying span through the real config → registry → gate scan path', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(
      join(active.root, '.cadence/config.json'),
      JSON.stringify({
        ...defaultConfig,
        verification: {
          testGlobs: ['**/*_spec.rb'],
          coverageMode: 'assertion',
          coverageProfiles: [RUBY_PROFILE_CONFIG],
        },
      }),
    );
    // Loading config is what validates + registers the custom profile
    // (AC-7's "config is loaded" clause) — must happen before the scan.
    const cfg = await loadConfig(active.root);
    expect(cfg.verification.coverageProfiles).toHaveLength(1);

    await mkdir(join(active.root, 'spec'), { recursive: true });
    await writeFile(join(active.root, 'spec/thing_spec.rb'), RUBY_SOURCE, 'utf8');

    const cov = await scanTestCoverage(active.root, {
      mode: 'assertion',
      globs: cfg.verification.testGlobs,
    });

    expect(uncoveredAcs(['AC-7'], cov)).toEqual([]);
    expect(weaklyLinkedAcs(['AC-7'], cov)).toEqual([]);
    const refs = cov.get('AC-7') ?? [];
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((r) => r.qualifying === true)).toBe(true);
  });
});
