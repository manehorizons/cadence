import { describe, expect, it } from 'vitest';
import {
  emptyEvidenceLedger,
  emptyRecommendationLedger,
  type Evidence,
  type Recommendation,
} from '@manehorizons/cadence-types';
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

// Simulates a dangling `evidence.json` row left behind by a bad rebase-conflict
// resolution or an interrupted `cadence recommendation add` call: an Evidence
// row whose `recommendationId` points at an id with NO matching entry in
// `recommendations.json` (neither active nor archived).
function danglingEvidence(recommendationId: string): Evidence {
  return {
    id: 'ev-20260724-001',
    recommendationId,
    kind: 'note',
    summary: 'orphaned evidence row referencing an id no recommendation record has',
    createdAt: NOW.toISOString(),
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

  it('AC-1: nextRecommendationId does not collide with a dangling evidence.json recommendationId reference', () => {
    // The recommendation ledger's highest same-day sequence number is 010 —
    // both the active and archived buckets stop there.
    const ledger = emptyRecommendationLedger();
    ledger.recommendations.push(activeRecommendation(`${TODAY_PREFIX}010`));

    // evidence.json has an orphaned row pointing one sequence number past the
    // ledger's max — e.g. left behind by a bad rebase-conflict resolution or an
    // interrupted `cadence recommendation add` call. Nothing in
    // recommendations.json (active or archived) has this id.
    const evidenceLedger = emptyEvidenceLedger();
    evidenceLedger.evidence.push(danglingEvidence(`${TODAY_PREFIX}011`));

    // Post-fix contract: nextRecommendationId must also cross-check the
    // evidence ledger so it never re-mints an id a dangling evidence row
    // already references. It must skip past 011 (dangling) straight to 012 —
    // not silently collide with the orphaned evidence row's 011.
    const id = nextRecommendationId(ledger, NOW, evidenceLedger);

    expect(id).toBe(`${TODAY_PREFIX}012`);
    expect(id).not.toBe(`${TODAY_PREFIX}011`);
  });
});
