import type { CadenceConfig } from '@manehorizons/cadence-types';
import type { VerifierProvider } from '../verify/verifier-factory.js';
import { discoverKey } from './key-discovery.js';

/**
 * The seven verifier seam config blocks (parallels config-explain PROVIDER_BLOCKS).
 * Order matches config explain's render order.
 */
export const VERIFIER_SEAMS = [
  'specReview',
  'uiSpecReview',
  'verifier',
  'perTaskVerifier',
  'codeReview',
  'planReview',
  'securityAudit',
] as const;
export type VerifierSeam = (typeof VERIFIER_SEAMS)[number];

/** The seam the default ('deep-verify') activation flips. */
export const DEEP_VERIFY_SEAM: VerifierSeam = 'verifier';

export interface VerifierReadiness {
  /** Effective provider of the deep-verify seam. */
  provider: VerifierProvider;
  /** Credentials present for that provider (mock ⇒ true). */
  keyPresent: boolean;
  seamsReal: VerifierSeam[];
  seamsMock: VerifierSeam[];
  /** deep-verify provider is real AND its credentials are present. */
  ready: boolean;
  reason: string;
}

function seamProvider(config: CadenceConfig, seam: VerifierSeam): VerifierProvider {
  return (config[seam] as { provider: VerifierProvider }).provider;
}

/** Are `provider`'s credentials present for `seam`? local needs a base URL + a model
 *  (the seam's own `model`, else CADENCE_LOCAL_MODEL — mirrors verify/verifier-factory.ts).
 *  `cwd` (default `process.cwd()`) is where a `.env` file is discovered — a key found
 *  there counts the same as one exported into the env (AC-1). */
export function credsPresent(
  provider: VerifierProvider,
  seam: VerifierSeam,
  config: CadenceConfig,
  env: NodeJS.ProcessEnv,
  cwd: string = process.cwd(),
): boolean {
  if (provider === 'mock') return true;
  if (provider === 'anthropic') return Boolean(discoverKey('ANTHROPIC_API_KEY', env, cwd).value);
  // Phase 165: host-cli has no required credential by design — it shells out
  // to the user's already-installed, already-authenticated host CLI, with a
  // hardcoded default binary (`claude`) when CADENCE_HOST_CLI_BIN is unset
  // (mirrors verify/verifier-factory.ts's `discoverKey(...) ?? 'claude'`).
  // Whether that binary actually exists/authenticates is checked lazily at
  // spawn time (host-cli-client.ts), the same way `local`/`anthropic` never
  // probe connectivity here either — so "present" just means "nothing is
  // missing", which is unconditionally true. Without this branch, `host-cli`
  // fell through to the `local` check below and was misreported as broken.
  if (provider === 'host-cli') return true;
  const model =
    (config[seam] as { model?: string }).model ??
    discoverKey('CADENCE_LOCAL_MODEL', env, cwd).value;
  return Boolean(discoverKey('CADENCE_LOCAL_BASE_URL', env, cwd).value) && Boolean(model);
}

/** Pure verifier-posture assessment. Shared by `activate` and `doctor`.
 *  `cwd` (default `process.cwd()`) is threaded to `credsPresent` for `.env` discovery. */
export function assessReadiness(
  config: CadenceConfig,
  env: NodeJS.ProcessEnv,
  cwd: string = process.cwd(),
): VerifierReadiness {
  const seamsReal: VerifierSeam[] = [];
  const seamsMock: VerifierSeam[] = [];
  for (const seam of VERIFIER_SEAMS) {
    (seamProvider(config, seam) === 'mock' ? seamsMock : seamsReal).push(seam);
  }
  const provider = seamProvider(config, DEEP_VERIFY_SEAM);
  const keyPresent = credsPresent(provider, DEEP_VERIFY_SEAM, config, env, cwd);
  const ready = provider !== 'mock' && keyPresent;
  const reason =
    provider === 'mock'
      ? 'deep-verify uses the mock provider — no real AI verification.'
      : keyPresent
        ? `deep-verify uses ${provider} with credentials present.`
        : `deep-verify is set to ${provider} but its credentials are missing.`;
  return { provider, keyPresent, seamsReal, seamsMock, ready, reason };
}
