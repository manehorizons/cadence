import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicSecurityAuditVerifier,
  HostCliSecurityAuditVerifier,
  MockSecurityAuditVerifier,
  type SecurityAuditInput,
} from '../../src/verify/security-audit.js';
import type { SpawnFn, SpawnedProcessLike } from '../../src/verify/host-cli-client.js';
import { HostCliError } from '../../src/verify/host-cli-client.js';
import { selectSecurityAuditVerifier } from '../../src/verify/security-audit-factory.js';

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

const cleanDiff = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,2 +1,3 @@
 export const x = 1;
+export const y = 2;
 export const z = 3;
`;

const authDiff = `--- a/src/api.ts
+++ b/src/api.ts
@@ -10,1 +10,2 @@
 const url = '/v1';
+const headers = { Authorization: 'Bearer sk-live-abcdef123456' };
`;

const jwtDiff = `--- a/src/token.ts
+++ b/src/token.ts
@@ -1,1 +1,2 @@
 const a = 1;
+const t = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.s5x_abcDEF-123';
`;

describe('MockSecurityAuditVerifier (AC-2)', () => {
  it('returns no findings on empty diff', async () => {
    const v = new MockSecurityAuditVerifier();
    const r = await v.verify({ files: ['src/foo.ts'], diff: '' });
    expect(r.findings).toEqual([]);
    expect(r.provider).toBe('mock');
  });

  it('returns no findings on a benign diff', async () => {
    const v = new MockSecurityAuditVerifier();
    const r = await v.verify({ files: ['src/foo.ts'], diff: cleanDiff });
    expect(r.findings).toEqual([]);
  });

  it('flags a hardcoded Authorization header as CRITICAL', async () => {
    const v = new MockSecurityAuditVerifier();
    const r = await v.verify({ files: ['src/api.ts'], diff: authDiff });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      severity: 'critical',
      message: 'hardcoded Authorization header',
      line: 11,
    });
  });

  it('flags a JWT-shaped credential as CRITICAL', async () => {
    const v = new MockSecurityAuditVerifier();
    const r = await v.verify({ files: ['src/token.ts'], diff: jwtDiff });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      severity: 'critical',
      message: 'hardcoded JWT-shaped credential',
      line: 2,
    });
  });

  it('ignores `++` doubled markers (file-header rows)', async () => {
    const v = new MockSecurityAuditVerifier();
    const diff = `+++ b/src/api.ts\n@@ -1,1 +1,1 @@\n+const ok = 1;\n`;
    const r = await v.verify({ files: ['src/api.ts'], diff });
    expect(r.findings).toEqual([]);
  });

  // Phase 184 (AC-3): omitting the new `opts` parameter entirely must keep
  // behaving exactly as before — the regression case.
  it('behaves identically when opts is omitted (regression)', async () => {
    const v = new MockSecurityAuditVerifier();
    const r = await v.verify({ files: ['src/api.ts'], diff: authDiff });
    expect(r.findings).toHaveLength(1);
    expect(r.provider).toBe('mock');
  });

  // Phase 184 (AC-3): mock is pure/no I/O — it accepts `opts` without
  // erroring and ignores it, same as MockVerifier.
  it('accepts an opts argument without erroring and ignores it', async () => {
    const v = new MockSecurityAuditVerifier();
    const controller = new AbortController();
    const r = await v.verify(
      { files: ['src/api.ts'], diff: authDiff },
      { signal: controller.signal, traceId: 'trace-mock-1' },
    );
    expect(r.findings).toHaveLength(1);
    expect(r.provider).toBe('mock');
  });
});

function makeMockClient(parsedOutput: unknown): Anthropic {
  const parse = vi.fn().mockResolvedValue({ parsed_output: parsedOutput });
  return { messages: { parse } } as unknown as Anthropic;
}

const input: SecurityAuditInput = {
  files: ['src/api.ts'],
  diff: '+ const k = "eyJa.eyJb.cccc"',
};

describe('AnthropicSecurityAuditVerifier (AC-3)', () => {
  it('maps structured findings through', async () => {
    const client = makeMockClient({
      findings: [
        { severity: 'critical', message: 'hardcoded token', line: 4 },
        { severity: 'medium', message: 'weak randomness' },
      ],
    });
    const v = new AnthropicSecurityAuditVerifier({ client });
    const r = await v.verify(input);
    expect(r.provider).toBe('anthropic');
    expect(r.model).toBe('claude-sonnet-4-6');
    expect(r.findings).toEqual([
      { severity: 'critical', message: 'hardcoded token', line: 4 },
      { severity: 'medium', message: 'weak randomness' },
    ]);
  });

  it('returns no findings without an API call when no files + no diff', async () => {
    const parse = vi.fn();
    const client = { messages: { parse } } as unknown as Anthropic;
    const v = new AnthropicSecurityAuditVerifier({ client });
    const r = await v.verify({ files: [], diff: '' });
    expect(r.findings).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });

  it('throws when parsed_output is null', async () => {
    const client = makeMockClient(null);
    const v = new AnthropicSecurityAuditVerifier({ client });
    await expect(v.verify(input)).rejects.toThrow(/no parseable output/);
  });

  it('propagates non-API errors', async () => {
    const client = {
      messages: {
        parse: vi.fn().mockRejectedValueOnce(new Error('net bork')),
      },
    } as unknown as Anthropic;
    const v = new AnthropicSecurityAuditVerifier({ client });
    await expect(v.verify(input)).rejects.toThrow(/net bork/);
  });

  // Phase 184 (AC-3): omitting opts entirely keeps calling `messages.parse`
  // with a single argument — the regression case for the new parameter.
  it('calls messages.parse with no request-options argument when opts is omitted', async () => {
    const parse = vi.fn().mockResolvedValue({
      parsed_output: { findings: [] },
    });
    const client = { messages: { parse } } as unknown as Anthropic;
    const v = new AnthropicSecurityAuditVerifier({ client });
    await v.verify(input);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0]?.[1]).toBeUndefined();
  });

  // Phase 184 (AC-3): the real transport call — `client.messages.parse` —
  // genuinely receives the caller's AbortSignal as its request-options
  // second argument (confirmed against the installed `@anthropic-ai/sdk`'s
  // `RequestOptions.signal?: AbortSignal` type).
  it('forwards opts.signal into the messages.parse request-options argument', async () => {
    const parse = vi.fn().mockResolvedValue({
      parsed_output: { findings: [] },
    });
    const client = { messages: { parse } } as unknown as Anthropic;
    const v = new AnthropicSecurityAuditVerifier({ client });
    const controller = new AbortController();
    await v.verify(input, { signal: controller.signal, traceId: 'trace-1' });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
  });

  it('refuses to construct without an API key', () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new AnthropicSecurityAuditVerifier()).toThrow(
        /ANTHROPIC_API_KEY/,
      );
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }
  });
});

describe('HostCliSecurityAuditVerifier (AC-4)', () => {
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

  it('AC-4: spawns the host CLI headlessly and returns the same result shape local/anthropic return', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(
      claudeEnvelope({ findings: [{ severity: 'critical', message: 'hardcoded token', line: 4 }] }),
      calls,
    );
    const v = new HostCliSecurityAuditVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify(input);
    expect(r).toEqual({
      findings: [{ severity: 'critical', message: 'hardcoded token', line: 4 }],
      provider: 'host-cli',
    });
    expect(calls[0]?.bin).toBe('claude');
  });

  it('returns no findings without spawning when no files + no diff', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ findings: [] }), calls);
    const v = new HostCliSecurityAuditVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify({ files: [], diff: '' });
    expect(r.findings).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('AC-4: forwards opts.signal to the spawn layer — an already-aborted signal short-circuits before spawning', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ findings: [] }), calls);
    const v = new HostCliSecurityAuditVerifier({ bin: 'claude', spawnImpl });
    const controller = new AbortController();
    controller.abort();
    await expect(v.verify(input, { signal: controller.signal, traceId: 'trace-1' })).rejects.toThrow(
      HostCliError,
    );
    expect(calls).toHaveLength(0);
  });

  it('accepts traceId without erroring and without affecting the result', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ findings: [] }), calls);
    const v = new HostCliSecurityAuditVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify(input, { traceId: 'trace-2' });
    expect(r.findings).toEqual([]);
  });
});

describe('selectSecurityAuditVerifier (AC-1)', () => {
  it('returns mock by default', () => {
    const v = selectSecurityAuditVerifier(null, { env: {} });
    expect(v.name).toBe('mock');
  });

  it('AC-4: resolves host-cli config to a HostCliSecurityAuditVerifier instance, not a mock fallback', () => {
    const v = selectSecurityAuditVerifier(
      { securityAudit: { provider: 'host-cli' } },
      { env: {} },
    );
    expect(v.name).toBe('host-cli');
    expect(v).toBeInstanceOf(HostCliSecurityAuditVerifier);
  });

  it('returns anthropic when configured + key present', () => {
    const v = selectSecurityAuditVerifier(
      { securityAudit: { provider: 'anthropic' } },
      { env: { ANTHROPIC_API_KEY: 'sk-test' } },
    );
    expect(v.name).toBe('anthropic');
  });

  it('falls back to mock + warn when key missing', () => {
    const warnings: string[] = [];
    const v = selectSecurityAuditVerifier(
      { securityAudit: { provider: 'anthropic' } },
      { env: {}, warn: (m) => warnings.push(m) },
    );
    expect(v.name).toBe('mock');
    expect(warnings[0]).toMatch(/ANTHROPIC_API_KEY is unset/);
  });

  it('override wins over config', () => {
    const v = selectSecurityAuditVerifier(
      { securityAudit: { provider: 'anthropic' } },
      { env: { ANTHROPIC_API_KEY: 'sk-test' }, override: 'mock' },
    );
    expect(v.name).toBe('mock');
  });
});
