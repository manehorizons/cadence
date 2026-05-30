import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { Draft } from '@manehorizons/cadence-types';
import {
  AnthropicPlanReviewVerifier,
  MockPlanReviewVerifier,
} from '../../src/verify/plan-review.js';
import { selectPlanReviewVerifier } from '../../src/verify/plan-review-factory.js';

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

describe('selectPlanReviewVerifier (AC-1)', () => {
  it('returns mock by default', () => {
    const v = selectPlanReviewVerifier(null, { env: {} });
    expect(v.name).toBe('mock');
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
