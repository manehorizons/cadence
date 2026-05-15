import type { CadenceConfig } from '@cadence/types';
import {
  AnthropicCodeReviewVerifier,
  MockCodeReviewVerifier,
  type CodeReviewVerifier,
} from './code-review.js';

export interface SelectCodeReviewVerifierOptions {
  /** Override `config.codeReview.provider`. */
  override?: 'mock' | 'anthropic';
  /** Test seam: stand in for `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: emit warnings somewhere other than `process.stderr`. */
  warn?: (message: string) => void;
}

/**
 * Picks the code-review verifier given config + env. Falls back to mock
 * when the Anthropic provider is requested but `ANTHROPIC_API_KEY` is
 * missing — with a stderr warning so the caller knows the downgrade
 * happened. Mirrors `selectVerifier` (Phase 15) / `selectPerTaskVerifier`
 * (Phase 24.2).
 */
export function selectCodeReviewVerifier(
  config: Pick<CadenceConfig, 'codeReview'> | null,
  opts: SelectCodeReviewVerifierOptions = {},
): CodeReviewVerifier {
  const provider =
    opts.override ?? config?.codeReview?.provider ?? 'mock';
  const env = opts.env ?? process.env;
  const warn = opts.warn ?? ((m: string) => process.stderr.write(m + '\n'));

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      warn(
        'code-review: anthropic provider requested but ANTHROPIC_API_KEY is unset — falling back to mock provider.',
      );
      return new MockCodeReviewVerifier();
    }
    const model = config?.codeReview?.model;
    return new AnthropicCodeReviewVerifier({
      apiKey: env.ANTHROPIC_API_KEY,
      ...(model ? { model } : {}),
    });
  }

  return new MockCodeReviewVerifier();
}
