import type { CadenceConfig, Gate, Profile, Tier } from '@thomas-powers-jr/cadence-types';
import { MOCK_VERIFIER_NOTICE, MOCK_VERIFIER_CAPABILITY } from '@thomas-powers-jr/cadence-types';
import { effectiveProfile, gatesFor } from '../gates/engine.js';
import type { ResolvedPack } from '../packs/resolve.js';
import type {
  ConfigExplanation,
  ExplainContext,
  ProviderRow,
  TierGateView,
  Warning,
} from './types.js';

/** Tiers in canonical (size-ascending) order. */
const TIERS: Tier[] = ['quick-fix', 'standard', 'complex'];

/**
 * The seven provider config blocks and the gate (or SPEC verifier) each backs.
 * Order is the order rows render in.
 */
type ProviderBlockKey =
  | 'specReview'
  | 'uiSpecReview'
  | 'verifier'
  | 'perTaskVerifier'
  | 'codeReview'
  | 'planReview'
  | 'securityAudit';

const PROVIDER_BLOCKS: ReadonlyArray<{ block: ProviderBlockKey; gate: string }> = [
  { block: 'specReview', gate: 'spec-review' },
  { block: 'uiSpecReview', gate: 'ui-spec-review' },
  { block: 'verifier', gate: 'deep-verify' },
  { block: 'perTaskVerifier', gate: 'per-task-verify' },
  { block: 'codeReview', gate: 'code-review' },
  { block: 'planReview', gate: 'plan-review' },
  { block: 'securityAudit', gate: 'security-audit' },
];

/** Collapse the seven provider blocks into one renderable row each. */
function providerRows(config: CadenceConfig): ProviderRow[] {
  return PROVIDER_BLOCKS.map(({ block, gate }) => {
    const provider = config[block].provider;
    return { block, gate, provider, isMock: provider === 'mock' };
  });
}

/** One `gates[].add` contribution matched to a (profile, tier) cell, with its source pack. */
interface PackGateContribution {
  gate: Gate;
  packId: string;
}

/**
 * Phase 292 (Slice 3, §4b/§7): the gates enabled packs contribute for one
 * (profile, tier) cell — same matching logic `effectiveGateSet` (engine.ts)
 * uses: a pack's `gates[].add` entry applies when both its `profile` and
 * `tier` equal the cell being asked about. Only the successfully-resolved
 * (`manifest`) variant of `ResolvedPack` contributes; an errored pack is
 * silently skipped here, exactly as `effectiveGateSet` treats it as
 * contributing nothing. This is called only for the current-tier row in
 * the `TIERS.map` loop below — every other row keeps calling raw
 * `gatesFor` unconditionally.
 */
function packContributedGatesFor(
  profile: Profile,
  tier: Tier,
  resolvedPacks: ReadonlyArray<ResolvedPack>,
): PackGateContribution[] {
  const seen = new Set<Gate>();
  const contributions: PackGateContribution[] = [];
  for (const pack of resolvedPacks) {
    if (!('manifest' in pack)) continue; // errored resolution — contributes nothing
    for (const delta of pack.manifest.gates ?? []) {
      if (delta.profile !== profile || delta.tier !== tier) continue;
      for (const gate of delta.add) {
        if (seen.has(gate)) continue;
        seen.add(gate);
        contributions.push({ gate, packId: pack.id });
      }
    }
  }
  return contributions;
}

/**
 * Derive the config-semantic foot-gun warnings: places where the config says one
 * thing but the runtime effect is another. Each message ends by pointing at
 * `cadence doctor` for the full structural health check.
 */
