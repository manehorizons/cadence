import { describe, it, expect } from 'vitest';
import type { Draft } from '@thomas-powers-jr/cadence-types';
import { runCodeReviewGate } from '../../src/gates/code-review.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { CodeReviewResult, Finding } from '../../src/verify/code-review.js';

/**
 * Phase 235 T4 — criteria-gap findings. A finding on diff work no
 * acceptance criterion or boundary covers must surface anchored at
 * `{ kind: 'none', tier: 'undeclared' }` — the criteria-gap signal — and be
 * distinguishable in the result from an ordinary anchored finding. Per
 * `dec-20260729-005` (D2, no second refusal primitive): a gap finding is
 * emitted into the SAME finding stream `runCodeReviewGate` already refuses
 * on, so a HIGH-severity gap refuses through the pre-existing
 * `collectHighFindings`/`pass = highs.length === 0` path with zero new
 * refusal machinery. D3: gap count + severity distribution are declared
 * unconditionally, on both pass and refuse.
 */

const DRAFT: Draft = {
  schemaVersion: 1,
  id: '235-01',
  phase: '235-criteria-anchored-review-input',
  tier: 'standard',
  title: 'criteria-anchored review verifier',
  objective: 'criteria-gap findings',
  acceptanceCriteria: [
    {
      id: 'AC-1',
      name: 'covered work',
      given: 'a precondition',
      when: 'an action occurs',
      then: 'an outcome is observed',
    },
  ],
  tasks: [
    {
      id: 'T1',
      name: 'covered task',
      files: ['src/covered.ts'],
      action: 'do covered work',
      verify: 'pnpm test',
      done: 'AC-1',
      status: 'DONE',
    },
  ],
  boundaries: ['DO NOT touch src/legacy.ts'],
  status: 'IN_PROGRESS',
};

interface CtxOverrides {
  findings: Record<string, Finding[]>;
  touchedFiles?: string[];
  draft?: Draft;
  allowCodeReviewFailure?: boolean;
  errs?: string[];
}

