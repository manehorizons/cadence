import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicPerTaskVerifier,
  MockPerTaskVerifier,
  type PerTaskInput,
} from '../../src/verify/per-task.js';
import { selectPerTaskVerifier } from '../../src/verify/per-task-factory.js';

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

describe('selectPerTaskVerifier (AC-1, AC-3)', () => {
  it('returns mock by default', () => {
    const v = selectPerTaskVerifier(null, { env: {} });
    expect(v.name).toBe('mock');
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
