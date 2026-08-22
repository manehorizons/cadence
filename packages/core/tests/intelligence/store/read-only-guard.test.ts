import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import {
  emptyAssumptionLedger,
  emptyEvidenceLedger,
  emptyIntelligenceDecisionLedger,
  emptyMilestoneLedger,
  emptyRecommendationLedger,
} from '@thomas-powers-jr/cadence-types';
import { assertNotReadOnly } from '../../../src/intelligence/store/read-only-guard.js';
import {
  writeIntelligenceLedgers,
  rerenderRecommendationsMdIfPresent,
} from '../../../src/intelligence/store/io.js';
import {
  writeIntelligenceDecisionLedger,
  addIntelligenceDecision,
  runDecisionTransition,
} from '../../../src/intelligence/store/decisions.js';
import {
  writeAssumptionLedger,
  addAssumption,
  runAssumptionTransition,
} from '../../../src/intelligence/store/assumptions.js';
import { writeMilestoneLedger } from '../../../src/intelligence/store/milestones.js';
import { runIntelligenceReconcile } from '../../../src/intelligence/store/reconcile.js';
import { addRecommendation } from '../../../src/intelligence/store/recommendations.js';
import {
  recommendationsPath,
  decisionsPath,
  assumptionsPath,
  milestonesPath,
  recommendationsMdPath,
} from '../../../src/intelligence/store/paths.js';

let active: Fixture | null = null;

// vi.stubEnv/vi.unstubAllEnvs (rather than manual process.env save/delete/
// restore) is the vitest-recommended idiom for env var manipulation in
// tests: vitest tracks every stubbed key itself and guarantees it is
// reverted, which is more robust than a hand-rolled save/restore under
// vitest.shared.ts's `pool: 'forks'` / `maxWorkers: 12` config, where
// process.env is a live OS-level object shared by every test file a worker
// happens to execute -- a manual save/restore can capture and "faithfully
// restore" an already-contaminated ambient value instead of a clean one.
afterEach(async () => {
  vi.unstubAllEnvs();
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedRec(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 'seed',
    summary: 'seed',
    priority: 'medium',
    readiness: 'raw-idea',
    affectedAreas: [],
    affectedFiles: [],
  });
  return r.id;
}

