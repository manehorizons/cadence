import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicVerifier,
  formatUserMessage,
} from '../../src/verify/anthropic-verifier.js';
import type { VerifyInput } from '../../src/verify/verifier.js';

// AC-2: happy path — parses verdicts from a successful API call
// AC-2: empty input short-circuits without an API call
// AC-2: model field is recorded in the result
// AC-5: null parsed_output throws a descriptive error
// AC-5: network/HTTP errors propagate
// AC-5: construction without API key or injected client throws

function makeMockClient(parsedOutput: unknown): Anthropic {
  const parse = vi.fn().mockResolvedValue({ parsed_output: parsedOutput });
  return { messages: { parse } } as unknown as Anthropic;
}

const baseInput: VerifyInput = {
  acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
  tests: {
    'AC-1': [{ file: 'tests/foo.test.ts', line: 1, snippet: 'covers AC-1' }],
  },
  diff: '+ new line',
  files: ['src/foo.ts'],
};

describe('formatUserMessage — id binding + example (AC-1, Phase 29.7 G1)', () => {
  it('lists every AC id and demands one verdict per exact id', () => {
    const msg = formatUserMessage({
      acs: [
        { id: 'AC-1', given: 'g1', when: 'w1', then: 't1' },
        { id: 'AC-2', given: 'g2', when: 'w2', then: 't2' },
      ],
      tests: {},
      diff: '+x',
      files: ['a.ts'],
    });
    expect(msg).toMatch(/exactly one verdict object per acceptance criterion: AC-1, AC-2/);
    expect(msg).toMatch(/"id" MUST be the exact AC id string/);
  });

  it('embeds a schema-conforming JSON example with one entry per AC id', () => {
    const msg = formatUserMessage({
      acs: [
        { id: 'AC-1', given: 'g', when: 'w', then: 't' },
        { id: 'AC-2', given: 'g', when: 'w', then: 't' },
      ],
      tests: {},
      diff: '',
      files: [],
    });
    const m = msg.match(/\{"verdicts":\[.*\]\}/);
    expect(m).not.toBeNull();
    const parsed = JSON.parse(m![0]) as {
      verdicts: { id: string; pass: boolean; reason: string }[];
    };
    expect(parsed.verdicts.map((v) => v.id)).toEqual(['AC-1', 'AC-2']);
    expect(typeof parsed.verdicts[0]!.pass).toBe('boolean');
    expect(typeof parsed.verdicts[0]!.reason).toBe('string');
  });
});

describe('AnthropicVerifier (AC-2 + AC-5)', () => {
  it('returns verdicts from a successful API call (AC-2)', async () => {
    const client = makeMockClient({
      verdicts: [
        { id: 'AC-1', pass: true, reason: 'implementation verified' },
      ],
    });
    const v = new AnthropicVerifier({ client });
    const r = await v.verify(baseInput);
    expect(r.provider).toBe('anthropic');
    expect(r.model).toBe('claude-sonnet-4-6');
    expect(r.verdicts['AC-1']).toEqual({
      pass: true,
      reason: 'implementation verified',
    });
  });

  it('honors the model override (AC-2)', async () => {
    const client = makeMockClient({
      verdicts: [{ id: 'AC-1', pass: true, reason: 'ok' }],
    });
    const v = new AnthropicVerifier({ client, model: 'claude-haiku-4-5' });
    const r = await v.verify(baseInput);
    expect(r.model).toBe('claude-haiku-4-5');
  });

  it('empty input short-circuits without an API call (AC-2)', async () => {
    const parse = vi.fn();
    const client = { messages: { parse } } as unknown as Anthropic;
    const v = new AnthropicVerifier({ client });
    const r = await v.verify({ acs: [], tests: {}, diff: '', files: [] });
    expect(r.verdicts).toEqual({});
    expect(r.provider).toBe('anthropic');
    expect(parse).not.toHaveBeenCalled();
  });

  it('throws when the model returns no parseable output (AC-5)', async () => {
    const client = makeMockClient(null);
    const v = new AnthropicVerifier({ client });
    await expect(v.verify(baseInput)).rejects.toThrow(/no parseable output/);
  });

  it('propagates errors from the API client (AC-5)', async () => {
    const client = {
      messages: {
        parse: vi.fn().mockRejectedValueOnce(new Error('network bork')),
      },
    } as unknown as Anthropic;
    const v = new AnthropicVerifier({ client });
    await expect(v.verify(baseInput)).rejects.toThrow(/network bork/);
  });

  it('refuses to construct without an API key or injected client (AC-5)', () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new AnthropicVerifier()).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }
  });

  it('accepts an explicit apiKey instead of an injected client (AC-2)', () => {
    // Should not throw — instantiates internal client lazily.
    const v = new AnthropicVerifier({ apiKey: 'sk-test-placeholder' });
    expect(v.name).toBe('anthropic');
  });
});
