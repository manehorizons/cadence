import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { explainAcCoverage, scanTestCoverage } from '../../src/verify/coverage.js';
import { runCoverageGate } from '../../src/gates/coverage.js';
import type { SettleContext } from '../../src/gates/types.js';

// Phase 282-01, T3: `cadence verify coverage --explain AC-N` (`explainAcCoverage`)
// and the real settle-time `test-coverage` gate (`runCoverageGate`, which reads
// `scanTestCoverage`'s output through `uncoveredAcs`/`weaklyLinkedAcs`/
// `skippedOnlyLinkedAcs`) are two SEPARATE implementations of "does this AC have
// a qualifying test?". `explainAcCoverage` answers per-occurrence with no
// cross-occurrence dedup at all; the gate answers from `scanTestCoverage`'s
// per-file deduped `TestRef[]`. The documented historical divergence
// (rec-20260814-002) was exactly the T1 fixture shape — a `describe()` title
// mentioning an AC id ahead of a genuinely qualifying `it()` for the same id in
// the same file — where the gate refused while `--explain` reported SATISFIED,
// because the gate's per-file dedup slot kept the earlier `qualifying: false`
// occurrence.
//
// These tests pin the AGREEMENT RELATION itself (`explain.satisfied ===
// (gate.outcome === 'pass')`) across seven fixture shapes, plus the ground-truth
// verdict for each shape so the relation can never hold vacuously by both sides
// being wrong in the same direction.
//
// Scope note: only the BARE coverage scheme is exercised. Under
// `phase-qualified` the qualifier filter runs BEFORE the per-file dedup in both
// implementations (`coverage.ts`'s pre-dedup `tokenHasExpectedQualifier`
// filter), so that path cannot produce the dedup-ordering divergence this task
// reconciles; `coverage-explain-qualified.test.ts` and
// `tests/gates/coverage-qualified.test.ts` already cover it separately.
//
// Fixture tokens below are BARE `AC-N` ids. This repo runs
// `verification.coverageScheme: 'phase-qualified'`, so bare tokens in this
// file's own source are filtered out of its own coverage scan entirely and
// cannot become accidental evidence for any phase.

/**
 * ONE glob list, threaded through all three consumers that must agree on the
 * file set: `explainAcCoverage`'s `opts.globs`, the `scanTestCoverage` call
 * backing the gate's `ctx.coverage()` thunk, and
 * `ctx.config.verification.testGlobs` (which the gate's absent-branch
 * `anyTestFilesMatched` call reads independently). Desyncing any of the three
 * would compare verdicts over different file sets and make agreement
 * accidental.
 */
