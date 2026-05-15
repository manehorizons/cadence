import type { CadenceConfig } from '@cadence/types';
import {
  AnthropicPerTaskVerifier,
  MockPerTaskVerifier,
  type PerTaskVerifier,
} from './per-task.js';

export interface SelectPerTaskVerifierOptions {
  /** Override `config.perTaskVerifier.provider`. */
  override?: 'mock' | 'anthropic';
  /** Test seam: stand in for `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: emit warnings somewhere other than `process.stderr`. */
  warn?: (message: string) => void;
}

/**
 * Picks the per-task verifier given config + env. Falls back to mock when
 * the Anthropic provider is requested but `ANTHROPIC_API_KEY` is missing —
 * with a stderr warning so the caller knows the downgrade happened.
 * Mirrors `selectVerifier` (Phase 15).
 */
export function selectPerTaskVerifier(
  config: Pick<CadenceConfig, 'perTaskVerifier'> | null,
  opts: SelectPerTaskVerifierOptions = {},
): PerTaskVerifier {
  const provider =
    opts.override ?? config?.perTaskVerifier?.provider ?? 'mock';
  const env = opts.env ?? process.env;
  const warn = opts.warn ?? ((m: string) => process.stderr.write(m + '\n'));

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      warn(
        'per-task-verify: anthropic provider requested but ANTHROPIC_API_KEY is unset — falling back to mock provider.',
      );
      return new MockPerTaskVerifier();
    }
    const model = config?.perTaskVerifier?.model;
    return new AnthropicPerTaskVerifier({
      apiKey: env.ANTHROPIC_API_KEY,
      ...(model ? { model } : {}),
    });
  }

  return new MockPerTaskVerifier();
}
