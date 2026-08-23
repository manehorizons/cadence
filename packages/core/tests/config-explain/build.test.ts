import { describe, it, expect } from 'vitest';
import { defaultConfig, presets } from '@thomas-powers-jr/cadence-types';
import { gatesFor } from '../../src/gates/engine.js';
import { buildExplanation } from '../../src/config-explain/build.js';
import type { ExplainContext } from '../../src/config-explain/types.js';
import type { ResolvedPack } from '../../src/packs/resolve.js';

/** A context with no active phase and every external probe satisfied. */
const cleanCtx: ExplainContext = {
  activeTier: null,
  anthropicKeyPresent: true,
  localKeyPresent: true,
  hostHooksInstalled: true,
};

describe('buildExplanation — gate sets per tier (AC-1)', () => {
  // AC-1: each tier's gate set equals gatesFor(tier, effectiveProfile).
  it('AC-1: computes a gate set per tier from the configured profile', () => {
    // standard profile so the three tiers differ observably.
    const config = { ...defaultConfig, profile: 'standard' as const };
    const exp = buildExplanation(config, cleanCtx);

    const tiers = exp.tiers.map((t) => t.tier);
    expect(tiers).toEqual(['quick-fix', 'standard', 'complex']);

    for (const view of exp.tiers) {
      const want = gatesFor(view.tier, 'standard');
      expect(view.gates).toEqual(want.gates);
      expect(view.softCap).toBe(want.softCap);
    }
  });

  // AC-1: the tier matching ctx.activeTier is flagged current; none when absent.
  it('AC-1: flags the active tier as current, none when no phase is active', () => {
    const withActive = buildExplanation(presets.production, {
      ...cleanCtx,
      activeTier: 'complex',
    });
    expect(withActive.tiers.filter((t) => t.current).map((t) => t.tier)).toEqual(['complex']);

    const idle = buildExplanation(presets.production, cleanCtx);
    expect(idle.tiers.some((t) => t.current)).toBe(false);
  });
});

describe('buildExplanation — provider rows (Phase 165 AC-1)', () => {
  // AC-1: a 'host-cli' provider renders as a real, non-mock row — proves the
  // ProviderRow['provider'] type (and providerRows' block-indexed read) genuinely
  // admits the 4th provider rather than silently coercing/erroring on it.
  it("AC-1: a 'host-cli' provider block renders as a non-mock row", () => {
    const config = { ...defaultConfig, perTaskVerifier: { provider: 'host-cli' as const } };
    const exp = buildExplanation(config, cleanCtx);

    const row = exp.providers.find((r) => r.block === 'perTaskVerifier');
    expect(row).toEqual({
      block: 'perTaskVerifier',
      gate: 'per-task-verify',
      provider: 'host-cli',
      isMock: false,
    });
  });
});

describe('buildExplanation — hooks-not-installed stale-vs-absent honesty (phase 250, T16)', () => {
  // defaultConfig has sessionStart/stopReminder/userPromptSubmit = true, so
  // anyHookEnabled is true and the hooks-not-installed warning is live.
  const ctxAbsent: ExplainContext = { ...cleanCtx, hostHooksInstalled: false };
  const ctxStale: ExplainContext = {
    ...cleanCtx,
    hostHooksInstalled: false,
    hostHooksStale: true,
  };

  // T16: a present-but-stale entry must not get the "no host hook entry was
  // found" message — that claim is false when an entry does exist.
  it('T16: a stale-scope managed entry gets a distinct "needs reinstalling" message, not "no host hook entry was found"', () => {
    const warnings = buildExplanation(defaultConfig, ctxStale).warnings;
    const warning = warnings.find((w) => w.code === 'hooks-not-installed');
    expect(warning).toBeDefined();
    expect(warning!.message).toMatch(/outdated npm scope/i);
    expect(warning!.message).toMatch(/needs reinstalling/i);
    expect(warning!.message).not.toMatch(/no host hook entry was found/i);
  });

  // T16: a genuinely absent entry keeps the original message, and it must
  // not pick up the stale-scope framing.
  it('T16: a genuinely absent entry still reports "no host hook entry was found", distinct from the stale message', () => {
    const warnings = buildExplanation(defaultConfig, ctxAbsent).warnings;
    const warning = warnings.find((w) => w.code === 'hooks-not-installed');
    expect(warning).toBeDefined();
    expect(warning!.message).toMatch(/no host hook entry was found/i);
    expect(warning!.message).not.toMatch(/outdated npm scope/i);
  });
});