describe('assertNotReadOnly (guard unit) (289-01/AC-1)', () => {
  it('289-01/AC-1: unset CADENCE_READ_ONLY does not throw', () => {
    vi.stubEnv('CADENCE_READ_ONLY', undefined);
    expect(() => assertNotReadOnly('some-op')).not.toThrow();
  });

  it('289-01/AC-1: empty string CADENCE_READ_ONLY does not throw', () => {
    vi.stubEnv('CADENCE_READ_ONLY', '');
    expect(() => assertNotReadOnly('some-op')).not.toThrow();
  });

  it.each(['1', 'true', 'yes', '0', 'anything'])(
    '289-01/AC-1: CADENCE_READ_ONLY=%s throws a CadenceError naming the mode and the operation',
    (val) => {
      vi.stubEnv('CADENCE_READ_ONLY', val);
      expect(() => assertNotReadOnly('my-operation')).toThrow(
        /CADENCE_READ_ONLY.*my-operation/s,
      );
    },
  );

  it('289-01/AC-1: thrown error carries code READ_ONLY_MODE_BLOCKED', () => {
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    try {
      assertNotReadOnly('op');
      throw new Error('expected assertNotReadOnly to throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('READ_ONLY_MODE_BLOCKED');
    }
  });
});

// These import and call the store's write functions directly (never via the
// CLI), so they are also this phase's evidence for 289-01/AC-5 ("a ledger
// mutation attempted by importing the service directly... is still
// refused") — the same refusal mechanism, exercised the same way AC-1
// requires, satisfies both ACs at once rather than needing a duplicate test.
describe('read-only guard at each of the ten store write entry points (289-01/AC-1, 289-01/AC-5)', () => {
  it('289-01/AC-1, 289-01/AC-5: writeIntelligenceLedgers (imported directly, not via CLI) refuses under CADENCE_READ_ONLY and leaves ledgers unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard' });
    await writeIntelligenceLedgers(active.root, emptyRecommendationLedger(), emptyEvidenceLedger());
    const before = await readFile(recommendationsPath(active.root), 'utf8');
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    await expect(
      writeIntelligenceLedgers(active.root, emptyRecommendationLedger(), emptyEvidenceLedger()),
    ).rejects.toThrow(/CADENCE_READ_ONLY.*writeIntelligenceLedgers/s);
    const after = await readFile(recommendationsPath(active.root), 'utf8');
    expect(after).toBe(before);
  });

  it('289-01/AC-1: writeIntelligenceDecisionLedger refuses under CADENCE_READ_ONLY and leaves decisions.json unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard' });
    await writeIntelligenceDecisionLedger(active.root, emptyIntelligenceDecisionLedger());
    const before = await readFile(decisionsPath(active.root), 'utf8');
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    await expect(
      writeIntelligenceDecisionLedger(active.root, emptyIntelligenceDecisionLedger()),
    ).rejects.toThrow(/CADENCE_READ_ONLY.*writeIntelligenceDecisionLedger/s);
    const after = await readFile(decisionsPath(active.root), 'utf8');
    expect(after).toBe(before);
  });

  it('289-01/AC-1: addIntelligenceDecision refuses under CADENCE_READ_ONLY, creates no decisions.json', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard' });
    const jsonPath = decisionsPath(active.root);
    expect(existsSync(jsonPath)).toBe(false);
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    await expect(
      addIntelligenceDecision(active.root, { title: 't', rationale: 'r' }),
    ).rejects.toThrow(/CADENCE_READ_ONLY.*addIntelligenceDecision/s);
    expect(existsSync(jsonPath)).toBe(false);
  });

  it('289-01/AC-1: runDecisionTransition refuses under CADENCE_READ_ONLY and leaves decisions.json unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard' });
    const recId = await seedRec(active.root);
    const d = await addIntelligenceDecision(active.root, {
      recommendationId: recId,
      title: 'D1',
      rationale: 'r',
    });
    const before = await readFile(decisionsPath(active.root), 'utf8');
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    await expect(runDecisionTransition(active.root, d.id, 'supersede')).rejects.toThrow(
      /CADENCE_READ_ONLY.*runDecisionTransition/s,
    );
    const after = await readFile(decisionsPath(active.root), 'utf8');
    expect(after).toBe(before);
  });

  it('289-01/AC-1: writeAssumptionLedger refuses under CADENCE_READ_ONLY and leaves assumptions.json unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard' });
    await writeAssumptionLedger(active.root, emptyAssumptionLedger());
    const before = await readFile(assumptionsPath(active.root), 'utf8');
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    await expect(writeAssumptionLedger(active.root, emptyAssumptionLedger())).rejects.toThrow(
      /CADENCE_READ_ONLY.*writeAssumptionLedger/s,
    );
    const after = await readFile(assumptionsPath(active.root), 'utf8');
    expect(after).toBe(before);
  });

  it('289-01/AC-1: addAssumption refuses under CADENCE_READ_ONLY, creates no assumptions.json', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard' });
    const recId = await seedRec(active.root);
    const jsonPath = assumptionsPath(active.root);
    expect(existsSync(jsonPath)).toBe(false);
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    await expect(
      addAssumption(active.root, { recommendationId: recId, text: 'x' }),
    ).rejects.toThrow(/CADENCE_READ_ONLY.*addAssumption/s);
    expect(existsSync(jsonPath)).toBe(false);
  });

  it('289-01/AC-1: runAssumptionTransition refuses under CADENCE_READ_ONLY and leaves assumptions.json unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard' });
    const recId = await seedRec(active.root);
    const a = await addAssumption(active.root, { recommendationId: recId, text: 'x' });
    const before = await readFile(assumptionsPath(active.root), 'utf8');
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    await expect(runAssumptionTransition(active.root, a.id, 'validate')).rejects.toThrow(
      /CADENCE_READ_ONLY.*runAssumptionTransition/s,
    );
    const after = await readFile(assumptionsPath(active.root), 'utf8');
    expect(after).toBe(before);
  });

  it('289-01/AC-1: writeMilestoneLedger refuses under CADENCE_READ_ONLY and leaves milestones.json unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard' });
    await writeMilestoneLedger(active.root, emptyMilestoneLedger());
    const before = await readFile(milestonesPath(active.root), 'utf8');
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    await expect(writeMilestoneLedger(active.root, emptyMilestoneLedger())).rejects.toThrow(
      /CADENCE_READ_ONLY.*writeMilestoneLedger/s,
    );
    const after = await readFile(milestonesPath(active.root), 'utf8');
    expect(after).toBe(before);
  });

  it('289-01/AC-1: runIntelligenceReconcile refuses under CADENCE_READ_ONLY and leaves recommendations.json unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard' });
    await seedRec(active.root);
    const before = await readFile(recommendationsPath(active.root), 'utf8');
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    await expect(runIntelligenceReconcile(active.root)).rejects.toThrow(
      /CADENCE_READ_ONLY.*runIntelligenceReconcile/s,
    );
    const after = await readFile(recommendationsPath(active.root), 'utf8');
    expect(after).toBe(before);
  });

  it('289-01/AC-1: rerenderRecommendationsMdIfPresent refuses under CADENCE_READ_ONLY and leaves RECOMMENDATIONS.md unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard' });
    await seedRec(active.root);
    const before = await readFile(recommendationsMdPath(active.root), 'utf8');
    vi.stubEnv('CADENCE_READ_ONLY', '1');
    await expect(rerenderRecommendationsMdIfPresent(active.root)).rejects.toThrow(
      /CADENCE_READ_ONLY.*rerenderRecommendationsMdIfPresent/s,
    );
    const after = await readFile(recommendationsMdPath(active.root), 'utf8');
    expect(after).toBe(before);
  });
});

describe('guard does not block anything when CADENCE_READ_ONLY is unset (289-01/AC-3 sanity)', () => {
  it('289-01/AC-3: writeMilestoneLedger succeeds normally with the env var unset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard-baseline' });
    vi.stubEnv('CADENCE_READ_ONLY', undefined);
    await expect(writeMilestoneLedger(active.root, emptyMilestoneLedger())).resolves.toBeUndefined();
    expect(existsSync(milestonesPath(active.root))).toBe(true);
  });

  it('289-01/AC-3: addIntelligenceDecision succeeds normally with the env var unset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard-baseline' });
    vi.stubEnv('CADENCE_READ_ONLY', undefined);
    const d = await addIntelligenceDecision(active.root, { title: 'untied', rationale: 'r' });
    expect(d.title).toBe('untied');
    expect(existsSync(decisionsPath(active.root))).toBe(true);
  });

  it('289-01/AC-3: runIntelligenceReconcile succeeds normally with the env var unset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-guard-baseline' });
    vi.stubEnv('CADENCE_READ_ONLY', undefined);
    await seedRec(active.root);
    const res = await runIntelligenceReconcile(active.root);
    expect(res.present).toBe(true);
  });
});
