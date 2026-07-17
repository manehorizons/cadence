import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { Draft } from '@manehorizons/cadence-types';
import {
  AnthropicPlanReviewVerifier,
  HostCliPlanReviewVerifier,
  MockPlanReviewVerifier,
} from '../../src/verify/plan-review.js';
import type { SpawnFn, SpawnedProcessLike } from '../../src/verify/host-cli-client.js';
import { selectPlanReviewVerifier } from '../../src/verify/plan-review-factory.js';

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

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    schemaVersion: 1,
    id: '25-01',
    phase: '25-plan-review',
    tier: 'complex',
    title: 'demo',
    objective: 'do the thing',
    acceptanceCriteria: [
      { id: 'AC-1', given: 'g', when: 'w', then: 't' },
    ],
    tasks: [
      {
        id: 'T1',
        name: 'task',
        files: ['src/foo.ts'],
        action: 'do',
        verify: 'check',
        done: 'AC-1',
      },
    ],
    boundaries: ['DO NOT widen scope'],
    status: 'PENDING',
    ...overrides,
  };
}

describe('MockPlanReviewVerifier (AC-2)', () => {
  it('passes a complete plan with empty findings', async () => {
    const v = new MockPlanReviewVerifier();
    const r = await v.verify({ draft: makeDraft() });
    expect(r.pass).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.provider).toBe('mock');
  });

  it('fails with a HIGH finding when there are zero ACs', async () => {
    const v = new MockPlanReviewVerifier();
    const r = await v.verify({ draft: makeDraft({ acceptanceCriteria: [] }) });
    expect(r.pass).toBe(false);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      severity: 'high',
      message: 'plan has no acceptance criteria',
    });
  });

  it('fails with one HIGH finding per blank GWT field', async () => {
    const v = new MockPlanReviewVerifier();
    const r = await v.verify({
      draft: makeDraft({
        acceptanceCriteria: [
          { id: 'AC-1', given: 'g', when: '  ', then: '' },
        ],
      }),
    });
    expect(r.pass).toBe(false);
    expect(r.findings).toHaveLength(2);
    expect(r.findings.map((f) => f.message)).toEqual([
      'AC-1 has empty when',
      'AC-1 has empty then',
    ]);
    expect(r.findings.every((f) => f.severity === 'high')).toBe(true);
  });
});

function makeMockClient(parsedOutput: unknown): Anthropic {
  const parse = vi.fn().mockResolvedValue({ parsed_output: parsedOutput });
  return { messages: { parse } } as unknown as Anthropic;
}

describe('AnthropicPlanReviewVerifier (AC-3)', () => {
  it('maps a structured fail verdict through', async () => {
    const client = makeMockClient({
      pass: false,
      findings: [
        {
          severity: 'high',
          message: 'objective not testable',
          suggestedEdit: 'rewrite objective as a falsifiable outcome',
        },
        { severity: 'low', message: 'wording nit' },
      ],
    });
    const v = new AnthropicPlanReviewVerifier({ client });
    const r = await v.verify({ draft: makeDraft() });
    expect(r.provider).toBe('anthropic');
    expect(r.model).toBe('claude-sonnet-4-6');
    expect(r.pass).toBe(false);
    expect(r.findings).toEqual([
      {
        severity: 'high',
        message: 'objective not testable',
        suggestedEdit: 'rewrite objective as a falsifiable outcome',
      },
      { severity: 'low', message: 'wording nit' },
    ]);
  });

  it('throws when parsed_output is null', async () => {
    const client = makeMockClient(null);
    const v = new AnthropicPlanReviewVerifier({ client });
    await expect(v.verify({ draft: makeDraft() })).rejects.toThrow(
      /no parseable output/,
    );
  });

  it('propagates non-API errors', async () => {
    const client = {
      messages: {
        parse: vi.fn().mockRejectedValueOnce(new Error('net bork')),
      },
    } as unknown as Anthropic;
    const v = new AnthropicPlanReviewVerifier({ client });
    await expect(v.verify({ draft: makeDraft() })).rejects.toThrow(
      /net bork/,
    );
  });

  it('refuses to construct without an API key', () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new AnthropicPlanReviewVerifier()).toThrow(
        /ANTHROPIC_API_KEY/,
      );
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }
  });
});

describe('HostCliPlanReviewVerifier (AC-2)', () => {
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

  it('AC-2: spawns the host CLI headlessly and returns the same result shape local/anthropic return', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ pass: true, findings: [] }), calls);
    const v = new HostCliPlanReviewVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify({ draft: makeDraft() });
    expect(r).toEqual({ pass: true, findings: [], provider: 'host-cli' });
    expect(calls[0]?.bin).toBe('claude');
    expect(calls[0]?.args).toContain('-p');
  });

  it('passes findings through and reports the model when configured', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(
      claudeEnvelope({
        pass: false,
        findings: [{ severity: 'high', message: 'no boundaries', suggestedEdit: 'add one' }],
      }),
      calls,
    );
    const v = new HostCliPlanReviewVerifier({ bin: 'claude', model: 'opus', spawnImpl });
    const r = await v.verify({ draft: makeDraft() });
    expect(r.pass).toBe(false);
    expect(r.findings).toEqual([
      { severity: 'high', message: 'no boundaries', suggestedEdit: 'add one' },
    ]);
    expect(r.model).toBe('opus');
    expect(calls[0]?.args).toContain('--model');
  });

  it('omits the model field from the result when not configured', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const spawnImpl = fakeSpawn(claudeEnvelope({ pass: true, findings: [] }), calls);
    const v = new HostCliPlanReviewVerifier({ bin: 'claude', spawnImpl });
    const r = await v.verify({ draft: makeDraft() });
    expect(r.model).toBeUndefined();
  });
});

describe('selectPlanReviewVerifier (AC-1)', () => {
  it('returns mock by default', () => {
    const v = selectPlanReviewVerifier(null, { env: {} });
    expect(v.name).toBe('mock');
  });

  it('AC-2: resolves host-cli config to a HostCliPlanReviewVerifier instance, not a mock fallback', () => {
    const v = selectPlanReviewVerifier({ planReview: { provider: 'host-cli' } }, { env: {} });
    expect(v.name).toBe('host-cli');
    expect(v).toBeInstanceOf(HostCliPlanReviewVerifier);
  });

  it('returns anthropic when configured + key present', () => {
    const v = selectPlanReviewVerifier(
      { planReview: { provider: 'anthropic' } },
      { env: { ANTHROPIC_API_KEY: 'sk-test' } },
    );
    expect(v.name).toBe('anthropic');
  });

  it('falls back to mock + warn when key missing', () => {
    const warnings: string[] = [];
    const v = selectPlanReviewVerifier(
      { planReview: { provider: 'anthropic' } },
      { env: {}, warn: (m) => warnings.push(m) },
    );
    expect(v.name).toBe('mock');
    expect(warnings[0]).toMatch(/ANTHROPIC_API_KEY is unset/);
  });

  it('override wins over config', () => {
    const v = selectPlanReviewVerifier(
      { planReview: { provider: 'anthropic' } },
      { env: { ANTHROPIC_API_KEY: 'sk-test' }, override: 'mock' },
    );
    expect(v.name).toBe('mock');
  });
});
