import { describe, it, expect } from 'vitest';
import { runBuildTestGate } from '../../src/gates/build-test-must-pass.js';
import type { SettleContext, TestRunResult } from '../../src/gates/types.js';

function ctx(over: {
  run?: TestRunResult;
  allowFailingBuild?: boolean;
  force?: boolean;
  errs?: string[];
}): SettleContext {
  const errs = over.errs ?? [];
  const opts: Record<string, boolean> = {};
  if (over.allowFailingBuild) opts.allowFailingBuild = true;
  if (over.force) opts.force = true;
  return {
    cwd: '/x',
    state: { draftReadAt: null } as never,
    draft: { acceptanceCriteria: [], tasks: [] } as never,
    progress: { draftId: 'd', tasks: {} },
    config: null,
    gateSet: { gates: ['build-test-must-pass'], softCap: false } as never,
    opts,
    explicitIds: new Set<string>(),
    touchedFiles: [],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    verifiers: { deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) } },
    emit: { anomalies: async () => {} },
    runner: { test: async () => over.run ?? { ran: false, ok: true } },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runBuildTestGate', () => {
  // AC-3 / AC-7: no testCommand configured (ran:false) → pass SILENTLY (no
  // stderr), so an unconfigured settle stays bit-identical.
  it('passes silently when no testCommand is configured', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(ctx({ run: { ran: false, ok: true }, errs }));
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  // AC-3: command succeeded (ran:true, ok:true) → pass, no stderr
  it('passes when the test command succeeds', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(
      ctx({ run: { ran: true, ok: true, exitCode: 0, command: 'pnpm test' }, errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  // AC-3: command failed, no bypass → refuse with command + summary lines
  it('refuses when the test command fails', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(
      ctx({ run: { ran: true, ok: false, exitCode: 1, command: 'pnpm test' }, errs }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs[0]).toBe('build-test-must-pass: pnpm test exited 1\n');
    expect(errs.join('')).toContain(
      'settle run refused: the test suite must pass before settle.',
    );
  });

  // AC-3: --allow-failing-build bypasses a failing command
  it('passes a failing command under --allow-failing-build', async () => {
    const res = await runBuildTestGate(
      ctx({ run: { ran: true, ok: false, exitCode: 2, command: 'pnpm test' }, allowFailingBuild: true }),
    );
    expect(res.outcome).toBe('pass');
  });

  // AC-3: --force also bypasses a failing command
  it('passes a failing command under --force', async () => {
    const res = await runBuildTestGate(
      ctx({ run: { ran: true, ok: false, exitCode: 1, command: 'pnpm test' }, force: true }),
    );
    expect(res.outcome).toBe('pass');
  });
});
