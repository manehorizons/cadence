// Phase 54: store.ts was split into focused modules under src/intelligence/store/,
// with store.ts kept as a thin re-export barrel so all existing import sites
// resolve unchanged. This is a characterization guard on the barrel's public
// surface — it asserts every public symbol the monolith exposed is still
// reachable through `intelligence/store.js`, and that a representative
// cross-module write path (addRecommendation, which spans recommendations →
// io → paths/ids → render) still works end-to-end through the barrel.
//
// AC-1: behavior preserved — the rest of the suite (29 files importing the
//   barrel) is the real safety net; this file guards the surface itself.
// AC-2: store.ts is a pure re-export barrel exposing exactly the old surface.
// AC-3: responsibilities split across store/ modules (paths, ids, io,
//   recommendations, assumptions, decisions, stats, audit, reconcile,
//   milestones) — exercised transitively here via the barrel.
import { describe, expect, it, afterEach } from 'vitest';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import * as store from '../../src/intelligence/store.js';
import {
  AUDIT_KINDS,
  addAssumption,
  addIntelligenceDecision,
  addRecommendation,
  applyAssumptionTransition,
  applyDecisionTransition,
  applyRecommendationTransition,
  computeIntelligenceAudit,
  computeIntelligenceStats,
  deriveDecisionInverseLinks,
  deriveRecommendationLinks,
  intelligenceDir,
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readMilestoneLedger,
  readRecommendationLedger,
  runAssumptionTransition,
  runDecisionTransition,
  runIntelligenceReconcile,
  runRecommendationTransition,
  writeMilestoneLedger,
} from '../../src/intelligence/store.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('intelligence/store barrel (phase 54)', () => {
  // AC-2: every public symbol the pre-split store.ts exported is reachable
  // through the barrel.
  it('re-exports the full public surface', () => {
    const fns = [
      intelligenceDir,
      readRecommendationLedger,
      readEvidenceLedger,
      readAssumptionLedger,
      readIntelligenceDecisionLedger,
      addRecommendation,
      deriveRecommendationLinks,
      applyRecommendationTransition,
      runRecommendationTransition,
      addAssumption,
      applyAssumptionTransition,
      runAssumptionTransition,
      addIntelligenceDecision,
      deriveDecisionInverseLinks,
      applyDecisionTransition,
      runDecisionTransition,
      computeIntelligenceStats,
      computeIntelligenceAudit,
      runIntelligenceReconcile,
      readMilestoneLedger,
      writeMilestoneLedger,
    ];
    for (const fn of fns) expect(typeof fn).toBe('function');
    expect(Array.isArray(AUDIT_KINDS)).toBe(true);
    expect(AUDIT_KINDS).toContain('broken-assumption-link');
  });

  // AC-2: the barrel must NOT widen the surface — internal helpers (path
  // builders, id generators, ledger writers) stay private to store/.
  it('does not leak internal helpers through the barrel', () => {
    const surface = store as Record<string, unknown>;
    for (const internal of [
      'recommendationsPath',
      'evidencePath',
      'nextRecommendationId',
      'writeIntelligenceLedgers',
      'writeAssumptionLedger',
      'rerenderRecommendationsMdIfPresent',
    ]) {
      expect(surface[internal]).toBeUndefined();
    }
  });

  // AC-1 + AC-3: a cross-module write path still works end-to-end through the
  // barrel (recommendations → io → paths/ids → render), and the computed
  // views read it back consistently.
  it('drives a cross-module write+read path through the barrel', async () => {
    active = await tempRepo();
    const root = active.root;
    const rec = await addRecommendation(root, {
      title: 'split the store',
      summary: 'decompose the god-module',
      priority: 'high',
      readiness: 'ready-for-milestone',
      affectedAreas: ['packages/core/src/intelligence'],
      affectedFiles: ['packages/core/src/intelligence/store.ts'],
      evidenceSummary: '985 LOC single file',
    });
    expect(rec.id).toMatch(/^rec-\d{8}-\d{3}$/);
    // Platform-agnostic: build the expected path with join so the assertion
    // holds on Windows (backslash separators) as well as POSIX.
    expect(intelligenceDir(root)).toBe(join(root, '.cadence', 'intelligence'));

    const recLedger = await readRecommendationLedger(root);
    const evLedger = await readEvidenceLedger(root);
    const asLedger = await readAssumptionLedger(root);
    const decLedger = await readIntelligenceDecisionLedger(root);

    const stats = computeIntelligenceStats(recLedger, evLedger, asLedger, decLedger);
    expect(stats.recommendations.total).toBe(1);

    const audit = computeIntelligenceAudit(recLedger, evLedger, asLedger, decLedger);
    expect(audit.findings).toHaveLength(0);
  });
});
