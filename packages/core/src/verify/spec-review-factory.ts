import type { CadenceConfig } from '@cadence/types';
import {
  AnthropicSpecReviewVerifier,
  LocalSpecReviewVerifier,
  MockSpecReviewVerifier,
  type SpecReviewVerifier,
} from './spec-review.js';

export interface SelectSpecReviewVerifierOptions {
  /** Override `config.specReview.provider`. */
  override?: 'mock' | 'anthropic' | 'local';
  /** Test seam: stand in for `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: emit warnings somewhere other than `process.stderr`. */
  warn?: (message: string) => void;
}

/**
 * Picks the spec-review verifier given config + env. Falls back to mock when
 * the requested provider's prerequisites are missing — with a stderr warning.
 * Structural clone of `selectPlanReviewVerifier` (Phase 25.1).
 */
export function selectSpecReviewVerifier(
  config: Pick<CadenceConfig, 'specReview'> | null,
  opts: SelectSpecReviewVerifierOptions = {},
): SpecReviewVerifier {
  const provider = opts.override ?? config?.specReview?.provider ?? 'mock';
  const env = opts.env ?? process.env;
  const warn = opts.warn ?? ((m: string) => process.stderr.write(m + '\n'));

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      warn(
        'spec-review: anthropic provider requested but ANTHROPIC_API_KEY is unset — falling back to mock provider.',
      );
      return new MockSpecReviewVerifier();
    }
    const model = config?.specReview?.model;
    return new AnthropicSpecReviewVerifier({
      apiKey: env.ANTHROPIC_API_KEY,
      ...(model ? { model } : {}),
    });
  }

  if (provider === 'local') {
    const baseURL = env.CADENCE_LOCAL_BASE_URL;
    const model = config?.specReview?.model ?? env.CADENCE_LOCAL_MODEL;
    if (!baseURL || !model) {
      warn(
        'spec-review: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.',
      );
      return new MockSpecReviewVerifier();
    }
    return new LocalSpecReviewVerifier({ baseURL, model });
  }

  return new MockSpecReviewVerifier();
}
