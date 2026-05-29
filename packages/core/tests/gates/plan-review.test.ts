import { describe, it, expect } from 'vitest';
import { runPlanReviewGate } from '../../src/gates/plan-review.js';
import type { DraftGateContext } from '../../src/gates/draft-types.js';
import type { PlanReviewFinding, PlanReviewResult } from '../../src/verify/plan-review.js';

const FINDING: PlanReviewFinding = { severity: 'high', message: 'scope creep', suggestedEdit: 'split it' };

function ctx(over: {
  gates?: string[];
  result?: PlanReviewResult;
  attemptsSoFar?: number;
  history?: unknown[];
  maxAttempts?: number;
  allowPlanReviewFailure?: boolean;
  writes?: string[];
  unconverged?: unknown[];
  errs?: string[];
}): DraftGateContext {
  const writes = over.writes ?? [];
  const unconverged = over.unconverged ?? [];
  const errs = over.errs ?? [];
  return {
    cwd: '/x',
    state: {} as never,
    draft: { tasks: [] } as never,
    config: { convergence: { maxAttempts: over.maxAttempts ?? 3 } } as never,
    gateSet: { gates: over.gates ?? ['plan-review'], softCap: false } as never,
    phase: '01-foundation',
    id: '01-01',
    opts: over.allowPlanReviewFailure ? { allowPlanReviewFailure: true } : {},
    coherence: () => ({ issues: [] }),
    verifiers: {
      planReview: {
        verify: async () => over.result ?? { pass: true, findings: [], provider: 'mock' },
      },
    },
    emit: {
      coherenceWarn: async () => {},
      planReviewUnconverged: async (info) => {
        unconverged.push(info);
      },
    },
    prompter: { create: () => ({ ask: async () => '' }) },
    planReviewSidecar: {
      read: async () => ({ attemptsSoFar: over.attemptsSoFar ?? 0, history: over.history ?? [] }),
      write: async (text) => {
        writes.push(text);
      },
    },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as DraftGateContext;
}

describe('runPlanReviewGate', () => {
  it('passes inertly when plan-review is not in the set (no sidecar write)', async () => {
    const writes: string[] = [];
    const res = await runPlanReviewGate(ctx({ gates: [], writes }));
    expect(res.outcome).toBe('pass');
    expect(writes).toEqual([]);
  });

  it('passes + writes a converged sidecar when the review passes', async () => {
    const writes: string[] = [];
    const res = await runPlanReviewGate(ctx({ result: { pass: true, findings: [], provider: 'mock' }, writes }));
    expect(res.outcome).toBe('pass');
    const sidecar = JSON.parse(writes[0]!);
    expect(sidecar.converged).toBe(true);
    expect(sidecar.draftId).toBe('01-01');
  });

  it('refuses (reloop) on first failure under maxAttempts', async () => {
    const errs: string[] = [];
    const unconverged: unknown[] = [];
    const res = await runPlanReviewGate(
      ctx({ result: { pass: false, findings: [FINDING], provider: 'mock' }, attemptsSoFar: 0, maxAttempts: 3, errs, unconverged }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('attempt 1/3 did not pass');
    expect(errs.join('')).toContain('plan-review: high — scope creep');
    expect(errs.join('')).toContain('↳ suggested: split it');
    expect(unconverged).toEqual([]); // reloop does not emit
  });

  it('refuses (escalate) + emits unconverged at the attempt ceiling', async () => {
    const unconverged: unknown[] = [];
    const errs: string[] = [];
    const res = await runPlanReviewGate(
      ctx({ result: { pass: false, findings: [FINDING], provider: 'mock' }, attemptsSoFar: 2, maxAttempts: 3, errs, unconverged }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('did NOT converge after 3 attempts');
    expect(unconverged).toHaveLength(1);
    expect(unconverged[0]).not.toHaveProperty('bypassed');
  });

  it('bypasses a failing review under --allow-plan-review-failure (escalate → bypassed:true)', async () => {
    const unconverged: Array<Record<string, unknown>> = [];
    const errs: string[] = [];
    const res = await runPlanReviewGate(
      ctx({
        result: { pass: false, findings: [FINDING], provider: 'mock' },
        attemptsSoFar: 2,
        maxAttempts: 3,
        allowPlanReviewFailure: true,
        errs,
        unconverged,
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain('--allow-plan-review-failure set; proceeding past 1 finding(s)');
    expect(unconverged).toHaveLength(1);
    expect(unconverged[0]?.bypassed).toBe(true);
  });
});
