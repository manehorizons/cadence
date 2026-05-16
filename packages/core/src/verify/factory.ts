import type { CadenceConfig } from '@cadence/types';
import { AnthropicVerifier } from './anthropic-verifier.js';
import { MockVerifier } from './mock-verifier.js';
import { LocalVerifier, type Verifier } from './verifier.js';

export interface SelectVerifierOptions {
  /** When provided, overrides `config.verifier.provider`. */
  override?: 'mock' | 'anthropic' | 'local';
  /** Test seam: stand in for `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: emit warnings somewhere other than `process.stderr`. */
  warn?: (message: string) => void;
}

/**
 * Picks the right verifier given config + env. Falls back to mock when the
 * Anthropic provider is requested but `ANTHROPIC_API_KEY` is missing — with
 * a stderr warning so the caller knows downgrading happened.
 */
export function selectVerifier(
  config: Pick<CadenceConfig, 'verifier'> | null,
  opts: SelectVerifierOptions = {},
): Verifier {
  const provider = opts.override ?? config?.verifier?.provider ?? 'mock';
  const env = opts.env ?? process.env;
  const warn = opts.warn ?? ((m: string) => process.stderr.write(m + '\n'));

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      warn(
        'verifier: anthropic provider requested but ANTHROPIC_API_KEY is unset — falling back to mock provider.',
      );
      return new MockVerifier();
    }
    const model = config?.verifier?.model;
    return new AnthropicVerifier({
      apiKey: env.ANTHROPIC_API_KEY,
      ...(model ? { model } : {}),
    });
  }

  if (provider === 'local') {
    const baseURL = env.CADENCE_LOCAL_BASE_URL;
    const model = config?.verifier?.model ?? env.CADENCE_LOCAL_MODEL;
    if (!baseURL || !model) {
      warn(
        'verifier: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.',
      );
      return new MockVerifier();
    }
    return new LocalVerifier({ baseURL, model });
  }

  return new MockVerifier();
}
