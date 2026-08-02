import type { CadenceConfig } from '@thomas-powers-jr/cadence-types';
import { AnthropicVerifier } from './anthropic-verifier.js';
import { MockVerifier } from './mock-verifier.js';
import { HostCliVerifier, LocalVerifier, type Verifier } from './verifier.js';
import {
  createVerifierFactory,
  type VerifierSelectOptions,
} from './verifier-factory.js';

/** @deprecated alias of `VerifierSelectOptions` (kept for API stability). */
export type SelectVerifierOptions = VerifierSelectOptions;

/**
 * Picks the right verifier given config + env (Phase 15). Falls back to mock
 * when a provider's prerequisites are missing — with a stderr warning so the
 * caller knows downgrading happened.
 */
export const selectVerifier = createVerifierFactory<
  Pick<CadenceConfig, 'verifier'>,
  Verifier
>({
  label: 'verifier',
  read: (c) => c?.verifier,
  mock: () => new MockVerifier(),
  anthropic: (o) => new AnthropicVerifier(o),
  local: (o) => new LocalVerifier(o),
  hostCli: (o) => new HostCliVerifier(o),
});
