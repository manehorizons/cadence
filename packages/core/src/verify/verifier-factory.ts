export type VerifierProvider = 'mock' | 'anthropic' | 'local';

/** Shared options for every `select…Verifier` factory (Phase 40.1). */
export interface VerifierSelectOptions {
  /** Overrides the configured provider. */
  override?: VerifierProvider;
  /** Test seam: stand in for `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: emit warnings somewhere other than `process.stderr`. */
  warn?: (message: string) => void;
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

/** Prominent stderr banner for the silent mock-default case under real verify. */
export const MOCK_FALLBACK_BANNER = [
  '',
  '  ┌─────────────────────────────────────────────────────────────────┐',
  '  │  ⚠  MOCK verification — results are NOT real.                     │',
  '  │     No verifier provider is configured, so --deep used the        │',
  '  │     deterministic mock. Set ANTHROPIC_API_KEY (or configure a     │',
  '  │     provider) for genuine verification.                           │',
  '  └─────────────────────────────────────────────────────────────────┘',
  '  https://github.com/manehorizons/cadence/blob/main/docs/providers.md',
  '',
].join('\n');

export function createVerifierFactory<C, V>(
  spec: VerifierFactorySpec<C, V>,
): (config: C | null, opts?: VerifierSelectOptions) => V {
  return (config: C | null, opts: VerifierSelectOptions = {}): V => {
    const slice = spec.read(config);
    const provider = opts.override ?? slice?.provider ?? 'mock';
    const env = opts.env ?? process.env;
    const warn = opts.warn ?? ((m: string) => process.stderr.write(m + '\n'));

    if (provider === 'anthropic') {
      if (!env.ANTHROPIC_API_KEY) {
        warn(
          `${spec.label}: anthropic provider requested but ANTHROPIC_API_KEY is unset — falling back to mock provider.`,
        );
        return spec.mock();
      }
      const model = slice?.model;
      return spec.anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        ...(model ? { model } : {}),
        ...(slice?.timeoutMs !== undefined ? { timeout: slice.timeoutMs } : {}),
        ...(slice?.maxRetries !== undefined
          ? { maxRetries: slice.maxRetries }
          : {}),
      });
    }

    if (provider === 'local') {
      const baseURL = env.CADENCE_LOCAL_BASE_URL;
      const model = slice?.model ?? env.CADENCE_LOCAL_MODEL;
      if (!baseURL || !model) {
        warn(
          `${spec.label}: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.`,
        );
        return spec.mock();
      }
      const headers = buildLocalHeaders(env.CADENCE_LOCAL_API_KEY, slice?.localHeaders);
      return spec.local({ baseURL, model, ...(headers ? { headers } : {}) });
    }

    return spec.mock();
  };
}
