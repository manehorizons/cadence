import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicCodeReviewVerifier,
  MockCodeReviewVerifier,
  type CodeReviewInput,
} from '../../src/verify/code-review.js';
import { selectCodeReviewVerifier } from '../../src/verify/code-review-factory.js';

const cleanDiff = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export const x = 1;
+export const y = 2;
 export const z = 3;
`;

const dirtyDiff = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,5 @@
 export const x = 1;
+console.log('hi');
+console.log('there');
 export const z = 3;
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -10,1 +10,2 @@
 const v = 1;
+console.log(v);
`;

describe('MockCodeReviewVerifier (AC-2)', () => {
  it('returns empty findings on empty diff', async () => {
    const v = new MockCodeReviewVerifier();
    const r = await v.verify({ files: ['src/foo.ts'], diff: '' });
    expect(r.findings).toEqual({});
    expect(r.provider).toBe('mock');
  });

  it('returns empty findings when no console.log additions', async () => {
    const v = new MockCodeReviewVerifier();
    const r = await v.verify({ files: ['src/foo.ts'], diff: cleanDiff });
    expect(r.findings).toEqual({});
  });

  it('flags every added console.log as HIGH, per file', async () => {
    const v = new MockCodeReviewVerifier();
    const r = await v.verify({
      files: ['src/foo.ts', 'src/bar.ts'],
      diff: dirtyDiff,
    });
    expect(r.findings['src/foo.ts']).toHaveLength(2);
    expect(r.findings['src/foo.ts']![0]).toMatchObject({
      severity: 'high',
      message: 'console.log left in source',
      line: 2,
    });
    expect(r.findings['src/bar.ts']).toHaveLength(1);
    expect(r.findings['src/bar.ts']![0]).toMatchObject({
      severity: 'high',
      line: 11,
    });
  });

  it('ignores `++` doubled markers (file-header rows)', async () => {
    const v = new MockCodeReviewVerifier();
    // A unified diff has `+++ b/foo` headers; these must not trip the rule.
    const diff = `+++ b/src/foo.ts\n@@ -1,1 +1,1 @@\n+const x = 1;\n`;
    const r = await v.verify({ files: ['src/foo.ts'], diff });
    expect(r.findings).toEqual({});
  });
});

function makeMockClient(parsedOutput: unknown): Anthropic {
  const parse = vi.fn().mockResolvedValue({ parsed_output: parsedOutput });
  return { messages: { parse } } as unknown as Anthropic;
}

const input: CodeReviewInput = {
  files: ['src/foo.ts'],
  diff: '+ console.log("bad")',
};

describe('AnthropicCodeReviewVerifier (AC-3)', () => {
  it('returns per-file findings on success', async () => {
    const client = makeMockClient({
      findings: [
        { file: 'src/foo.ts', severity: 'high', message: 'debug log', line: 7 },
        { file: 'src/foo.ts', severity: 'low', message: 'naming nit' },
      ],
    });
    const v = new AnthropicCodeReviewVerifier({ client });
    const r = await v.verify(input);
    expect(r.provider).toBe('anthropic');
    expect(r.model).toBe('claude-sonnet-4-6');
    expect(r.findings['src/foo.ts']).toEqual([
      { severity: 'high', message: 'debug log', line: 7 },
      { severity: 'low', message: 'naming nit' },
    ]);
  });

  it('returns empty findings without an API call when no files + no diff', async () => {
    const parse = vi.fn();
    const client = { messages: { parse } } as unknown as Anthropic;
    const v = new AnthropicCodeReviewVerifier({ client });
    const r = await v.verify({ files: [], diff: '' });
    expect(r.findings).toEqual({});
    expect(parse).not.toHaveBeenCalled();
  });

  it('throws when parsed_output is null', async () => {
    const client = makeMockClient(null);
    const v = new AnthropicCodeReviewVerifier({ client });
    await expect(v.verify(input)).rejects.toThrow(/no parseable output/);
  });

  it('propagates non-API errors', async () => {
    const client = {
      messages: {
        parse: vi.fn().mockRejectedValueOnce(new Error('net bork')),
      },
    } as unknown as Anthropic;
    const v = new AnthropicCodeReviewVerifier({ client });
    await expect(v.verify(input)).rejects.toThrow(/net bork/);
  });

  it('refuses to construct without an API key', () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new AnthropicCodeReviewVerifier()).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }
  });
});

describe('selectCodeReviewVerifier (AC-1)', () => {
  it('returns mock by default', () => {
    const v = selectCodeReviewVerifier(null, { env: {} });
    expect(v.name).toBe('mock');
  });

  it('returns anthropic when configured + key present', () => {
    const v = selectCodeReviewVerifier(
      { codeReview: { provider: 'anthropic' } },
      { env: { ANTHROPIC_API_KEY: 'sk-test' } },
    );
    expect(v.name).toBe('anthropic');
  });

  it('falls back to mock + warn when key missing', () => {
    const warnings: string[] = [];
    const v = selectCodeReviewVerifier(
      { codeReview: { provider: 'anthropic' } },
      { env: {}, warn: (m) => warnings.push(m) },
    );
    expect(v.name).toBe('mock');
    expect(warnings[0]).toMatch(/ANTHROPIC_API_KEY is unset/);
  });

  it('override wins over config', () => {
    const v = selectCodeReviewVerifier(
      { codeReview: { provider: 'anthropic' } },
      { env: { ANTHROPIC_API_KEY: 'sk-test' }, override: 'mock' },
    );
    expect(v.name).toBe('mock');
  });
});
