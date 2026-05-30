import type { CadenceConfig } from '@manehorizons/cadence-types';
import {
  AnthropicPlanReviewVerifier,
  LocalPlanReviewVerifier,
  MockPlanReviewVerifier,
  type PlanReviewVerifier,
} from './plan-review.js';
import {
  createVerifierFactory,
  type VerifierSelectOptions,
} from './verifier-factory.js';

/** @deprecated alias of `VerifierSelectOptions` (kept for API stability). */
export type SelectPlanReviewVerifierOptions = VerifierSelectOptions;

/** Picks the plan-review verifier given config + env (Phase 25.1). */
export const selectPlanReviewVerifier = createVerifierFactory<
  Pick<CadenceConfig, 'planReview'>,
  PlanReviewVerifier
>({
  label: 'plan-review',
  read: (c) => c?.planReview,
  mock: () => new MockPlanReviewVerifier(),
  anthropic: (o) => new AnthropicPlanReviewVerifier(o),
  local: (o) => new LocalPlanReviewVerifier(o),
});
