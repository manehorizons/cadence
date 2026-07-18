import { describe, it, expect } from 'vitest';
// NOTE: this module does not exist yet — that is the point of this
// regression test (issue #206 / rec-20260712-001). T2 adds
// `packages/core/src/gates/task-verify-required.ts` exporting
// `runTaskVerifyRequiredGate`. Until then this import fails to resolve and
// the whole file fails to load, which is the correct failure mode for a
// gate that has not been built yet.
import { runTaskVerifyRequiredGate } from '../../src/gates/task-verify-required.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { Task } from '@manehorizons/cadence-types';

/**
 * A DRAFT task whose `- verify:` line was omitted. `draft-parser.ts`
 * currently defaults a missing verify line to `''` rather than refusing to
 * parse — this is the shape that silently reaches settle today.
 */
function bareTask(over: Partial<Task> = {}): Task {
  return {
    id: 'T1',
    name: 'do the thing',
    files: ['src/a.ts'],
    action: 'implement the thing',
    verify: '',
    done: 'AC-1',
    status: 'DONE',
    ...over,
  };
}

function ctx(over: { tasks?: Task[]; gates?: string[]; errs?: string[] }): SettleContext {
  const errs = over.errs ?? [];
  const tasks = over.tasks ?? [bareTask()];
  return {
    cwd: '/x',
    state: {} as never,
    draft: {
      acceptanceCriteria: [{ id: 'AC-1', given: '', when: '', then: '' }],
      tasks,
    } as never,
    progress: { draftId: 'd', tasks: {} },
    config: null,
    gateSet: { gates: over.gates ?? ['task-verify-required'], softCap: false } as never,
    opts: {},
    explicitIds: new Set<string>(),
    touchedFiles: [],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => '',
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: { verify: async () => ({ findings: {}, provider: 'mock' }) },
      securityAudit: { verify: async () => ({ findings: [], provider: 'mock' }) },
    },
    emit: { anomalies: async () => {}, codeReviewHigh: async () => {}, codeReviewUnconverged: async () => {} },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: { create: () => ({ ask: async () => '' }) },
    codeReviewSidecar: { read: async () => ({ attemptsSoFar: 0, history: [] }), write: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runTaskVerifyRequiredGate (issue #206 / rec-20260712-001)', () => {
  it('AC-1: refuses settle when a DONE task has an empty verify field, naming the offending task id', async () => {
    const errs: string[] = [];
    const res = await runTaskVerifyRequiredGate(ctx({ tasks: [bareTask({ id: 'T1' })], errs }));

    expect(res.outcome).toBe('refuse');
    expect(res.reason ?? errs.join('')).toContain('T1');
  });

  it('passes inertly when the gate is not in the active gate set', async () => {
    const res = await runTaskVerifyRequiredGate(ctx({ tasks: [bareTask()], gates: [] }));
    expect(res.outcome).toBe('pass');
  });
});
