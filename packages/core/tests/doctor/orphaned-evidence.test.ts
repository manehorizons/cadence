import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import type { Evidence } from '@thomas-powers-jr/cadence-types';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import {
  readEvidenceLedger,
  readRecommendationLedger,
  writeIntelligenceLedgers,
} from '../../src/intelligence/store/io.js';
import { checkOrphanedEvidence } from '../../src/doctor/run.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('checkOrphanedEvidence', () => {
  it('AC-2: ok on a clean, consistent ledger pair', async () => {
    active = await tempRepo({ initialized: true });
    // A paired rec + evidence row (evidenceSummary makes addRecommendation
    // mint both, correctly linked) — no orphan.
    await addRecommendation(active.root, {
      title: 'clean rec',
      summary: 's',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
      evidenceSummary: 'some note',
    });
    const check = await checkOrphanedEvidence(active.root);
    expect(check.name).toBe('orphaned-evidence');
    expect(check.severity).toBe('ok');
  });

  it('AC-2: doctor flags an evidence row with no matching recommendation', async () => {
    active = await tempRepo({ initialized: true });
    const rec = await addRecommendation(active.root, {
      title: 'anchored rec',
      summary: 's',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
    });
    // Inject a dangling evidence row that points at a recommendation id
    // present in neither the active nor archived lists.
    const recLedger = await readRecommendationLedger(active.root);
    const evidenceLedger = await readEvidenceLedger(active.root);
    const orphan: Evidence = {
      id: 'ev-20260724-999',
      recommendationId: 'rec-20260724-999',
      kind: 'note',
      summary: 'orphaned row',
      createdAt: new Date().toISOString(),
    };
    evidenceLedger.evidence.push(orphan);
    await writeIntelligenceLedgers(active.root, recLedger, evidenceLedger);

    const check = await checkOrphanedEvidence(active.root);
    expect(check.name).toBe('orphaned-evidence');
    expect(check.severity).toBe('warning');
    expect(check.detail).toContain('ev-20260724-999');
    expect(check.detail).toContain('rec-20260724-999');
    // Sanity: the anchored recommendation's own evidence linkage is untouched
    // and does not itself produce a false positive.
    expect(rec.id).not.toBe('rec-20260724-999');
  });
});
