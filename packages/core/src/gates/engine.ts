import type {
  CadenceConfig,
  CadenceState,
  Draft,
  Gate,
  GateSet,
  Profile,
  Tier,
} from '@manehorizons/cadence-types';

/**
 * Gates that always fire regardless of (tier × profile). Free per DESIGN.md
 * Section 4.1 — "always fire" row.
 */
const ALWAYS_FIRE: Gate[] = [
  'coherence-check',
  'structural-verifier',
  'build-test-must-pass',
];

/**
 * Per-cell deltas (gates added on top of ALWAYS_FIRE). Mirrors DESIGN.md
 * Section 4.2 exactly. Keep this table the only source of truth — when the
 * matrix changes, edit here, not in scattered call sites.
 */
const DELTAS: Record<Profile, Record<Tier, Gate[]>> = {
  strict: {
    'quick-fix': ['draft-read', 'approve', 'test-coverage', 'interactive-verdict'],
    standard: [
      'draft-read',
      'approve',
      'test-coverage',
      'interactive-verdict',
      'per-task-verify',
      'code-review',
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
    ],
  },
  standard: {
    'quick-fix': ['test-coverage'],
    standard: ['test-coverage', 'draft-read', 'approve', 'anomaly-notify'],
    complex: [
      'test-coverage',
      'draft-read',
      'approve',
      'anomaly-notify',
      'code-review',
      'deep-verify',
    ],
  },
  auto: {
    'quick-fix': ['anomaly-notify'],
    standard: ['test-coverage', 'anomaly-notify'],
    complex: ['test-coverage', 'anomaly-notify'],
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
 */
export function effectiveBoundaryEnforcement(
  config: Pick<CadenceConfig, 'boundaryEnforcement'> | null,
  draft: Pick<Draft, 'boundaryEnforcement'> | null,
): CadenceConfig['boundaryEnforcement'] {
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
