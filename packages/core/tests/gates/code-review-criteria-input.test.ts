import { describe, it, expect } from 'vitest';
import type { Draft } from '@manehorizons/cadence-types';
import { runCodeReviewGate } from '../../src/gates/code-review.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { CodeReviewInput, CodeReviewResult } from '../../src/contracts/index.js';

/**
 * Phase 235 T3 — proves CodeReviewInput carries the DRAFT's acceptance
 * criteria, boundaries[] and task->AC refs, and that runCodeReviewGate
 * actually populates them from ctx.draft rather than discarding them. Uses a
 * spy CodeReviewVerifier (mock/fake only, fully offline) that captures the
 * input it receives.
 */

const DRAFT: Draft = {
  schemaVersion: 1,
  id: '235-01',
  phase: '235-criteria-anchored-review-input',
  tier: 'standard',
  title: 'criteria-anchored review verifier',
  objective: 'give the code-review verifier sight of the DRAFT',
  acceptanceCriteria: [
    { id: 'AC-1', name: 'sees criteria', given: 'a DRAFT with ACs', when: 'the gate runs', then: 'input carries them' },
    { id: 'AC-2', name: 'anchor ladder', given: 'tiers', when: 'anchored', then: 'classified' },
  ],
  tasks: [
    {
      id: 'T1',
      name: 'extend CodeReviewInput',
      files: ['packages/core/src/verify/code-review.ts'],
      action: 'add optional fields',
      verify: 'pnpm test',
      done: 'AC-1',
      status: 'DONE',
    },
  ],
  boundaries: ['DO NOT give findings a stable id'],
  status: 'IN_PROGRESS',
};

function buildCtx(
  draft: Draft,
  captured: { input?: CodeReviewInput },
): SettleContext {
  const result: CodeReviewResult = { findings: {}, provider: 'mock' };
  return {
    cwd: '/x',
    state: {
      draftReadAt: null,
      activePhase: '235-criteria-anchored-review-input',
      activeDraft: '235-01',
    } as never,
    draft,
    progress: { draftId: '235-01', tasks: {} },
    config: { convergence: { maxAttempts: 3 } } as never,
    gateSet: { gates: ['code-review'], softCap: false } as never,
    opts: {},
    explicitIds: new Set<string>(),
    touchedFiles: ['packages/core/src/verify/code-review.ts'],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => 'DIFF',
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: {
        verify: async (input: CodeReviewInput) => {
          captured.input = input;
          return result;
        },
      },
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
    io: { err: () => {} },
  } as unknown as SettleContext;
}

describe('CodeReviewInput criteria payload (phase 235 T3)', () => {
  it('AC-1: a non-empty criteria payload reaches the verifier for a DRAFT with ACs', async () => {
    const captured: { input?: CodeReviewInput } = {};
    const res = await runCodeReviewGate(buildCtx(DRAFT, captured));

    expect(res.outcome).toBe('pass');
    const input = captured.input;
    expect(input).toBeDefined();

    // Base contract fields are unchanged.
    expect(input!.files).toEqual(['packages/core/src/verify/code-review.ts']);
    expect(input!.diff).toBe('DIFF');

    // AC-1: acceptance criteria (id, name, given, when, then) reach the verifier.
    expect(input!.acceptanceCriteria).toEqual([
      { id: 'AC-1', name: 'sees criteria', given: 'a DRAFT with ACs', when: 'the gate runs', then: 'input carries them' },
      { id: 'AC-2', name: 'anchor ladder', given: 'tiers', when: 'anchored', then: 'classified' },
    ]);
    expect(input!.acceptanceCriteria!.length).toBeGreaterThan(0);

    // AC-1: boundaries[] reach the verifier.
    expect(input!.boundaries).toEqual(['DO NOT give findings a stable id']);

    // AC-1: task->AC refs (Task.id, files, verify, done, status) reach the verifier.
    expect(input!.taskRefs).toEqual([
      {
        id: 'T1',
        files: ['packages/core/src/verify/code-review.ts'],
        verify: 'pnpm test',
        done: 'AC-1',
        status: 'DONE',
      },
    ]);
  });

  it('omits status on a task ref when the task has no status set (exactOptionalPropertyTypes: omit, never undefined)', async () => {
    const draftNoStatus: Draft = {
      ...DRAFT,
      tasks: [
        {
          id: 'T1',
          name: 'extend CodeReviewInput',
          files: ['packages/core/src/verify/code-review.ts'],
          action: 'add optional fields',
          verify: 'pnpm test',
          done: 'AC-1',
        },
      ],
    };
    const captured: { input?: CodeReviewInput } = {};
    await runCodeReviewGate(buildCtx(draftNoStatus, captured));

    expect(captured.input!.taskRefs).toEqual([
      {
        id: 'T1',
        files: ['packages/core/src/verify/code-review.ts'],
        verify: 'pnpm test',
        done: 'AC-1',
      },
    ]);
    expect(Object.prototype.hasOwnProperty.call(captured.input!.taskRefs![0]!, 'status')).toBe(false);
  });

  it('populates empty arrays (not undefined) when the DRAFT has no boundaries', async () => {
    const draftNoBoundaries: Draft = { ...DRAFT, boundaries: [] };
    const captured: { input?: CodeReviewInput } = {};
    await runCodeReviewGate(buildCtx(draftNoBoundaries, captured));

    expect(captured.input!.boundaries).toEqual([]);
  });
});
