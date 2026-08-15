import type {
  AcEvidence,
  CadenceConfig,
  CadenceState,
  Draft,
  Gate,
  GateSet,
  Profile,
  Tier,
} from '@thomas-powers-jr/cadence-types';
import { resolveEffectiveProvider } from '../verify/verifier-factory.js';

/**
 * Gates that always fire regardless of (tier × profile). Free per DESIGN.md
 * Section 4.1 — "always fire" row.
 *
 * Exported (phase 274, T7 AC-6 fix) so tests can assert against this table
 * directly instead of hand-duplicating its contents — a drift risk the
 * whole-branch review flagged. Still module-owned: nothing outside this
 * file writes to it.
 */
export const ALWAYS_FIRE: Gate[] = [
  'coherence-check',
  'structural-verifier',
  'build-test-must-pass',
];

/**
 * Per-cell deltas (gates added on top of ALWAYS_FIRE). Mirrors DESIGN.md
 * Section 4.2 exactly. Keep this table the only source of truth — when the
 * matrix changes, edit here, not in scattered call sites.
 *
 * Exported (phase 274, T7 AC-6): AC-6 requires a committed test that
 * "asserts `DELTAS.standard.complex` directly (not a settled SUMMARY)" —
 * the indirect `gatesFor()` proof alone didn't satisfy deep-verify's literal
 * reading of that Then-clause. Read-only from every consumer's perspective.
 */
export const DELTAS: Record<Profile, Record<Tier, Gate[]>> = {
  strict: {
    'quick-fix': ['draft-read', 'approve', 'test-coverage', 'interactive-verdict'],
    standard: [
      'draft-read',
      'approve',
      'test-coverage',
      'interactive-verdict',
      'per-task-verify',
      'code-review',
      'task-verify-required',
    ],
    complex: [
      'draft-read',
      'approve',
      'test-coverage',
      'interactive-verdict',
      'per-task-verify',
      'code-review',
      'plan-review',
      'security-audit',
      'task-verify-required',
    ],
  },
  standard: {
    'quick-fix': ['test-coverage'],
    standard: ['test-coverage', 'draft-read', 'approve', 'anomaly-notify', 'task-verify-required'],
    complex: [
      'test-coverage',
      'draft-read',
      'approve',
      'anomaly-notify',
      'code-review',
      'deep-verify',
      'task-verify-required',
    ],
  },
  auto: {
    'quick-fix': ['anomaly-notify'],
    standard: ['test-coverage', 'anomaly-notify', 'task-verify-required'],
    complex: ['test-coverage', 'anomaly-notify', 'task-verify-required'],
  },
};

/**
 * Resolve the effective profile for a phase. DRAFT frontmatter override wins;
 * otherwise the project default from `.cadence/config.json` applies. Falls
 * back to `'auto'` if neither is set.
 */
export function effectiveProfile(
  config: Pick<CadenceConfig, 'profile'> | null,
  draft: Pick<Draft, 'profile'> | null,
): Profile {
  if (draft?.profile) return draft.profile;
  if (config?.profile) return config.profile;
  return 'auto';
}

/**
 * Resolve the effective boundaryEnforcement mode for a phase (Phase 155,
 * AC-5). DRAFT frontmatter override wins; otherwise the project default from
 * `.cadence/config.json` applies. Falls back to `'warn'` if neither is set —
 * mirrors `effectiveProfile` above.
 *
 * Phase 280 T9 (AC-2, dec-20260815-002 / D-DQ2): optional third
 * `progressSignal` param — escalation-only. When
 * `progressSignal.anyTaskDispatched` is true the result is always `'block'`,
 * overriding config *and* an explicit draft override; it never de-escalates.
 * Omitting the param (every pre-existing 2-arg call site) leaves behavior
 * byte-for-byte unchanged.
 */
export function effectiveBoundaryEnforcement(
  config: Pick<CadenceConfig, 'boundaryEnforcement'> | null,
  draft: Pick<Draft, 'boundaryEnforcement'> | null,
  progressSignal?: { anyTaskDispatched: boolean },
): CadenceConfig['boundaryEnforcement'] {
  if (progressSignal?.anyTaskDispatched) return 'block';
  if (draft?.boundaryEnforcement) return draft.boundaryEnforcement;
  if (config?.boundaryEnforcement) return config.boundaryEnforcement;
  return 'warn';
}

/**
 * Resolve the effective redundantWorkEnforcement mode for a phase (subagent
 * task-redundancy monitoring). DRAFT frontmatter override wins; otherwise the
 * project default from `.cadence/config.json` applies. Falls back to
 * `'warn'` if neither is set — mirrors `effectiveBoundaryEnforcement`.
 */
export function effectiveRedundantWorkEnforcement(
  config: Pick<CadenceConfig, 'redundantWorkEnforcement'> | null,
  draft: Pick<Draft, 'redundantWorkEnforcement'> | null,
): CadenceConfig['redundantWorkEnforcement'] {
  if (draft?.redundantWorkEnforcement) return draft.redundantWorkEnforcement;
  if (config?.redundantWorkEnforcement) return config.redundantWorkEnforcement;
  return 'warn';
}

