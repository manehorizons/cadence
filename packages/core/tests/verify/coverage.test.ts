import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanTestCoverage, uncoveredAcs } from '../../src/verify/coverage.js';

// AC-1: single test names one AC; coverage map contains it
// AC-1: single test names two ACs; both appear in coverage
// AC-1: multiple tests share one AC; coverage[AC] has two entries
// AC-1: no AC tokens anywhere → empty map
// AC-3: custom globs override defaults
// AC-2 (uncoveredAcs helper): returns AC ids with zero matches

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups.length = 0;
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cadence-cov-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeTest(root: string, relPath: string, body: string): Promise<void> {
  const abs = join(root, relPath);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

describe('scanTestCoverage', () => {
  it('collects a single AC token from a test file (AC-1)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/core/tests/foo.test.ts',
      "describe('AC-1: greeting', () => { it('emits hi', () => {}); });\n",
    );
    const map = await scanTestCoverage(root);
    expect(map.get('AC-1')).toHaveLength(1);
    expect(map.get('AC-1')?.[0]?.file).toBe('packages/core/tests/foo.test.ts');
    expect(map.get('AC-1')?.[0]?.line).toBe(1);
  });

  it('handles a test that names two ACs (AC-1)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/core/tests/bar.test.ts',
      "// covers AC-1 and AC-2\ndescribe('combined', () => {});\n",
    );
    const map = await scanTestCoverage(root);
    expect(map.get('AC-1')).toHaveLength(1);
    expect(map.get('AC-2')).toHaveLength(1);
  });

  it('deduplicates within a file but accumulates across files (AC-1)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/core/tests/a.test.ts',
      "describe('AC-3 path one', () => {});\nit('AC-3 also here', () => {});\n",
    );
    await writeTest(
      root,
      'packages/core/tests/b.test.ts',
      "describe('AC-3 path two', () => {});\n",
    );
    const map = await scanTestCoverage(root);
    // Each file contributes at most one ref per AC (deduped per-file). The
    // first matching line wins for the snippet/line number.
    const refs = map.get('AC-3') ?? [];
    expect(refs.map((r) => r.file).sort()).toEqual([
      'packages/core/tests/a.test.ts',
      'packages/core/tests/b.test.ts',
    ]);
    const a = refs.find((r) => r.file.endsWith('a.test.ts'))!;
    expect(a.line).toBe(1);
  });

  it('returns an empty map when no AC tokens appear (AC-1)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/core/tests/no-ac.test.ts',
      "describe('plain', () => { it('does nothing', () => {}); });\n",
    );
    const map = await scanTestCoverage(root);
    expect(map.size).toBe(0);
  });

  it('honors custom globs (AC-3 — config overridability surface)', async () => {
    const root = tempRepo();
    // Default glob expects packages/**; place a file outside that path.
    await writeTest(
      root,
      'apps/api/__tests__/auth.spec.ts',
      "describe('AC-7: auth', () => {});\n",
    );
    const defaultMap = await scanTestCoverage(root);
    expect(defaultMap.size).toBe(0);
    const customMap = await scanTestCoverage(root, {
      globs: ['apps/**/*.spec.ts'],
    });
    expect(customMap.get('AC-7')).toHaveLength(1);
  });

  it('uncoveredAcs returns AC ids with zero matches (AC-2)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'packages/core/tests/x.test.ts',
      "describe('AC-1', () => {});\n",
    );
    const map = await scanTestCoverage(root);
    expect(uncoveredAcs(['AC-1', 'AC-2', 'AC-3'], map)).toEqual(['AC-2', 'AC-3']);
  });

  it('uncoveredAcs returns all ids when coverage map is empty (AC-2)', async () => {
    expect(uncoveredAcs(['AC-1', 'AC-2'], new Map())).toEqual(['AC-1', 'AC-2']);
  });

  it('tolerates missing repo root (AC-1)', async () => {
    const map = await scanTestCoverage(join(tmpdir(), 'definitely-not-a-repo-xyz'));
    expect(map.size).toBe(0);
  });
});
