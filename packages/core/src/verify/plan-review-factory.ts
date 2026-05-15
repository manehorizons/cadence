import type { CadenceConfig } from '@cadence/types';
import {
  AnthropicPlanReviewVerifier,
  MockPlanReviewVerifier,
  type PlanReviewVerifier,
} from './plan-review.js';

export interface SelectPlanReviewVerifierOptions {
  /** Override `config.planReview.provider`. */
  override?: 'mock' | 'anthropic';
  /** Test seam: stand in for `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: emit warnings somewhere other than `process.stderr`. */
  warn?: (message: string) => void;
}

/**
 * Picks the plan-review verifier given config + env. Falls back to mock when
 * the Anthropic provider is requested but `ANTHROPIC_API_KEY` is missing —
 * with a stderr warning so the caller knows the downgrade happened. Mirrors
 * `selectCodeReviewVerifier` (Phase 24.3) / `selectPerTaskVerifier`
 * (Phase 24.2).
 */
export function selectPlanReviewVerifier(
  config: Pick<CadenceConfig, 'planReview'> | null,
  opts: SelectPlanReviewVerifierOptions = {},
): PlanReviewVerifier {
  const provider = opts.override ?? config?.planReview?.provider ?? 'mock';
  const env = opts.env ?? process.env;
  const warn = opts.warn ?? ((m: string) => process.stderr.write(m + '\n'));

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      warn(
        'plan-review: anthropic provider requested but ANTHROPIC_API_KEY is unset — falling back to mock provider.',
      );
      return new MockPlanReviewVerifier();
    }
    const model = config?.planReview?.model;
    return new AnthropicPlanReviewVerifier({
      apiKey: env.ANTHROPIC_API_KEY,
      ...(model ? { model } : {}),
    });
  }

  return new MockPlanReviewVerifier();
}
