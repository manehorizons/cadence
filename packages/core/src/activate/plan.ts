import type { CadenceConfig } from '@thomas-powers-jr/cadence-types';
import type { VerifierProvider } from '../verify/verifier-factory.js';
import { VERIFIER_SEAMS, DEEP_VERIFY_SEAM, type VerifierSeam } from './assess.js';

export type ActivationScope = 'deep-verify' | 'all';

export interface SeamChange {
  seam: VerifierSeam;
  from: VerifierProvider;
  to: VerifierProvider;
}

export interface ActivationPlan {
  provider: VerifierProvider;
  scope: ActivationScope;
  /** Seams that would change. Empty ⇒ no-op (idempotent). */
  changes: SeamChange[];
  /** Env var the chosen provider requires, or null for mock. */
  envVar: string | null;
  /** Exact command to watch real verification fire. */
  nextStep: string;
}

const ENV_VAR: Record<VerifierProvider, string | null> = {
  mock: null,
  anthropic: 'ANTHROPIC_API_KEY',
  local: 'CADENCE_LOCAL_BASE_URL',
  // Phase 165: host-cli's binary is discovered the same way local's baseURL
  // is (`discoverKey`), not a hard env-var requirement — closest analog for
  // this "what does the user need to set" display is the override var.
  'host-cli': 'CADENCE_HOST_CLI_BIN',
};

/** Pure: compute which seams to flip for `provider` at `scope`. Writes nothing. */
export function planActivation(input: {
  provider: VerifierProvider;
  scope: ActivationScope;
  currentConfig: CadenceConfig;
}): ActivationPlan {
  const { provider, scope, currentConfig } = input;
  const targets: VerifierSeam[] =
    scope === 'all' ? [...VERIFIER_SEAMS] : [DEEP_VERIFY_SEAM];
  const changes: SeamChange[] = [];
  for (const seam of targets) {
    const from = (currentConfig[seam] as { provider: VerifierProvider }).provider;
    if (from !== provider) changes.push({ seam, from, to: provider });
  }
  return { provider, scope, changes, envVar: ENV_VAR[provider], nextStep: 'cadence settle run --deep' };
}