/**
 * Resolve the effective `gates.evidenceFloor` for a phase (Phase 214, T2 —
 * closes the visibility-only Phase 140 evidence-ladder enforcement gap).
 * Unlike `effectiveProfile`/`effectiveBoundaryEnforcement` there is no
 * per-draft override — DRAFT frontmatter never gained an `evidenceFloor`
 * field — so this reads only `config.gates.evidenceFloor`, falling back to
 * `'mention'`: the schema-level back-compat default from
 * `CadenceConfigZ.gates.evidenceFloor` (`packages/types/src/config.ts`),
 * which is deliberately the weakest rung so a config predating this gate
 * never starts newly refusing. The `checkEvidenceFloor` gate step in
 * `./ac-evidence.js` consumes this value.
 */
export function effectiveEvidenceFloor(
  config: Pick<CadenceConfig, 'gates'> | null,
): AcEvidence {
  return config?.gates?.evidenceFloor ?? 'mention';
}

/**
 * Phase 214 (T3, AC-3): the specific, named reason `gates.evidenceFloor:
 * 'ai-verified'` is structurally unreachable while the active `--deep`
 * verifier provider is `mock`. `deriveAcEvidence`
 * (`./ac-evidence.js`) has always excluded a mock-provider deep-verify pass
 * from counting as `ai-verified` (Phase 140's "Mock Mirage" precedent:
 * `if (verdict?.pass === true && verdict.provider !== 'mock') return
 * 'ai-verified';`) — so under this exact combination `checkEvidenceFloor`
 * would refuse *every* settle attempt forever, with no evidence an operator
 * could produce to satisfy it short of a bypass. That is a permanent,
 * structural dead end, not an ordinary "strengthen the evidence" case, and
 * the generic below-floor message (`checkEvidenceFloor`'s `reason`) doesn't
 * say so.
 */
export const AI_VERIFIED_UNDER_MOCK_PROVIDER_REASON =
  "`ai-verified` evidence is unreachable while the deep-verify provider is `mock` " +
  '(Phase 140: a mock pass is never counted as ai-verified) — configure a real ' +
  'provider via `cadence activate`, or lower `gates.evidenceFloor`.';

/**
 * Phase 214 (T3, AC-3): does effective `floor`/`provider` land on the
 * structural ai-verified/mock trap described above? Pure predicate — the
 * only two values that matter, already resolved by the caller.
 */
export function isEvidenceFloorStructurallyUnreachable(
  floor: AcEvidence,
  provider: ReturnType<typeof resolveEffectiveProvider>['provider'],
): boolean {
  return floor === 'ai-verified' && provider === 'mock';
}

/**
 * Phase 214 (T3, AC-3): pick the evidence-floor refusal message. Swaps in
 * `AI_VERIFIED_UNDER_MOCK_PROVIDER_REASON` exactly when
 * `isEvidenceFloorStructurallyUnreachable` holds for the effective floor and
 * the resolved `--deep` verifier provider; otherwise returns `genericReason`
 * unchanged (the per-AC actual-vs-required text `checkEvidenceFloor`
 * already produces — see `./ac-evidence.js`). Provider resolution reuses
 * `resolveEffectiveProvider` (`../verify/verifier-factory.js`) rather than
 * re-deriving the `?? 'mock'` fallback here, so this stays in lockstep with
 * every other verifier-provider consumer in the codebase.
 */
export function evidenceFloorRefusalReason(
  floor: AcEvidence,
  config: Pick<CadenceConfig, 'verifier'> | null,
  genericReason: string,
): string {
  const { provider } = resolveEffectiveProvider(config?.verifier ?? undefined);
  if (isEvidenceFloorStructurallyUnreachable(floor, provider)) {
    return AI_VERIFIED_UNDER_MOCK_PROVIDER_REASON;
  }
  return genericReason;
}

/**
 * Compute the set of gates that should fire for a given (tier, profile)
 * combination. Pure function; no I/O. `softCap` is true only for the
 * `auto × complex` cell — gate implementations later phases refuse without
 * `--allow-auto-complex`.
 */
export function gatesFor(tier: Tier, profile: Profile): GateSet {
  const deltas = DELTAS[profile][tier];
  const seen = new Set<Gate>();
  const gates: Gate[] = [];
  for (const g of [...ALWAYS_FIRE, ...deltas]) {
    if (seen.has(g)) continue;
    seen.add(g);
    gates.push(g);
  }
  return {
    gates,
    softCap: profile === 'auto' && tier === 'complex',
  };
}

/**
 * Convenience: derive the effective gate set from state + config + draft.
 * State carries the active tier; draft (optional) provides the profile
 * override; config provides the project default.
 */
export function effectiveGateSet(
  state: Pick<CadenceState, 'tier'>,
  config: Pick<CadenceConfig, 'profile'> | null,
  draft: Pick<Draft, 'profile' | 'tier'> | null,
): GateSet {
  const tier: Tier = draft?.tier ?? state.tier ?? 'standard';
  const profile = effectiveProfile(config, draft);
  return gatesFor(tier, profile);
}