function deriveWarnings(
  config: CadenceConfig,
  ctx: ExplainContext,
  rows: ProviderRow[],
  complexSoftCap: boolean,
  /** Already filtered to genuine additions — see call site in buildExplanation. */
  currentTierAdditions: PackGateContribution[],
): Warning[] {
  const warnings: Warning[] = [];

  // 1. Provider set to a real backend with its key absent → silent mock fallback.
  // Phase 264 (T4): this is config-explain's "silently downgraded" half of
  // AC-3 — append MOCK_VERIFIER_CAPABILITY alongside the fallback warning so
  // this surface names the same mock-capability fact as the all-mock case
  // below and as cadence doctor's downgraded-seam wording.
  for (const row of rows) {
    if (row.provider === 'anthropic' && !ctx.anthropicKeyPresent) {
      warnings.push({
        code: 'provider-no-key',
        message: `${row.block} is set to 'anthropic' but ANTHROPIC_API_KEY is unset — it will silently fall back to 'mock'; a Claude Code/IDE login does not satisfy this — anthropic calls the Anthropic SDK directly and needs a separately API-billed key. Run cadence doctor to confirm provider health. ${MOCK_VERIFIER_CAPABILITY.message}`,
      });
    } else if (row.provider === 'local' && !ctx.localKeyPresent) {
      warnings.push({
        code: 'provider-no-key',
        message: `${row.block} is set to 'local' but CADENCE_LOCAL_API_KEY is unset — the request may be rejected or fall back to 'mock'. Run cadence doctor to confirm provider health. ${MOCK_VERIFIER_CAPABILITY.message}`,
      });
    }
  }

  // 2. A hook enabled in config but the host adapter never installed → no effect.
  // Phase 250 (AC-5/T16): a stale-scope managed entry is present-but-outdated,
  // not absent — say so distinctly rather than reusing the "no entry was
  // found" message (that would be false: an entry does exist).
  const anyHookEnabled = Object.values(config.hooks).some(Boolean);
  if (anyHookEnabled && !ctx.hostHooksInstalled) {
    if (ctx.hostHooksStale === true) {
      warnings.push({
        code: 'hooks-not-installed',
        message:
          'one or more hooks are enabled in config, and a CADENCE-managed host hook entry is present in .claude/settings.json, but it is stale — it still references an outdated npm scope and needs reinstalling via `cadence-host-claude-code install`. Run cadence doctor for the full host check.',
      });
    } else {
      warnings.push({
        code: 'hooks-not-installed',
        message:
          "one or more hooks are enabled in config, but no host hook entry was found in .claude/settings.json — these hooks do nothing until `cadence-host-claude-code install`. Run cadence doctor for the full host check.",
      });
    }
  }

  // 3. auto × complex is soft-capped — complex phases refuse without a flag.
  if (complexSoftCap) {
    warnings.push({
      code: 'auto-complex-softcap',
      message:
        "under the 'auto' profile, complex phases are soft-capped: CADENCE refuses to approve/settle them without --allow-auto-complex. Run cadence doctor for related checks.",
    });
  }

  // 4. Every seam is mock — the default newcomer state. Point at activation.
  // Phase 104: honesty wording from the single MOCK_VERIFIER_NOTICE source.
  // Phase 264 (T4): append the neutral MOCK_VERIFIER_CAPABILITY fact alongside
  // it — the notice nudges toward activation, the capability names precisely
  // what mock does and doesn't check.
  if (rows.every((r) => r.isMock)) {
    warnings.push({
      code: 'all-mock',
      message: `every verifier seam is set to mock. ${MOCK_VERIFIER_NOTICE.message} ${MOCK_VERIFIER_CAPABILITY.message}`,
    });
  }

  // 5. An enabled pack's gates[].add matched the active phase's (profile,
  // tier) cell AND actually added something not already in the raw
  // gatesFor() output for that cell — the current-tier row is now
  // pack-augmented. Phase 292 (Slice 3, §4b/§7): surface the divergence
  // explicitly rather than leaving it to be inferred from a longer gate
  // list, mirroring the precedent set by warnings 1-4 above. The caller
  // has already filtered `currentTierAdditions` down to genuine
  // additions (gates not already present via gatesFor) — a pack whose
  // `add` merely restates an existing DELTAS entry must not trip this.
  if (currentTierAdditions.length > 0) {
    const gateNames = [...new Set(currentTierAdditions.map((c) => c.gate))].join(', ');
    const packIds = [...new Set(currentTierAdditions.map((c) => c.packId))].join(', ');
    warnings.push({
      code: 'packs-augment-current-tier',
      message: `the current tier's row above is pack-augmented: enabled pack(s) ${packIds} added ${gateNames} to it, on top of the raw gatesFor() gates. Every other tier's row in the table above is unaffected — it still shows raw gatesFor() output, not reflecting any pack.`,
    });
  }

  return warnings;
}

/**
 * Turn a {@link CadenceConfig} plus an {@link ExplainContext} into a structured,
 * renderable {@link ConfigExplanation}. Pure — no I/O, no env, no clock — so the
 * same path serves the CLI and tests. External facts arrive via `ctx`.
 */
export function buildExplanation(config: CadenceConfig, ctx: ExplainContext): ConfigExplanation {
  const profile = effectiveProfile(config, null);
  const resolvedPacks = ctx.resolvedPacks ?? [];

  // Phase 292 (Slice 3, §4b/§7): compute pack contributions once, for the
  // active tier only — the matrix table's other rows must stay raw
  // `gatesFor` output, untouched, so this is never computed for a
  // non-current tier below. Filtered down to genuine additions (gates not
  // already present in the raw gatesFor() output for that cell) right
  // here, once, so both the current-tier row and the warning below agree
  // on exactly what diverged — a pack whose `add` merely restates an
  // existing DELTAS entry contributes nothing observable and must not
  // appear in either.
  const currentTierAdditions: PackGateContribution[] = [];
  if (ctx.activeTier !== null) {
    const rawCurrentGates = gatesFor(ctx.activeTier, profile).gates;
    for (const c of packContributedGatesFor(profile, ctx.activeTier, resolvedPacks)) {
      if (!rawCurrentGates.includes(c.gate)) currentTierAdditions.push(c);
    }
  }

  const tiers: TierGateView[] = TIERS.map((tier) => {
    const set = gatesFor(tier, profile);
    const isCurrent = ctx.activeTier === tier;
    const additions = isCurrent ? currentTierAdditions.map((c) => c.gate) : [];
    const gates = additions.length > 0 ? [...set.gates, ...additions] : set.gates;
    return {
      tier,
      gates,
      softCap: set.softCap,
      current: isCurrent,
      packContributedGates: additions,
    };
  });

  const providers = providerRows(config);
  const complexSoftCap = tiers.find((t) => t.tier === 'complex')?.softCap ?? false;
  const warnings = deriveWarnings(config, ctx, providers, complexSoftCap, currentTierAdditions);

  return {
    profile,
    loopEnforcement: config.loopEnforcement,
    acDiscipline: config.acDiscipline,
    tiers,
    providers,
    warnings,
    config,
  };
}
