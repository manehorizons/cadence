import { describe, it, expect } from 'vitest';
import { NO_TEST_COMMAND_NOTICE } from '@manehorizons/cadence-types';
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
  // Phase 139 / AC-5: no testCommand configured (ran:false) → still PASS, but
  // no longer silent — a loud, non-blocking stderr notice is written so the
  // gap is visible instead of hidden.
  it('AC-5: passes but writes NO_TEST_COMMAND_NOTICE when no testCommand is configured', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(ctx({ run: { ran: false, ok: true }, errs }));
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain(NO_TEST_COMMAND_NOTICE.message);
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

  // AC-5: a configured testCommand never triggers the no-testCommand notice,
  // on either outcome.
  it('AC-5: never writes NO_TEST_COMMAND_NOTICE when a testCommand is configured', async () => {
    const errs: string[] = [];
    await runBuildTestGate(
      ctx({ run: { ran: true, ok: true, exitCode: 0, command: 'pnpm test' }, errs }),
    );
    await runBuildTestGate(
      ctx({ run: { ran: true, ok: false, exitCode: 1, command: 'pnpm test' }, errs, force: true }),
    );
    expect(errs.join('')).not.toContain(NO_TEST_COMMAND_NOTICE.message);
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

  // AC-1 (phase 140): no testCommand → still PASS, but the accumulator now
  // carries buildTestRan:false so the registry can classify this gate as
  // "skipped" (not really checked) in SUMMARY's gate provenance.
  it('AC-1: patches buildTestRan:false when no testCommand is configured', async () => {
    const res = await runBuildTestGate(ctx({ run: { ran: false, ok: true } }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.buildTestRan).toBe(false);
  });

  // AC-1: a real, successful run does NOT patch buildTestRan (undefined = ran).
  it('AC-1: omits buildTestRan when the test command actually ran', async () => {
    const res = await runBuildTestGate(
      ctx({ run: { ran: true, ok: true, exitCode: 0, command: 'pnpm test' } }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.buildTestRan).toBeUndefined();
  });
});
