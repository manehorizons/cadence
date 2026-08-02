import { describe, it, expect, afterEach, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import { AnthropicVerifier } from '../../src/verify/anthropic-verifier.js';
import { localChatJSON } from '../../src/verify/local-client.js';
import type { VerifyInput } from '../../src/verify/verifier.js';
import { Logger, setLogger, resetLogger } from '../../src/logging/logger.js';
import type { LogLevel } from '@thomas-powers-jr/cadence-types';

function captureRecords(level: LogLevel = 'debug'): Array<Record<string, unknown>> {
  const recs: Array<Record<string, unknown>> = [];
  setLogger(
    new Logger({
      level,
      format: 'json',
      write: (l) => recs.push(JSON.parse(l) as Record<string, unknown>),
      now: () => 'T',
    }),
  );
  return recs;
}

const baseInput: VerifyInput = {
  acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
  tests: { 'AC-1': [{ file: 'tests/foo.test.ts', line: 1, snippet: 'covers AC-1' }] },
  diff: '+ new line',
  files: ['src/foo.ts'],
};

afterEach(() => resetLogger());

describe('verify seam logging — anthropic (AC-3)', () => {
  it('AC-3: emits seam:verify request + response records with token usage', async () => {
    const recs = captureRecords('debug');
    const parse = vi.fn().mockResolvedValue({
      parsed_output: { verdicts: [{ id: 'AC-1', pass: true, reason: 'ok' }] },
      usage: { input_tokens: 123, output_tokens: 45 },
    });
    const client = { messages: { parse } } as unknown as Anthropic;
    await new AnthropicVerifier({ client }).verify(baseInput);

    const verify = recs.filter((r) => r.seam === 'verify');
    expect(verify.find((r) => r.msg === 'verify request')).toMatchObject({
      fields: { provider: 'anthropic', acs: 1 },
    });
    expect(verify.find((r) => r.msg === 'verify response')).toMatchObject({
      fields: { provider: 'anthropic', inputTokens: 123, outputTokens: 45 },
    });
  });

  it('AC-3: emits a seam:verify warn on a provider error before propagating', async () => {
    const recs = captureRecords('debug');
    const client = {
      messages: { parse: vi.fn().mockRejectedValueOnce(new Error('network bork')) },
    } as unknown as Anthropic;
    await expect(new AnthropicVerifier({ client }).verify(baseInput)).rejects.toThrow(/network bork/);
    expect(recs.find((r) => r.seam === 'verify' && r.msg === 'verify error')).toMatchObject({
      level: 'warn',
    });
  });

  it('AC-3/AC-6: emits nothing at the silent default', async () => {
    const recs = captureRecords('silent');
    const parse = vi.fn().mockResolvedValue({
      parsed_output: { verdicts: [{ id: 'AC-1', pass: true, reason: 'ok' }] },
    });
    await new AnthropicVerifier({ client: { messages: { parse } } as unknown as Anthropic }).verify(baseInput);
    expect(recs).toHaveLength(0);
  });
});

describe('verify seam logging — local (AC-3)', () => {
  const schema = z.object({ ok: z.boolean() });

  function okTransport(usage?: { prompt_tokens: number; completion_tokens: number }) {
    return vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ok":true}' } }],
        ...(usage ? { usage } : {}),
      }),
    }) as unknown as typeof fetch;
  }

  it('AC-3: emits seam:verify request + response(usage) records', async () => {
    const recs = captureRecords('debug');
    await localChatJSON({
      baseURL: 'http://local',
      model: 'm',
      system: 's',
      user: 'u',
      schema,
      transport: okTransport({ prompt_tokens: 10, completion_tokens: 7 }),
    });
    const verify = recs.filter((r) => r.seam === 'verify');
    expect(verify.find((r) => r.msg === 'verify request')).toMatchObject({
      fields: { provider: 'local', baseURL: 'http://local', model: 'm' },
    });
    expect(verify.find((r) => r.msg === 'verify response')).toMatchObject({
      fields: { inputTokens: 10, outputTokens: 7 },
    });
  });

  it('AC-3: emits a seam:verify warn on a non-OK HTTP response', async () => {
    const recs = captureRecords('debug');
    const transport = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    await expect(
      localChatJSON({ baseURL: 'http://local', model: 'm', system: 's', user: 'u', schema, transport }),
    ).rejects.toThrow(/HTTP 503/);
    expect(recs.find((r) => r.seam === 'verify' && r.msg === 'verify error')).toMatchObject({
      level: 'warn',
      fields: { status: 503 },
    });
  });

  it('AC-5: never logs auth header values', async () => {
    const recs = captureRecords('debug');
    await localChatJSON({
      baseURL: 'http://local',
      model: 'm',
      system: 's',
      user: 'u',
      schema,
      headers: { Authorization: 'Bearer super-secret-token' },
      transport: okTransport({ prompt_tokens: 1, completion_tokens: 1 }),
    });
    const serialized = JSON.stringify(recs);
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('Authorization');
  });
});
