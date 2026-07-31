import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  scanTestCoverage,
  uncoveredAcs,
  tokenHasExpectedQualifier,
} from '../../src/verify/coverage.js';

// Phase 239 (T2): scanner support for the phase-qualified coverage scheme.
//
// FIXTURE TOKEN HYGIENE: fixture tokens for ACs this task does NOT own are
// built by concatenation (`q('AC-3')` → the prefix form for this phase) so
// this file's own source text never contains a contiguous qualified token
// for an AC it doesn't itself cover — keeping phase 239's own coverage
// attribution honest once the repo flips to the qualified scheme (T10).
// The only literal `239-01/AC-N` tokens in this file are this task's own AC
// references (AC-1, AC-6) inside asserting it() titles.

const QUAL = '239-01';
const FOREIGN = '211-01';
/** Build a this-phase qualified fixture token, e.g. `<QUAL>/AC-3`. */
const q = (ac: string): string => `${QUAL}/${ac}`;
/** Build a foreign-phase qualified fixture token, e.g. `<FOREIGN>/AC-3`. */
const f = (ac: string): string => `${FOREIGN}/${ac}`;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups.length = 0;
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cadence-cov-scheme-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeTest(root: string, rel: string, body: string): Promise<void> {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

describe('scanTestCoverage — bare scheme unchanged when expectedQualifier is absent', () => {
  it('239-01/AC-1: absent expectedQualifier leaves the mention-mode scan unchanged', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/a.test.ts',
      `// covers AC-3 and ${q('AC-3')}\nit('x', () => {});\n`,
    );
    const map = await scanTestCoverage(root);
    // Exact TestRef shape as today: per-file dedup, first line wins, no
    // qualifying/skipped flags in mention mode.
    expect(map.get('AC-3')).toEqual([
      {
        file: 'packages/x/a.test.ts',
        line: 1,
        snippet: `// covers AC-3 and ${q('AC-3')}`,
      },
    ]);
  });

  it('239-01/AC-1: absent expectedQualifier leaves the assertion-mode scan unchanged', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/b.test.ts',
      `it('does (AC-4)', () => { expect(1).toBe(1); });\n// stray AC-5 comment\n`,
    );
    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    expect(cov.get('AC-4')).toEqual([
      {
        file: 'packages/x/b.test.ts',
        line: 1,
        snippet: "it('does (AC-4)', () => { expect(1).toBe(1); });",
        qualifying: true,
        skipped: false,
      },
    ]);
    expect(cov.get('AC-5')?.[0]?.qualifying).toBe(false);
  });

  it('239-01/AC-1: a qualified token still counts as a bare ref when no qualifier is configured', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/c.test.ts',
      `it('${q('AC-3')} qualified fixture', () => { expect(1).toBe(1); });\n`,
    );
    const bareMention = await scanTestCoverage(root);
    expect(bareMention.get('AC-3')).toHaveLength(1);
    const bareAssertion = await scanTestCoverage(root, { mode: 'assertion' });
    expect(bareAssertion.get('AC-3')?.[0]?.qualifying).toBe(true);
    expect(uncoveredAcs(['AC-3'], bareMention)).toEqual([]);
  });
});

