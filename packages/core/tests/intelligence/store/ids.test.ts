import { describe, expect, it } from 'vitest';
import { emptyRecommendationLedger, type Recommendation } from '@manehorizons/cadence-types';
import { nextRecommendationId } from '../../../src/intelligence/store/ids.js';

// Fixed clock so the day-prefix in generated ids is deterministic across
// runs/timezones — never Date.now() / new Date() with no args here.
const NOW = new Date('2026-07-19T00:00:00.000Z');
const TODAY_PREFIX = 'rec-20260719-';

function archivedRecommendation(id: string): Recommendation {
  return {
    id,
    title: 'archived synthetic recommendation',
    summary: 'used only to seed the archived bucket for id-collision regression tests',
    source: 'manual',
    status: 'shipped',
    readiness: 'raw-idea',
    priority: 'medium',
    leverageScore: 0,
    riskScore: 0,
    confidence: 0,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    archivedAt: NOW.toISOString(),
    archiveReason: 'shipped',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function activeRecommendation(id: string): Recommendation {
  return {
    id,
    title: 'active synthetic recommendation',
    summary: 'used only to seed the active bucket for id-sequencing regression tests',
    source: 'manual',
    status: 'candidate',
    readiness: 'raw-idea',
    priority: 'medium',
    leverageScore: 0,
    riskScore: 0,
    confidence: 0,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe('nextRecommendationId', () => {
  it('AC-1: skips a sequence number already used by an archived same-day recommendation, never reissuing it', () => {
    const ledger = emptyRecommendationLedger();
    // Every recommendation created "today" has since been archived — the
    // active `recommendations` array is empty under today's prefix, but the
    // sequence number rec-20260719-003 is still permanently referenced
    // (evidence, assumptions, decisions, milestone links, commit messages,
    // DRAFT files) via the archived record.
    ledger.archived.push(archivedRecommendation(`${TODAY_PREFIX}003`));

    const id = nextRecommendationId(ledger, NOW);

    expect(id).toBe(`${TODAY_PREFIX}004`);
    expect(id).not.toBe(`${TODAY_PREFIX}001`);
  });

  it('still picks the next id right after the highest active same-day sequence number when nothing is archived', () => {
    const ledger = emptyRecommendationLedger();
    ledger.recommendations.push(
      activeRecommendation(`${TODAY_PREFIX}001`),
      activeRecommendation(`${TODAY_PREFIX}002`),
    );

    const id = nextRecommendationId(ledger, NOW);

    expect(id).toBe(`${TODAY_PREFIX}003`);
  });
});
