import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  addEvidenceToRecommendation,
  addRecommendation,
} from '../../../src/intelligence/store/recommendations.js';
import { readEvidenceLedger, readRecommendationLedger } from '../../../src/intelligence/store/io.js';

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

describe('addEvidenceToRecommendation (phase 199 tied-record writer)', () => {
  it('AC-1: appends an Evidence entry, links its id into the recommendation\'s evidenceIds, and advances updatedAt', async () => {
    active = await tempRepo({ initialized: true, projectName: 'rec-evidence-add-happy' });

    const rec = await addRecommendation(active.root, {
      title: 'existing rec',
      summary: 'a recommendation that already exists',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: ['core'],
      affectedFiles: [],
    });
    const beforeUpdatedAt = rec.updatedAt;

    // Ensure a real clock tick so updatedAt is observably different, not just
    // regenerated with the same millisecond timestamp.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await addEvidenceToRecommendation(active.root, {
      recommendationId: rec.id,
      note: 'confirmed the behavior in a manual repro',
    });
    expect(result.ok).toBe(true);

    const evidenceLedger = await readEvidenceLedger(active.root);
    const evidence = evidenceLedger.evidence.find((e) => e.recommendationId === rec.id);
    expect(evidence).toBeDefined();
    expect(evidence?.kind).toBe('note');
    expect(evidence?.summary).toBe('confirmed the behavior in a manual repro');

    const recLedger = await readRecommendationLedger(active.root);
    const updatedRec = recLedger.recommendations.find((r) => r.id === rec.id);
    expect(updatedRec).toBeDefined();
    expect(updatedRec?.evidenceIds).toContain(evidence?.id);
    expect(updatedRec?.updatedAt).not.toBe(beforeUpdatedAt);
    expect(new Date(updatedRec!.updatedAt).getTime()).toBeGreaterThan(
      new Date(beforeUpdatedAt).getTime(),
    );
  });

  it('AC-2: refuses an unknown recommendation id and leaves both ledger files untouched', async () => {
    active = await tempRepo({ initialized: true, projectName: 'rec-evidence-add-notfound' });

    // Seed an existing recommendation (with evidence) so both ledger files
    // are actually present on disk before we snapshot their "before" content —
    // a fresh, untouched repo doesn't write evidence.json/recommendations.json
    // until the first ledger write, which would make an ENOENT read look like
    // a false-positive "untouched" result.
    await addRecommendation(active.root, {
      title: 'unrelated existing rec',
      summary: 'seeded so both ledger files exist on disk',
      priority: 'low',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
      evidenceSummary: 'seed evidence',
    });

    const evidencePath = join(active.root, '.cadence/intelligence/evidence.json');
    const recommendationsPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const evidenceBefore = await readFile(evidencePath, 'utf8');
    const recommendationsBefore = await readFile(recommendationsPath, 'utf8');

    const result = await addEvidenceToRecommendation(active.root, {
      recommendationId: 'rec-does-not-exist',
      note: 'this should never be persisted',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('rec-does-not-exist');
      expect(result.error).toContain('not found');
    }

    const evidenceAfter = await readFile(evidencePath, 'utf8');
    const recommendationsAfter = await readFile(recommendationsPath, 'utf8');
    expect(evidenceAfter).toBe(evidenceBefore);
    expect(recommendationsAfter).toBe(recommendationsBefore);
  });

  it('AC-3: redacts a credential-shaped substring in --note before persisting Evidence.summary', async () => {
    active = await tempRepo({ initialized: true, projectName: 'rec-evidence-add-redact' });

    const rec = await addRecommendation(active.root, {
      title: 'existing rec for redaction test',
      summary: 'a recommendation that already exists',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: ['core'],
      affectedFiles: [],
    });

    const result = await addEvidenceToRecommendation(active.root, {
      recommendationId: rec.id,
      note: 'found AKIAABCDEFGHIJKLMNOP hardcoded in config', // gitleaks:allow — fake key, redaction fixture
    });
    expect(result.ok).toBe(true);

    const evidenceLedger = await readEvidenceLedger(active.root);
    const evidence = evidenceLedger.evidence.find((e) => e.recommendationId === rec.id);
    expect(evidence?.summary).toBe('found [REDACTED] hardcoded in config');
  });
});