const GLOBS = ['**/*.test.ts'];

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups.length = 0;
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cadence-cov-agree-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeTest(root: string, rel: string, body: string): Promise<void> {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

interface Verdicts {
  /** `explainAcCoverage(...).satisfied` — the `--explain` path's own answer. */
  explainSatisfied: boolean;
  /** `runCoverageGate(...).outcome` — the real settle-time gate's answer. */
  gatePassed: boolean;
  /** Everything the gate wrote to stderr, joined. */
  gateStderr: string;
}

/**
 * Run BOTH implementations against the same fixture repo for the same AC id,
 * in assertion mode, over the same glob set.
 *
 * The gate is the real `runCoverageGate`, not a reimplementation: its
 * `ctx.coverage()` thunk is wired to a real `scanTestCoverage` call over the
 * fixture, exactly as `services/settle.ts` memoizes it in production, so the
 * gate's own `uncoveredAcs`/`weaklyLinkedAcs`/`skippedOnlyLinkedAcs` +
 * refusal-message logic all execute for real.
 */
async function bothVerdicts(root: string, acId: string): Promise<Verdicts> {
  const explain = await explainAcCoverage(root, acId, { mode: 'assertion', globs: GLOBS });

  const errs: string[] = [];
  const ctx = {
    cwd: root,
    state: {},
    draft: {
      acceptanceCriteria: [{ id: acId, given: '', when: '', then: '' }],
      tasks: [],
    },
    progress: { draftId: 'd', tasks: {} },
    config: { verification: { coverageMode: 'assertion', testGlobs: GLOBS } },
    gateSet: { gates: ['test-coverage'], softCap: false },
    opts: {},
    explicitIds: new Set<string>(),
    touchedFiles: [],
    coverage: async () => scanTestCoverage(root, { mode: 'assertion', globs: GLOBS }),
    verifiers: { deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) } },
    emit: { anomalies: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;

  const res = await runCoverageGate(ctx);
  return {
    explainSatisfied: explain.satisfied,
    gatePassed: res.outcome === 'pass',
    gateStderr: errs.join(''),
  };
}

describe('verify coverage --explain agrees with the real test-coverage gate (282-01/AC-3)', () => {
  it('agrees (both SATISFIED) on the historical divergence shape: a describe() title mention precedes a qualifying it() for the same id in the same file (282-01/AC-3)', async () => {
    const root = tempRepo();
    // rec-20260814-002's exact reported shape: the non-qualifying describe()
    // title occurrence comes FIRST, the genuinely qualifying it() second.
    await writeTest(
      root,
      'divergence.test.ts',
      [
        `describe('mentions AC-1 in the title only', () => {`,
        `  it('unrelated inner test', () => { const x = 1; });`,
        `});`,
        ``,
        `it('does the real qualifying work (AC-1)', () => { expect(2).toBe(2); });`,
        ``,
      ].join('\n'),
    );

    const v = await bothVerdicts(root, 'AC-1');

    // The agreement relation itself — this is what AC-3 asks for.
    expect(v.explainSatisfied).toBe(v.gatePassed);
    // ...and the ground truth, so the relation can't hold by both being wrong.
    expect(v.explainSatisfied).toBe(true);
    expect(v.gateStderr).toBe('');
  });

  it('agrees (both SATISFIED) on an unambiguously covered AC: one qualifying it() and nothing else (282-01/AC-3)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'clean.test.ts',
      `it('covers AC-1 cleanly', () => { expect(1).toBe(1); });\n`,
    );

    const v = await bothVerdicts(root, 'AC-1');

    expect(v.explainSatisfied).toBe(v.gatePassed);
    expect(v.explainSatisfied).toBe(true);
    expect(v.gateStderr).toBe('');
  });

  it('agrees (both UNSATISFIED) on a genuinely uncovered AC — matching test files exist, they just never reference the id (282-01/AC-3)', async () => {
    const root = tempRepo();
    // A glob-matching test file IS present (so this is "genuinely uncovered
    // AC", not "empty repo / glob misconfiguration"), it just covers a
    // different id.
    await writeTest(
      root,
      'other.test.ts',
      `it('covers AC-2 only', () => { expect(1).toBe(1); });\n`,
    );

    const v = await bothVerdicts(root, 'AC-1');

    expect(v.explainSatisfied).toBe(v.gatePassed);
    expect(v.explainSatisfied).toBe(false);
    expect(v.gateStderr).toContain('has no linked test');
  });

  it('agrees (both UNSATISFIED) on a weak link: the id appears only in a comment and a describe() title, never inside an asserting block (282-01/AC-3)', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'weak.test.ts',
      [
        `// AC-1 is only discussed here, in a comment.`,
        `describe('AC-1 talk, no assertion referencing it', () => {`,
        `  it('asserts something unrelated', () => { expect(1).toBe(1); });`,
        `});`,
        ``,
      ].join('\n'),
    );

    const v = await bothVerdicts(root, 'AC-1');

    expect(v.explainSatisfied).toBe(v.gatePassed);
    expect(v.explainSatisfied).toBe(false);
    expect(v.gateStderr).toContain('not inside a recognized asserting test block');
  });

  it('agrees (both UNSATISFIED) on the skip dodge: the only referencing block is it.skip() (282-01/AC-3)', async () => {
    const root = tempRepo();
    // Highest-value non-coincidental check: the two implementations reach this
    // verdict through visibly different code — the gate via
    // `skippedOnlyLinkedAcs` over deduped refs, `--explain` via its own
    // per-occurrence `span.skipped` branch.
    await writeTest(
      root,
      'skipped.test.ts',
      `it.skip('covers AC-1 but is skipped', () => { expect(1).toBe(1); });\n`,
    );

    const v = await bothVerdicts(root, 'AC-1');

    expect(v.explainSatisfied).toBe(v.gatePassed);
    expect(v.explainSatisfied).toBe(false);
    expect(v.gateStderr).toContain('only linked test is skipped');
  });

  it('agrees (both UNSATISFIED) when the referencing block is nested inside a skipped outer block — the one structural asymmetry between the two implementations (282-01/AC-3)', async () => {
    const root = tempRepo();
    // The sharpest adversarial shape for this reconciliation: `scanTestCoverage`
    // computes `qualifying` with `spans.some(s => s.hasAssertion && !s.skipped
    // && contains)` — ANY containing span — while `explainAcCoverage` uses
    // `spans.find(s => contains)` — the FIRST containing span — and then reads
    // that one span's flags. Those two differ only if spans can nest, and they
    // cannot: `coverage-profiles/engine.ts` advances `i = block.end + 1` after
    // each resolved block, so a resolved span swallows every opener inside it
    // and the span list is non-overlapping. This fixture pins that invariant:
    // the inner asserting `it()` never becomes its own span, so both
    // implementations see exactly one containing span (the skipped outer) and
    // both correctly refuse — an assertion that never runs is not coverage.
    await writeTest(
      root,
      'nested.test.ts',
      [
        `it.skip('outer skipped wrapper', () => {`,
        `  it('inner asserting block naming AC-1', () => { expect(1).toBe(1); });`,
        `});`,
        ``,
      ].join('\n'),
    );

    const v = await bothVerdicts(root, 'AC-1');

    expect(v.explainSatisfied).toBe(v.gatePassed);
    expect(v.explainSatisfied).toBe(false);
  });

  it('agrees (both SATISFIED) when the non-qualifying mention and the qualifying it() are split across two files (282-01/AC-3)', async () => {
    const root = tempRepo();
    // Cross-file variant of the divergence shape: the per-file dedup slot in
    // `alpha` can only ever hold a non-qualifying ref, so agreement here
    // depends on the gate's whole-list `isFullyNonQualifying` check seeing
    // `beta`'s qualifying ref — a different code path from the single-file
    // case above.
    await writeTest(
      root,
      'alpha.test.ts',
      [
        `describe('mentions AC-1 in the title only', () => {`,
        `  it('unrelated inner test', () => { const x = 1; });`,
        `});`,
        ``,
      ].join('\n'),
    );
    await writeTest(
      root,
      'beta.test.ts',
      `it('covers AC-1 for real', () => { expect(1).toBe(1); });\n`,
    );

    const v = await bothVerdicts(root, 'AC-1');

    expect(v.explainSatisfied).toBe(v.gatePassed);
    expect(v.explainSatisfied).toBe(true);
    expect(v.gateStderr).toBe('');
  });
});
