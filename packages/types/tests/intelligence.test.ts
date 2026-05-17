import { describe, expect, it } from 'vitest';
import {
  RecommendationLedgerZ,
  RecommendationZ,
  emptyRecommendationLedger,
} from '../src/intelligence.js';

describe('intelligence schemas', () => {
  it('accepts a valid manual recommendation', () => {
    const parsed = RecommendationZ.parse({
      id: 'rec-20260517-001',
      title: 'Add project intelligence ledger',
      summary: 'Track strategic recommendations before they become CADENCE specs.',
      source: 'manual',
      status: 'candidate',
      readiness: 'ready-for-milestone',
      priority: 'high',
      leverageScore: 8,
      riskScore: 3,
      confidence: 0.8,
      decayState: 'fresh',
      affectedAreas: ['core', 'types'],
      affectedFiles: ['packages/types/src/intelligence.ts'],
      evidenceIds: [],
      assumptionIds: [],
      decisionIds: [],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    });

    expect(parsed.source).toBe('manual');
    expect(parsed.readiness).toBe('ready-for-milestone');
  });

  it('rejects out-of-range scores', () => {
    const result = RecommendationZ.safeParse({
      id: 'rec-20260517-001',
      title: 'Bad score',
      summary: 'This should fail because confidence must be 0..1.',
      source: 'manual',
      status: 'candidate',
      readiness: 'raw-idea',
      priority: 'medium',
      leverageScore: 11,
      riskScore: 0,
      confidence: 2,
      decayState: 'fresh',
      affectedAreas: [],
      affectedFiles: [],
      evidenceIds: [],
      assumptionIds: [],
      decisionIds: [],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('creates an empty versioned ledger', () => {
    const ledger = emptyRecommendationLedger();
    expect(RecommendationLedgerZ.parse(ledger).schemaVersion).toBe(1);
    expect(ledger.recommendations).toEqual([]);
  });
});
