import type { CadenceConfig, Gate, Profile, Tier } from '@thomas-powers-jr/cadence-types';
import type { VerifierProvider } from '../verify/verifier-factory.js';

/**
 * External facts the pure {@link buildExplanation} needs but cannot observe
 * itself. The CLI layer (phase 92) gathers these impurely — env probes, the
 * active-phase tier from `state.json`, host-install state from
 * `.claude/settings.json` — and passes them in, keeping the builder offline and
 * deterministic.
 */
export interface ExplainContext {
  /** Active phase tier when a phase is mid-loop; `null` when idle. */
  activeTier: Tier | null;
  /** Whether `ANTHROPIC_API_KEY` is present in the environment. */
  anthropicKeyPresent: boolean;
  /** Whether `CADENCE_LOCAL_API_KEY` is present in the environment. */
  localKeyPresent: boolean;
  /** Whether the Claude Code adapter's hooks are registered in `.claude/settings.json`. */
  hostHooksInstalled: boolean;
}

/** The gates that fire for one tier under the configured profile. */
export interface TierGateView {
  tier: Tier;
  gates: Gate[];
  /** Soft cap on `auto × complex` — gate impls refuse without `--allow-auto-complex`. */
  softCap: boolean;
  /** True when this tier matches the active phase's tier. */
  current: boolean;
}

/** One row of the collapsed provider table — which gate, which provider. */
export interface ProviderRow {
  /** The config block key, e.g. `verifier`. */
  block: string;
  /** The gate (or SPEC verifier) the block backs, e.g. `deep-verify`. */
  gate: string;
  provider: VerifierProvider;
  /** True when `provider === 'mock'` (offline / no real AI verification). */
  isMock: boolean;
}

export type WarningCode = 'provider-no-key' | 'hooks-not-installed' | 'auto-complex-softcap' | 'all-mock';

/** A config-semantic foot-gun: the config says X but the runtime effect is Y. */
export interface Warning {
  code: WarningCode;
  message: string;
}

/** The structured, renderable explanation of a config. Pure data. */
export interface ConfigExplanation {
  profile: Profile;
  loopEnforcement: CadenceConfig['loopEnforcement'];
  acDiscipline: CadenceConfig['acDiscipline'];
  /** One view per tier, in canonical order (quick-fix, standard, complex). */
  tiers: TierGateView[];
  /** The seven provider blocks, collapsed to one row each. */
  providers: ProviderRow[];
  /** Active foot-gun warnings; empty when the config is clean. */
  warnings: Warning[];
  /**
   * The source config, retained so the text renderer can deep-dive an arbitrary
   * top-level field (`config explain <field>`) or dump every key (`--all`)
   * without a second load. Not emitted by {@link ConfigExplanation} JSON output.
   */
  config: CadenceConfig;
}
