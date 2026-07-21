import { describe, it, expect } from 'vitest';
import type { UiSpec } from '@manehorizons/cadence-types';
import {
  MockUiSpecReviewVerifier,
  AnthropicUiSpecReviewVerifier,
} from '../../src/verify/ui-spec-review.js';

function uiSpec(overrides: Partial<UiSpec> = {}): UiSpec {
  return {
    schemaVersion: 1,
    id: '205-01',
    phase: '205-ui-spec-gate',
    components: [],
    responsiveInteraction: [],
    status: 'PENDING',
    ...overrides,
  };
}

describe('MockUiSpecReviewVerifier', () => {
  const v = new MockUiSpecReviewVerifier();

  it('AC-3: fails with a HIGH finding when there are zero components', async () => {
    const res = await v.verify({ uiSpec: uiSpec({ responsiveInteraction: ['x'] }) });
    expect(res.pass).toBe(false);
    expect(res.findings.some((f) => f.severity === 'high' && /no components/.test(f.message))).toBe(true);
  });

  it('AC-3: fails and names the component when Layout & Tokens is empty (the precedent-only case)', async () => {
    const res = await v.verify({
      uiSpec: uiSpec({
        components: [
          { name: 'StructuredWizardShell', detail: [], layoutTokens: [], precedent: ["reuse existing shell"] },
        ],
        responsiveInteraction: ['x'],
      }),
    });
    expect(res.pass).toBe(false);
    expect(
      res.findings.some(
        (f) => f.severity === 'high' && f.message.includes('StructuredWizardShell'),
      ),
    ).toBe(true);
  });

  it('AC-3: fails when Responsive & Interaction is empty', async () => {
    const res = await v.verify({
      uiSpec: uiSpec({
        components: [{ name: 'X', detail: [], layoutTokens: ['spacing-4'], precedent: [] }],
      }),
    });
    expect(res.pass).toBe(false);
    expect(res.findings.some((f) => /responsive\/interaction/.test(f.message))).toBe(true);
  });

  it('passes when every component has Layout & Tokens and Responsive & Interaction is non-empty', async () => {
    const res = await v.verify({
      uiSpec: uiSpec({
        components: [{ name: 'X', detail: [], layoutTokens: ['spacing-4'], precedent: [] }],
        responsiveInteraction: ['collapses below 768px'],
      }),
    });
    expect(res.pass).toBe(true);
    expect(res.findings).toEqual([]);
  });
});

describe('AnthropicUiSpecReviewVerifier construction', () => {
  it('constructing does not make a network call (lazy, mirrors spec-review)', () => {
    expect(() => new AnthropicUiSpecReviewVerifier({ apiKey: 'sk-test-unused' })).not.toThrow();
  });

  it('throws without an api key or client', () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new AnthropicUiSpecReviewVerifier()).toThrow();
    } finally {
      if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });
});
