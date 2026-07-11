/**
 * Per-file profile dispatch in `scanTestCoverage` (phase 167, T6, AC-6).
 *
 * Before this task, `scanTestCoverage`'s assertion-mode path always called
 * `findTestSpans` (js/ts-only) regardless of a file's actual extension —
 * phase 166's diagnosed problem that "assertion mode is JS/TS-only" was
 * fixed inside the shared engine (T1-T5) but never reachable from the real
 * gate. T6 wires per-file dispatch by extension (`getProfileForExtension`,
 * `./coverage-profiles/registry.js`) into `scanTestCoverage` itself, so this
 * suite exercises the real gate/scan path end-to-end, not just the engine.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanTestCoverage, uncoveredAcs, weaklyLinkedAcs } from '../../src/verify/coverage.js';
import { runCoverageGate } from '../../src/gates/coverage.js';
import type { SettleContext } from '../../src/gates/types.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups.length = 0;
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cadence-cov-dispatch-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeTest(root: string, rel: string, body: string): Promise<void> {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

/**
 * Minimal `SettleContext` wired to a REAL `scanTestCoverage` over a real
 * temp repo (unlike `tests/gates/coverage.test.ts`'s own `ctx()` helper,
 * which injects a hand-built `Map` and never exercises per-file dispatch).
 * Needed to prove the glob-miss/span-miss diagnostic split (phase 166 T3)
 * still discriminates correctly now that assertion mode dispatches by
 * language instead of always scanning as js/ts.
 */
