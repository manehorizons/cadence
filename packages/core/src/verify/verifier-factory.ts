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
  /** Read this family's `{ provider, model }` slice off the config. `model`
   *  admits `| undefined` so the (exactOptionalPropertyTypes) config slices
   *  assign directly. */
  read(
    config: C | null,
  ): { provider?: VerifierProvider; model?: string | undefined } | undefined;
  mock(): V;
  anthropic(opts: { apiKey: string; model?: string }): V;
  local(opts: { baseURL: string; model: string }): V;
}

/**
 * Build a `select…Verifier(config, opts)` function (Phase 40.1 consolidation of
 * six byte-identical factories). One selection algorithm:
 * `provider = override ?? slice.provider ?? 'mock'`; the `anthropic` provider
 * needs `ANTHROPIC_API_KEY`; the `local` provider needs `CADENCE_LOCAL_BASE_URL`
 * and a model (`slice.model ?? CADENCE_LOCAL_MODEL`); a missing prerequisite
 * falls back to `mock` with one stderr warning so the caller knows it downgraded.
 */
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
      return spec.local({ baseURL, model });
    }

    return spec.mock();
  };
}
