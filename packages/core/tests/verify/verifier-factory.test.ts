import { describe, it, expect } from 'vitest';
import { createVerifierFactory } from '../../src/verify/verifier-factory.js';

// A trivial verifier family: each provider returns a tagged object so the test
// can assert which branch fired and what payload it received.
type FakeV = { kind: 'mock' } | { kind: 'anthropic'; model?: string } | { kind: 'local'; baseURL: string; model: string };

interface FakeConfig {
  fake?: { provider?: 'mock' | 'anthropic' | 'local'; model?: string };
}

const select = createVerifierFactory<FakeConfig, FakeV>({
  label: 'fake',
  read: (c) => c?.fake,
  mock: () => ({ kind: 'mock' }),
  anthropic: (o) => ({ kind: 'anthropic', ...(o.model ? { model: o.model } : {}) }),
  local: (o) => ({ kind: 'local', baseURL: o.baseURL, model: o.model }),
});

describe('createVerifierFactory', () => {
  it('defaults to mock (no config, no override)', () => {
    expect(select(null, { env: {} })).toEqual({ kind: 'mock' });
  });

  it('honors the override over the config slice', () => {
    const v = select({ fake: { provider: 'mock' } }, { override: 'anthropic', env: { ANTHROPIC_API_KEY: 'k' } });
    expect(v).toEqual({ kind: 'anthropic' });
  });

  it('anthropic with a key passes the configured model', () => {
    const v = select({ fake: { provider: 'anthropic', model: 'm1' } }, { env: { ANTHROPIC_API_KEY: 'k' } });
    expect(v).toEqual({ kind: 'anthropic', model: 'm1' });
  });

  it('anthropic without a key falls back to mock with the labeled warning', () => {
    const warns: string[] = [];
    const v = select({ fake: { provider: 'anthropic' } }, { env: {}, warn: (m) => warns.push(m) });
    expect(v).toEqual({ kind: 'mock' });
    expect(warns).toEqual([
      'fake: anthropic provider requested but ANTHROPIC_API_KEY is unset — falling back to mock provider.',
    ]);
  });

  it('local resolves baseURL + model (slice.model wins over env), no warning', () => {
    const warns: string[] = [];
    const v = select(
      { fake: { provider: 'local', model: 'cfg-model' } },
      { env: { CADENCE_LOCAL_BASE_URL: 'http://x', CADENCE_LOCAL_MODEL: 'env-model' }, warn: (m) => warns.push(m) },
    );
    expect(v).toEqual({ kind: 'local', baseURL: 'http://x', model: 'cfg-model' });
    expect(warns).toEqual([]);
  });

  it('local falls back to env model when the slice has none', () => {
    const v = select(
      { fake: { provider: 'local' } },
      { env: { CADENCE_LOCAL_BASE_URL: 'http://x', CADENCE_LOCAL_MODEL: 'env-model' } },
    );
    expect(v).toEqual({ kind: 'local', baseURL: 'http://x', model: 'env-model' });
  });

  it('local without baseURL/model falls back to mock with the labeled warning', () => {
    const warns: string[] = [];
    const v = select({ fake: { provider: 'local' } }, { env: {}, warn: (m) => warns.push(m) });
    expect(v).toEqual({ kind: 'mock' });
    expect(warns).toEqual([
      'fake: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.',
    ]);
  });
});
