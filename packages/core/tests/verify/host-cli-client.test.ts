import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';
import { hostCliJSON, type SpawnFn, type SpawnedProcessLike } from '../../src/verify/host-cli-client.js';

// AC-3 (structural, satisfied by the diff): this test file, and the module it
// exercises, import nothing from `@manehorizons/cadence-types`'s host.ts or
// `packages/host-claude-code/` — the host-cli provider spawns the CLI binary
// directly from `packages/core/src/verify/` the same way `local-client.ts`
// calls an arbitrary HTTP endpoint, adding zero new HostAdapter/HostCapabilities
// surface.

const Schema = z.object({ ok: z.boolean() });

interface FakeCall {
  bin: string;
  args: string[];
}

interface FakeResponse {
  stdout?: string;
  stderr?: string;
  code?: number;
  err?: NodeJS.ErrnoException;
}

/** Stubs the subprocess transport: records each spawn call and replays scripted responses in order (last one repeats). No real `claude`/`codex` binary is ever invoked. */
function fakeSpawn(responses: FakeResponse[], calls: FakeCall[]): SpawnFn {
  let i = 0;
  return (bin, args) => {
    calls.push({ bin, args });
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
    };

    queueMicrotask(() => {
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
  const base = { system: 's', user: 'u', schema: Schema };

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
});
