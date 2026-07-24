import { afterEach, describe, expect, it } from 'vitest';
import type { Evidence, EvidenceLedger, Recommendation, RetroRollup } from '@manehorizons/cadence-types';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import { readEvidenceLedger, readRecommendationLedger } from '../../src/intelligence/store/io.js';
import {
  countFrictionEvidence,
  matchFrictionToRecommendations,
  recordFrictionEvidence,
} from '../../src/services/retro-feedback.js';

function emptyBuckets() {
  return { recurring: [], oneOff: [] };
}

function baseRollup(overrides: Partial<RetroRollup> = {}): RetroRollup {
  return {
    totalPhases: 3,
    phasesWithFriction: 3,
    bypasses: emptyBuckets(),
    roughTaskStatuses: emptyBuckets(),
    findingCategories: emptyBuckets(),
    ...overrides,
  };
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedRecommendation(
  root: string,
  input: { affectedAreas: string[]; affectedFiles: string[] },
): Promise<Recommendation> {
  return addRecommendation(root, {
    title: 'candidate recommendation',
    summary: 'a recommendation that friction may or may not match',
    priority: 'medium',
    readiness: 'raw-idea',
    affectedAreas: input.affectedAreas,
    affectedFiles: input.affectedFiles,
  });
}

function mkRecommendation(p: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-count',
    title: 't',
    summary: 's',
    source: 'manual',
    status: 'candidate',
    readiness: 'raw-idea',
    priority: 'medium',
    leverageScore: 5,
    riskScore: 5,
    confidence: 0.5,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}

function mkEvidence(p: Partial<Evidence> = {}): Evidence {
  return {
    id: 'ev-1',
    recommendationId: 'rec-count',
    kind: 'note',
    summary: '[retro-friction:bypasses:code-review] recurring gate bypass "code-review" seen across 2 phase(s): 170-a, 171-b.',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}

describe('countFrictionEvidence', () => {
  it('AC-3: counts only linked, matching-recommendationId, friction-marker-prefixed evidence entries', () => {
    const rec = mkRecommendation({ evidenceIds: ['ev-1', 'ev-2', 'ev-3', 'ev-4'] });
    const evidenceLedger: EvidenceLedger = {
      schemaVersion: 1,
      evidence: [
        mkEvidence({ id: 'ev-1' }), // linked, matching recId, friction marker -> counts
        mkEvidence({ id: 'ev-2', summary: 'a plain human note, not friction-derived' }), // no marker -> excluded
        mkEvidence({ id: 'ev-3', recommendationId: 'rec-other' }), // wrong recommendationId -> excluded
        mkEvidence({ id: 'ev-99' }), // not in evidenceIds -> excluded
        mkEvidence({
          id: 'ev-4',
          summary: '[retro-friction:findingCategories:codeReview] recurring finding category "codeReview" seen across 2 phase(s): 170-a, 171-b.',
        }), // linked, matching recId, different friction marker -> counts
      ],
    };
    expect(countFrictionEvidence(rec, evidenceLedger)).toBe(2);
  });

  it('AC-3: zero linked evidence and zero friction-marker evidence both count as 0', () => {
    const rec = mkRecommendation({ evidenceIds: [] });
    const evidenceLedger: EvidenceLedger = { schemaVersion: 1, evidence: [mkEvidence({ id: 'ev-1' })] };
    expect(countFrictionEvidence(rec, evidenceLedger)).toBe(0);

    const recLinkedToNonFriction = mkRecommendation({ evidenceIds: ['ev-5'] });
    const ledgerNonFriction: EvidenceLedger = {
      schemaVersion: 1,
      evidence: [mkEvidence({ id: 'ev-5', summary: 'ran `pnpm test`, all green' })],
    };
    expect(countFrictionEvidence(recLinkedToNonFriction, ledgerNonFriction)).toBe(0);
  });
});

describe('matchFrictionToRecommendations', () => {
  it('AC-1: a recurring bypass entry matches a recommendation whose affectedAreas overlaps its key', () => {
    const rollup = baseRollup({
      bypasses: {
        recurring: [{ key: 'code-review', count: 2, phaseIds: ['170-a', '171-b'] }],
        oneOff: [],
      },
    });
    const recommendations: Recommendation[] = [
      {
        id: 'rec-1',
        title: 't',
        summary: 's',
        source: 'manual',
        status: 'candidate',
        readiness: 'raw-idea',
        priority: 'medium',
        leverageScore: 5,
        riskScore: 5,
        confidence: 0.5,
        decayState: 'fresh',
        affectedAreas: ['code-review gate reliability'],
        affectedFiles: [],
        evidenceIds: [],
        assumptionIds: [],
        decisionIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const matches = matchFrictionToRecommendations(rollup, recommendations);

    expect(matches).toEqual([
      {
        frictionKey: 'code-review',
        frictionBucket: 'bypasses',
        phaseIds: ['170-a', '171-b'],
        recommendationId: 'rec-1',
      },
    ]);
  });

  it('AC-1: a recurring finding-category entry (camelCase key) matches via affectedFiles path overlap', () => {
    const rollup = baseRollup({
      findingCategories: {
        recurring: [{ key: 'codeReview', count: 2, phaseIds: ['170-a', '171-b'] }],
        oneOff: [],
      },
    });
    const recommendations: Recommendation[] = [
      {
        id: 'rec-2',
        title: 't',
        summary: 's',
        source: 'manual',
        status: 'candidate',
        readiness: 'raw-idea',
        priority: 'medium',
        leverageScore: 5,
        riskScore: 5,
        confidence: 0.5,
        decayState: 'fresh',
        affectedAreas: [],
        affectedFiles: ['packages/core/src/review/code-review.ts'],
        evidenceIds: [],
        assumptionIds: [],
        decisionIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const matches = matchFrictionToRecommendations(rollup, recommendations);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      frictionKey: 'codeReview',
      frictionBucket: 'findingCategories',
      recommendationId: 'rec-2',
    });
  });

  it('AC-1: a friction entry with no overlapping recommendation produces no match, and never crashes', () => {
    const rollup = baseRollup({
      roughTaskStatuses: {
        recurring: [{ key: 'BLOCKED', count: 2, phaseIds: ['170-a', '171-b'] }],
        oneOff: [],
      },
    });
    const recommendations: Recommendation[] = [
      {
        id: 'rec-3',
        title: 't',
        summary: 's',
        source: 'manual',
        status: 'candidate',
        readiness: 'raw-idea',
        priority: 'medium',
        leverageScore: 5,
        riskScore: 5,
        confidence: 0.5,
        decayState: 'fresh',
        affectedAreas: ['unrelated docs work'],
        affectedFiles: ['README.md'],
        evidenceIds: [],
        assumptionIds: [],
        decisionIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const matches = matchFrictionToRecommendations(rollup, recommendations);

    expect(matches).toEqual([]);
  });

  it('AC-1: does not false-positive match via raw substring containment across word boundaries', () => {
    // Regression for a reviewer-found bug: 'testRetry' -> tokens ['test',
    // 'retry']. A raw `string.includes(token)` check would wrongly match
    // this candidate because 'test' is a substring of 'latest' and 'retry'
    // is a substring of 'retrying', even though neither is a real token.
    const rollup = baseRollup({
      bypasses: {
        recurring: [{ key: 'testRetry', count: 2, phaseIds: ['170-a', '171-b'] }],
        oneOff: [],
      },
    });
    const recommendations: Recommendation[] = [
      {
        id: 'rec-5',
        title: 't',
        summary: 's',
        source: 'manual',
        status: 'candidate',
        readiness: 'raw-idea',
        priority: 'medium',
        leverageScore: 5,
        riskScore: 5,
        confidence: 0.5,
        decayState: 'fresh',
        affectedAreas: [],
        affectedFiles: ['packages/core/src/latest/retrying.ts'],
        evidenceIds: [],
        assumptionIds: [],
        decisionIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const matches = matchFrictionToRecommendations(rollup, recommendations);

    expect(matches).toEqual([]);
  });

  it('never matches a one-off friction entry, even when it would otherwise overlap', () => {
    const rollup = baseRollup({
      bypasses: {
        recurring: [],
        oneOff: [{ key: 'code-review', count: 1, phaseIds: ['170-a'] }],
      },
    });
    const recommendations: Recommendation[] = [
      {
        id: 'rec-4',
        title: 't',
        summary: 's',
        source: 'manual',
        status: 'candidate',
        readiness: 'raw-idea',
        priority: 'medium',
        leverageScore: 5,
        riskScore: 5,
        confidence: 0.5,
        decayState: 'fresh',
        affectedAreas: ['code-review gate reliability'],
        affectedFiles: [],
        evidenceIds: [],
        assumptionIds: [],
        decisionIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const matches = matchFrictionToRecommendations(rollup, recommendations);

    expect(matches).toEqual([]);
  });
});

describe('recordFrictionEvidence', () => {
  it('AC-2: a matched friction entry writes exactly one new evidence entry linked to the recommendation', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-feedback-write' });
    const rec = await seedRecommendation(active.root, {
      affectedAreas: ['code-review gate reliability'],
      affectedFiles: [],
    });

    const matches = [
      {
        frictionKey: 'code-review',
        frictionBucket: 'bypasses' as const,
        phaseIds: ['170-a', '171-b'],
        recommendationId: rec.id,
      },
    ];
    const recLedger = await readRecommendationLedger(active.root);
    const evidenceLedgerBefore = await readEvidenceLedger(active.root);

    const results = await recordFrictionEvidence(
      active.root,
      matches,
      recLedger.recommendations,
      evidenceLedgerBefore,
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.outcome).toBe('wrote');
    expect(results[0]?.evidenceId).toBeDefined();

    const evidenceLedgerAfter = await readEvidenceLedger(active.root);
    const written = evidenceLedgerAfter.evidence.find((e) => e.id === results[0]?.evidenceId);
    expect(written).toBeDefined();
    expect(written?.recommendationId).toBe(rec.id);
    expect(written?.summary).toContain('[retro-friction:bypasses:code-review]');
    expect(written?.summary).toContain('2 phase(s)');

    const updatedRecLedger = await readRecommendationLedger(active.root);
    const updatedRec = updatedRecLedger.recommendations.find((r) => r.id === rec.id);
    expect(updatedRec?.evidenceIds).toContain(results[0]?.evidenceId);
  });

  it('AC-1/AC-2: a friction entry with no matching recommendation writes no evidence and does not crash', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-feedback-no-match' });
    await seedRecommendation(active.root, {
      affectedAreas: ['unrelated docs work'],
      affectedFiles: [],
    });

    const rollup = baseRollup({
      roughTaskStatuses: {
        recurring: [{ key: 'BLOCKED', count: 2, phaseIds: ['170-a', '171-b'] }],
        oneOff: [],
      },
    });
    const recLedger = await readRecommendationLedger(active.root);
    const evidenceLedgerBefore = await readEvidenceLedger(active.root);

    const matches = matchFrictionToRecommendations(rollup, recLedger.recommendations);
    expect(matches).toEqual([]);

    const results = await recordFrictionEvidence(
      active.root,
      matches,
      recLedger.recommendations,
      evidenceLedgerBefore,
    );

    expect(results).toEqual([]);
    const evidenceLedgerAfter = await readEvidenceLedger(active.root);
    expect(evidenceLedgerAfter.evidence).toEqual(evidenceLedgerBefore.evidence);
  });

  it('AC-2: running the recording step twice for the same friction/recommendation pair writes zero additional entries', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-feedback-idempotent' });
    const rec = await seedRecommendation(active.root, {
      affectedAreas: [],
      affectedFiles: ['packages/core/src/review/code-review.ts'],
    });

    const matches = [
      {
        frictionKey: 'codeReview',
        frictionBucket: 'findingCategories' as const,
        phaseIds: ['170-a', '171-b'],
        recommendationId: rec.id,
      },
    ];

    const recLedger1 = await readRecommendationLedger(active.root);
    const evidenceLedger1 = await readEvidenceLedger(active.root);
    const firstRun = await recordFrictionEvidence(
      active.root,
      matches,
      recLedger1.recommendations,
      evidenceLedger1,
    );
    expect(firstRun).toHaveLength(1);
    expect(firstRun[0]?.outcome).toBe('wrote');

    const evidenceLedgerAfterFirst = await readEvidenceLedger(active.root);
    expect(evidenceLedgerAfterFirst.evidence).toHaveLength(1);

    // Second run: re-read fresh state exactly as a real second CLI invocation
    // would, and run the identical match set again.
    const recLedger2 = await readRecommendationLedger(active.root);
    const evidenceLedger2 = await readEvidenceLedger(active.root);
    const secondRun = await recordFrictionEvidence(
      active.root,
      matches,
      recLedger2.recommendations,
      evidenceLedger2,
    );

    expect(secondRun).toHaveLength(1);
    expect(secondRun[0]?.outcome).toBe('skipped-already-recorded');
    expect(secondRun[0]?.evidenceId).toBeUndefined();

    const evidenceLedgerAfterSecond = await readEvidenceLedger(active.root);
    expect(evidenceLedgerAfterSecond.evidence).toHaveLength(1);

    const updatedRecLedger = await readRecommendationLedger(active.root);
    const updatedRec = updatedRecLedger.recommendations.find((r) => r.id === rec.id);
    expect(updatedRec?.evidenceIds).toHaveLength(1);
  });

  it('AC-2: reports an error outcome for a match whose recommendationId is not in the supplied recommendations, without throwing', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-feedback-missing-rec' });
    const evidenceLedgerBefore = await readEvidenceLedger(active.root);

    const matches = [
      {
        frictionKey: 'code-review',
        frictionBucket: 'bypasses' as const,
        phaseIds: ['170-a', '171-b'],
        recommendationId: 'rec-does-not-exist',
      },
    ];

    const results = await recordFrictionEvidence(active.root, matches, [], evidenceLedgerBefore);

    expect(results).toHaveLength(1);
    expect(results[0]?.outcome).toBe('error');
  });
});
