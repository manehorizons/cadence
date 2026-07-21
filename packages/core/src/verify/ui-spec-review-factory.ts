import type { CadenceConfig } from '@manehorizons/cadence-types';
import {
  AnthropicUiSpecReviewVerifier,
  HostCliUiSpecReviewVerifier,
  LocalUiSpecReviewVerifier,
  MockUiSpecReviewVerifier,
  type UiSpecReviewVerifier,
} from './ui-spec-review.js';
import {
  createVerifierFactory,
  type VerifierSelectOptions,
} from './verifier-factory.js';

/** @deprecated alias of `VerifierSelectOptions` (kept for API stability). */
export type SelectUiSpecReviewVerifierOptions = VerifierSelectOptions;

/** Picks the ui-spec-review verifier given config + env (rec-20260711-004). */
export const selectUiSpecReviewVerifier = createVerifierFactory<
  Pick<CadenceConfig, 'uiSpecReview'>,
  UiSpecReviewVerifier
>({
  label: 'ui-spec-review',
  read: (c) => c?.uiSpecReview,
  mock: () => new MockUiSpecReviewVerifier(),
  anthropic: (o) => new AnthropicUiSpecReviewVerifier(o),
  local: (o) => new LocalUiSpecReviewVerifier(o),
  hostCli: (o) => new HostCliUiSpecReviewVerifier(o),
});
