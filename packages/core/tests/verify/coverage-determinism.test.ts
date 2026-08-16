import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanTestCoverage } from '../../src/verify/coverage.js';
import type { AcId, TestRef } from '../../src/verify/coverage.js';

// Phase 282-01, T2 (AC-2): cross-file walk-order determinism.
// `listAllFiles` (coverage.ts, near the bottom) walks the repo with a
// stack-based DFS (`stack.pop()`, LIFO) over plain `readdir()` results, with
// no sort at any point. Node's `readdir` order is not spec-guaranteed stable
// across repeated calls. `scanTestCoverage` iterates `listAllFiles`'s output
// in order and appends one `TestRef` per file to `out.get(id)` for any AC id
// with occurrences split across multiple files — so for an id occurring in
// files A and B, the ARRAY ORDER of `[refA, refB]` vs `[refB, refA]` can vary
// run-to-run depending on directory-walk order, even though file contents and
// the per-file dedup outcome (T1's fix) are fully deterministic. The fix is
// to sort `listAllFiles`'s returned array before returning it.

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups.length = 0;
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cadence-cov-determinism-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeTest(root: string, rel: string, body: string): Promise<void> {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

describe('scanTestCoverage cross-file walk-order determinism (282-01/AC-2)', () => {
  it('returns a deep-equal map, including array order, across 10 consecutive runs against an identical multi-file fixture (282-01/AC-2)', async () => {
    const root = tempRepo();

    // The same AC id (AC-2) has qualifying occurrences split across several
    // files in different subdirectories, so directory-walk order genuinely
    // has room to vary (pre-fix, `listAllFiles` is an unsorted LIFO-stack
    // `readdir` walk). A handful of sibling directories/files widen each
    // directory's `readdir()` result set, giving order more room to differ.
    await writeTest(
      root,
      'packages/alpha/nested/one.test.ts',
      `it('does the real qualifying work (AC-2)', () => { expect(1).toBe(1); });\n`,
    );
    await writeTest(
      root,
      'packages/beta/nested/two.test.ts',
      `it('does more qualifying work (AC-2)', () => { expect(2).toBe(2); });\n`,
    );
    await writeTest(
      root,
      'packages/gamma/nested/three.test.ts',
      `it('and a third occurrence (AC-2)', () => { expect(3).toBe(3); });\n`,
    );
    for (const letter of ['delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa']) {
      await writeTest(
        root,
        `packages/${letter}/nested/other.test.ts`,
        `it('unrelated, no AC token here', () => { expect(true).toBe(true); });\n`,
      );
    }

    const runs: Array<Map<AcId, TestRef[]>> = [];
    for (let i = 0; i < 10; i++) {
      runs.push(await scanTestCoverage(root, { mode: 'assertion' }));
    }

    // Sanity check first: the multi-file AC id actually has occurrences
    // split across more than one file, so array order genuinely had room to
    // vary — otherwise this test would pass vacuously.
    const first = runs[0]!;
    const ac2Refs = first.get('AC-2');
    expect(ac2Refs?.length).toBeGreaterThanOrEqual(2);

    // Pin the exact array order the post-fix (sorted) walk must produce.
    // This assertion is what actually gives the test teeth: a bare 10-run
    // deep-equal loop within a single process can pass vacuously even on
    // the pre-fix unsorted walk, because nothing mutates the directory
    // between calls — repeated readdir() calls against an unchanged
    // directory tend to return the same order every time regardless of
    // whether that order is sorted. Asserting the specific ascending order
    // fails pre-fix whenever the pre-fix LIFO-stack walk doesn't happen to
    // already produce ascending order (readdir order reversed by
    // `stack.pop()`), and passes post-fix by construction.
    expect((first.get('AC-2') ?? []).map((r) => r.file)).toEqual([
      'packages/alpha/nested/one.test.ts',
      'packages/beta/nested/two.test.ts',
      'packages/gamma/nested/three.test.ts',
    ]);

    // Do NOT sort/normalize before comparing — that would defeat the point
    // of the test. Every one of the 10 runs must be deep-equal to the
    // first, including array order within each AC id's ref list.
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(first);
    }
  });
});
