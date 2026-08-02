import type { CadenceConfig } from '@thomas-powers-jr/cadence-types';
import {
  AnthropicSpecReviewVerifier,
  HostCliSpecReviewVerifier,
  LocalSpecReviewVerifier,
  MockSpecReviewVerifier,
  type SpecReviewVerifier,
} from './spec-review.js';
import {
  createVerifierFactory,
  type VerifierSelectOptions,
} from './verifier-factory.js';

/** @deprecated alias of `VerifierSelectOptions` (kept for API stability). */
export type SelectSpecReviewVerifierOptions = VerifierSelectOptions;

/** Picks the spec-review verifier given config + env (Phase 25.x). */
export const selectSpecReviewVerifier = createVerifierFactory<
  Pick<CadenceConfig, 'specReview'>,
  SpecReviewVerifier
>({
  label: 'spec-review',
  read: (c) => c?.specReview,
  mock: () => new MockSpecReviewVerifier(),
  anthropic: (o) => new AnthropicSpecReviewVerifier(o),
  local: (o) => new LocalSpecReviewVerifier(o),
  hostCli: (o) => new HostCliSpecReviewVerifier(o),
});
