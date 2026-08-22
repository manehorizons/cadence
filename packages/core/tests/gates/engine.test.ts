import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Profile, Tier } from '@thomas-powers-jr/cadence-types';
import {
  effectiveGateSet,
  effectiveProfile,
  effectiveBoundaryEnforcement,
  effectiveRedundantWorkEnforcement,
  effectiveEvidenceFloor,
  evidenceFloorRefusalReason,
  AI_VERIFIED_UNDER_MOCK_PROVIDER_REASON,
  gatesFor,
  DELTAS,
  ALWAYS_FIRE,
} from '../../src/gates/engine.js';
import { checkEvidenceFloor } from '../../src/gates/ac-evidence.js';
import { resolvePacks } from '../../src/packs/resolve.js';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

// Pre-existing local alias for this file's other describe blocks (unrelated
// to phase 274) — left as-is rather than sweeping every call site. Phase
// 274's own AC-6 test below asserts against the imported `DELTAS`/
// `ALWAYS_FIRE` directly instead.
const ALWAYS = ALWAYS_FIRE;

describe('effectiveProfile', () => {
  it('draft override wins over config default', () => {
    expect(effectiveProfile({ profile: 'auto' }, { profile: 'strict' })).toBe('strict');
  });

  it('config default applies when draft has no override', () => {
    expect(effectiveProfile({ profile: 'standard' }, { profile: undefined })).toBe('standard');
    expect(effectiveProfile({ profile: 'standard' }, null)).toBe('standard');
  });

  it('falls back to "auto" when neither config nor draft set a profile', () => {
    expect(effectiveProfile(null, null)).toBe('auto');
    expect(effectiveProfile({ profile: undefined as never }, null)).toBe('auto');
  });
});

// Phase 155 T3 (AC-5) — mirrors effectiveProfile's draft-override-wins precedent.
describe('effectiveBoundaryEnforcement', () => {
  it('AC-5: draft override wins over config default', () => {
    expect(
      effectiveBoundaryEnforcement({ boundaryEnforcement: 'block' }, { boundaryEnforcement: 'warn' }),
    ).toBe('warn');
  });

  it('AC-5: config default applies when draft has no override', () => {
    expect(
      effectiveBoundaryEnforcement({ boundaryEnforcement: 'block' }, { boundaryEnforcement: undefined }),
    ).toBe('block');
    expect(effectiveBoundaryEnforcement({ boundaryEnforcement: 'block' }, null)).toBe('block');
  });

  it('AC-5: falls back to "warn" when neither config nor draft set it', () => {
    expect(effectiveBoundaryEnforcement(null, null)).toBe('warn');
    expect(effectiveBoundaryEnforcement({ boundaryEnforcement: undefined as never }, null)).toBe(
      'warn',
    );
  });

  // Phase 280 T9 (AC-2) — dispatch-execution escalation. anyTaskDispatched
  // always wins to 'block', overriding even an explicit 'warn' from config or
  // draft; the 3rd param is optional so all pre-existing 2-arg call sites
  // above are unaffected.
  it('AC-2: anyTaskDispatched:true escalates to "block" even when config says "warn" and draft is unset', () => {
    expect(
      effectiveBoundaryEnforcement(
        { boundaryEnforcement: 'warn' },
        { boundaryEnforcement: undefined },
        { anyTaskDispatched: true },
      ),
    ).toBe('block');
  });

  it('AC-2: anyTaskDispatched:true escalates to "block" even when draft explicitly overrides config to "warn"', () => {
    expect(
      effectiveBoundaryEnforcement(
        { boundaryEnforcement: 'block' },
        { boundaryEnforcement: 'warn' },
        { anyTaskDispatched: true },
      ),
    ).toBe('block');
  });

  it('AC-2: anyTaskDispatched:false behaves identically to the 2-arg call (no escalation)', () => {
    expect(
      effectiveBoundaryEnforcement(
        { boundaryEnforcement: 'warn' },
        { boundaryEnforcement: undefined },
        { anyTaskDispatched: false },
      ),
    ).toBe('warn');
    expect(
      effectiveBoundaryEnforcement(
        { boundaryEnforcement: 'block' },
        { boundaryEnforcement: 'warn' },
        { anyTaskDispatched: false },
      ),
    ).toBe('warn');
  });
});

