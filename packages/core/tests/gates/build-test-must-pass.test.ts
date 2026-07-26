import { describe, it, expect } from 'vitest';
import { NO_TEST_COMMAND_NOTICE } from '@manehorizons/cadence-types';
import { runBuildTestGate } from '../../src/gates/build-test-must-pass.js';
import type { SettleContext, TestRunResult } from '../../src/gates/types.js';

function ctx(over: {
  run?: TestRunResult;
  allowFailingBuild?: boolean;
  force?: boolean;
  errs?: string[];
  config?: SettleContext['config'];
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
    config: over.config ?? null,
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
    // AC-2: reason matches the exact unsealed refusal message.
    expect(res.reason).toBe(
      'settle run refused: the test suite must pass before settle. ' +
        'Pass --allow-failing-build to bypass, or --force to settle anyway.',
    );
  });

  // AC-3: --allow-failing-build bypasses a failing command
  it('passes a failing command under --allow-failing-build', async () => {
    const res = await runBuildTestGate(
      ctx({ run: { ran: true, ok: false, exitCode: 2, command: 'pnpm test' }, allowFailingBuild: true }),
    );
    expect(res.outcome).toBe('pass');
    // Phase 226 (T3): a genuine unsealed bypass carries flags.buildTestBypassed
    // so the registry can record 'skipped (bypassed)' provenance instead of 'ran'.
    expect(res.flags?.buildTestBypassed).toBe(true);
  });

  // AC-3: --force also bypasses a failing command
  it('passes a failing command under --force', async () => {
    const res = await runBuildTestGate(
      ctx({ run: { ran: true, ok: false, exitCode: 1, command: 'pnpm test' }, force: true }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.flags?.buildTestBypassed).toBe(true);
  });

  // Phase 226 (T3): a genuinely passing run must NOT carry the bypass flag —
  // it was never bypassed, it just passed.
  it('does not set buildTestBypassed on a genuinely passing run', async () => {
    const res = await runBuildTestGate(
      ctx({ run: { ran: true, ok: true, exitCode: 0, command: 'pnpm test' } }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.flags?.buildTestBypassed).toBeUndefined();
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

// Phase 141 T6 (AC-4, AC-5): sealed build-test-must-pass ignores --force and
// --allow-failing-build, refusing with a distinct "gates.sealed" message that
// omits the now-inapplicable bypass hint.
describe('runBuildTestGate · sealed (phase 141)', () => {
  const sealedConfig = { gates: { sealed: ['build-test-must-pass'] } } as never;
  const failingRun: TestRunResult = { ran: true, ok: false, exitCode: 1, command: 'pnpm test' };

  // AC-4: sealed + --force still refuses.
  it('refuses under --force when sealed', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(
      ctx({ run: failingRun, errs, force: true, config: sealedConfig }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('gates.sealed');
  });

  // AC-4: sealed + --allow-failing-build still refuses.
  it('refuses under --allow-failing-build when sealed', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(
      ctx({ run: failingRun, errs, allowFailingBuild: true, config: sealedConfig }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('gates.sealed');
  });

  // AC-4: sealed refusal fires even with neither bypass flag passed — the
  // message ternary is keyed purely on `sealed`, not on an attempted bypass.
  it('refuses when sealed even with no bypass flags passed', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(ctx({ run: failingRun, errs, config: sealedConfig }));
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('gates.sealed');
  });

  // AC-4: sealed refusal message is distinct, names gates.sealed literally,
  // and omits the "Pass --allow-failing-build ... or --force" bypass hint.
  it('sealed refusal message names gates.sealed and omits the bypass hint', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(
      ctx({ run: failingRun, errs, force: true, config: sealedConfig }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('gates.sealed');
    expect(joined).not.toContain('Pass --allow-failing-build to bypass');
    // AC-2: reason matches the exact sealed refusal message.
    expect(res.reason).toBe(
      'settle run refused: the test suite must pass before settle. ' +
        'This gate is sealed (gates.sealed) and cannot be bypassed with ' +
        '--allow-failing-build or --force.',
    );
  });

  // AC-4: the command/exitCode stderr line still prints regardless of sealed.
  it('still prints the command exit-code line when sealed', async () => {
    const errs: string[] = [];
    await runBuildTestGate(ctx({ run: failingRun, errs, force: true, config: sealedConfig }));
    expect(errs[0]).toBe('build-test-must-pass: pnpm test exited 1\n');
  });

  // AC-4: sealed but the test actually passed → gate passes normally, no
  // sealed message printed (sealing only removes the ability to bypass an
  // already-correct refusal, it never manufactures a new one).
  it('passes when sealed but the test command succeeds', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(
      ctx({
        run: { ran: true, ok: true, exitCode: 0, command: 'pnpm test' },
        errs,
        config: sealedConfig,
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  // AC-4/T6 scope: the !res.ran (no test command configured) path is
  // unaffected by sealing — there's nothing to refuse since the test never
  // ran, so it still passes and still patches buildTestRan:false.
  it('the no-testCommand path is unaffected by sealing', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(
      ctx({ run: { ran: false, ok: true }, errs, config: sealedConfig }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.buildTestRan).toBe(false);
    expect(errs.join('')).toContain(NO_TEST_COMMAND_NOTICE.message);
  });

  // AC-5 (regression safety): unsealed --force still bypasses a refusal and
  // prints the original bypass hint, not the sealed message.
  it('unsealed: --force still bypasses and prints the original bypass hint (regression)', async () => {
    const errs: string[] = [];
    const res = await runBuildTestGate(ctx({ run: failingRun, errs, force: true }));
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  // AC-5 (regression safety): unsealed --allow-failing-build still bypasses.
  it('unsealed: --allow-failing-build still bypasses (regression)', async () => {
    const res = await runBuildTestGate(ctx({ run: failingRun, allowFailingBuild: true }));
    expect(res.outcome).toBe('pass');
  });

  // AC-5 (regression safety): a config naming a different gate in
  // gates.sealed does not seal build-test-must-pass — --force bypasses
  // cleanly, just like the unsealed case.
  it('a gates.sealed entry for a different gate does not seal build-test-must-pass (regression)', async () => {
    const otherSealed = { gates: { sealed: ['test-coverage'] } } as never;
    const res = await runBuildTestGate(
      ctx({ run: failingRun, force: true, config: otherSealed }),
    );
    expect(res.outcome).toBe('pass');
  });

  // AC-5 (regression safety): empty gates.sealed array does not seal.
  it('an empty gates.sealed array does not seal build-test-must-pass (regression)', async () => {
    const emptySealed = { gates: { sealed: [] } } as never;
    const res = await runBuildTestGate(
      ctx({ run: failingRun, force: true, config: emptySealed }),
    );
    expect(res.outcome).toBe('pass');
  });
});
