import Anthropic from '@anthropic-ai/sdk';
import { buildAnthropicClientConfig } from '../verify/anthropic-verifier.js';
import type { VerifierProvider } from '../verify/verifier-factory.js';
import { discoverKey } from './key-discovery.js';

export type PingResult =
  | { ok: true }
  | { ok: false; reason: string }
  | { skipped: true; reason: string };

export type ProviderPing = (
  provider: VerifierProvider,
  env: NodeJS.ProcessEnv,
  deps?: { client?: Anthropic; cwd?: string },
) => Promise<PingResult>;

/** Cheapest model — the ping only proves auth, not quality. */
const PING_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Minimal live auth check. Anthropic only: one 1-token message proves the key
 * works. `local`/`mock` are skipped (live-checking an arbitrary endpoint is out
 * of scope for this slice). The client is injectable so tests never hit the network.
 * `deps.cwd` (default `process.cwd()`) is where a `.env` file is discovered — a key
 * found there is treated the same as one exported into the env (AC-1).
 */
export const pingProvider: ProviderPing = async (provider, env, deps = {}) => {
  if (provider !== 'anthropic') {
    return { skipped: true, reason: `live check not supported for ${provider}` };
  }
  const cwd = deps.cwd ?? process.cwd();
  const apiKey = discoverKey('ANTHROPIC_API_KEY', env, cwd).value;
  if (!apiKey) return { ok: false, reason: 'ANTHROPIC_API_KEY is unset' };
  const client = deps.client ?? new Anthropic(buildAnthropicClientConfig({ apiKey }));
  try {
    await client.messages.create({
      model: PING_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, reason: `${err.status ?? 'error'}: ${err.message}` };
    }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
};
