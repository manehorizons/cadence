import type { CadenceConfig } from '@manehorizons/cadence-types';
import type { VerifierProvider } from '../verify/verifier-factory.js';

/**
 * The six verifier seam config blocks (parallels config-explain PROVIDER_BLOCKS).
 * Order matches config explain's render order.
 */
export const VERIFIER_SEAMS = [
  'specReview',
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
 *  (the seam's own `model`, else CADENCE_LOCAL_MODEL — mirrors verify/verifier-factory.ts). */
export function credsPresent(
  provider: VerifierProvider,
  seam: VerifierSeam,
  config: CadenceConfig,
  env: NodeJS.ProcessEnv,
): boolean {
  if (provider === 'mock') return true;
  if (provider === 'anthropic') return Boolean(env.ANTHROPIC_API_KEY);
  const model = (config[seam] as { model?: string }).model ?? env.CADENCE_LOCAL_MODEL;
  return Boolean(env.CADENCE_LOCAL_BASE_URL) && Boolean(model);
}

/** Pure verifier-posture assessment. Shared by `activate` and `doctor`. */
export function assessReadiness(
  config: CadenceConfig,
  env: NodeJS.ProcessEnv,
): VerifierReadiness {
  const seamsReal: VerifierSeam[] = [];
  const seamsMock: VerifierSeam[] = [];
  for (const seam of VERIFIER_SEAMS) {
    (seamProvider(config, seam) === 'mock' ? seamsMock : seamsReal).push(seam);
  }
  const provider = seamProvider(config, DEEP_VERIFY_SEAM);
  const keyPresent = credsPresent(provider, DEEP_VERIFY_SEAM, config, env);
  const ready = provider !== 'mock' && keyPresent;
  const reason =
    provider === 'mock'
      ? 'deep-verify uses the mock provider — no real AI verification.'
      : keyPresent
        ? `deep-verify uses ${provider} with credentials present.`
        : `deep-verify is set to ${provider} but its credentials are missing.`;
  return { provider, keyPresent, seamsReal, seamsMock, ready, reason };
}
