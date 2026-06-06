import { describe, it, expect } from 'vitest';
import {
  buildLocalHeaders,
  createVerifierFactory,
} from '../../src/verify/verifier-factory.js';

// A trivial verifier family: each provider returns a tagged object so the test
// can assert which branch fired and what payload it received.
type FakeV =
  | { kind: 'mock' }
  | { kind: 'anthropic'; model?: string; timeout?: number; maxRetries?: number }
  | { kind: 'local'; baseURL: string; model: string; headers?: Record<string, string> };

interface FakeConfig {
  fake?: {
    provider?: 'mock' | 'anthropic' | 'local';
    model?: string;
    timeoutMs?: number;
    maxRetries?: number;
    localHeaders?: Record<string, string>;
  };
}

const select = createVerifierFactory<FakeConfig, FakeV>({
  label: 'fake',
  read: (c) => c?.fake,
  mock: () => ({ kind: 'mock' }),
  anthropic: (o) => ({
    kind: 'anthropic',
    ...(o.model ? { model: o.model } : {}),
    ...(o.timeout !== undefined ? { timeout: o.timeout } : {}),
    ...(o.maxRetries !== undefined ? { maxRetries: o.maxRetries } : {}),
  }),
  local: (o) => ({
    kind: 'local',
    baseURL: o.baseURL,
    model: o.model,
    ...(o.headers ? { headers: o.headers } : {}),
  }),
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

  // AC-1 (Phase 72) — provider-hardening opts flow from the slice to anthropic.
  it('anthropic receives timeoutMs + maxRetries from the slice', () => {
    const v = select(
      { fake: { provider: 'anthropic', timeoutMs: 30_000, maxRetries: 4 } },
      { env: { ANTHROPIC_API_KEY: 'k' } },
    );
    expect(v).toEqual({ kind: 'anthropic', timeout: 30_000, maxRetries: 4 });
  });

  it('anthropic without hardening opts stays bare (SDK defaults hold)', () => {
    const v = select({ fake: { provider: 'anthropic' } }, { env: { ANTHROPIC_API_KEY: 'k' } });
    expect(v).toEqual({ kind: 'anthropic' });
  });

  // AC-2 (Phase 72) — local auth from env + custom headers from the slice.
  it('local merges CADENCE_LOCAL_API_KEY bearer + slice.localHeaders', () => {
    const v = select(
      { fake: { provider: 'local', localHeaders: { 'x-tenant': 'acme' } } },
      {
        env: {
          CADENCE_LOCAL_BASE_URL: 'http://x',
          CADENCE_LOCAL_MODEL: 'm',
          CADENCE_LOCAL_API_KEY: 'sk-local',
        },
      },
    );
    expect(v).toEqual({
      kind: 'local',
      baseURL: 'http://x',
      model: 'm',
      headers: { Authorization: 'Bearer sk-local', 'x-tenant': 'acme' },
    });
  });

  it('local with no auth/headers omits headers entirely', () => {
    const v = select(
      { fake: { provider: 'local' } },
      { env: { CADENCE_LOCAL_BASE_URL: 'http://x', CADENCE_LOCAL_MODEL: 'm' } },
    );
    expect(v).toEqual({ kind: 'local', baseURL: 'http://x', model: 'm' });
  });
});

describe('buildLocalHeaders (AC-2, Phase 72)', () => {
  it('returns undefined when neither key nor custom headers given', () => {
    expect(buildLocalHeaders(undefined, undefined)).toBeUndefined();
    expect(buildLocalHeaders(undefined, {})).toBeUndefined();
  });

  it('builds a bearer Authorization from the api key', () => {
    expect(buildLocalHeaders('sk-local', undefined)).toEqual({
      Authorization: 'Bearer sk-local',
    });
  });

  it('merges custom headers, letting custom override the derived bearer', () => {
    expect(
      buildLocalHeaders('sk-local', { Authorization: 'Bearer override', 'x-a': '1' }),
    ).toEqual({ Authorization: 'Bearer override', 'x-a': '1' });
  });
});