function realCtx(over: {
  cwd: string;
  globs: string[];
  acIds?: string[];
  errs?: string[];
}): SettleContext {
  const errs = over.errs ?? [];
  const acIds = over.acIds ?? ['AC-1'];
  const draft = {
    acceptanceCriteria: acIds.map((id) => ({ id, given: '', when: '', then: '' })),
    tasks: [],
  } as never;
  const config = {
    verification: { coverageMode: 'assertion', testGlobs: over.globs },
  } as never;
  return {
    cwd: over.cwd,
    state: {} as never,
    draft,
    progress: { draftId: 'd', tasks: {} },
    config,
    gateSet: { gates: ['test-coverage'], softCap: false },
    opts: {},
    explicitIds: new Set<string>(),
    touchedFiles: [],
    coverage: () => scanTestCoverage(over.cwd, { mode: 'assertion', globs: over.globs }),
    verifiers: { deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) } },
    emit: { anomalies: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('scanTestCoverage per-file profile dispatch (phase 167 T6, AC-6)', () => {
  it('a mixed-language repo scans each file with ITS OWN profile, not js/ts for all (AC-6)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'pkg/a.test.ts',
      "it('ts qualifies (AC-6)', () => { expect(1).toBe(1); });\n",
    );
    await writeTest(
      root,
      'pkg/foo_test.go',
      [
        'package pkg',
        '',
        'func TestFoo(t *testing.T) {',
        '\tx := 1 // AC-6',
        '\tif x != 1 {',
        '\t\tt.Errorf("bad")',
        '\t}',
        '}',
        '',
      ].join('\n'),
    );
    await writeTest(
      root,
      'pkg/test_bar.py',
      ['def test_bar():', '    y = 1  # AC-6', '    assert y == 1', ''].join('\n'),
    );

    const globs = ['**/*.test.ts', '**/*_test.go', '**/test_*.py'];
    const cov = await scanTestCoverage(root, { mode: 'assertion', globs });

    // All three files reference the SAME token via their OWN profile so a
    // js/ts-only fallback (the pre-T6 bug) would still have "worked" for
    // the .ts file but silently failed the .go/.py ones — asserting all
    // three qualify proves real per-file dispatch, not a lucky js/ts match.
    expect(uncoveredAcs(['AC-6'], cov)).toEqual([]);
    expect(weaklyLinkedAcs(['AC-6'], cov)).toEqual([]);
    const refs = cov.get('AC-6') ?? [];
    expect(refs.map((r) => r.file).sort()).toEqual([
      'pkg/a.test.ts',
      'pkg/foo_test.go',
      'pkg/test_bar.py',
    ]);
    for (const r of refs) {
      expect(r.qualifying).toBe(true);
    }
  });

  it('an unclaimed extension yields zero spans, never a js/ts-shaped fallback scan (AC-6)', async () => {
    const root = tempRepo();
    // Assertion-shaped Ruby/RSpec-style text: no built-in profile claims
    // `.rb`, so this must NOT be scanned as if it were js/ts even though
    // `it(...) do ... end` superficially resembles a js/ts `it(...)` call.
    await writeTest(
      root,
      'lib/thing_spec.rb',
      ["it 'does the thing (AC-6)' do", '  expect(1).to eq(1)', 'end', ''].join('\n'),
    );
    const globs = ['**/*.rb'];
    const cov = await scanTestCoverage(root, { mode: 'assertion', globs });

    // Mentioned (so not "absent"/uncovered)...
    expect(uncoveredAcs(['AC-6'], cov)).toEqual([]);
    // ...but zero spans were found (no profile claims `.rb`), so it is
    // weakly linked, never qualifying — the false-negative-over-false-
    // positive invariant (AC-6).
    expect(weaklyLinkedAcs(['AC-6'], cov)).toEqual(['AC-6']);
    const refs = cov.get('AC-6') ?? [];
    expect(refs).toHaveLength(1);
    expect(refs[0]?.qualifying).toBe(false);
  });

  it('glob-miss vs span-miss stays correctly distinguished for a non-js/ts language (phase 166 T3, AC-6)', async () => {
    // (a) glob-miss: globs match nothing at all.
    const emptyRoot = tempRepo();
    const globMissErrs: string[] = [];
    const globMissRes = await runCoverageGate(
      realCtx({ cwd: emptyRoot, globs: ['**/*_test.go'], errs: globMissErrs }),
    );
    expect(globMissRes.outcome).toBe('refuse');
    const globMissJoined = globMissErrs.join('');
    expect(globMissJoined).toContain('no test files matched configured globs');
    expect(globMissJoined).not.toContain('assertion-shaped span');

    // (b) span-miss: a real Go file matches the glob, mentions the AC, but
    // its enclosing test function never asserts — before T6 this file was
    // scanned with the js/ts profile (finding no `it()`/`test()` call at
    // all), which happened to also collapse to "no qualifying span"; T6
    // must keep it a genuine, profile-aware span-miss rather than an
    // accidental one.
    const spanMissRoot = tempRepo();
    await writeTest(
      spanMissRoot,
      'pkg/baz_test.go',
      [
        'package pkg',
        '',
        'func TestBaz(t *testing.T) {',
        '\t// AC-6 mentioned only, this function never asserts',
        '\tx := 1',
        '\t_ = x',
        '}',
        '',
      ].join('\n'),
    );
    const spanMissErrs: string[] = [];
    const spanMissRes = await runCoverageGate(
      realCtx({ cwd: spanMissRoot, globs: ['**/*_test.go'], acIds: ['AC-6'], errs: spanMissErrs }),
    );
    expect(spanMissRes.outcome).toBe('refuse');
    const spanMissJoined = spanMissErrs.join('');
    expect(spanMissJoined).toContain('assertion-shaped span');
    expect(spanMissJoined).not.toContain('no test files matched configured globs');
  });

  it('a real Go assertion is now reachable end-to-end through the real gate (AC-6)', async () => {
    // This is the actual proof that phase 166's diagnosed problem
    // ("assertion mode is JS/TS-only") is fixed by T6 specifically: a go
    // file with a genuine assertion, scanned through the REAL
    // `runCoverageGate` path (not a mocked coverage map), now passes.
    const root = tempRepo();
    await writeTest(
      root,
      'pkg/ok_test.go',
      [
        'package pkg',
        '',
        'func TestOk(t *testing.T) {',
        '\tx := 1 // AC-6',
        '\tif x != 1 {',
        '\t\tt.Fatalf("expected 1, got %d", x)',
        '\t}',
        '}',
        '',
      ].join('\n'),
    );
    const errs: string[] = [];
    const res = await runCoverageGate(
      realCtx({ cwd: root, globs: ['**/*_test.go'], acIds: ['AC-6'], errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });
});