describe('scanTestCoverage — expectedQualifier filtering (phase-qualified scheme)', () => {
  it('239-01/AC-6: mention mode returns only prefixed occurrences under expectedQualifier', async () => {
    const root = tempRepo();
    await writeTest(root, 'packages/x/bare.test.ts', `// AC-3 bare mention\n`);
    await writeTest(root, 'packages/x/foreign.test.ts', `// ${f('AC-3')} foreign mention\n`);
    await writeTest(root, 'packages/x/qualified.test.ts', `// ${q('AC-3')} qualified mention\n`);
    const cov = await scanTestCoverage(root, { expectedQualifier: QUAL });
    const refs = cov.get('AC-3') ?? [];
    expect(refs.map((r) => r.file)).toEqual(['packages/x/qualified.test.ts']);
    // The map key stays the bare AC id — consumers keep addressing by AC-N.
    expect([...cov.keys()]).toEqual(['AC-3']);
    expect(uncoveredAcs(['AC-3'], cov)).toEqual([]);
  });

  it('239-01/AC-6: assertion mode returns only prefixed occurrences under expectedQualifier', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/bare.test.ts',
      `it('bare AC-3', () => { expect(1).toBe(1); });\n`,
    );
    await writeTest(
      root,
      'packages/x/foreign.test.ts',
      `it('${f('AC-3')}', () => { expect(1).toBe(1); });\n`,
    );
    await writeTest(
      root,
      'packages/x/qualified.test.ts',
      `it('${q('AC-3')}', () => { expect(1).toBe(1); });\n`,
    );
    const cov = await scanTestCoverage(root, {
      mode: 'assertion',
      expectedQualifier: QUAL,
    });
    const refs = cov.get('AC-3') ?? [];
    expect(refs.map((r) => r.file)).toEqual(['packages/x/qualified.test.ts']);
    expect(refs[0]?.qualifying).toBe(true);
  });

  it('239-01/AC-6: a bare token alone does not satisfy the qualifier (uncovered, both modes)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/bare.test.ts',
      `it('bare AC-3 only', () => { expect(1).toBe(1); });\n`,
    );
    const mention = await scanTestCoverage(root, { expectedQualifier: QUAL });
    expect(uncoveredAcs(['AC-3'], mention)).toEqual(['AC-3']);
    const assertion = await scanTestCoverage(root, {
      mode: 'assertion',
      expectedQualifier: QUAL,
    });
    expect(uncoveredAcs(['AC-3'], assertion)).toEqual(['AC-3']);
  });

  it('239-01/AC-6: a foreign-phase prefix alone does not satisfy the qualifier (uncovered, both modes)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/foreign.test.ts',
      `it('${f('AC-3')} foreign only', () => { expect(1).toBe(1); });\n`,
    );
    const mention = await scanTestCoverage(root, { expectedQualifier: QUAL });
    expect(uncoveredAcs(['AC-3'], mention)).toEqual(['AC-3']);
    const assertion = await scanTestCoverage(root, {
      mode: 'assertion',
      expectedQualifier: QUAL,
    });
    expect(uncoveredAcs(['AC-3'], assertion)).toEqual(['AC-3']);
  });

  it('239-01/AC-6: a bare occurrence earlier in the file does not shadow a later qualified one', async () => {
    const root = tempRepo();
    // The per-file dedup key is `${id}@${file}` — if filtering ran after the
    // dedup add, the line-1 bare occurrence would consume the slot and the
    // line-3 qualified one would be dropped. Guard both modes.
    await writeTest(
      root,
      'packages/x/order.test.ts',
      `// bare AC-3 mention first\n\nit('${q('AC-3')} qualified later', () => { expect(1).toBe(1); });\n`,
    );
    const mention = await scanTestCoverage(root, { expectedQualifier: QUAL });
    expect(mention.get('AC-3')?.[0]?.line).toBe(3);
    const assertion = await scanTestCoverage(root, {
      mode: 'assertion',
      expectedQualifier: QUAL,
    });
    expect(assertion.get('AC-3')?.[0]?.line).toBe(3);
    expect(assertion.get('AC-3')?.[0]?.qualifying).toBe(true);
  });
});

describe('tokenHasExpectedQualifier (pure) and the AC-6 lexing invariant', () => {
  it('239-01/AC-6: the prefix form keeps the embedded bare token lexable', async () => {
    // The whole point of the prefix (vs infix) design: an unqualified
    // scanner must still see the bare AC-3 inside a qualified token.
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/lex.test.ts',
      `it('${q('AC-3')} only qualified form present', () => { expect(1).toBe(1); });\n`,
    );
    const bareScan = await scanTestCoverage(root);
    // The bare scanner keys the ref under the embedded bare token.
    expect([...bareScan.keys()]).toEqual(['AC-3']);
    // And the pure helper agrees the same occurrence carries the qualifier.
    const text = q('AC-3');
    expect(tokenHasExpectedQualifier(text, text.indexOf('AC-3'), QUAL)).toBe(true);
  });

  it('239-01/AC-6: pure helper accepts only an exact immediately-preceding qualifier prefix', () => {
    const tok = q('AC-3'); // "<QUAL>/AC-3"
    const at = tok.indexOf('AC-3');
    expect(tokenHasExpectedQualifier(tok, at, QUAL)).toBe(true);
    // Foreign qualifier does not match.
    expect(tokenHasExpectedQualifier(tok, at, FOREIGN)).toBe(false);
    // Bare token at the start of the text: no room for any prefix.
    expect(tokenHasExpectedQualifier('AC-3', 0, QUAL)).toBe(false);
    // Bare token mid-text without the prefix.
    const bare = "it('bare AC-3', () => {});";
    expect(tokenHasExpectedQualifier(bare, bare.indexOf('AC-3'), QUAL)).toBe(false);
    // A longer id ending in the qualifier must not satisfy it: "1<QUAL>/AC-3".
    const longer = `1${q('AC-3')}`;
    expect(tokenHasExpectedQualifier(longer, longer.indexOf('AC-3'), QUAL)).toBe(false);
    // But ordinary punctuation/whitespace before the prefix is fine.
    const spaced = ` ${q('AC-3')}`;
    expect(tokenHasExpectedQualifier(spaced, spaced.indexOf('AC-3'), QUAL)).toBe(true);
    const quoted = `('${q('AC-3')}')`;
    expect(tokenHasExpectedQualifier(quoted, quoted.indexOf('AC-3'), QUAL)).toBe(true);
  });
});
