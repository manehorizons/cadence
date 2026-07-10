import { MOCK_VERIFIER_NOTICE } from '@manehorizons/cadence-types';
import { discoverKey } from '../activate/key-discovery.js';

export type VerifierProvider = 'mock' | 'anthropic' | 'local';

/** Shared options for every `select…Verifier` factory (Phase 40.1). */
export interface VerifierSelectOptions {
  /** Overrides the configured provider. */
  override?: VerifierProvider;
  /** Test seam: stand in for `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: emit warnings somewhere other than `process.stderr`. */
  warn?: (message: string) => void;
  /** Where a `.env` file is discovered (default `process.cwd()`) — a key found
   *  there is treated the same as one exported into the env (AC-1). */
  cwd?: string;
}

/**
 * Describes one verifier family: how to read its `{ provider, model }` config
 * slice and how to build each of its three providers. `C` is the (Pick) config
 * param the binding accepts; `V` is the verifier type produced.
 */
export interface VerifierFactorySpec<C, V> {
  /** Warning-prefix label, e.g. `'code-review'`. */
  label: string;
  /** Read this family's config slice. `model` and the Phase-72 hardening fields
   *  admit `| undefined` so the (exactOptionalPropertyTypes) config slices
   *  assign directly. Families without the hardening fields (everything but the
   *  top-level `verifier` slice) simply return them as `undefined`. */
  read(config: C | null):
    | {
        provider?: VerifierProvider;
        model?: string | undefined;
        /** Phase 72: anthropic request timeout (ms). */
        timeoutMs?: number | undefined;
        /** Phase 72: anthropic retry budget. */
        maxRetries?: number | undefined;
        /** Phase 72: extra headers for the local provider. */
        localHeaders?: Record<string, string> | undefined;
      }
    | undefined;
  mock(): V;
  anthropic(opts: {
    apiKey: string;
    model?: string;
    timeout?: number;
    maxRetries?: number;
  }): V;
  local(opts: {
    baseURL: string;
    model: string;
    headers?: Record<string, string>;
  }): V;
}

/**
 * Phase 72: pure builder for the `local` provider's extra headers. Returns a
 * bearer `Authorization` from `apiKey` merged under any `custom` headers (custom
 * wins), or `undefined` when there is nothing to send so the caller can omit the
 * key entirely. Header values are secrets — never log the result.
 */
export function buildLocalHeaders(
  apiKey: string | undefined,
  custom: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const merged: Record<string, string> = {};
  if (apiKey) merged.Authorization = `Bearer ${apiKey}`;
  if (custom) Object.assign(merged, custom);
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Build a `select…Verifier(config, opts)` function (Phase 40.1 consolidation of
 * six byte-identical factories). One selection algorithm:
 * `provider = override ?? slice.provider ?? 'mock'`; the `anthropic` provider
 * needs `ANTHROPIC_API_KEY`; the `local` provider needs `CADENCE_LOCAL_BASE_URL`
 * and a model (`slice.model ?? CADENCE_LOCAL_MODEL`); a missing prerequisite
 * falls back to `mock` with one stderr warning so the caller knows it downgraded.
 */
/**
 * Mirrors the selection algorithm's first line without building a verifier or
 * touching env: `provider = override ?? slice.provider ?? 'mock'`. `defaulted`
 * is true only when the provider fell through to `'mock'` with no explicit
 * choice — that is the silent-false-confidence case worth warning about. An
 * explicit `mock` (config or override) is NOT defaulted.
 */
export function resolveEffectiveProvider(
  slice: { provider?: VerifierProvider } | undefined,
  opts: { override?: VerifierProvider } = {},
): { provider: VerifierProvider; defaulted: boolean } {
  const provider = opts.override ?? slice?.provider ?? 'mock';
  const defaulted =
    opts.override === undefined && slice?.provider === undefined;
  return { provider, defaulted };
}

const PROVIDERS_DOC =
  'https://github.com/manehorizons/cadence/blob/main/docs/providers.md';

/**
 * Prominent stderr banner for the mock case under a verification gate.
 * Phase 104: rendered from the single source-of-truth `MOCK_VERIFIER_NOTICE`
 * so the "mock = not real verification" wording stays identical to `doctor`,
 * `init`, and `config explain` (no duplicated honesty literal).
 */
export const MOCK_FALLBACK_BANNER = [
  '',
  `  ⚠  ${MOCK_VERIFIER_NOTICE.label.toUpperCase()}`,
  `     ${MOCK_VERIFIER_NOTICE.message}`,
  `     ${PROVIDERS_DOC}`,
  '',
].join('\n');

export function createVerifierFactory<C, V>(
  spec: VerifierFactorySpec<C, V>,
): (config: C | null, opts?: VerifierSelectOptions) => V {
  return (config: C | null, opts: VerifierSelectOptions = {}): V => {
    const slice = spec.read(config);
    const provider = opts.override ?? slice?.provider ?? 'mock';
    const env = opts.env ?? process.env;
    const cwd = opts.cwd ?? process.cwd();
    const warn = opts.warn ?? ((m: string) => process.stderr.write(m + '\n'));

    if (provider === 'anthropic') {
      const apiKey = discoverKey('ANTHROPIC_API_KEY', env, cwd).value;
      if (!apiKey) {
        warn(
          `${spec.label}: anthropic provider requested but ANTHROPIC_API_KEY is unset — falling back to mock provider.`,
        );
        return spec.mock();
      }
      const model = slice?.model;
      return spec.anthropic({
        apiKey,
        ...(model ? { model } : {}),
        ...(slice?.timeoutMs !== undefined ? { timeout: slice.timeoutMs } : {}),
        ...(slice?.maxRetries !== undefined
          ? { maxRetries: slice.maxRetries }
          : {}),
      });
    }

    if (provider === 'local') {
      const baseURL = discoverKey('CADENCE_LOCAL_BASE_URL', env, cwd).value;
      const model = slice?.model ?? discoverKey('CADENCE_LOCAL_MODEL', env, cwd).value;
      if (!baseURL || !model) {
        warn(
          `${spec.label}: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.`,
        );
        return spec.mock();
      }
      const localApiKey = discoverKey('CADENCE_LOCAL_API_KEY', env, cwd).value;
      const headers = buildLocalHeaders(localApiKey, slice?.localHeaders);
      return spec.local({ baseURL, model, ...(headers ? { headers } : {}) });
    }

    return spec.mock();
  };
}
