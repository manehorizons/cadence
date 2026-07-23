import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CadenceConfigZ, defaultConfig } from '@manehorizons/cadence-types';
import {
  buildLocalHeaders,
  createVerifierFactory,
  type VerifierProvider,
} from '../../src/verify/verifier-factory.js';
import { selectVerifier } from '../../src/verify/factory.js';
import { AnthropicVerifier } from '../../src/verify/anthropic-verifier.js';
import { MockVerifier } from '../../src/verify/mock-verifier.js';
import { HostCliError } from '../../src/verify/host-cli-client.js';

const dirs: string[] = [];
const makeTmpDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'cadence-verifier-factory-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

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

  it('AC-1: anthropic without a key falls back to mock with the labeled warning, naming Claude Code login as insufficient', () => {
    const warns: string[] = [];
    const v = select({ fake: { provider: 'anthropic' } }, { env: {}, warn: (m) => warns.push(m) });
    expect(v).toEqual({ kind: 'mock' });
    expect(warns).toEqual([
      'fake: anthropic provider requested but ANTHROPIC_API_KEY is unset (a Claude Code/IDE login does not satisfy this — anthropic calls the Anthropic SDK directly and needs a separately API-billed key) — falling back to mock provider.',
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

  it('builds a real anthropic verifier from a key discoverable only via .env, not just env (AC-1, AC-3)', () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, '.env'), 'ANTHROPIC_API_KEY=from-dotenv\n');
    // Simulates a teammate: the provider ('anthropic') is already committed in
    // config, they never exported the env var, and never ran `cadence activate`
    // themselves — the key only lives in their local .env file.
    const warns: string[] = [];
    const v = select(
      { fake: { provider: 'anthropic' } },
      { env: {}, cwd, warn: (m) => warns.push(m) },
    );
    expect(v).toEqual({ kind: 'anthropic' });
    expect(warns).toEqual([]);
  });

  it('builds a real local verifier from CADENCE_LOCAL_BASE_URL/MODEL discoverable only via .env (AC-1)', () => {
    const cwd = makeTmpDir();
    writeFileSync(
      cwd + '/.env',
      'CADENCE_LOCAL_BASE_URL=http://dotenv-host\nCADENCE_LOCAL_MODEL=dotenv-model\nCADENCE_LOCAL_API_KEY=dotenv-key\n',
    );
    const v = select({ fake: { provider: 'local' } }, { env: {}, cwd });
    expect(v).toEqual({
      kind: 'local',
      baseURL: 'http://dotenv-host',
      model: 'dotenv-model',
      headers: { Authorization: 'Bearer dotenv-key' },
    });
  });

  it('without a .env and without the env var still falls back to mock (no cwd given)', () => {
    const warns: string[] = [];
    const v = select({ fake: { provider: 'anthropic' } }, { env: {}, warn: (m) => warns.push(m) });
    expect(v).toEqual({ kind: 'mock' });
    expect(warns.length).toBe(1);
  });
});

// AC-3 (Phase 164 T4) — one level more real than the fake-spec harness above:
// exercises the actual production wrapper (`selectVerifier`) over the real
// `CadenceConfig`/`CadenceConfigZ` shape from @manehorizons/cadence-types, and
// asserts the real `AnthropicVerifier` class is constructed (not a fake tag).
describe('selectVerifier — committed-config inheritance across teammates (AC-3, integration)', () => {
  it('a teammate who never ran `cadence activate` still gets real anthropic verification from a committed provider + a key discoverable only via .env', () => {
    const cwd = makeTmpDir();
    // Simulates a team repo: someone already ran `cadence activate` and
    // committed `.cadence/config.json` with `verifier.provider: 'anthropic'`.
    // This teammate clones fresh, never runs `cadence activate` themselves,
    // and never exports ANTHROPIC_API_KEY into their shell — the key only
    // exists in a real .env file at the repo root.
    writeFileSync(
      join(cwd, '.env'),
      'ANTHROPIC_API_KEY=sk-test-integration-placeholder\n',
    );
    const committedConfig = CadenceConfigZ.parse({
      ...defaultConfig,
      verifier: { provider: 'anthropic', diffCapBytes: 262144 },
    });

    const warns: string[] = [];
    // Real production wrapper (packages/core/src/verify/factory.ts), the same
    // one settle.ts etc. call — not the FakeV harness above.
    const verifier = selectVerifier(committedConfig, {
      env: {}, // no ANTHROPIC_API_KEY exported — must resolve via .env, not process.env
      cwd,
      warn: (m) => warns.push(m),
    });

    // Never call .verify() — constructing the Anthropic SDK client does no
    // network I/O, only invoking a client method would. Asserting identity
    // (constructor + name) proves the real provider was selected without any
    // network call.
    expect(verifier).toBeInstanceOf(AnthropicVerifier);
    expect(verifier).not.toBeInstanceOf(MockVerifier);
    expect(verifier.name).toBe('anthropic');
    // No fallback warning — this is real verification, not a silent mock downgrade.
    expect(warns).toEqual([]);
  });
});

