import type { CadenceConfig } from '@manehorizons/cadence-types';
import {
  AnthropicCodeReviewVerifier,
  LocalCodeReviewVerifier,
  MockCodeReviewVerifier,
  type CodeReviewVerifier,
} from './code-review.js';
import {
  createVerifierFactory,
  type VerifierSelectOptions,
} from './verifier-factory.js';

/** @deprecated alias of `VerifierSelectOptions` (kept for API stability). */
export type SelectCodeReviewVerifierOptions = VerifierSelectOptions;

/** Picks the code-review verifier given config + env (Phase 24.3). */
export const selectCodeReviewVerifier = createVerifierFactory<
  Pick<CadenceConfig, 'codeReview'>,
  CodeReviewVerifier
>({
  label: 'code-review',
  read: (c) => c?.codeReview,
  mock: () => new MockCodeReviewVerifier(),
  anthropic: (o) => new AnthropicCodeReviewVerifier(o),
  local: (o) => new LocalCodeReviewVerifier(o),
});
