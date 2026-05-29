import { describe, it, expect } from 'vitest';
import { runStructuralVerifierGate } from '../../src/gates/structural-verifier.js';
import type { SettleContext } from '../../src/gates/types.js';

function task(status: string) {
  return { status, notes: '', touchedFiles: [], updatedAt: '2026-05-29T00:00:00.000Z' };
}

function ctx(over: {
  tasks?: Record<string, ReturnType<typeof task>>;
  allowOpenTasks?: boolean;
  force?: boolean;
  errs?: string[];
}): SettleContext {
  const errs = over.errs ?? [];
  const opts: Record<string, boolean> = {};
  if (over.allowOpenTasks) opts.allowOpenTasks = true;
  if (over.force) opts.force = true;
  return {
    cwd: '/x',
    state: { draftReadAt: null } as never,
    draft: { acceptanceCriteria: [], tasks: [] } as never,
    progress: { draftId: 'd', tasks: over.tasks ?? {} },
    config: null,
    gateSet: { gates: ['structural-verifier'], softCap: false } as never,
    opts,
    explicitIds: new Set<string>(),
    touchedFiles: [],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    verifiers: { deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) } },
    emit: { anomalies: async () => {} },
    runner: { test: async () => ({ ran: false, ok: true }) },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runStructuralVerifierGate', () => {
  // AC-2: an IN_PROGRESS task is non-terminal → refuse with per-task + summary lines
  it('refuses when a task is IN_PROGRESS', async () => {
    const errs: string[] = [];
    const res = await runStructuralVerifierGate(
      ctx({ tasks: { 'task-1': task('IN_PROGRESS') }, errs }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs[0]).toBe('structural-verifier: task task-1 is IN_PROGRESS (not terminal)\n');
    expect(errs.join('')).toContain(
      'settle run refused: all tasks must be terminal (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED).',
    );
  });

  // AC-2: a PENDING task is non-terminal → refuse
  it('refuses when a task is PENDING', async () => {
    const res = await runStructuralVerifierGate(ctx({ tasks: { t: task('PENDING') } }));
    expect(res.outcome).toBe('refuse');
  });

  // AC-2: every terminal status passes
  it('passes when all tasks are terminal', async () => {
    const errs: string[] = [];
    const res = await runStructuralVerifierGate(
      ctx({
        tasks: {
          a: task('DONE'),
          b: task('DONE_WITH_CONCERNS'),
          c: task('NEEDS_CONTEXT'),
          d: task('BLOCKED'),
        },
        errs,
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  // AC-2: --allow-open-tasks bypasses, no stderr
  it('passes an open task under --allow-open-tasks', async () => {
    const errs: string[] = [];
    const res = await runStructuralVerifierGate(
      ctx({ tasks: { t: task('IN_PROGRESS') }, allowOpenTasks: true, errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  // AC-2: --force also bypasses
  it('passes an open task under --force', async () => {
    const res = await runStructuralVerifierGate(
      ctx({ tasks: { t: task('PENDING') }, force: true }),
    );
    expect(res.outcome).toBe('pass');
  });

  // AC-2: no tasks → pass
  it('passes when there are no tasks', async () => {
    const res = await runStructuralVerifierGate(ctx({ tasks: {} }));
    expect(res.outcome).toBe('pass');
  });
});
