import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanTestCoverage, uncoveredAcs, weaklyLinkedAcs } from '../../src/verify/coverage.js';

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

  it('mention mode is unchanged: a comment-only AC counts (AC-4 regression)', async () => {
    const root = tempRepo();
    await writeTest(root, 'packages/x/d.test.ts', `// AC-1\nit('x', () => { const y = 1; });`);
    const covMention = await scanTestCoverage(root, { mode: 'mention' });
    expect(uncoveredAcs(['AC-1'], covMention)).toEqual([]);
    const covDefault = await scanTestCoverage(root);
    expect(uncoveredAcs(['AC-1'], covDefault)).toEqual([]);
  });
});
