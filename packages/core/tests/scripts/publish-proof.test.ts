import { describe, expect, it, vi } from 'vitest';

// Importing this module must NOT trigger a real verdaccio/npm run — that
// safety is exactly what T3's import.meta.url guard exists to guarantee.
// If this import ever hangs or shells out, the guard regressed.
const script = await import('../../../../scripts/publish-proof.mjs');

describe('publish-proof exerciseLoopSteps', () => {
  it('returns the exact init->draft->approve->build->settle sequence for a given proj (AC-1)', () => {
    const proj = '/tmp/some-clean-proj';
    const steps = script.exerciseLoopSteps(proj);

    expect(steps).toHaveLength(5);

    const [init, draftNew, draftApprove, buildTask, settleRun] = steps;

    expect(init).toEqual([
      'npx',
      ['cadence', 'init', '--name=publish-proof'],
      'loop: cadence init',
      { cwd: proj },
    ]);

    expect(draftNew).toEqual([
      'npx',
      ['cadence', 'draft', 'new', '--title=smoke-loop', '--tier=quick-fix'],
      'loop: cadence draft new',
      { cwd: proj },
    ]);

    expect(draftApprove).toEqual([
      'npx',
      ['cadence', 'draft', 'approve', '01-smoke-loop', '01'],
      'loop: cadence draft approve',
      { cwd: proj },
    ]);

    expect(buildTask).toEqual([
      'npx',
      ['cadence', 'build', 'task', 'T1', '--status=DONE'],
      'loop: cadence build task T1 DONE',
      { cwd: proj },
    ]);

    expect(settleRun).toEqual([
      'npx',
      ['cadence', 'settle', 'run', '--auto', '--allow-failing-build'],
      'loop: cadence settle run --auto',
      { cwd: proj },
    ]);
  });

  it('scopes every step to the given proj as cwd (AC-1)', () => {
    const proj = '/tmp/another-proj';
    const steps = script.exerciseLoopSteps(proj);

    for (const [, , , opts] of steps) {
      expect(opts).toEqual({ cwd: proj });
    }
  });

  it('is a pure function — same proj in, same sequence out, no side effects (AC-1)', () => {
    const proj = '/tmp/pure-proj';
    expect(script.exerciseLoopSteps(proj)).toEqual(script.exerciseLoopSteps(proj));
  });
});

describe('publish-proof must() failure format', () => {
  it('does not throw and returns undefined when the result exited 0 (AC-2)', () => {
    expect(() => script.must({ status: 0, stdout: '', stderr: '' }, 'ok step')).not.toThrow();
    expect(script.must({ status: 0, stdout: '', stderr: '' }, 'ok step')).toBeUndefined();
  });

  it('throws an Error carrying exactly the failing step label when status is non-zero (AC-2)', () => {
    expect(() =>
      script.must({ status: 1, stdout: 'out', stderr: 'err' }, 'loop: cadence init'),
    ).toThrow('loop: cadence init');
  });

  it('throws when the result is missing entirely, e.g. a spawn failure (AC-2)', () => {
    expect(() => script.must(undefined, 'loop: cadence draft new')).toThrow(
      'loop: cadence draft new',
    );
    expect(() => script.must(null, 'loop: cadence draft new')).toThrow(
      'loop: cadence draft new',
    );
  });

  it('logs the failing label plus captured stdout/stderr to stderr before throwing (AC-2)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        script.must(
          { status: 1, stdout: 'captured stdout', stderr: 'captured stderr' },
          'loop: cadence settle run --auto',
        ),
      ).toThrow('loop: cadence settle run --auto');

      expect(spy).toHaveBeenCalledTimes(1);
      const logged = spy.mock.calls[0]?.[0] as string;
      expect(logged).toContain('FAIL loop: cadence settle run --auto');
      expect(logged).toContain('captured stdout');
      expect(logged).toContain('captured stderr');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('publish-proof withUnconditionalTeardown', () => {
  it('runs teardown and returns fn\'s result when fn succeeds (AC-3)', async () => {
    const teardown = vi.fn().mockResolvedValue(undefined);
    const result = await script.withUnconditionalTeardown(async () => 'ok', teardown);

    expect(result).toBe('ok');
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('still runs teardown, then rethrows, when fn throws partway through (AC-3)', async () => {
    const teardown = vi.fn().mockResolvedValue(undefined);
    const boom = new Error('loop: cadence init');

    await expect(
      script.withUnconditionalTeardown(async () => {
        throw boom;
      }, teardown),
    ).rejects.toThrow(boom);

    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('awaits teardown to completion before the rejection is observable by the caller (AC-3)', async () => {
    const order: string[] = [];
    const teardown = vi.fn(async () => {
      // internal async gap: makes a missing `await teardown()` at the call
      // site (a fire-and-forget regression) observable here — without this,
      // a synchronous mock body would pass even if the real code stopped
      // awaiting teardown, since `finally` rethrows regardless of whether
      // its own body was awaited by the caller.
      await Promise.resolve();
      order.push('teardown');
    });

    await expect(
      script.withUnconditionalTeardown(async () => {
        order.push('fn-threw');
        throw new Error('broken published artifact');
      }, teardown),
    ).rejects.toThrow('broken published artifact');

    order.push('caller-observed-rejection');
    expect(order).toEqual(['fn-threw', 'teardown', 'caller-observed-rejection']);
  });
});
