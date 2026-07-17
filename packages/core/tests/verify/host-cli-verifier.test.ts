import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HostCliVerifier } from '../../src/verify/verifier.js';
import { HostCliError, type SpawnFn, type SpawnedProcessLike } from '../../src/verify/host-cli-client.js';
import { selectVerifier } from '../../src/verify/factory.js';

/** Mirrors `per-task.test.ts`'s `fakeSpawn` — stubs the subprocess transport
 *  one layer below `hostCliJSON` so no test ever spawns a real binary. */
function fakeSpawn(stdout: string, calls: Array<{ bin: string; args: string[] }>): SpawnFn {
  return (bin, args) => {
    calls.push({ bin, args });
    const stdoutListeners: Array<(chunk: Buffer) => void> = [];
    let closeListener: ((code: number | null) => void) | undefined;
    const proc: SpawnedProcessLike = {
      stdout: {
        on: (event: string, cb: (chunk: Buffer) => void) => {
          if (event === 'data') stdoutListeners.push(cb);
          return proc.stdout as NodeJS.ReadableStream;
        },
      } as unknown as NodeJS.ReadableStream,
      stderr: { on: () => proc.stderr } as unknown as NodeJS.ReadableStream,
      on: (event: 'error' | 'close', cb: never) => {
        if (event === 'close') closeListener = cb as (code: number | null) => void;
        return proc;
      },
    };
    queueMicrotask(() => {
      stdoutListeners.forEach((l) => l(Buffer.from(stdout)));
      closeListener?.(0);
    });
    return proc;
  };
}

const claudeEnvelope = (result: unknown) =>
  JSON.stringify({ is_error: false, result: JSON.stringify(result) });

describe('HostCliVerifier (AC-5)', () => {
  // See per-task.test.ts: pin CLAUDECODE unset so the self-invocation guard
  // doesn't trip when these tests run inside a Claude Code session.
  let savedClaudecode: string | undefined;
  beforeEach(() => {
    savedClaudecode = process.env.CLAUDECODE;
    delete process.env.CLAUDECODE;
  });
  afterEach(() => {
    if (savedClaudecode === undefined) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = savedClaudecode;
  });

  const input = {
    acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
    tests: {},
    diff: '',
    files: [],
  };

  it('AC-5: spawns the host CLI headlessly and returns the same verdict shape local/anthropic return', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(
      claudeEnvelope({ verdicts: [{ id: 'AC-1', pass: true, reason: 'ok' }] }),
      calls,
    );
    const v = new HostCliVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify(input);
    expect(r).toEqual({
      verdicts: { 'AC-1': { pass: true, reason: 'ok' } },
      provider: 'host-cli',
    });
    expect(calls[0]?.bin).toBe('claude');
  });

  it('empty ACs short-circuits with no spawn', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ verdicts: [] }), calls);
    const v = new HostCliVerifier({ bin: 'claude', model: 'opus', spawnImpl });
    const r = await v.verify({ acs: [], tests: {}, diff: '', files: [] });
    expect(r).toEqual({ verdicts: {}, provider: 'host-cli', model: 'opus' });
    expect(calls).toHaveLength(0);
  });

  it('reports the model when configured, omits it when not', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(
      claudeEnvelope({ verdicts: [{ id: 'AC-1', pass: true, reason: 'ok' }] }),
      calls,
    );
    const v = new HostCliVerifier({ bin: 'claude', model: 'opus', spawnImpl });
    const r = await v.verify(input);
    expect(r.model).toBe('opus');
  });

  it('never fabricates usage — hostCliJSON does not report token usage', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(
      claudeEnvelope({ verdicts: [{ id: 'AC-1', pass: true, reason: 'ok' }] }),
      calls,
    );
    const v = new HostCliVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify(input);
    expect(r.usage).toBeUndefined();
  });

  it('AC-5: forwards opts.signal to the spawn layer — an already-aborted signal short-circuits before spawning', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ verdicts: [] }), calls);
    const v = new HostCliVerifier({ bin: 'claude', spawnImpl });
    const controller = new AbortController();
    controller.abort();
    await expect(
      v.verify(input, { signal: controller.signal, traceId: 'trace-1' }),
    ).rejects.toThrow(HostCliError);
    expect(calls).toHaveLength(0);
  });
});

describe('selectVerifier (AC-5)', () => {
  it('returns mock by default', () => {
    const v = selectVerifier(null, { env: {} });
    expect(v.name).toBe('mock');
  });

  it('AC-5: resolves host-cli config to a HostCliVerifier instance, not a mock fallback', () => {
    const v = selectVerifier({ verifier: { provider: 'host-cli' } }, { env: {} });
    expect(v.name).toBe('host-cli');
    expect(v).toBeInstanceOf(HostCliVerifier);
  });
});
