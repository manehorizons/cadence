import { describe, it, expect } from 'vitest';
import { runPerTaskVerifyGate } from '../../src/gates/per-task-verify.js';
import type { BuildGateContext } from '../../src/gates/build-types.js';
import type { PerTaskResult } from '../../src/verify/per-task.js';

function ctx(over: {
  gates?: string[];
  result?: PerTaskResult;
  allowPerTaskFailure?: boolean;
  taskId?: string;
  tasks?: Array<{ id: string; files: string[] }>;
  emits?: Array<Record<string, unknown>>;
  errs?: string[];
}): BuildGateContext {
  const emits = over.emits ?? [];
  const errs = over.errs ?? [];
  return {
    cwd: '/x',
    state: {} as never,
    draft: { tasks: over.tasks ?? [{ id: 'T1', files: ['src/a.ts'] }] } as never,
    config: null,
    gateSet: { gates: over.gates ?? ['per-task-verify'], softCap: false } as never,
    taskId: over.taskId ?? 'T1',
    opts: over.allowPerTaskFailure ? { allowPerTaskFailure: true } : {},
    diff: () => 'DIFF',
    verifiers: {
      perTask: {
        verify: async () => over.result ?? { verdict: 'pass', reason: 'ok', provider: 'mock' },
      },
    },
    emit: {
      perTaskFail: async (info) => {
        emits.push(info);
      },
    },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as BuildGateContext;
}

describe('runPerTaskVerifyGate', () => {
  it('passes inertly (no record) when the gate is not in the set', async () => {
    const res = await runPerTaskVerifyGate(ctx({ gates: [] }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch).toBeUndefined();
  });

  it('passes + records on a pass verdict', async () => {
    const res = await runPerTaskVerifyGate(ctx({ result: { verdict: 'pass', reason: 'ok', provider: 'mock' } }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.perTaskRecord).toMatchObject({ verdict: 'pass', reason: 'ok', provider: 'mock' });
  });

  it('refuses + emits per-task-fail (bypassed:false) on a refuse verdict, no bypass', async () => {
    const emits: Array<Record<string, unknown>> = [];
    const errs: string[] = [];
    const res = await runPerTaskVerifyGate(
      ctx({ result: { verdict: 'refuse', reason: 'bad', provider: 'mock' }, emits, errs }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('per-task-verify refused: bad');
    expect(emits[0]).toMatchObject({ taskId: 'T1', reason: 'bad', bypassed: false });
  });

  it('passes (bypassed) + emits bypassed:true on refuse with --allow-per-task-failure', async () => {
    const emits: Array<Record<string, unknown>> = [];
    const errs: string[] = [];
    const res = await runPerTaskVerifyGate(
      ctx({ result: { verdict: 'refuse', reason: 'bad', provider: 'mock' }, allowPerTaskFailure: true, emits, errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain('--allow-per-task-failure set; proceeding past refuse verdict');
    expect(emits[0]).toMatchObject({ bypassed: true });
    expect(res.summaryPatch?.perTaskRecord).toMatchObject({ verdict: 'refuse', bypassed: true });
  });
});
