import type { CadenceConfig, Tier } from '@thomas-powers-jr/cadence-types';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SimpleStateBackend } from '../state/simple.js';
import { hasManagedCadence, hasStaleScopeManagedHook } from '../doctor/host-hooks.js';
import { resolvePacks } from '../packs/resolve.js';
import type { ExplainContext } from './types.js';

/**
 * Read `.claude/settings.json` once and derive both the installed and
 * stale-scope flags from the same parsed document — mirrors doctor's
 * `checkHostHooks` (`../doctor/run.ts`, phase 250 T14) so `config explain`
 * can tell a genuinely-absent CADENCE-managed hook entry from one that is
 * present but still references the pre-rename npm scope (phase 250, AC-5).
 * Best-effort: an absent file, unreadable file, or invalid JSON all degrade
 * to "not installed, not stale" rather than throwing.
 */
async function readHostHookState(root: string): Promise<{ installed: boolean; stale: boolean }> {
  const settings = join(root, '.claude', 'settings.json');
  if (!existsSync(settings)) return { installed: false, stale: false };
  try {
    const parsed: unknown = JSON.parse(await readFile(settings, 'utf8'));
    return { installed: hasManagedCadence(parsed), stale: hasStaleScopeManagedHook(parsed) };
  } catch {
    return { installed: false, stale: false };
  }
}

/**
 * Gather the impure facts {@link buildExplanation} needs: the active phase tier
 * (from `state.json`), the provider-key env vars, host-install state, and
 * (phase 292, Slice 3) resolved packs. Pure functions stay pure — this is the
 * one place that touches the filesystem and `process.env`. Best-effort
 * throughout: any read failure degrades to a safe default rather than
 * throwing, so `config explain` never dies on a half-set-up repo. `env` is
 * injectable for testing.
 *
 * `config` is the already-loaded config (both CLI call sites in
 * `cli/commands/config.ts` call `loadConfig` before this) — passed in rather
 * than re-loaded here so this stays a single read, and so `resolvePacks`
 * (`../packs/resolve.js`) sees the exact same `config.packs` the rest of the
 * command run is using.
 */
export async function gatherExplainContext(
  root: string,
  config: Pick<CadenceConfig, 'packs'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ExplainContext> {
  let activeTier: Tier | null = null;
  try {
    const state = await new SimpleStateBackend(root).readState();
    activeTier = state.tier ?? null;
  } catch {
    activeTier = null;
  }

  const hostHooks = await readHostHookState(root);

  let resolvedPacks: ExplainContext['resolvedPacks'] = [];
  try {
    resolvedPacks = await resolvePacks(root, config);
  } catch {
    resolvedPacks = [];
  }

  return {
    activeTier,
    anthropicKeyPresent: Boolean(env.ANTHROPIC_API_KEY),
    localKeyPresent: Boolean(env.CADENCE_LOCAL_API_KEY),
    hostHooksInstalled: hostHooks.installed,
    hostHooksStale: hostHooks.stale,
    resolvedPacks,
  };
}
