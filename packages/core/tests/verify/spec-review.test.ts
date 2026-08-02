import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Spec } from '@thomas-powers-jr/cadence-types';
import {
  HostCliSpecReviewVerifier,
  MockSpecReviewVerifier,
} from '../../src/verify/spec-review.js';
import type { SpawnFn, SpawnedProcessLike } from '../../src/verify/host-cli-client.js';
import { selectSpecReviewVerifier } from '../../src/verify/spec-review-factory.js';

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

const spec: Spec = {
  schemaVersion: 1,
  id: '01-00',
  phase: '01',
  objective: 'Ship the thing',
  acceptanceCriteria: [
    { id: 'AC-1', name: '', given: 'a state', when: 'an action', then: 'an outcome' },
  ],
  constraints: ['stay in scope'],
  openQuestions: [],
  status: 'PENDING',
};

describe('MockSpecReviewVerifier', () => {
  it('passes a well-formed spec', async () => {
    const v = new MockSpecReviewVerifier();
    const r = await v.verify({ spec });
    expect(r.pass).toBe(true);
    expect(r.provider).toBe('mock');
  });
});

describe('HostCliSpecReviewVerifier (AC-1)', () => {
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

  it('AC-1: spawns the host CLI headlessly and returns the same result shape local/anthropic return', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ pass: true, findings: [] }), calls);
    const v = new HostCliSpecReviewVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify({ spec });
    expect(r).toEqual({ pass: true, findings: [], provider: 'host-cli' });
    expect(calls[0]?.bin).toBe('claude');
    expect(calls[0]?.args).toContain('-p');
  });

  it('passes findings through and reports the model when configured', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(
      claudeEnvelope({
        pass: false,
        findings: [{ severity: 'high', message: 'no constraints', suggestedEdit: 'add one' }],
      }),
      calls,
    );
    const v = new HostCliSpecReviewVerifier({ bin: 'claude', model: 'opus', spawnImpl });
    const r = await v.verify({ spec });
    expect(r.pass).toBe(false);
    expect(r.findings).toEqual([
      { severity: 'high', message: 'no constraints', suggestedEdit: 'add one' },
    ]);
    expect(r.model).toBe('opus');
    expect(calls[0]?.args).toContain('--model');
    expect(calls[0]?.args).toContain('opus');
  });

  it('omits the model field from the result when not configured', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ pass: true, findings: [] }), calls);
    const v = new HostCliSpecReviewVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify({ spec });
    expect(r.model).toBeUndefined();
  });
});

describe('selectSpecReviewVerifier (AC-1)', () => {
  it('returns mock by default', () => {
    const v = selectSpecReviewVerifier(null, { env: {} });
    expect(v.name).toBe('mock');
  });

  it('AC-1: resolves host-cli config to a HostCliSpecReviewVerifier instance, not a mock fallback', () => {
    const v = selectSpecReviewVerifier({ specReview: { provider: 'host-cli' } }, { env: {} });
    expect(v.name).toBe('host-cli');
    expect(v).toBeInstanceOf(HostCliSpecReviewVerifier);
  });
});
