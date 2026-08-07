import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractOverrideTargets, parseLockfilePackages, checkOverrideCoverage } from '../../../../scripts/check-lockfile-overrides.mjs';

// 253-01, AC-1 and AC-2 (phase 253, task T4) — the real disk-reading proof
// that the corrected override targets in the REAL, committed package.json
// satisfy every REAL resolved instance in the REAL, refreshed
// pnpm-lock.yaml. Unlike check-lockfile-overrides.test.ts (T1's fixture-based
// unit tests for the pure functions themselves, modeling both the
// pre-remediation and anticipated post-remediation shapes), this test reads
// the two actual repo files off disk — mirrors release-integrity.test.ts's
// "Release workflow integrity wiring" pattern of asserting against real
// files rather than a fixture.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PACKAGE_JSON = join(ROOT, 'package.json');
const LOCKFILE = join(ROOT, 'pnpm-lock.yaml');

describe('lockfile overrides — real, current repo state (253-01, AC-1 and AC-2)', () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const lockfileText = readFileSync(LOCKFILE, 'utf8');

  it("names the corrected patched-floor targets in package.json's pnpm.overrides (253-01/AC-1)", () => {
    const targets = extractOverrideTargets(packageJson);

    // fast-uri: retargeted to the real patched floor.
    expect(targets).toContainEqual({ package: 'fast-uri', sourceVersion: '3.1.2', range: '^3.1.5' });
    // brace-expansion 5.x line: retargeted to the real patched floor.
    expect(targets).toContainEqual({ package: 'brace-expansion', sourceVersion: '5.0.6', range: '^5.0.9' });
    // brace-expansion 2.x line: its own new override, distinct from the 5.x
    // line's key — not an unversioned key that would wrongly force one line
    // toward the other's target. A caret range (major-capped), not an
    // unbounded `>=`: an earlier draft of this override used `>=2.1.4` and it
    // empirically, silently collapsed the 2.x line into the unrelated 5.x
    // line's resolution (an unbounded `>=` target has no upper bound, so
    // pnpm satisfies it with whatever's latest anywhere in the graph, even
    // across a major boundary — see 253-01-T3-EVIDENCE.md's "declared-range
    // intersection" finding). `^2.1.4` pins the resolution to major 2.
    expect(targets).toContainEqual({ package: 'brace-expansion', sourceVersion: '^2.0.0', range: '^2.1.4' });
    const braceExpansionTargets = targets.filter((t: { package: string }) => t.package === 'brace-expansion');
    expect(braceExpansionTargets).toHaveLength(2);
    expect(new Set(braceExpansionTargets.map((t: { sourceVersion: string }) => t.sourceVersion)).size).toBe(2);
    // ip-address: previously had no override at all — a new one closing the
    // patched floor. This repo's dependency graph has only one ip-address
    // major today, so an unbounded `>=10.3.1` would not currently collapse
    // anything the way brace-expansion's unbounded range did above — but a
    // caret range is applied here too, proactively, for the same
    // future-drift-resistance reason (a future second ip-address major
    // entering the graph would otherwise silently repeat the collapse).
    expect(targets).toContainEqual({ package: 'ip-address', sourceVersion: '^10.0.0', range: '^10.3.1' });
  });

  it('every resolved instance of fast-uri, brace-expansion (both lines), and ip-address satisfies its override target (253-01/AC-2)', () => {
    const overrideTargets = extractOverrideTargets(packageJson);
    const lockfilePackages = parseLockfilePackages(lockfileText);

    // Sanity: brace-expansion resolves to at least one live instance in the
    // real lockfile. At 253-01 time it resolved to two (minimatch@9.x's 2.x
    // line and minimatch@10.x's 5.x line), which is what originally
    // motivated this test's "not just the first instance found" phrasing for
    // AC-2. Phase 260's vitest v4 bump (and its transitive vite/vitest dep
    // graph) dropped minimatch@9.x from the resolved graph entirely, so only
    // the 5.x line remains today — a real, expected dependency-graph shift,
    // not a regression (the `brace-expansion@^2.0.0` override in
    // package.json's pnpm.overrides stays in place regardless, ready to
    // cover a 2.x line again if one re-enters the graph later). The
    // multi-instance "don't stop at the first match" behavior itself stays
    // covered by check-lockfile-overrides.test.ts's fixture-based unit tests,
    // which model that shape directly rather than depending on today's real
    // graph happening to contain two majors of the same package.
    const braceExpansionInstances = lockfilePackages.filter((p: { package: string }) => p.package === 'brace-expansion');
    expect(braceExpansionInstances.length).toBeGreaterThanOrEqual(1);

    const result = checkOverrideCoverage(overrideTargets, lockfilePackages);

    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
