import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanTestCoverage } from '../../src/verify/coverage.js';

// Phase 282-01, T1 (AC-1): per-file dedup ordering. `scanTestCoverage`'s
// assertion-mode branch dedupes AC-token occurrences per file with a `seen`
// Set keyed by `${id}@${relPath}` — but historically `seen.add(key)` ran on
// the FIRST regex match in the file, before `qualifying`/`skipped` were even
// computed for that match. So a non-qualifying occurrence (e.g. a
// `describe()` title mentioning the AC id, which sits outside any
// `it()`/`test()` span) claims the per-file slot ahead of a genuinely
// qualifying `it()`/`test()` occurrence appearing later in the same file,
// and the qualifying one is silently discarded. D-O, option 1: a later
// qualifying occurrence must displace an earlier non-qualifying one for the
// same (id, file) slot.

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups.length = 0;
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cadence-cov-dedup-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeTest(root: string, rel: string, body: string): Promise<void> {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

describe('scanTestCoverage per-file dedup ordering (282-01/AC-1)', () => {
  it('a later qualifying it()/test() occurrence displaces an earlier non-qualifying describe()-title mention for the same (id, file) slot (282-01/AC-1)', async () => {
    const root = tempRepo();
    // The `describe()` title mentions AC-1 first (non-qualifying — no
    // `it`/`test` opener wraps that text, so it falls outside every span).
    // A genuinely qualifying `it()` occurrence of the same AC-1 id follows
    // later in the same file.
    await writeTest(
      root,
      'packages/x/dedup-order.test.ts',
      [
        `describe('mentions AC-1 in the title only', () => {`,
        `  it('unrelated inner test', () => { const x = 1; });`,
        `});`,
        ``,
        `it('does the real qualifying work (AC-1)', () => { expect(2).toBe(2); });`,
        ``,
      ].join('\n'),
    );

    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    const refs = cov.get('AC-1') ?? [];

    // The per-file dedup collapses same-file occurrences of the same id
    // into one slot — assert that slot recorded the qualifying occurrence,
    // not the earlier non-qualifying describe()-title mention.
    expect(refs).toHaveLength(1);
    expect(refs[0]?.qualifying).toBe(true);
  });

  // Reverse-direction pin: nothing about the fix should let a LATER
  // non-qualifying occurrence clobber an EARLIER qualifying one for the same
  // (id, file) slot — only a non-qualifying → qualifying replacement is
  // allowed. Existing fixtures in coverage-assertion.test.ts can't exercise
  // this because they deliberately split mixed-qualifying refs across
  // separate files (the per-file dedup key includes the path); this fixture
  // puts both occurrences in the SAME file, qualifying first.
  it('an earlier qualifying it()/test() occurrence is NOT displaced by a later non-qualifying describe()-title mention for the same (id, file) slot (282-01/AC-1)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/x/dedup-order-reverse.test.ts',
      [
        `it('does the real qualifying work (AC-1)', () => { expect(2).toBe(2); });`,
        ``,
        `describe('mentions AC-1 in the title only, after the real test', () => {`,
        `  it('unrelated inner test', () => { const x = 1; });`,
        `});`,
        ``,
      ].join('\n'),
    );

    const cov = await scanTestCoverage(root, { mode: 'assertion' });
    const refs = cov.get('AC-1') ?? [];

    expect(refs).toHaveLength(1);
    expect(refs[0]?.qualifying).toBe(true);
  });
});