describe('effectiveRedundantWorkEnforcement', () => {
  it('defaults to "warn" when neither draft nor config set it', () => {
    expect(effectiveRedundantWorkEnforcement(null, null)).toBe('warn');
  });

  it('config value wins over the default', () => {
    expect(effectiveRedundantWorkEnforcement({ redundantWorkEnforcement: 'off' }, null)).toBe('off');
  });

  it('draft override wins over config', () => {
    expect(
      effectiveRedundantWorkEnforcement(
        { redundantWorkEnforcement: 'block' },
        { redundantWorkEnforcement: 'warn' },
      ),
    ).toBe('warn');
  });
});

// Phase 214 T2 (AC-1): resolves the effective gates.evidenceFloor for the
// evidence-floor gate step. Mirrors effectiveBoundaryEnforcement's
// config-wins, back-compat-fallback shape — there is no per-draft override
// for evidenceFloor (T1's config.ts scope never added one to the Draft
// schema), so this only ever reads config.
describe('effectiveEvidenceFloor (Phase 214 T2)', () => {
  it('AC-1: config value wins when set', () => {
    expect(effectiveEvidenceFloor({ gates: { sealed: [], evidenceFloor: 'executed' } })).toBe('executed');
  });

  it('AC-1: falls back to "mention" — the schema-level back-compat default — when config is null', () => {
    expect(effectiveEvidenceFloor(null)).toBe('mention');
  });

  it('AC-1: falls back to "mention" when config.gates is present but evidenceFloor is unset', () => {
    expect(effectiveEvidenceFloor({ gates: { sealed: [], evidenceFloor: undefined as never } })).toBe('mention');
  });
});

// Phase 214 T3 (AC-3): names the structural ai-verified/mock trap explicitly.
// `deriveAcEvidence` (ac-evidence.ts) never counts a mock-provider deep-verify
// pass as 'ai-verified' (Phase 140's Mock Mirage exclusion) — so
// floor='ai-verified' + provider='mock' refuses settle forever with no
// bypass-free fix. The generic below-floor message (checkEvidenceFloor's
// `reason`) doesn't say that; this must.
describe('evidenceFloorRefusalReason (Phase 214 T3)', () => {
  const genericReason = checkEvidenceFloor(
    [{ id: 'AC-1', evidence: 'mention' }],
    'ai-verified',
  ).reason as string;

  it('AC-3: names the structural reason when floor=ai-verified and provider=mock', () => {
    const reason = evidenceFloorRefusalReason(
      'ai-verified',
      { verifier: { provider: 'mock', diffCapBytes: 262144 } },
      genericReason,
    );
    expect(reason).toBe(AI_VERIFIED_UNDER_MOCK_PROVIDER_REASON);
    expect(reason).toContain('ai-verified');
    expect(reason).toContain('mock');
    expect(reason).toContain('Phase 140');
  });

  it('AC-3: the structural-reason message is distinct from the generic below-floor message', () => {
    const reason = evidenceFloorRefusalReason(
      'ai-verified',
      { verifier: { provider: 'mock', diffCapBytes: 262144 } },
      genericReason,
    );
    expect(reason).not.toBe(genericReason);
    expect(genericReason).not.toContain('Phase 140');
  });

  it('AC-3: falls through to the generic message when floor is below ai-verified, even under mock', () => {
    expect(
      evidenceFloorRefusalReason(
        'executed',
        { verifier: { provider: 'mock', diffCapBytes: 262144 } },
        genericReason,
      ),
    ).toBe(genericReason);
  });

  it('AC-3: falls through to the generic message when floor=ai-verified but the provider is real', () => {
    for (const provider of ['anthropic', 'local', 'host-cli'] as const) {
      expect(
        evidenceFloorRefusalReason('ai-verified', { verifier: { provider, diffCapBytes: 262144 } }, genericReason),
      ).toBe(genericReason);
    }
  });

  it('AC-3: treats a null/unset verifier config the same as an explicit mock provider (schema default)', () => {
    expect(evidenceFloorRefusalReason('ai-verified', null, genericReason)).toBe(
      AI_VERIFIED_UNDER_MOCK_PROVIDER_REASON,
    );
    expect(evidenceFloorRefusalReason('ai-verified', { verifier: undefined as never }, genericReason)).toBe(
      AI_VERIFIED_UNDER_MOCK_PROVIDER_REASON,
    );
  });
});

