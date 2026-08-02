import { describe, it, expect } from 'vitest';
import { defaultConfig } from '@thomas-powers-jr/cadence-types';
import {
  HostCliUiSpecReviewVerifier,
  MockUiSpecReviewVerifier,
} from '../../src/verify/ui-spec-review.js';
import { selectUiSpecReviewVerifier } from '../../src/verify/ui-spec-review-factory.js';

// rec-20260711-004 — mirrors spec-review.test.ts's
// `describe('selectSpecReviewVerifier (AC-1)', ...)` fixture style.

describe('selectUiSpecReviewVerifier (AC-3)', () => {
  it('returns mock by default', () => {
    const v = selectUiSpecReviewVerifier(null, { env: {} });
    expect(v.name).toBe('mock');
    expect(v).toBeInstanceOf(MockUiSpecReviewVerifier);
  });

  it('defaults to mock when uiSpecReview.provider is mock', () => {
    const v = selectUiSpecReviewVerifier(defaultConfig, { env: {} });
    expect(v.name).toBe('mock');
  });

  it('falls back to mock with a warning when anthropic is requested but no API key is discoverable', () => {
    const cfg = { ...defaultConfig, uiSpecReview: { provider: 'anthropic' as const } };
    const warnings: string[] = [];
    const v = selectUiSpecReviewVerifier(cfg, {
      env: {},
      warn: (m) => warnings.push(m),
    });
    expect(v.name).toBe('mock');
    expect(warnings.some((w) => w.includes('ui-spec-review'))).toBe(true);
  });

  it('resolves host-cli config to a HostCliUiSpecReviewVerifier instance, not a mock fallback', () => {
    const v = selectUiSpecReviewVerifier(
      { uiSpecReview: { provider: 'host-cli' } },
      { env: {} },
    );
    expect(v.name).toBe('host-cli');
    expect(v).toBeInstanceOf(HostCliUiSpecReviewVerifier);
  });
});