describe('buildExplanation — pack-contributed gates on the current-tier row (AC-3, phase 292 T3)', () => {
  // A single pack that adds 'code-review' to auto×quick-fix — a cell whose
  // raw DELTAS entry (engine.ts) is just ['anomaly-notify'], so 'code-review'
  // is observably new.
  const packManifest = {
    id: 'cadence/example',
    version: '1.0.0',
    gates: [{ profile: 'auto' as const, tier: 'quick-fix' as const, add: ['code-review' as const] }],
  };
  const resolvedPacks: ResolvedPack[] = [{ id: 'cadence/example', source: 'local', manifest: packManifest }];
  const autoConfig = { ...defaultConfig, profile: 'auto' as const };

  // AC-3: buildExplanation must stay pure — it never reads packs off disk
  // itself, only from ctx.resolvedPacks. The decisive evidence: `resolvedPacks`
  // here names a pack id ('cadence/example') that exists nowhere on this
  // machine's filesystem (no `.cadence/packs/cadence/example/pack.json` was
  // ever written by this test) — yet its gates[].add contribution still
  // shows up below. If buildExplanation called resolvePacks (or touched the
  // filesystem at all) instead of trusting ctx verbatim, this pack could
  // never resolve and the contribution would be silently absent. The
  // function is also synchronous (not a Promise) and deterministic across
  // repeat calls with the same plain-object ctx — both properties a hidden
  // I/O read would put at risk.
  it('AC-3: stays pure — no I/O, deterministic, synchronous — when packs arrive via ctx.resolvedPacks', () => {
    const ctx: ExplainContext = { ...cleanCtx, activeTier: 'quick-fix', resolvedPacks };
    const result = buildExplanation(autoConfig, ctx);
    expect(result).not.toBeInstanceOf(Promise);
    // The pack contributed despite resolving from nowhere on disk — proof
    // buildExplanation trusted ctx.resolvedPacks rather than reading the FS.
    expect(result.tiers.find((t) => t.tier === 'quick-fix')!.packContributedGates).toEqual([
      'code-review',
    ]);
    const again = buildExplanation(autoConfig, ctx);
    expect(again).toEqual(result);
  });

  // AC-3: the current-tier row's gates differ from the raw gatesFor(tier,
  // profile) output for that same tier once a pack contributes a matching
  // gates[].add entry, and packContributedGates names exactly what was added.
  it("292-01/AC-3: the current tier's row unions in an enabled pack's gates[].add contribution for its (profile, tier) cell", () => {
    const ctx: ExplainContext = { ...cleanCtx, activeTier: 'quick-fix', resolvedPacks };
    const exp = buildExplanation(autoConfig, ctx);

    const raw = gatesFor('quick-fix', 'auto');
    const current = exp.tiers.find((t) => t.tier === 'quick-fix')!;

    expect(current.current).toBe(true);
    expect(current.gates).not.toEqual(raw.gates);
    expect(current.gates).toContain('code-review');
    expect(current.packContributedGates).toEqual(['code-review']);
  });

  // AC-3: rows for tiers other than the active one stay exactly the raw
  // gatesFor() output, even when a pack declares a gates[].add entry that
  // would match that other tier's (profile, tier) cell — the matrix table
  // itself must never be pack-augmented, only the current-tier row.
  it('AC-3: non-active tier rows are unaffected — still raw gatesFor output — even when a pack targets their cell', () => {
    const resolvedPacksBoth: ResolvedPack[] = [
      {
        id: 'cadence/example',
        source: 'local',
        manifest: {
          id: 'cadence/example',
          version: '1.0.0',
          gates: [
            { profile: 'auto', tier: 'quick-fix', add: ['code-review'] },
            { profile: 'auto', tier: 'standard', add: ['security-audit'] },
          ],
        },
      },
    ];
    const ctx: ExplainContext = { ...cleanCtx, activeTier: 'quick-fix', resolvedPacks: resolvedPacksBoth };
    const exp = buildExplanation(autoConfig, ctx);

    const standardRow = exp.tiers.find((t) => t.tier === 'standard')!;
    const rawStandard = gatesFor('standard', 'auto');
    expect(standardRow.current).toBe(false);
    expect(standardRow.gates).toEqual(rawStandard.gates);
    expect(standardRow.packContributedGates).toEqual([]);

    const complexRow = exp.tiers.find((t) => t.tier === 'complex')!;
    const rawComplex = gatesFor('complex', 'auto');
    expect(complexRow.gates).toEqual(rawComplex.gates);
    expect(complexRow.packContributedGates).toEqual([]);
  });

  // AC-3: an errored pack resolution (unresolvable/invalid manifest) never
  // contributes gates — mirrors how effectiveGateSet treats it.
  it('AC-3: an errored ResolvedPack contributes nothing to the current-tier row', () => {
    const erroredPacks: ResolvedPack[] = [{ id: 'cadence/broken', source: 'local', error: 'boom' }];
    const ctx: ExplainContext = { ...cleanCtx, activeTier: 'quick-fix', resolvedPacks: erroredPacks };
    const exp = buildExplanation(autoConfig, ctx);

    const current = exp.tiers.find((t) => t.tier === 'quick-fix')!;
    expect(current.packContributedGates).toEqual([]);
    expect(current.gates).toEqual(gatesFor('quick-fix', 'auto').gates);
  });

  // AC-3: no resolvedPacks at all (absent field / idle phase) is a no-op —
  // back-compat with ExplainContext literals that predate this field.
  it('AC-3: an absent resolvedPacks field is a no-op — pre-existing ExplainContext literals keep working', () => {
    const exp = buildExplanation(autoConfig, { ...cleanCtx, activeTier: 'quick-fix' });
    const current = exp.tiers.find((t) => t.tier === 'quick-fix')!;
    expect(current.packContributedGates).toEqual([]);
    expect(current.gates).toEqual(gatesFor('quick-fix', 'auto').gates);
  });

  // Divergence surfacing: when the current-tier row is pack-augmented, that
  // must be visible, not a silent mismatch — a dedicated warning names the
  // added gate(s) and the contributing pack(s), following the same
  // deriveWarnings precedent as the other four warning codes.
  it('AC-3: a pack-augmented current-tier row surfaces a "packs-augment-current-tier" warning naming the gate and pack', () => {
    const ctx: ExplainContext = { ...cleanCtx, activeTier: 'quick-fix', resolvedPacks };
    const exp = buildExplanation(autoConfig, ctx);

    const warning = exp.warnings.find((w) => w.code === 'packs-augment-current-tier');
    expect(warning).toBeDefined();
    expect(warning!.message).toMatch(/code-review/);
    expect(warning!.message).toMatch(/cadence\/example/);
  });

  // No divergence, no warning — a clean config (no packs enabled) must not
  // spuriously emit the new warning code.
  it('AC-3: no "packs-augment-current-tier" warning when no pack contributes to the current tier', () => {
    const exp = buildExplanation(autoConfig, { ...cleanCtx, activeTier: 'quick-fix' });
    expect(exp.warnings.some((w) => w.code === 'packs-augment-current-tier')).toBe(false);
  });

  // AC-3: a pack's gates[].add can name a gate that's already in the raw
  // DELTAS entry for that (profile, tier) cell (auto×quick-fix's raw entry
  // is ['anomaly-notify'], per DELTAS in engine.ts) — that contributes
  // nothing observable. Neither the row's gates/packContributedGates nor the
  // warning may treat this as a divergence; doing so would be exactly the
  // false-positive a naive "any match" implementation risks.
  it('AC-3: a pack re-declaring a gate already present via raw gatesFor is not treated as a divergence — no row change, no warning', () => {
    const redundantPacks: ResolvedPack[] = [
      {
        id: 'cadence/redundant',
        source: 'local',
        manifest: {
          id: 'cadence/redundant',
          version: '1.0.0',
          gates: [{ profile: 'auto', tier: 'quick-fix', add: ['anomaly-notify'] }],
        },
      },
    ];
    const ctx: ExplainContext = { ...cleanCtx, activeTier: 'quick-fix', resolvedPacks: redundantPacks };
    const exp = buildExplanation(autoConfig, ctx);

    const current = exp.tiers.find((t) => t.tier === 'quick-fix')!;
    expect(current.gates).toEqual(gatesFor('quick-fix', 'auto').gates);
    expect(current.packContributedGates).toEqual([]);
    expect(exp.warnings.some((w) => w.code === 'packs-augment-current-tier')).toBe(false);
  });
});
