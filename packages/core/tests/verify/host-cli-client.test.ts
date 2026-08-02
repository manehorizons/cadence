import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod/v4';
import { hostCliJSON, type SpawnFn, type SpawnedProcessLike } from '../../src/verify/host-cli-client.js';

// AC-3 (structural, satisfied by the diff): this test file, and the module it
// exercises, import nothing from `@thomas-powers-jr/cadence-types`'s host.ts or
// `packages/host-claude-code/` — the host-cli provider spawns the CLI binary
// directly from `packages/core/src/verify/` the same way `local-client.ts`
// calls an arbitrary HTTP endpoint, adding zero new HostAdapter/HostCapabilities
// surface.

const Schema = z.object({ ok: z.boolean() });

interface FakeCall {
  bin: string;
  args: string[];
  /** Phase 178 T3: signals passed to the fake process's `kill()`, in call order. */
  killSignals: NodeJS.Signals[];
}

interface FakeResponse {
  stdout?: string;
  stderr?: string;
  code?: number;
  err?: NodeJS.ErrnoException;
  /** Phase 178 T3: AC-3's "never closes stdout or exits" case — no listener is
   *  ever invoked, simulating the documented hung-subprocess limitation. */
  hang?: boolean;
}

/** Stubs the subprocess transport: records each spawn call and replays scripted responses in order (last one repeats). No real `claude`/`codex` binary is ever invoked. */
function fakeSpawn(responses: FakeResponse[], calls: FakeCall[]): SpawnFn {
  let i = 0;
  return (bin, args) => {
    const call: FakeCall = { bin, args, killSignals: [] };
    calls.push(call);
    const resp = responses[Math.min(i++, responses.length - 1)] ?? {};

    const stdoutListeners: Array<(chunk: Buffer) => void> = [];
    const stderrListeners: Array<(chunk: Buffer) => void> = [];
    let errorListener: ((err: NodeJS.ErrnoException) => void) | undefined;
    let closeListener: ((code: number | null) => void) | undefined;

    const proc: SpawnedProcessLike = {
      stdout: {
        on: (event: string, cb: (chunk: Buffer) => void) => {
          if (event === 'data') stdoutListeners.push(cb);
          return proc.stdout as NodeJS.ReadableStream;
        },
      } as unknown as NodeJS.ReadableStream,
      stderr: {
        on: (event: string, cb: (chunk: Buffer) => void) => {
          if (event === 'data') stderrListeners.push(cb);
          return proc.stderr as NodeJS.ReadableStream;
        },
      } as unknown as NodeJS.ReadableStream,
      on: (event: 'error' | 'close', cb: ((err: NodeJS.ErrnoException) => void) | ((code: number | null) => void)) => {
        if (event === 'error') errorListener = cb as (err: NodeJS.ErrnoException) => void;
        if (event === 'close') closeListener = cb as (code: number | null) => void;
        return proc;
      },
      kill: (signal?: NodeJS.Signals) => {
        call.killSignals.push(signal ?? 'SIGTERM');
        return true;
      },
    };

    queueMicrotask(() => {
      if (resp.hang) return; // never fires error/close — the timeout guard must catch this
      if (resp.err) {
        errorListener?.(resp.err);
        return;
      }
      if (resp.stdout !== undefined) stdoutListeners.forEach((l) => l(Buffer.from(resp.stdout as string)));
      if (resp.stderr !== undefined) stderrListeners.forEach((l) => l(Buffer.from(resp.stderr as string)));
      closeListener?.(resp.code ?? 0);
    });

    return proc;
  };
}

const claudeEnvelope = (result: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ is_error: false, result, ...extra });

