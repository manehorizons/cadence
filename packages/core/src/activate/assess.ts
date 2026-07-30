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
  /**
   * Seams whose configured provider is real but whose credentials are absent —
   * guaranteed to fall back to `mock` at runtime (see the prerequisite branches
   * in `verify/verifier-factory.ts`). Issue #331: this is the set
   * `seamsReal`/`seamsMock` cannot express, because those partition by
   * *configured provider name* and so classify a keyless `anthropic` seam as
   * real. In `VERIFIER_SEAMS` order. Never includes a `mock` seam (not a
   * downgrade — it announces itself) nor a `host-cli` seam (no required
   * credential by design; see `credsPresent`).
   */
  seamsDowngraded: VerifierSeam[];
  /** deep-verify provider is real AND its credentials are present. */
  ready: boolean;
  reason: string;
}

/** The provider configured for `seam`. Exported so a caller reporting a seam
 *  from `seamsDowngraded` can name the provider that will downgrade. */
export function seamProvider(config: CadenceConfig, seam: VerifierSeam): VerifierProvider {
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

/** True when this process is running inside a live Claude Code session — the
 *  `CLAUDECODE` env var, documented at https://code.claude.com/docs/en/env-vars
 *  (see `verify/host-cli-client.ts`'s `SELF_INVOCATION_ENV_VAR` for the fuller
 *  citation). Used to disambiguate a Claude Code login (no bearing on the
 *  `anthropic` provider's credentials) from an actually-missing API key. */
export function isClaudeCodeSession(env: NodeJS.ProcessEnv): boolean {
  return env.CLAUDECODE === '1';
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
  const seamsDowngraded: VerifierSeam[] = [];
  for (const seam of VERIFIER_SEAMS) {
    const seamsProvider = seamProvider(config, seam);
    (seamsProvider === 'mock' ? seamsMock : seamsReal).push(seam);
    // Issue #331: credential-check EVERY real seam, not just deep-verify —
    // otherwise a keyless `anthropic` seam sits in `seamsReal` and reads as
    // healthy while being certain to downgrade.
    if (seamsProvider !== 'mock' && !credsPresent(seamsProvider, seam, config, env, cwd)) {
      seamsDowngraded.push(seam);
    }
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
  return { provider, keyPresent, seamsReal, seamsMock, seamsDowngraded, ready, reason };
}
