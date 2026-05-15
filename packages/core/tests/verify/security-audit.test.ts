import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicSecurityAuditVerifier,
  MockSecurityAuditVerifier,
  type SecurityAuditInput,
} from '../../src/verify/security-audit.js';
import { selectSecurityAuditVerifier } from '../../src/verify/security-audit-factory.js';

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

describe('selectSecurityAuditVerifier (AC-1)', () => {
  it('returns mock by default', () => {
    const v = selectSecurityAuditVerifier(null, { env: {} });
    expect(v.name).toBe('mock');
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