describe('hostCliJSON', () => {
  // `env: {}` pins every pre-existing test to a deterministic, self-invocation-
  // -free environment regardless of what the *actual* process this test suite
  // runs under happens to export (e.g. this repo's own dev sessions often run
  // under Claude Code itself, which sets `CLAUDECODE=1` — without this default
  // those ambient variables would leak into `hostCliJSON`'s default
  // `env ?? process.env` and spuriously trip the AC-2 guard added below).
  const base = { system: 's', user: 'u', schema: Schema, env: {} };

  it('AC-1: spawns claude in headless/non-interactive mode with the flattened prompt and parses the JSON envelope into a schema-valid verdict', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);

    const r = await hostCliJSON({ ...base, spawnImpl });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.bin).toBe('claude');
    expect(calls[0]!.args[0]).toBe('-p');
    expect(calls[0]!.args[1]).toContain('[SYSTEM]\ns');
    expect(calls[0]!.args[1]).toContain('[USER]\nu');
    expect(calls[0]!.args.slice(2)).toEqual(['--output-format', 'json']);
  });

  it('passes --model when a model is configured (claude family)', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);

    await hostCliJSON({ ...base, model: 'opus', spawnImpl });

    expect(calls[0]!.args.slice(2)).toEqual(['--output-format', 'json', '--model', 'opus']);
  });

  it('does not pass a --model flag when no model is configured', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);

    await hostCliJSON({ ...base, spawnImpl });

    expect(calls[0]!.args).not.toContain('--model');
  });

  it('spawns codex exec --json for a codex-named binary and parses the last agent_message event', async () => {
    const calls: FakeCall[] = [];
    const jsonl = [
      JSON.stringify({ type: 'thread.started', thread_id: 'x' }),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: '{"ok":true}' } }),
      JSON.stringify({ type: 'turn.completed', usage: {} }),
    ].join('\n');
    const spawnImpl = fakeSpawn([{ stdout: jsonl }], calls);

    const r = await hostCliJSON({ ...base, bin: 'codex', spawnImpl });

    expect(r.ok).toBe(true);
    expect(calls[0]!.bin).toBe('codex');
    expect(calls[0]!.args[0]).toBe('exec');
    expect(calls[0]!.args).toContain('--json');
    expect(calls[0]!.args).toContain('--skip-git-repo-check');
    expect(calls[0]!.args[calls[0]!.args.length - 1]).toContain('[USER]\nu');
  });

  it('AC-1: reuses the shared repair-retry harness — repairs once then succeeds', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn(
      [{ stdout: claudeEnvelope('not json at all') }, { stdout: claudeEnvelope('{"ok":true}') }],
      calls,
    );

    const r = await hostCliJSON({ ...base, spawnImpl });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('AC-1: two repair retries — succeeds on the second retry', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn(
      [
        { stdout: claudeEnvelope('bad') },
        { stdout: claudeEnvelope('still bad') },
        { stdout: claudeEnvelope('{"ok":true}') },
      ],
      calls,
    );

    const r = await hostCliJSON({ ...base, spawnImpl });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('throws after two failed repairs, naming the bin/family in the error', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn(
      [{ stdout: claudeEnvelope('n1') }, { stdout: claudeEnvelope('n2') }, { stdout: claudeEnvelope('n3') }],
      calls,
    );

    await expect(hostCliJSON({ ...base, spawnImpl })).rejects.toThrow(/2 repair retries.*bin=claude/);
  });

  it('rejects with a distinguishable HostCliError(reason="not-found") when the binary is missing (ENOENT) — no retry, no hang', async () => {
    const calls: FakeCall[] = [];
    const enoent = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }) as NodeJS.ErrnoException;
    const spawnImpl = fakeSpawn([{ err: enoent }], calls);

    await expect(hostCliJSON({ ...base, spawnImpl })).rejects.toMatchObject({
      name: 'HostCliError',
      reason: 'not-found',
    });
    // A spawn-level failure is not JSON/schema-repairable — must not retry the process.
    expect(calls).toHaveLength(1);
  });

  it('rejects with a HostCliError(reason="nonzero-exit") including stderr content on a non-zero exit', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ code: 1, stderr: 'not authenticated' }], calls);

    const err = await hostCliJSON({ ...base, spawnImpl }).catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'HostCliError', reason: 'nonzero-exit' });
    expect((err as Error).message).toMatch(/not authenticated/);
  });

  it('rejects with a HostCliError(reason="output-error") when stdout is not valid JSON (claude family)', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: 'not json envelope at all' }], calls);

    await expect(hostCliJSON({ ...base, spawnImpl })).rejects.toMatchObject({
      reason: 'output-error',
    });
  });

  it('rejects with a HostCliError(reason="output-error") when the claude envelope reports is_error', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn(
      [{ stdout: JSON.stringify({ is_error: true, subtype: 'error_max_turns', result: 'boom' }) }],
      calls,
    );

    const err = await hostCliJSON({ ...base, spawnImpl }).catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'HostCliError', reason: 'output-error' });
    expect((err as Error).message).toMatch(/boom/);
  });

  it('AC-1: emits a one-time quota-transparency notice on first real spawn, and never repeats it across multiple calls in the same process', async () => {
    // Fresh module instance so this test's "once per process" assertion is
    // not polluted by earlier tests in this file already having spawned
    // (and thus already flipped the module-level once-per-process flag).
    vi.resetModules();
    const { hostCliJSON: freshHostCliJSON } = await import('../../src/verify/host-cli-client.js');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const calls: FakeCall[] = [];
      const spawnImpl = fakeSpawn(
        [{ stdout: claudeEnvelope('{"ok":true}') }, { stdout: claudeEnvelope('{"ok":true}') }],
        calls,
      );

      await freshHostCliJSON({ ...base, spawnImpl });
      await freshHostCliJSON({ ...base, spawnImpl });

      expect(calls).toHaveLength(2); // two real spawns happened...
      const quotaNotices = stderrSpy.mock.calls.filter(
        ([chunk]) => typeof chunk === 'string' && chunk.toLowerCase().includes('quota'),
      );
      expect(quotaNotices).toHaveLength(1); // ...but the notice fired only once
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('AC-2: refuses to spawn and rejects with HostCliError(reason="self-invocation") when CLAUDECODE=1 is set (claude family)', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);

    const err = await hostCliJSON({
      ...base,
      env: { CLAUDECODE: '1' },
      spawnImpl,
    }).catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'HostCliError', reason: 'self-invocation' });
    expect((err as Error).message).toMatch(/self-invocation|already running inside a headless/i);
    // No-hang guarantee (AC-2): the refusal happens before any subprocess is
    // created — no spawn call was ever made, no retry either (a
    // self-invocation refusal is not JSON/schema-repairable).
    expect(calls).toHaveLength(0);
  });

  it('AC-2: does not refuse when CLAUDECODE is unset — proceeds to spawn normally (no false positive)', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);

    const r = await hostCliJSON({ ...base, env: {}, spawnImpl });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('AC-2: does not refuse when CLAUDECODE is set to something other than "1" (e.g. unset/empty-string ambient var)', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);

    const r = await hostCliJSON({ ...base, env: { CLAUDECODE: '' }, spawnImpl });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('AC-2: CLAUDECODE=1 does not affect the codex family — self-invocation detection is not (yet) wired for codex, since no reliable documented session env var was found', async () => {
    const calls: FakeCall[] = [];
    const jsonl = JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"ok":true}' } });
    const spawnImpl = fakeSpawn([{ stdout: jsonl }], calls);

    const r = await hostCliJSON({ ...base, bin: 'codex', env: { CLAUDECODE: '1' }, spawnImpl });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('AC-2: propagating through the standard fallback path — the self-invocation HostCliError has the same shape (name/reason) as the other spawn-boundary errors so wrapWithFallback needs no new logic', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([], calls);

    const err = await hostCliJSON({
      ...base,
      env: { CLAUDECODE: '1' },
      spawnImpl,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { name: string }).name).toBe('HostCliError');
    expect((err as { reason: string }).reason).toBe('self-invocation');
  });

  it('AC-3: kills the subprocess and rejects with HostCliError(reason="timeout") when it never closes stdout or exits', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ hang: true }], calls);

    const err = await hostCliJSON({ ...base, spawnImpl, timeoutMs: 20 }).catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'HostCliError', reason: 'timeout' });
    // Killed via the optional `SpawnedProcessLike.kill` capability, not left running.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.killSignals).toContain('SIGKILL');
    // A timeout is not JSON/schema-repairable — must not retry the process.
  });

  it('AC-3: a normally-closing process is unaffected by the timeout guard (no regression)', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);

    const r = await hostCliJSON({ ...base, spawnImpl, timeoutMs: 50 });

    expect(r.ok).toBe(true);
    expect(calls[0]!.killSignals).toHaveLength(0);
  });

  it('AC-3: the timeout timer is cleared on normal completion (resolve path) — no dangling/spurious timer', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);
    const clearSpy = vi.spyOn(global, 'clearTimeout');
    try {
      const r = await hostCliJSON({ ...base, spawnImpl, timeoutMs: 50 });

      expect(r.ok).toBe(true);
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('AC-3: the timeout timer is cleared on the reject path too (non-zero exit), not just on resolve', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ code: 1, stderr: 'boom' }], calls);
    const clearSpy = vi.spyOn(global, 'clearTimeout');
    try {
      await expect(hostCliJSON({ ...base, spawnImpl, timeoutMs: 50 })).rejects.toMatchObject({
        reason: 'nonzero-exit',
      });

      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('AC-3: resolves the timeout from CADENCE_HOST_CLI_TIMEOUT_MS when no explicit timeoutMs override is given', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ hang: true }], calls);

    const err = await hostCliJSON({
      ...base,
      env: { CADENCE_HOST_CLI_TIMEOUT_MS: '15' },
      spawnImpl,
    }).catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'HostCliError', reason: 'timeout' });
  });

  // Phase 184 T1 — AbortSignal + traceId plumbing.

  it('AC-1: an external signal that aborts mid-call kills the child and rejects with HostCliError(reason="aborted")', async () => {
    const calls: FakeCall[] = [];
    // Never closes stdout or exits on its own — the abort must be what ends
    // the call, not the (much larger) timeout.
    const spawnImpl = fakeSpawn([{ hang: true }], calls);
    const controller = new AbortController();

    // `spawnCapture`'s Promise executor (which registers the abort listener)
    // runs synchronously as part of calling `hostCliJSON` — nothing awaits
    // before that point — so aborting here, before awaiting the returned
    // promise, reliably lands after the listener is registered and before
    // the fake process's queued microtask (which never settles anyway, per
    // `hang: true`) could matter. No real sleeping/timers needed.
    const promise = hostCliJSON({ ...base, spawnImpl, timeoutMs: 60_000, signal: controller.signal });
    controller.abort();

    const err = await promise.catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'HostCliError', reason: 'aborted' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.killSignals).toContain('SIGKILL');
  });

  it('AC-1: a signal that is already aborted before the call starts rejects immediately with reason="aborted" and never spawns a child', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);
    const controller = new AbortController();
    controller.abort();

    const err = await hostCliJSON({ ...base, spawnImpl, signal: controller.signal }).catch(
      (e: unknown) => e,
    );

    expect(err).toMatchObject({ name: 'HostCliError', reason: 'aborted' });
    expect(calls).toHaveLength(0); // never spawned
  });

  it('AC-1: a signal that never fires does not affect a normally-closing call (no regression)', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);
    const controller = new AbortController();

    const r = await hostCliJSON({ ...base, spawnImpl, signal: controller.signal });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.killSignals).toHaveLength(0);
  });

  it('omitting signal entirely keeps today\'s behavior byte-identical (no regression)', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);

    const r = await hostCliJSON({ ...base, spawnImpl });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('AC-1: an optional traceId is accepted without changing behavior or output', async () => {
    const calls: FakeCall[] = [];
    const spawnImpl = fakeSpawn([{ stdout: claudeEnvelope('{"ok":true}') }], calls);

    const r = await hostCliJSON({ ...base, spawnImpl, traceId: 'trace-abc-123' });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