function buildCtx(over: CtxOverrides): SettleContext {
  const errs = over.errs ?? [];
  const opts: Record<string, boolean> = {};
  if (over.allowCodeReviewFailure) opts.allowCodeReviewFailure = true;
  const result: CodeReviewResult = { findings: over.findings, provider: 'mock' };
  return {
    cwd: '/x',
    state: {
      draftReadAt: null,
      activePhase: '235-criteria-anchored-review-input',
      activeDraft: '235-01',
    } as never,
    draft: over.draft ?? DRAFT,
    progress: { draftId: '235-01', tasks: {} },
    config: { convergence: { maxAttempts: 3 } } as never,
    gateSet: { gates: ['code-review'], softCap: false } as never,
    opts,
    explicitIds: new Set<string>(),
    touchedFiles: over.touchedFiles ?? Object.keys(over.findings),
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => 'DIFF',
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: { verify: async () => result },
    },
    emit: {
      anomalies: async () => {},
      codeReviewHigh: async () => {},
      codeReviewUnconverged: async () => {},
    },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: { create: () => ({ ask: async () => '' }) },
    codeReviewSidecar: {
      read: async () => ({ attemptsSoFar: 0, history: [] }),
      write: async () => {},
    },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runCodeReviewGate — criteria-gap findings (phase 235 T4)', () => {
  it('AC-4: a defect on diff work no criterion or boundary covers is emitted as a criteria-gap finding', async () => {
    const findings: Record<string, Finding[]> = {
      'src/uncovered.ts': [{ severity: 'high', message: 'uncovered defect', line: 2 }],
    };
    const res = await runCodeReviewGate(buildCtx({ findings }));
    const patched = res.summaryPatch?.codeReview;
    expect(patched).toBeDefined();
    const gapFindings = patched!['src/uncovered.ts'];
    expect(gapFindings).toBeDefined();
    expect(gapFindings![0]!.anchor).toEqual({ kind: 'none', tier: 'undeclared' });
  });

  it('AC-4: a criteria-gap finding is distinguishable in the result from an ordinary anchored finding', async () => {
    const findings: Record<string, Finding[]> = {
      'src/covered.ts': [{ severity: 'medium', message: 'covered defect', line: 1 }],
      'src/uncovered.ts': [{ severity: 'medium', message: 'uncovered defect', line: 2 }],
    };
    const res = await runCodeReviewGate(buildCtx({ findings }));
    const patched = res.summaryPatch!.codeReview!;
    const covered = patched['src/covered.ts']![0]!;
    const gap = patched['src/uncovered.ts']![0]!;

    expect(covered.anchor).toBeDefined();
    expect(covered.anchor!.kind).toBe('ac');
    expect(covered.anchor!.tier).not.toBe('undeclared');

    expect(gap.anchor).toEqual({ kind: 'none', tier: 'undeclared' });
    expect(gap.anchor).not.toEqual(covered.anchor);
  });

  it('AC-4: a HIGH criteria-gap finding refuses the gate through the existing HIGH-finding refuse path — no new bypass required', async () => {
    const findings: Record<string, Finding[]> = {
      'src/uncovered.ts': [{ severity: 'high', message: 'uncovered defect', line: 2 }],
    };
    const errs: string[] = [];
    const res = await runCodeReviewGate(buildCtx({ findings, errs }));
    expect(res.outcome).toBe('refuse');
    expect(errs.some((l) => l.includes('uncovered defect'))).toBe(true);

    // The SAME pre-existing bypass flag clears it — proves no second
    // refusal primitive was added for gap findings.
    const bypassRes = await runCodeReviewGate(
      buildCtx({ findings, allowCodeReviewFailure: true }),
    );
    expect(bypassRes.outcome).toBe('pass');
  });

  it('AC-4/D3: gap count and severity distribution are declared unconditionally, even when the gate passes', async () => {
    const findings: Record<string, Finding[]> = {
      'src/covered.ts': [{ severity: 'low', message: 'covered nit' }],
      'src/uncovered.ts': [{ severity: 'medium', message: 'uncovered nit' }],
    };
    const errs: string[] = [];
    const res = await runCodeReviewGate(buildCtx({ findings, errs }));
    expect(res.outcome).toBe('pass');
    expect(
      errs.some((l) => /criteria-gap/i.test(l) && /1 finding/.test(l) && /medium=1/.test(l)),
    ).toBe(true);

    const patched = res.summaryPatch!.codeReview!;
    const gapCount = Object.values(patched)
      .flat()
      .filter((f) => f.anchor?.tier === 'undeclared').length;
    expect(gapCount).toBe(1);
  });

  it('AC-4: an anchored finding (task->AC coverage) does NOT count as a gap, and HIGH still refuses regardless of anchoring (AC-7)', async () => {
    const findings: Record<string, Finding[]> = {
      'src/covered.ts': [{ severity: 'high', message: 'covered defect', line: 4 }],
    };
    const errs: string[] = [];
    const res = await runCodeReviewGate(buildCtx({ findings, errs }));
    expect(res.outcome).toBe('refuse');
    const patched = res.summaryPatch!.codeReview!;
    const covered = patched['src/covered.ts']![0]!;
    expect(covered.anchor?.tier).not.toBe('undeclared');
    // The finding IS anchored, so there is no gap to declare and the
    // criteria-gap notice must stay silent — while the pre-existing
    // HIGH-finding refuse path still fires (asserted above), proving the two
    // are independent: anchoring changes visibility, never refusal semantics
    // (AC-7, `dec-20260729-005`).
    expect(errs.some((l) => /criteria-gap/.test(l))).toBe(false);
  });

  it('a finding on a boundary-covered file (no task/AC, but named in boundaries[]) is NOT a gap', async () => {
    const findings: Record<string, Finding[]> = {
      'src/legacy.ts': [{ severity: 'low', message: 'legacy nit' }],
    };
    const res = await runCodeReviewGate(buildCtx({ findings }));
    const patched = res.summaryPatch!.codeReview!;
    const found = patched['src/legacy.ts']![0]!;
    expect(found.anchor).toEqual({
      kind: 'boundary',
      ref: 'DO NOT touch src/legacy.ts',
      tier: 'declared',
    });
  });

  it('no findings at all → stays QUIET on stderr, empty codeReview patch preserved', async () => {
    const errs: string[] = [];
    const res = await runCodeReviewGate(buildCtx({ findings: {}, errs }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.codeReview).toEqual({});
    // A settle that produced no findings has no gap to declare, and a
    // clean-diff settle is specified to emit nothing matching /code-review:/
    // on stderr — asserted by `tests/cli/settle-code-review.test.ts` (AC-4)
    // and `tests/cli/settle-codereview-convergence.test.ts` (AC-1), both
    // predating this phase. D3 constrains the declaration to be independent
    // of the floor OUTCOME, not to print a "0 gaps" line into a run that
    // found nothing. This pins the quiet so a future change cannot
    // reintroduce the regression that broke those two suites.
    expect(errs.some((l) => /code-review:/.test(l))).toBe(false);
  });

  it('AC-3: a persisted finding carries a stable id, target: "artifact", and disposition: "open" alongside its anchor', async () => {
    const findings: Record<string, Finding[]> = {
      'src/covered.ts': [{ severity: 'medium', message: 'covered defect', line: 1 }],
    };
    const res = await runCodeReviewGate(buildCtx({ findings }));
    const patched = res.summaryPatch!.codeReview!;
    const found = patched['src/covered.ts']![0]!;

    expect(found.anchor).toBeDefined();
    expect(typeof found.id).toBe('string');
    expect(found.id!.length).toBeGreaterThan(0);
    expect(found.target).toBe('artifact');
    expect(found.disposition).toBe('open');

    // Same (file, anchor, severity, message) inputs recomputed after an edit
    // that only shifts the finding's line number must yield the identical id
    // (AC-3's refactor-stability guarantee).
    const shiftedLine: Record<string, Finding[]> = {
      'src/covered.ts': [{ severity: 'medium', message: 'covered defect', line: 99 }],
    };
    const res2 = await runCodeReviewGate(buildCtx({ findings: shiftedLine }));
    const found2 = res2.summaryPatch!.codeReview!['src/covered.ts']![0]!;
    expect(found2.id).toBe(found.id);
  });

  it('AC-4/D3: a gap is declared even when the gate PASSES (floor outcome never hides it)', async () => {
    const errs: string[] = [];
    // A medium-severity unanchored finding: no HIGH, so `pass` is true and the
    // floor does not stop the settle — yet the gap must still be declared on
    // stderr AND be derivable from the persisted patch. This is the case D3
    // actually exists to protect.
    const res = await runCodeReviewGate(
      buildCtx({ findings: { 'src/unowned.ts': [{ severity: 'medium', message: 'uncovered work' }] }, errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs.some((l) => /criteria-gap/.test(l) && /1 finding/.test(l))).toBe(true);
    const patched = res.summaryPatch?.codeReview as
      | Record<string, { anchor?: { tier?: string } }[]>
      | undefined;
    expect(patched?.['src/unowned.ts']?.[0]?.anchor?.tier).toBe('undeclared');
  });
});
