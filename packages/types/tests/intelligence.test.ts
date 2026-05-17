import { describe, expect, it } from 'vitest';
import {
  InspectionZ,
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

describe('inspection schemas', () => {
  const validInspection = {
    schemaVersion: 1 as const,
    generatedAt: '2026-05-17T00:00:00.000Z',
    repo: {
      git: { available: false },
      pkg: { scripts: {} },
      docs: { readme: true, design: true, roadmap: true, changelog: true, docsDir: true },
      surfaces: { turbo: true },
      phases: { count: 0 },
    },
    backend: { present: false, kind: null, legalActions: [] },
    ledger: { recommendations: 0, byDecay: {}, evidence: 0 },
    flags: [],
  };

  it('accepts a valid inspection', () => {
    const parsed = InspectionZ.parse(validInspection);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.flags).toEqual([]);
  });

  it('rejects a wrong schemaVersion', () => {
    const r = InspectionZ.safeParse({ ...validInspection, schemaVersion: 2 });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown flag code', () => {
    const r = InspectionZ.safeParse({
      ...validInspection,
      flags: [{ code: 'not-a-real-flag', severity: 'warn', message: 'x' }],
    });
    expect(r.success).toBe(false);
  });
});