describe('gatesFor — matrix coverage', () => {
  // Always-fire gates appear in every cell.
  for (const profile of ['strict', 'standard', 'auto'] as const) {
    for (const tier of ['quick-fix', 'standard', 'complex'] as const) {
      it(`(${profile}, ${tier}) includes all three always-fire gates`, () => {
        const set = gatesFor(tier, profile);
        for (const g of ALWAYS) expect(set.gates).toContain(g);
      });
    }
  }

  it('strict × quick-fix: draft-read, approve, test-coverage, interactive-verdict', () => {
    const set = gatesFor('quick-fix', 'strict');
    expect(set.gates).toEqual(
      expect.arrayContaining(['draft-read', 'approve', 'test-coverage', 'interactive-verdict']),
    );
    expect(set.softCap).toBe(false);
  });

  it('strict × complex: includes plan-review + security-audit', () => {
    const set = gatesFor('complex', 'strict');
    expect(set.gates).toEqual(expect.arrayContaining(['plan-review', 'security-audit']));
    expect(set.softCap).toBe(false);
  });

  it('standard × complex: includes code-review + deep-verify', () => {
    const set = gatesFor('complex', 'standard');
    expect(set.gates).toEqual(expect.arrayContaining(['code-review', 'deep-verify']));
    expect(set.softCap).toBe(false);
  });

  it('auto × quick-fix: only anomaly-notify on top of free', () => {
    const set = gatesFor('quick-fix', 'auto');
    expect(set.gates).toEqual([...ALWAYS, 'anomaly-notify']);
    expect(set.softCap).toBe(false);
  });

  it('auto × standard: adds test-coverage + anomaly-notify + task-verify-required', () => {
    const set = gatesFor('standard', 'auto');
    expect(set.gates).toEqual([
      ...ALWAYS,
      'test-coverage',
      'anomaly-notify',
      'task-verify-required',
    ]);
    expect(set.softCap).toBe(false);
  });

  it('auto × complex: softCap=true (the cap)', () => {
    const set = gatesFor('complex', 'auto');
    expect(set.softCap).toBe(true);
    // Gates still computed (caller refuses based on softCap).
    expect(set.gates).toEqual(expect.arrayContaining(['anomaly-notify']));
  });

  it('returns deduplicated gates (no double-counting always-fire vs delta)', () => {
    for (const profile of ['strict', 'standard', 'auto'] as const) {
      for (const tier of ['quick-fix', 'standard', 'complex'] as const) {
        const set = gatesFor(tier, profile);
        expect(new Set(set.gates).size).toBe(set.gates.length);
      }
    }
  });
});

// Phase 274 T7 (AC-6) — anchors AC-6 on engine.ts's DELTAS table (source
// code truth, already inside deep-verify's observable surface) rather than
// on this phase's own not-yet-existing SUMMARY.json — the exact circularity
// phase 272's AC-7 fell into, which phase 274 exists to fix.
describe('274-01: DELTAS standard × complex reachability', () => {
  // Consolidated into a single `it()` (whole-branch review finding: this
  // file had the same `scanTestCoverage` per-`${acId}@${file}` dedup gap
  // — src/verify/coverage.ts:140-142, no line number in the key — that
  // this phase's own DRAFT fifth/sixth as-built amendments already fixed in
  // four other files; three separate `it()`s here all carried the literal
  // `274-01/AC-6` token, so only the first survived as visible coverage).
  it('274-01/AC-6: DELTAS.standard.complex directly contains code-review and deep-verify, gatesFor(complex, standard) actually conducts what DELTAS promises, and this phase\'s own DRAFT frontmatter is tier: complex, profile: standard', () => {
    // Direct assertion on the DELTAS cell itself, per AC-6's Then-clause
    // ("asserts DELTAS.standard.complex directly, not a settled SUMMARY") —
    // deep-verify rejected an earlier version of this test that only
    // inferred the cell's contents indirectly via gatesFor().
    expect(DELTAS.standard.complex).toEqual(expect.arrayContaining(['code-review', 'deep-verify']));
    // Neither gate is always-fire, so each can only have come from this
    // DELTAS cell — confirms the assertion above is about DELTAS itself,
    // not an artifact of gatesFor's deduplication.
    for (const g of ['code-review', 'deep-verify'] as const) {
      expect(ALWAYS_FIRE as readonly string[]).not.toContain(g);
    }

    const set = gatesFor('complex', 'standard');
    expect(set.gates).toEqual(expect.arrayContaining(['code-review', 'deep-verify']));

    // packages/core/tests/gates -> repo root is four levels up.
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
    const draftPath = join(
      repoRoot,
      '.cadence/phases/274-unobservable-criteria-classification/274-01-DRAFT.md',
    );
    const draftText = readFileSync(draftPath, 'utf8');
    expect(draftText).toContain('tier: complex');
    expect(draftText).toContain('profile: standard');
  });
});

