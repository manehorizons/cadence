import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicPerTaskVerifier,
  HostCliPerTaskVerifier,
  MockPerTaskVerifier,
  type PerTaskInput,
} from '../../src/verify/per-task.js';
import type { SpawnFn, SpawnedProcessLike } from '../../src/verify/host-cli-client.js';
import { selectPerTaskVerifier } from '../../src/verify/per-task-factory.js';

/**
 * Stubs the subprocess transport one layer below `hostCliJSON` (matching how
 * `host-cli-client.test.ts` avoids ever invoking a real `claude`/`codex`
 * binary): records each spawn call and resolves with a scripted stdout
 * payload on the next microtask.
 */
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

// AC-2: MockPerTaskVerifier deterministic branches (pass/concerns/refuse)
// AC-3: AnthropicPerTaskVerifier — happy paths via injected client + error paths

describe('MockPerTaskVerifier (AC-2)', () => {
  const baseInput: PerTaskInput = {
    taskId: 'T1',
    files: ['src/foo.ts', 'src/bar.ts'],
    diff: '+ added line\n',
  };

  it('passes when files non-empty AND diff non-empty', async () => {
    const v = new MockPerTaskVerifier();
    const r = await v.verify(baseInput);
    expect(r.verdict).toBe('pass');
    expect(r.provider).toBe('mock');
    expect(r.reason).toMatch(/2 file\(s\), \d+ diff bytes/);
  });

  it('refuses when no files touched', async () => {
    const v = new MockPerTaskVerifier();
    const r = await v.verify({ ...baseInput, files: [] });
    expect(r.verdict).toBe('refuse');
    expect(r.reason).toMatch(/no files touched/);
  });

  it('returns concerns when diff is empty/whitespace', async () => {
    const v = new MockPerTaskVerifier();
    const r = await v.verify({ ...baseInput, diff: '   \n  ' });
    expect(r.verdict).toBe('concerns');
    expect(r.reason).toMatch(/no diff since last task/);
  });
});

function makeMockClient(parsedOutput: unknown): Anthropic {
  const parse = vi.fn().mockResolvedValue({ parsed_output: parsedOutput });
  return { messages: { parse } } as unknown as Anthropic;
}

describe('AnthropicPerTaskVerifier (AC-3)', () => {
  const input: PerTaskInput = {
    taskId: 'T1',
    files: ['src/foo.ts'],
    diff: '+ added line',
  };

  it('returns the model verdict on success', async () => {
    const client = makeMockClient({
      verdict: 'pass',
      reason: 'diff is coherent and on-scope',
    });
    const v = new AnthropicPerTaskVerifier({ client });
    const r = await v.verify(input);
    expect(r).toEqual({
      verdict: 'pass',
      reason: 'diff is coherent and on-scope',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
  });

  it('honors the model override', async () => {
    const client = makeMockClient({ verdict: 'concerns', reason: 'eh' });
    const v = new AnthropicPerTaskVerifier({ client, model: 'claude-haiku-4-5' });
    const r = await v.verify(input);
    expect(r.model).toBe('claude-haiku-4-5');
  });

  it('throws when parsed_output is null', async () => {
    const client = makeMockClient(null);
    const v = new AnthropicPerTaskVerifier({ client });
    await expect(v.verify(input)).rejects.toThrow(/no parseable output/);
  });

  it('propagates non-API errors', async () => {
    const client = {
      messages: {
        parse: vi.fn().mockRejectedValueOnce(new Error('boom')),
      },
    } as unknown as Anthropic;
    const v = new AnthropicPerTaskVerifier({ client });
    await expect(v.verify(input)).rejects.toThrow(/boom/);
  });

  it('refuses to construct without an API key or injected client', () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new AnthropicPerTaskVerifier()).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }
  });
});

describe('HostCliPerTaskVerifier (AC-1)', () => {
  const input: PerTaskInput = {
    taskId: 'T1',
    files: ['src/foo.ts'],
    diff: '+ added line',
  };

  // Phase 178 T2: `HostCliPerTaskVerifierOptions` has no env-injection seam
  // (unlike `hostCliJSON` itself, which callers pin via `env: {}` — see
  // host-cli-client.test.ts's `base` fixture and json-repair.test.ts), so
  // `hostCliJSON` falls through to the real `process.env` here. Pin
  // CLAUDECODE unset for these tests so they stay deterministic regardless
  // of the invoking shell (e.g. this repo's own dev sessions, where
  // CLAUDECODE=1 is ambient and would otherwise trip the self-invocation
  // guard and fall back to mock).
  let savedClaudecode: string | undefined;
  beforeEach(() => {
    savedClaudecode = process.env.CLAUDECODE;
    delete process.env.CLAUDECODE;
  });
  afterEach(() => {
    if (savedClaudecode === undefined) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = savedClaudecode;
  });

  it('AC-1: spawns the host CLI headlessly, parses its output via the repair harness, and returns the same verdict shape local/anthropic return', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(
      claudeEnvelope({ verdict: 'pass', reason: 'diff is coherent and on-scope' }),
      calls,
    );
    const v = new HostCliPerTaskVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify(input);
    expect(r).toEqual({
      verdict: 'pass',
      reason: 'diff is coherent and on-scope',
      provider: 'host-cli',
    });
    expect(calls[0]?.bin).toBe('claude');
    expect(calls[0]?.args).toContain('-p');
    expect(calls[0]?.args).toContain('--output-format');
  });

  it('passes the model flag through and reports it on the result when configured', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ verdict: 'concerns', reason: 'eh' }), calls);
    const v = new HostCliPerTaskVerifier({ bin: 'claude', model: 'opus', spawnImpl });
    const r = await v.verify(input);
    expect(r.model).toBe('opus');
    expect(calls[0]?.args).toContain('--model');
    expect(calls[0]?.args).toContain('opus');
  });

  it('omits the model field from the result when not configured', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ verdict: 'pass', reason: 'ok' }), calls);
    const v = new HostCliPerTaskVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify(input);
    expect(r.model).toBeUndefined();
  });
});

describe('selectPerTaskVerifier (AC-1, AC-3)', () => {
  it('returns mock by default', () => {
    const v = selectPerTaskVerifier(null, { env: {} });
    expect(v.name).toBe('mock');
  });

  it('AC-1: resolves host-cli config to a HostCliPerTaskVerifier instance — the first end-to-end host-cli path for any verifier family', () => {
    const v = selectPerTaskVerifier(
      { perTaskVerifier: { provider: 'host-cli' } },
      { env: {} },
    );
    expect(v.name).toBe('host-cli');
    expect(v).toBeInstanceOf(HostCliPerTaskVerifier);
  });

  it('returns anthropic when configured and key present', () => {
    const v = selectPerTaskVerifier(
      { perTaskVerifier: { provider: 'anthropic' } },
      { env: { ANTHROPIC_API_KEY: 'sk-test' } },
    );
    expect(v.name).toBe('anthropic');
  });

  it('falls back to mock with warn when key is missing', () => {
    const warnings: string[] = [];
    const v = selectPerTaskVerifier(
      { perTaskVerifier: { provider: 'anthropic' } },
      { env: {}, warn: (m) => warnings.push(m) },
    );
    expect(v.name).toBe('mock');
    expect(warnings[0]).toMatch(/ANTHROPIC_API_KEY is unset/);
  });

  it('override flag wins over config', () => {
    const v = selectPerTaskVerifier(
      { perTaskVerifier: { provider: 'anthropic' } },
      { env: { ANTHROPIC_API_KEY: 'sk-test' }, override: 'mock' },
    );
    expect(v.name).toBe('mock');
  });
});
