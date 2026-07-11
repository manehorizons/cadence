import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  scanTestCoverage,
  uncoveredAcs,
  weaklyLinkedAcs,
  skippedOnlyLinkedAcs,
} from '../../src/verify/coverage.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups) await c(); cleanups.length = 0; });

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cadence-cov-asrt-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function writeTest(root: string, rel: string, body: string): Promise<void> {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

describe('scanTestCoverage assertion mode (phase 108)', () => {
  it('AC inside an asserting it() is qualifying (AC-3)', async () => {
    const root = tempRepo();
    await writeTest(root, 'packages/x/a.test.ts', `it('does (AC-1)', () => { expect(1).toBe(1); });`);
    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    expect(uncoveredAcs(['AC-1'], cov)).toEqual([]);
    expect(weaklyLinkedAcs(['AC-1'], cov)).toEqual([]);
  });

  it('AC only in a comment is weakly linked, not covered (AC-3)', async () => {
    const root = tempRepo();
    await writeTest(root, 'packages/x/b.test.ts', `// AC-1 here\nit('x', () => { expect(1).toBe(1); });`);
    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    // It has a (mention-only) ref, so it is not "uncovered"...
    expect(uncoveredAcs(['AC-1'], cov)).toEqual([]);
    // ...but it is weakly linked (no qualifying ref).
    expect(weaklyLinkedAcs(['AC-1'], cov)).toEqual(['AC-1']);
  });

  it('AC nowhere is uncovered (AC-3)', async () => {
    const root = tempRepo();
    await writeTest(root, 'packages/x/c.test.ts', `it('x', () => { expect(1).toBe(1); });`);
    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    expect(uncoveredAcs(['AC-1'], cov)).toEqual(['AC-1']);
  });

  // Phase 169 T1 (red): the live-verified skip dodge. A test.skip(...) block
  // with an intact assertion inside is wrongly treated as `qualifying: true`
  // by the real scanner today (this is exactly why `cadence settle run
  // --auto` settles clean, exit 0, on a settled-but-skipped test in the
  // wild). Fixed in T3 (coverage.ts classifies against hasAssertion &&
  // !skipped, once T2 adds `skipped` to TestSpan).
  it('a skipped test with an intact assertion is NOT qualifying (AC-1 red, phase 169)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/e.test.ts',
      `test.skip('AC-1: dodge', () => { assert.equal(1, 1); });`,
    );
    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    expect(cov.get('AC-1')?.[0]?.qualifying).toBe(false);
  });

  it('mention mode is unchanged: a comment-only AC counts (AC-4 regression)', async () => {
    const root = tempRepo();
    await writeTest(root, 'packages/x/d.test.ts', `// AC-1\nit('x', () => { const y = 1; });`);
    const covMention = await scanTestCoverage(root, { mode: 'mention' });
    expect(uncoveredAcs(['AC-1'], covMention)).toEqual([]);
    const covDefault = await scanTestCoverage(root);
    expect(uncoveredAcs(['AC-1'], covDefault)).toEqual([]);
  });

  // Phase 169 (T5): the real scanner's skip-only classification, exercised
  // end-to-end (not via a literal fed Map as the gate tests do).
  it('a skip-only-linked AC via the real scanner lands in skippedOnlyLinkedAcs, not weaklyLinkedAcs (phase 169)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/f.test.ts',
      `test.skip('AC-1: dodge', () => { assert.equal(1, 1); });`,
    );
    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    expect(uncoveredAcs(['AC-1'], cov)).toEqual([]);
    expect(skippedOnlyLinkedAcs(['AC-1'], cov)).toEqual(['AC-1']);
    expect(weaklyLinkedAcs(['AC-1'], cov)).toEqual([]);
  });

  // Phase 169 (T5): mixed-pass. A skip-caused ref (file A) and a qualifying
  // ref (file B) for the SAME AC id — the qualifying ref anywhere wins, so
  // the AC is fully covered and lands in none of the three "problem"
  // buckets. Refs must live in different files: `scanTestCoverage` dedupes
  // by `${acId}@${relativeFilePath}`, so two refs to AC-1 in the same file
  // would silently collapse to one and this test would not exercise the
  // multi-ref logic it claims to.
  it('mixed-pass: a skip-caused ref plus a qualifying ref for the same AC id is fully covered (phase 169)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/mixed-pass-a.test.ts',
      `test.skip('AC-1: dodge', () => { assert.equal(1, 1); });`,
    );
    await writeTest(
      root,
      'packages/x/mixed-pass-b.test.ts',
      `it('does (AC-1)', () => { expect(1).toBe(1); });`,
    );
    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    expect(uncoveredAcs(['AC-1'], cov)).toEqual([]);
    expect(weaklyLinkedAcs(['AC-1'], cov)).toEqual([]);
    expect(skippedOnlyLinkedAcs(['AC-1'], cov)).toEqual([]);
  });

  // Phase 169 (T5): mixed-weak. A skip-caused ref (file A) and a bare
  // comment mention with NO containing span at all (file B) for the same AC
  // id. Per the skippedOnlyLinkedAcs contract, EVERY non-qualifying ref must
  // be skip-caused for the skip-only bucket to apply — the bare-comment ref
  // here is not skip-caused, so the AC stays in weaklyLinkedAcs instead.
  it('mixed-weak: a skip-caused ref plus a bare comment-mention ref for the same AC id stays weakly linked (phase 169)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/mixed-weak-a.test.ts',
      `test.skip('AC-1: dodge', () => { assert.equal(1, 1); });`,
    );
    await writeTest(
      root,
      'packages/x/mixed-weak-b.test.ts',
      `// AC-1 mention only\nit('other thing', () => { expect(2).toBe(2); });`,
    );
    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    expect(uncoveredAcs(['AC-1'], cov)).toEqual([]);
    expect(weaklyLinkedAcs(['AC-1'], cov)).toEqual(['AC-1']);
    expect(skippedOnlyLinkedAcs(['AC-1'], cov)).toEqual([]);
  });

  // Phase 169 (T5): `test.todo('AC-1: something')` with no callback argument
  // at all must still count as a linked (skip-caused, non-qualifying) ref —
  // not disappear from `uncoveredAcs`' complement into the void. See
  // test-spans.test.ts for the span-level proof of why a real span still
  // forms here.
  it('test.todo with no callback argument still counts as a skip-caused ref, not uncovered (phase 169)', async () => {
    const root = tempRepo();
    await writeTest(root, 'packages/x/todo-only.test.ts', `test.todo('AC-1: something');`);
    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    expect(uncoveredAcs(['AC-1'], cov)).toEqual([]);
    expect(skippedOnlyLinkedAcs(['AC-1'], cov)).toEqual(['AC-1']);
    expect(weaklyLinkedAcs(['AC-1'], cov)).toEqual([]);
  });

  // Phase 169 (T5): mention mode is unaffected by any of this — the exact
  // same file content that produces a skip-only result in assertion mode is
  // simply "covered" in mention mode (whole-file token search, no span
  // awareness at all). `weaklyLinkedAcs`/`skippedOnlyLinkedAcs` are
  // documented as empty in mention mode; confirm that with a real scan
  // rather than just trusting the doc comment.
  it('mention mode shows the same skip-only file content as simply covered (phase 169)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/mention-skip.test.ts',
      `test.skip('AC-1: dodge', () => { assert.equal(1, 1); });`,
    );
    const cov = await scanTestCoverage(root, { mode: 'mention' });
    expect(uncoveredAcs(['AC-1'], cov)).toEqual([]);
    expect(weaklyLinkedAcs(['AC-1'], cov)).toEqual([]);
    expect(skippedOnlyLinkedAcs(['AC-1'], cov)).toEqual([]);
  });
});
