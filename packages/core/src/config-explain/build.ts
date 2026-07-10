import type { CadenceConfig, Tier } from '@manehorizons/cadence-types';
import { MOCK_VERIFIER_NOTICE } from '@manehorizons/cadence-types';
import { effectiveProfile, gatesFor } from '../gates/engine.js';
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
 * The six provider config blocks and the gate (or SPEC verifier) each backs.
 * Order is the order rows render in.
 */
type ProviderBlockKey =
  | 'specReview'
  | 'verifier'
  | 'perTaskVerifier'
  | 'codeReview'
  | 'planReview'
  | 'securityAudit';

const PROVIDER_BLOCKS: ReadonlyArray<{ block: ProviderBlockKey; gate: string }> = [
  { block: 'specReview', gate: 'spec-review' },
  { block: 'verifier', gate: 'deep-verify' },
  { block: 'perTaskVerifier', gate: 'per-task-verify' },
  { block: 'codeReview', gate: 'code-review' },
  { block: 'planReview', gate: 'plan-review' },
  { block: 'securityAudit', gate: 'security-audit' },
];

/** Collapse the six provider blocks into one renderable row each. */
function providerRows(config: CadenceConfig): ProviderRow[] {
  return PROVIDER_BLOCKS.map(({ block, gate }) => {
    const provider = config[block].provider;
    return { block, gate, provider, isMock: provider === 'mock' };
  });
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
): Warning[] {
  const warnings: Warning[] = [];

  // 1. Provider set to a real backend with its key absent → silent mock fallback.
  for (const row of rows) {
    if (row.provider === 'anthropic' && !ctx.anthropicKeyPresent) {
      warnings.push({
        code: 'provider-no-key',
        message: `${row.block} is set to 'anthropic' but ANTHROPIC_API_KEY is unset — it will silently fall back to 'mock'. Run cadence doctor to confirm provider health.`,
      });
    } else if (row.provider === 'local' && !ctx.localKeyPresent) {
      warnings.push({
        code: 'provider-no-key',
        message: `${row.block} is set to 'local' but CADENCE_LOCAL_API_KEY is unset — the request may be rejected or fall back to 'mock'. Run cadence doctor to confirm provider health.`,
      });
    }
  }

  // 2. A hook enabled in config but the host adapter never installed → no effect.
  const anyHookEnabled = Object.values(config.hooks).some(Boolean);
  if (anyHookEnabled && !ctx.hostHooksInstalled) {
    warnings.push({
      code: 'hooks-not-installed',
      message:
        "one or more hooks are enabled in config, but no host hook entry was found in .claude/settings.json — these hooks do nothing until `cadence-host-claude-code install`. Run cadence doctor for the full host check.",
    });
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
  if (rows.every((r) => r.isMock)) {
    warnings.push({
      code: 'all-mock',
      message: `every verifier seam is set to mock. ${MOCK_VERIFIER_NOTICE.message}`,
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

  const tiers: TierGateView[] = TIERS.map((tier) => {
    const set = gatesFor(tier, profile);
    return {
      tier,
      gates: set.gates,
      softCap: set.softCap,
      current: ctx.activeTier === tier,
    };
  });

  const providers = providerRows(config);
  const complexSoftCap = tiers.find((t) => t.tier === 'complex')?.softCap ?? false;
  const warnings = deriveWarnings(config, ctx, providers, complexSoftCap);

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