// AC-2 (Phase 165 T3) — loud, non-blocking fallback to mock when the
// host-cli provider's own method rejects with a HostCliError (binary not
// found / spawn failure / non-zero exit — i.e. "not found on PATH or not
// authenticated"). Uses a second, method-bearing fake spec (unlike the
// tag-object `FakeV` above) because the fallback wrapper operates on real
// method calls, not on the object the factory returns synchronously.
interface FakeAsyncResult {
  result: string;
}
interface FakeAsyncVerifier {
  readonly name: string;
  verify(input: string): Promise<FakeAsyncResult>;
}
interface FakeAsyncConfig {
  fake?: { provider?: VerifierProvider; model?: string };
}

function makeAsyncSpec(hostCliVerify: FakeAsyncVerifier['verify']) {
  return createVerifierFactory<FakeAsyncConfig, FakeAsyncVerifier>({
    label: 'fake-async',
    read: (c) => c?.fake,
    mock: () => ({
      name: 'mock',
      verify: async (input: string) => ({ result: `mock:${input}` }),
    }),
    anthropic: () => {
      throw new Error('not exercised in these tests');
    },
    local: () => {
      throw new Error('not exercised in these tests');
    },
    hostCli: () => ({ name: 'host-cli', verify: hostCliVerify }),
  });
}

describe('host-cli fallback wrapping (AC-2, Phase 165 T3)', () => {
  it('falls back to mock, warns, and resolves quickly when verify() rejects with a HostCliError (not-found)', async () => {
    const warns: string[] = [];
    const select = makeAsyncSpec(async () => {
      throw new HostCliError('binary "claude" not found on PATH', 'not-found');
    });
    const v = select({ fake: { provider: 'host-cli' } }, { env: {}, warn: (m) => warns.push(m) });

    const HANG_TIMEOUT_MS = 200;
    const start = Date.now();
    const result = await Promise.race([
      v.verify('x'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AC-2: fallback hung instead of resolving')), HANG_TIMEOUT_MS),
      ),
    ]);
    const elapsedMs = Date.now() - start;

    // (a) does not throw/reject — resolves using mock's own behavior instead.
    expect(result).toEqual({ result: 'mock:x' });
    // (c) resolves fast — no artificial delay, no hang waiting on interactive auth.
    expect(elapsedMs).toBeLessThan(HANG_TIMEOUT_MS);
    // (b) a warning was emitted, mirroring the anthropic/local fallback pattern.
    expect(warns.length).toBe(1);
    expect(warns[0]).toContain('fake-async');
    expect(warns[0]).toContain('host-cli provider failed');
    expect(warns[0]).toContain('not-found');
    expect(warns[0]).toContain('falling back to mock');
  });

  it('falls back to mock on a non-zero-exit HostCliError (unauthenticated CLI)', async () => {
    const warns: string[] = [];
    const select = makeAsyncSpec(async () => {
      throw new HostCliError('"claude" exited with code 1: not logged in', 'nonzero-exit');
    });
    const v = select({ fake: { provider: 'host-cli' } }, { env: {}, warn: (m) => warns.push(m) });

    await expect(v.verify('y')).resolves.toEqual({ result: 'mock:y' });
    expect(warns.length).toBe(1);
    expect(warns[0]).toContain('nonzero-exit');
  });

  it('does NOT swallow a non-HostCliError failure (e.g. exhausted repair retries) — it propagates', async () => {
    const warns: string[] = [];
    const select = makeAsyncSpec(async () => {
      throw new Error('host-cli provider: model output failed JSON/schema validation after 2 repair retries');
    });
    const v = select({ fake: { provider: 'host-cli' } }, { env: {}, warn: (m) => warns.push(m) });

    await expect(v.verify('z')).rejects.toThrow(/repair retries/);
    expect(warns).toEqual([]);
  });

  it('the successful (non-throwing) host-cli path is used untouched, with no warning', async () => {
    const warns: string[] = [];
    const select = makeAsyncSpec(async (input: string) => ({ result: `host-cli:${input}` }));
    const v = select({ fake: { provider: 'host-cli' } }, { env: {}, warn: (m) => warns.push(m) });

    await expect(v.verify('ok')).resolves.toEqual({ result: 'host-cli:ok' });
    expect(warns).toEqual([]);
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