describe('effectiveGateSet', () => {
  it('uses draft tier when present, else state.tier', () => {
    const set1 = effectiveGateSet({ tier: 'quick-fix' }, { profile: 'auto' }, null);
    expect(set1.softCap).toBe(false);
    const set2 = effectiveGateSet({ tier: 'quick-fix' }, { profile: 'auto' }, {
      tier: 'complex',
      profile: undefined,
    });
    expect(set2.softCap).toBe(true);
  });

  it('defaults to standard tier + auto profile when nothing is specified', () => {
    const set = effectiveGateSet({ tier: null }, null, null);
    expect(set.gates).toEqual([
      ...ALWAYS,
      'test-coverage',
      'anomaly-notify',
      'task-verify-required',
    ]);
    expect(set.softCap).toBe(false);
  });
});

// Phase 290 T4 (AC-6) — zero-behavioral-effect regression proof: gate computation
// is independent of pack resolution. This describe block provides two falsifiable
// assertions: (a) that gatesFor()/effectiveGateSet() output is byte-identical
// whether or not packs are enabled and resolved, and (b) that no file under
// gates/ or services/ statically imports from packs/ — structural proof that
// the two subsystems are decoupled.
describe('290-01: pack resolution has zero behavioral effect on gate computation (AC-6)', () => {
  let active: Fixture | null = null;
  afterEach(async () => {
    if (active) {
      await active.cleanup();
      active = null;
    }
  });

  it('290-01/AC-6: gatesFor/effectiveGateSet output is byte-identical to ALWAYS_FIRE+DELTAS even with a pack enabled and successfully resolved in fixture setup (no consumer reads the resolved pack)', async () => {
    // Set up fixture with a valid, resolvable pack enabled.
    active = await tempRepo({ initialized: true });
    const packDir = join(active.root, '.cadence/packs/cadence/test-pack');
    await mkdir(packDir, { recursive: true });

    const manifest = {
      id: 'cadence/test-pack',
      version: '1.0.0',
    };
    await writeFile(join(packDir, 'pack.json'), JSON.stringify(manifest));

    // Load config and enable the pack.
    const { loadConfig, writeConfig } = await import('../../src/config/loader.js');
    const config = await loadConfig(active.root);
    await writeConfig(active.root, {
      ...config,
      packs: { enabled: ['cadence/test-pack'], disabled: [] },
    });

    // Sanity-check: verify pack resolves.
    const resolved = await resolvePacks(active.root, {
      packs: { enabled: ['cadence/test-pack'], disabled: [] },
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('cadence/test-pack');
    expect(resolved[0]).toHaveProperty('manifest');

    // Tiers and profiles per the enums in types/src/state.ts and types/src/profile.ts.
    const tiers: Tier[] = ['quick-fix', 'standard', 'complex'];
    const profiles: Profile[] = ['strict', 'standard', 'auto'];

    // For each (tier, profile) combo, assert gatesFor and effectiveGateSet are
    // identical to what DELTAS/ALWAYS_FIRE would produce. Pull expected values
    // from the constants directly (source of truth); do not hardcode a duplicate table.
    for (const tier of tiers) {
      for (const profile of profiles) {
        const actual = gatesFor(tier, profile);

        // Compute expected from ALWAYS_FIRE + DELTAS, mirroring gatesFor's logic.
        const deltaGates = DELTAS[profile]?.[tier] ?? [];
        const expectedGates = [...new Set([...ALWAYS_FIRE, ...deltaGates])];
        const expectedSoftCap = profile === 'auto' && tier === 'complex';

        // Strict array equality (not arrayContaining) — arrayContaining only
        // proves actual.gates is a superset of expectedGates, which would
        // silently pass even if gatesFor leaked an extra, unexpected gate
        // (e.g. a pack-contributed gate) into its output. expectedGates is
        // built with the same first-occurrence-order dedup semantics as
        // gatesFor's own `for (const g of [...ALWAYS_FIRE, ...deltas])` loop
        // (Set iteration order for primitive strings preserves insertion
        // order), so order matches too — this is a real byte-identical proof.
        expect(actual.gates).toEqual(expectedGates);
        expect(new Set(actual.gates).size).toBe(actual.gates.length); // no duplicates
        expect(actual.softCap).toBe(expectedSoftCap);
      }
    }

    // Also test effectiveGateSet with the same fixture state (packs enabled/resolved).
    const draftTier: Tier = 'standard';
    const configProfile: Profile = 'auto';
    const effectiveSet = effectiveGateSet({ tier: draftTier }, { profile: configProfile }, null);

    const expectedDeltaGates = DELTAS[configProfile]?.[draftTier] ?? [];
    const expectedEffectiveGates = [...new Set([...ALWAYS_FIRE, ...expectedDeltaGates])];

    expect(effectiveSet.gates).toEqual(expectedEffectiveGates);
    expect(new Set(effectiveSet.gates).size).toBe(effectiveSet.gates.length);
  });

  it('290-01/AC-6: structural no-coupling assertion — no file in gates/ or services/ imports from packs/', () => {
    // Compute repo root: tests live at packages/core/tests/gates/engine.test.ts,
    // so four levels up.
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
    const gatesDir = join(repoRoot, 'packages/core/src/gates');
    const servicesDir = join(repoRoot, 'packages/core/src/services');

    const offendingFiles: string[] = [];
    // A directory-walk failure (bad path, permissions, a moved directory)
    // must not silently produce a vacuous green — an unreached scan means
    // zero files examined, which is indistinguishable from "examined every
    // file, found nothing" unless something counts what was actually read.
    let filesScanned = 0;

    // Recursively walk gatesDir and servicesDir, checking each .ts file.
    const scanDir = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            filesScanned += 1;
            const content = readFileSync(fullPath, 'utf8');
            // Look for import/export statements referencing packs/ — both
            // relative and absolute, and both static and dynamic. Two-part
            // check:
            //   1. Extract each *statement-level* top-of-line `import`/
            //      `export` clause (`^(?:import|export)\b[^;]*;`, multiline)
            //      and check whether that whole statement's text contains
            //      `/packs/`. Operating on the extracted statement (not the
            //      raw file content) means a `from` module specifier that
            //      happens to sit inside a non-import string — e.g. an error
            //      message like `` `failed to load pack from
            //      '.cadence/packs/${id}/pack.json'` `` — cannot produce a
            //      false positive, while named/default/namespace/mixed
            //      static imports and re-exports all match, because every
            //      one of those forms requires `from` before the module
            //      specifier and the whole clause (including a multi-line
            //      one) sits on the same statement between `import`/`export`
            //      and its terminating `;`.
            //   2. Separately check for a dynamic `import('.../packs/...')`
            //      call, which isn't anchored to line-start.
            // A prior narrower pattern only matched named/side-effect static
            // imports (its post-`import` clause was limited to an optional
            // `{...}` group followed by `from`) and silently missed default
            // and namespace imports — confirmed by injecting
            // `import * as _unusedPacksNamespace from '../packs/resolve.js';`
            // into engine.ts and observing this test still pass. A simpler
            // whole-content `from\s+['"\`].../packs/...['"\`]` pattern (an
            // intermediate fix) closed that gap but introduced its own false
            // positive on the error-message case above — confirmed by
            // testing both patterns against a matrix of positive and
            // negative cases before picking this statement-scoped version.
            const importStatements = content.match(/^(?:import|export)\b[^;]*;/gm) ?? [];
            const hasStaticPackImport = importStatements.some((s) => s.includes('/packs/'));
            const hasDynamicPackImport = /\bimport\s*\(\s*['"`][^'"`]*\/packs\//.test(content);
            if (hasStaticPackImport || hasDynamicPackImport) {
              offendingFiles.push(fullPath);
            }
          }
        }
      } catch {
        // Best-effort: if a read fails, don't blow up the test.
      }
    };

    scanDir(gatesDir);
    scanDir(servicesDir);

    // Guard against the scan itself silently finding nothing to look at.
    expect(filesScanned).toBeGreaterThan(0);

    expect(offendingFiles).toEqual(
      [],
      `Files in gates/ or services/ must not import from packs/. Found imports in: ${offendingFiles.join(
        ', ',
      )}`,
    );
  });
});
