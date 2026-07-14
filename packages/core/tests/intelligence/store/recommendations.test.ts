import { afterEach, describe, expect, it } from 'vitest';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { addRecommendation } from '../../../src/intelligence/store/recommendations.js';
import { readEvidenceLedger } from '../../../src/intelligence/store/io.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('addRecommendation evidence redaction', () => {
  it('AC-2: redacts a credential-shaped substring in evidenceSummary before persisting Evidence.summary', async () => {
    active = await tempRepo({ initialized: true, projectName: 'rec-evidence-redact' });

    const rec = await addRecommendation(active.root, {
      title: 'leaked key in config',
      summary: 'found a hardcoded credential',
      priority: 'high',
      readiness: 'raw-idea',
      affectedAreas: ['core'],
      affectedFiles: [],
      evidenceSummary: 'found AKIAABCDEFGHIJKLMNOP hardcoded in config',
    });

    const evidenceLedger = await readEvidenceLedger(active.root);
    const evidence = evidenceLedger.evidence.find((e) => e.recommendationId === rec.id);
    expect(evidence?.summary).toBe('found [REDACTED] hardcoded in config');
  });

  it('AC-2: leaves a plain non-secret evidenceSummary completely unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'rec-evidence-plain' });

    const rec = await addRecommendation(active.root, {
      title: 'ran suite locally',
      summary: 'confirmed tests pass',
      priority: 'low',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
      evidenceSummary: 'ran the test suite locally',
    });

    const evidenceLedger = await readEvidenceLedger(active.root);
    const evidence = evidenceLedger.evidence.find((e) => e.recommendationId === rec.id);
    expect(evidence?.summary).toBe('ran the test suite locally');
  });
});
