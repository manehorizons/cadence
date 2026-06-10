import type { Tier } from '@manehorizons/cadence-types';
import { SimpleStateBackend } from '../state/simple.js';
import { hostHooksInstalled } from '../doctor/host-hooks.js';
import type { ExplainContext } from './types.js';

/**
 * Gather the impure facts {@link buildExplanation} needs: the active phase tier
 * (from `state.json`), the provider-key env vars, and host-install state. Pure
 * functions stay pure — this is the one place that touches the filesystem and
 * `process.env`. Best-effort throughout: any read failure degrades to a safe
 * default rather than throwing, so `config explain` never dies on a half-set-up
 * repo. `env` is injectable for testing.
 */
export async function gatherExplainContext(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ExplainContext> {
  let activeTier: Tier | null = null;
  try {
    const state = await new SimpleStateBackend(root).readState();
    activeTier = state.tier ?? null;
  } catch {
    activeTier = null;
  }

  return {
    activeTier,
    anthropicKeyPresent: Boolean(env.ANTHROPIC_API_KEY),
    localKeyPresent: Boolean(env.CADENCE_LOCAL_API_KEY),
    hostHooksInstalled: await hostHooksInstalled(root),
  };
}
