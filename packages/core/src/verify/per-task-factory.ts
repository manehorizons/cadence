import type { CadenceConfig } from '@manehorizons/cadence-types';
import {
  AnthropicPerTaskVerifier,
  HostCliPerTaskVerifier,
  LocalPerTaskVerifier,
  MockPerTaskVerifier,
  type PerTaskVerifier,
} from './per-task.js';
import {
  createVerifierFactory,
  type VerifierSelectOptions,
} from './verifier-factory.js';

/** @deprecated alias of `VerifierSelectOptions` (kept for API stability). */
export type SelectPerTaskVerifierOptions = VerifierSelectOptions;

/** Picks the per-task verifier given config + env (Phase 24.2). */
export const selectPerTaskVerifier = createVerifierFactory<
  Pick<CadenceConfig, 'perTaskVerifier'>,
  PerTaskVerifier
>({
  label: 'per-task-verify',
  read: (c) => c?.perTaskVerifier,
  mock: () => new MockPerTaskVerifier(),
  anthropic: (o) => new AnthropicPerTaskVerifier(o),
  local: (o) => new LocalPerTaskVerifier(o),
  hostCli: (o) => new HostCliPerTaskVerifier(o),
});
