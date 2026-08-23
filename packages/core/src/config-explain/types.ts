import type { CadenceConfig, Gate, Profile, Tier } from '@thomas-powers-jr/cadence-types';
import type { VerifierProvider } from '../verify/verifier-factory.js';
import type { ResolvedPack } from '../packs/resolve.js';

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
  /**
   * Whether a `_managedBy: "cadence"` hook entry is present in
   * `.claude/settings.json` but stale — its command still references the
   * pre-rename npm scope (phase 250, AC-5/T16). Distinguishes "present but
   * needs reinstalling" from "genuinely absent" so `deriveWarnings` doesn't
   * emit the same "no host hook entry was found" message for both. Optional
   * so pre-existing `ExplainContext` literals (tests) keep compiling without
   * it; a missing/`undefined` value is treated the same as `false`.
   */
  hostHooksStale?: boolean;
  /**
   * Resolved packs (phase 292, Slice 3), gathered impurely via `resolvePacks`
   * by the CLI layer before `buildExplanation` runs, exactly the same
   * pattern `hostHooksInstalled` etc. already use — the builder stays
   * synchronous/offline and never calls `resolvePacks` itself. Only the
   * successfully-resolved (`manifest`) variant contributes `gates[].add`
   * deltas to the current-tier row; the `error` variant is ignored here,
   * mirroring how `effectiveGateSet` (engine.ts) treats an unresolvable
   * pack as contributing nothing rather than refusing. Optional so
   * pre-existing `ExplainContext` literals (tests) keep compiling without
   * it; a missing/`undefined` value behaves as "no packs enabled".
   */
  resolvedPacks?: ResolvedPack[];
}

/** The gates that fire for one tier under the configured profile. */
export interface TierGateView {
  tier: Tier;
  gates: Gate[];
  /** Soft cap on `auto × complex` — gate impls refuse without `--allow-auto-complex`. */
  softCap: boolean;
  /** True when this tier matches the active phase's tier. */
  current: boolean;
  /**
   * Gates present in `gates` because an enabled pack's `gates[].add`
   * matched this row's (profile, tier) cell — not because of the raw
   * tier×profile matrix (`gatesFor`). Phase 292 (Slice 3, §4b/§7): always
   * empty for non-current rows (those stay raw `gatesFor` output
   * unconditionally); empty for the current row too when no pack
   * contributed anything at this cell. Non-optional — every `TierGateView`
   * is builder-constructed, never hand-authored by a test as a bare
   * literal the way `ExplainContext` is.
   */
  packContributedGates: Gate[];
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

export type WarningCode = 'provider-no-key' | 'hooks-not-installed' | 'auto-complex-softcap' | 'all-mock' | 'packs-augment-current-tier';

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
