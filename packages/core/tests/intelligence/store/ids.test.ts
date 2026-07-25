import { describe, expect, it } from 'vitest';
import {
  emptyAssumptionLedger,
  emptyEvidenceLedger,
  emptyIntelligenceDecisionLedger,
  emptyRecommendationLedger,
  type Evidence,
  type IntelligenceDecision,
  type Recommendation,
} from '@manehorizons/cadence-types';
import {
  nextAssumptionId,
  nextEvidenceId,
  nextIntelligenceDecisionId,
  nextRecommendationId,
} from '../../../src/intelligence/store/ids.js';

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

// Phase 220 T5: same Phase 219 collision shape, generalized to the other
// three id-minting subjects via `mintId` + each subject's spec.
const EV_PREFIX = 'ev-20260719-';
const AS_PREFIX = 'as-20260719-';
const DEC_PREFIX = 'dec-20260719-';

function recommendationWithLinks(
  id: string,
  links: Partial<Pick<Recommendation, 'evidenceIds' | 'assumptionIds' | 'decisionIds'>>,
): Recommendation {
  return { ...activeRecommendation(id), ...links };
}

// Unlike `danglingEvidence` above (fixed id, parameterized `recommendationId`
// — built for the nextRecommendationId cross-check tests), this one seeds the
// evidence ledger's own sequence with a parameterized `id`.
function existingEvidence(id: string): Evidence {
  return {
    id,
    recommendationId: `${TODAY_PREFIX}001`,
    kind: 'note',
    summary: 'seeds the evidence ledger for id-sequencing regression tests',
    createdAt: NOW.toISOString(),
  };
}

function decision(id: string, overrides: Partial<IntelligenceDecision> = {}): IntelligenceDecision {
  return {
    id,
    title: 'synthetic decision',
    rationale: 'used only to seed the decision ledger for id-sequencing regression tests',
    status: 'active',
    decidedAt: NOW.toISOString(),
    supersedes: [],
    ...overrides,
  };
}

describe('nextEvidenceId', () => {
  it('still picks the next id right after the ledger\'s own highest same-day sequence number', () => {
    const ledger = emptyEvidenceLedger();
    ledger.evidence.push(existingEvidence(`${EV_PREFIX}001`));

    const id = nextEvidenceId(ledger, NOW);

    expect(id).toBe(`${EV_PREFIX}002`);
  });

  it('AC-2: does not collide with a dangling recommendation.evidenceIds[] reference', () => {
    // evidence.json's own highest same-day sequence number is 001.
    const ledger = emptyEvidenceLedger();
    ledger.evidence.push(existingEvidence(`${EV_PREFIX}001`));

    // recommendations.json references a sequence number one past evidence.json's
    // own max — e.g. an interrupted `cadence recommendation add` call left the
    // recommendation's evidenceIds[] pointing at a row that never made it into
    // evidence.json.
    const recLedger = emptyRecommendationLedger();
    recLedger.recommendations.push(
      recommendationWithLinks(`${TODAY_PREFIX}001`, { evidenceIds: [`${EV_PREFIX}002`] }),
    );

    const id = nextEvidenceId(ledger, NOW, recLedger);

    expect(id).toBe(`${EV_PREFIX}003`);
    expect(id).not.toBe(`${EV_PREFIX}002`);
  });
});

describe('nextAssumptionId', () => {
  it('still picks the next id right after the ledger\'s own highest same-day sequence number', () => {
    const ledger = emptyAssumptionLedger();
    ledger.assumptions.push({
      id: `${AS_PREFIX}001`,
      recommendationId: `${TODAY_PREFIX}001`,
      text: 'synthetic assumption',
      status: 'open',
      createdAt: NOW.toISOString(),
    });

    const id = nextAssumptionId(ledger, NOW);

    expect(id).toBe(`${AS_PREFIX}002`);
  });

  it('AC-2: does not collide with a dangling recommendation.assumptionIds[] reference', () => {
    // assumptions.json's own highest same-day sequence number is 001.
    const ledger = emptyAssumptionLedger();
    ledger.assumptions.push({
      id: `${AS_PREFIX}001`,
      recommendationId: `${TODAY_PREFIX}001`,
      text: 'synthetic assumption',
      status: 'open',
      createdAt: NOW.toISOString(),
    });

    // recommendations.json references a sequence number one past assumptions.json's
    // own max — a dangling assumptionIds[] entry left by a bad rebase-conflict
    // resolution.
    const recLedger = emptyRecommendationLedger();
    recLedger.recommendations.push(
      recommendationWithLinks(`${TODAY_PREFIX}001`, { assumptionIds: [`${AS_PREFIX}002`] }),
    );

    const id = nextAssumptionId(ledger, NOW, recLedger);

    expect(id).toBe(`${AS_PREFIX}003`);
    expect(id).not.toBe(`${AS_PREFIX}002`);
  });
});

describe('nextIntelligenceDecisionId', () => {
  it('still picks the next id right after the ledger\'s own highest same-day sequence number', () => {
    const ledger = emptyIntelligenceDecisionLedger();
    ledger.decisions.push(decision(`${DEC_PREFIX}001`));

    const id = nextIntelligenceDecisionId(ledger, NOW);

    expect(id).toBe(`${DEC_PREFIX}002`);
  });

  it('AC-2: does not collide with a dangling recommendation.decisionIds[] reference', () => {
    // decisions.json's own highest same-day sequence number is 001.
    const ledger = emptyIntelligenceDecisionLedger();
    ledger.decisions.push(decision(`${DEC_PREFIX}001`));

    // recommendations.json references a sequence number one past decisions.json's
    // own max — a dangling decisionIds[] entry left by a bad rebase-conflict
    // resolution.
    const recLedger = emptyRecommendationLedger();
    recLedger.recommendations.push(
      recommendationWithLinks(`${TODAY_PREFIX}001`, { decisionIds: [`${DEC_PREFIX}002`] }),
    );

    const id = nextIntelligenceDecisionId(ledger, NOW, recLedger);

    expect(id).toBe(`${DEC_PREFIX}003`);
    expect(id).not.toBe(`${DEC_PREFIX}002`);
  });

  it('AC-2: does not collide with a dangling supersededBy reference on a sibling decision', () => {
    // decisions.json's own highest same-day sequence number is 001, but that
    // decision's own `supersededBy` points one sequence number past it — e.g.
    // a superseding decision that was later deleted without updating this
    // back-reference.
    const ledger = emptyIntelligenceDecisionLedger();
    ledger.decisions.push(decision(`${DEC_PREFIX}001`, { supersededBy: `${DEC_PREFIX}002` }));

    const id = nextIntelligenceDecisionId(ledger, NOW);

    expect(id).toBe(`${DEC_PREFIX}003`);
    expect(id).not.toBe(`${DEC_PREFIX}002`);
  });

  it('AC-2: does not collide with a dangling supersedes reference on a sibling decision', () => {
    // Same shape, via the inverse `supersedes` array instead.
    const ledger = emptyIntelligenceDecisionLedger();
    ledger.decisions.push(decision(`${DEC_PREFIX}001`, { supersedes: [`${DEC_PREFIX}002`] }));

    const id = nextIntelligenceDecisionId(ledger, NOW);

    expect(id).toBe(`${DEC_PREFIX}003`);
    expect(id).not.toBe(`${DEC_PREFIX}002`);
  });
});
