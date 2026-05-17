import { describe, expect, it } from 'vitest';
import {
  InspectionZ,
  RecommendationLedgerZ,
  RecommendationReportZ,
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

describe('recommendation report schema', () => {
  const validReport = {
    schemaVersion: 1 as const,
    generatedAt: '2026-05-17T00:00:00.000Z',
    ranked: [
      {
        id: 'rec-1',
        title: 'do the thing',
        raw: 32.3,
        score: 83,
        status: 'accepted' as const,
        readiness: 'ready-for-milestone' as const,
        priority: 'high' as const,
        decayState: 'fresh' as const,
        terms: [{ label: 'lev 7', value: 7 }],
      },
    ],
    parked: [
      { id: 'rec-2', title: 'later', status: 'deferred' as const, readiness: 'raw-idea' as const },
    ],
    needsAttention: [
      { id: 'rec-3', title: 'rotten', decayState: 'contradicted' as const },
    ],
    advisory: { kind: 'top-recommendation' as const, primary: 'cadence milestone propose' },
    totals: { total: 3, ranked: 1, parked: 1, needsAttention: 1, excluded: 0 },
  };

  it('accepts a valid report', () => {
    const parsed = RecommendationReportZ.parse(validReport);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.ranked).toHaveLength(1);
  });

  it('rejects a wrong schemaVersion', () => {
    const r = RecommendationReportZ.safeParse({ ...validReport, schemaVersion: 2 });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown advisory kind', () => {
    const r = RecommendationReportZ.safeParse({
      ...validReport,
      advisory: { kind: 'not-a-kind', primary: 'x' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a score out of range', () => {
    const r = RecommendationReportZ.safeParse({
      ...validReport,
      ranked: [{ ...validReport.ranked[0], score: 101 }],
    });
    expect(r.success).toBe(false);
  });
});
