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
    expect(writes).toHaveLength(1);
    const sidecar = JSON.parse(writes[0]!);
    expect(sidecar.converged).toBe(true);
    expect(sidecar.draftId).toBe('01-01');
    // Full exact-shape characterization (legacy 29.7 top-level fields
    // preserved byte-for-byte alongside the newer converged/attempts/
    // maxAttempts/history fields) — pins today's real output so a later
    // extraction of a shared runner can be diffed against it.
    expect(sidecar).toEqual({
      draftId: '01-01',
      converged: true,
      attempts: 0,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: true,
          findingsCount: 0,
          provider: 'mock',
          verdict: 'pass',
        },
      ],
      pass: true,
      provider: 'mock',
      findings: 0,
      at: expect.any(String),
    });
  });

  it('refuses (reloop) on first failure under maxAttempts', async () => {
    const errs: string[] = [];
    const unconverged: unknown[] = [];
    const writes: string[] = [];
    const res = await runPlanReviewGate(
      ctx({
        result: { pass: false, findings: [FINDING], provider: 'mock' },
        attemptsSoFar: 0,
        maxAttempts: 3,
        errs,
        unconverged,
        writes,
      }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('attempt 1/3 did not pass');
    expect(errs.join('')).toContain('plan-review: high — scope creep');
    expect(errs.join('')).toContain('↳ suggested: split it');
    expect(unconverged).toEqual([]); // reloop does not emit
    expect(writes).toHaveLength(1);
    const sidecar = JSON.parse(writes[0]!);
    expect(sidecar).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 1,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'reloop',
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: expect.any(String),
    });
  });

  it('refuses (escalate) + emits unconverged at the attempt ceiling', async () => {
    const unconverged: unknown[] = [];
    const errs: string[] = [];
    const writes: string[] = [];
    const res = await runPlanReviewGate(
      ctx({
        result: { pass: false, findings: [FINDING], provider: 'mock' },
        attemptsSoFar: 2,
        maxAttempts: 3,
        errs,
        unconverged,
        writes,
      }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('did NOT converge after 3 attempts');
    expect(unconverged).toHaveLength(1);
    expect(unconverged[0]).not.toHaveProperty('bypassed');
    expect(writes).toHaveLength(1);
    const sidecar = JSON.parse(writes[0]!);
    expect(sidecar).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 3,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'escalate',
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: expect.any(String),
    });
  });

  it('bypasses a failing review under --allow-plan-review-failure (escalate → bypassed:true)', async () => {
    const unconverged: Array<Record<string, unknown>> = [];
    const errs: string[] = [];
    const writes: string[] = [];
    const res = await runPlanReviewGate(
      ctx({
        result: { pass: false, findings: [FINDING], provider: 'mock' },
        attemptsSoFar: 2,
        maxAttempts: 3,
        allowPlanReviewFailure: true,
        errs,
        unconverged,
        writes,
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain('--allow-plan-review-failure set; proceeding past 1 finding(s)');
    expect(unconverged).toHaveLength(1);
    expect(unconverged[0]?.bypassed).toBe(true);
    expect(writes).toHaveLength(1);
    const sidecar = JSON.parse(writes[0]!);
    expect(sidecar).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 3,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'escalate',
          bypassed: true,
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: expect.any(String),
    });
  });

  // Characterization gap found in audit: no prior test exercised the bypass
  // path at a *reloop* verdict (attemptsSoFar below the ceiling). Because the
  // `nv.verdict === 'escalate'` emit-guard in plan-review.ts only fires the
  // unconverged notify on escalate, a bypass at reloop must NOT emit — this
  // pins that today's real behavior (so a later refactor can be checked
  // against it).
  it('bypasses a failing review under --allow-plan-review-failure at a reloop verdict (no unconverged emit)', async () => {
    const unconverged: Array<Record<string, unknown>> = [];
    const errs: string[] = [];
    const writes: string[] = [];
    const res = await runPlanReviewGate(
      ctx({
        result: { pass: false, findings: [FINDING], provider: 'mock' },
        attemptsSoFar: 0,
        maxAttempts: 3,
        allowPlanReviewFailure: true,
        errs,
        unconverged,
        writes,
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain('--allow-plan-review-failure set; proceeding past 1 finding(s)');
    expect(unconverged).toEqual([]); // reloop-bypass never emits — escalate-only guard
    expect(writes).toHaveLength(1);
    const sidecar = JSON.parse(writes[0]!);
    expect(sidecar).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 1,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'reloop',
          bypassed: true,
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: expect.any(String),
    });
  });

  // Characterization gap found in audit: no prior test set `res.model`, so
  // the `...(res.model ? { model: res.model } : {})` spread (both in the
  // history entry and the sidecar's legacy top-level fields) was never
  // exercised. This pins today's real shape when a provider reports a model.
  it('includes the model field (history + legacy top-level) when the verifier reports one', async () => {
    const writes: string[] = [];
    const res = await runPlanReviewGate(
      ctx({ result: { pass: true, findings: [], provider: 'anthropic', model: 'claude-x' }, writes }),
    );
    expect(res.outcome).toBe('pass');
    const sidecar = JSON.parse(writes[0]!);
    expect(sidecar).toEqual({
      draftId: '01-01',
      converged: true,
      attempts: 0,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: true,
          findingsCount: 0,
          provider: 'anthropic',
          model: 'claude-x',
          verdict: 'pass',
        },
      ],
      pass: true,
      provider: 'anthropic',
      model: 'claude-x',
      findings: 0,
      at: expect.any(String),
    });
  });
});
