import { describe, expect, it, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import type {
  AssumptionLedger,
  IntelligenceDecisionLedger,
  Recommendation,
  RecommendationLedger,
} from '@cadence/types';
import {
  addAssumption,
  addIntelligenceDecision,
  addRecommendation,
  deriveRecommendationLinks,
  readRecommendationLedger,
  readMilestoneLedger,
  writeMilestoneLedger,
  readAssumptionLedger,
  readIntelligenceDecisionLedger,
  runDecisionTransition,
} from '../../src/intelligence/store.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('milestone ledger IO', () => {
  it('absent file -> empty ledger; round-trips + writes MILESTONES.md', async () => {
    const fx = await tempRepo({ initialized: true });
    try {
      expect(await readMilestoneLedger(fx.root)).toEqual({
        schemaVersion: 1,
        milestones: [],
      });

      await writeMilestoneLedger(fx.root, {
        schemaVersion: 1,
        milestones: [
          {
            id: 'mil-rec-rec-1',
            name: 'X',
            objective: 'o',
            status: 'proposed',
            recommendationIds: ['rec-1'],
            preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
            exportTargets: [],
            createdAt: '2026-05-17T00:00:00.000Z',
            updatedAt: '2026-05-17T00:00:00.000Z',
          },
        ],
      });

      const back = await readMilestoneLedger(fx.root);
      expect(back.milestones[0].id).toBe('mil-rec-rec-1');
      const md = await readFile(
        join(fx.root, '.cadence', 'intelligence', 'MILESTONES.md'),
        'utf8',
      );
      expect(md).toMatch(/# CADENCE Milestone Candidates/);
    } finally {
      await fx.cleanup();
    }
  });
});

describe('assumption + decision ledger readers', () => {
  it('absent files -> empty ledgers', async () => {
    const fx = await tempRepo({ initialized: true });
    try {
      expect(await readAssumptionLedger(fx.root)).toEqual({
        schemaVersion: 1,
        assumptions: [],
      });
      expect(await readIntelligenceDecisionLedger(fx.root)).toEqual({
        schemaVersion: 1,
        decisions: [],
      });
    } finally {
      await fx.cleanup();
    }
  });

  it('reads + Zod-validates present files', async () => {
    const fx = await tempRepo({ initialized: true });
    try {
      const dir = join(fx.root, '.cadence', 'intelligence');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'assumptions.json'),
        JSON.stringify({
          schemaVersion: 1,
          assumptions: [
            {
              id: 'as-1',
              recommendationId: 'rec-1',
              text: 'db is reachable',
              status: 'open',
              createdAt: '2026-05-18T00:00:00.000Z',
            },
          ],
        }),
      );
      await writeFile(
        join(dir, 'decisions.json'),
        JSON.stringify({
          schemaVersion: 1,
          decisions: [
            {
              id: 'dec-1',
              title: 'use approach A',
              rationale: 'cheapest path',
              decidedAt: '2026-05-18T00:00:00.000Z',
            },
          ],
        }),
      );
      expect((await readAssumptionLedger(fx.root)).assumptions[0]!.id).toBe('as-1');
      expect((await readIntelligenceDecisionLedger(fx.root)).decisions[0]!.title).toBe(
        'use approach A',
      );
    } finally {
      await fx.cleanup();
    }
  });
});

describe('intelligence store', () => {
  it('creates ledgers and rendered recommendations on first add', async () => {
    active = await tempRepo({ initialized: true, projectName: 'intel-store' });

    const rec = await addRecommendation(active.root, {
      title: 'Add context packets',
      summary: 'Create compact context packets for future CADENCE phases.',
      priority: 'high',
      readiness: 'raw-idea',
      affectedAreas: ['core'],
      affectedFiles: ['packages/core/src/intelligence/store.ts'],
      evidenceSummary: 'Requested during Praxis design.',
    });

    expect(rec.id).toMatch(/^rec-\d{8}-/);
    const ledger = await readRecommendationLedger(active.root);
    expect(ledger.recommendations).toHaveLength(1);
    expect(ledger.recommendations[0]?.title).toBe('Add context packets');

    const evidenceRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'evidence.json'),
      'utf8',
    );
    const evidence = JSON.parse(evidenceRaw);
    expect(evidence.evidence).toHaveLength(1);
    expect(evidence.evidence[0].summary).toBe('Requested during Praxis design.');
    expect(evidence.evidence[0].recommendationId).toBe(rec.id);
    expect(ledger.recommendations[0]?.evidenceIds).toEqual([evidence.evidence[0].id]);

    const rendered = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMENDATIONS.md'),
      'utf8',
    );
    expect(rendered).toMatch(/# CADENCE Recommendations/);
    expect(rendered).toMatch(/Add context packets/);
    expect(rendered).toMatch(/ready: raw-idea/);
    expect(rendered).toMatch(/Requested during Praxis design\./);
  });
});

function mkRec(id: string): Recommendation {
  return {
    id,
    title: `t-${id}`,
    summary: `s-${id}`,
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
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  };
}

function mkRecLedger(recs: Recommendation[]): RecommendationLedger {
  return { schemaVersion: 1, recommendations: recs };
}

function mkAsLedger(items: AssumptionLedger['assumptions']): AssumptionLedger {
  return { schemaVersion: 1, assumptions: items };
}

function mkDecLedger(
  items: IntelligenceDecisionLedger['decisions'],
): IntelligenceDecisionLedger {
  return { schemaVersion: 1, decisions: items };
}

describe('deriveRecommendationLinks (Slice 11)', () => {
  it('AC-1: empty inputs → empty recommendations array', () => {
    const r = deriveRecommendationLinks(mkRecLedger([]), mkAsLedger([]), mkDecLedger([]));
    expect(r).toEqual({ schemaVersion: 1, recommendations: [] });
  });

  it('AC-2: single rec + tied assumption populates assumptionIds', () => {
    const rec = mkRec('rec-1');
    const out = deriveRecommendationLinks(
      mkRecLedger([rec]),
      mkAsLedger([
        {
          id: 'as-1',
          recommendationId: 'rec-1',
          text: 't',
          status: 'open',
          createdAt: '2026-05-20T00:00:00.000Z',
        },
      ]),
      mkDecLedger([]),
    );
    expect(out.recommendations[0]).toEqual({ ...rec, assumptionIds: ['as-1'], decisionIds: [] });
  });

  it('AC-3: multi-rec disambiguation; insertion order preserved per rec', () => {
    const a = mkRec('rec-a');
    const b = mkRec('rec-b');
    const out = deriveRecommendationLinks(
      mkRecLedger([a, b]),
      mkAsLedger([
        { id: 'as-1', recommendationId: 'rec-a', text: 'x', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-2', recommendationId: 'rec-b', text: 'y', status: 'open', createdAt: '2026-05-20T01:00:00.000Z' },
        { id: 'as-3', recommendationId: 'rec-a', text: 'z', status: 'open', createdAt: '2026-05-20T02:00:00.000Z' },
      ]),
      mkDecLedger([]),
    );
    expect(out.recommendations[0]!.assumptionIds).toEqual(['as-1', 'as-3']);
    expect(out.recommendations[1]!.assumptionIds).toEqual(['as-2']);
  });

  it('AC-4: untied decision is skipped (no rec gets it in decisionIds)', () => {
    const a = mkRec('rec-a');
    const b = mkRec('rec-b');
    const out = deriveRecommendationLinks(
      mkRecLedger([a, b]),
      mkAsLedger([]),
      mkDecLedger([
        { id: 'dec-1', title: 'tied', rationale: 'r', recommendationId: 'rec-a', decidedAt: '2026-05-20T00:00:00.000Z' },
        { id: 'dec-2', title: 'untied', rationale: 'r', decidedAt: '2026-05-20T01:00:00.000Z' },
      ]),
    );
    expect(out.recommendations[0]!.decisionIds).toEqual(['dec-1']);
    expect(out.recommendations[1]!.decisionIds).toEqual([]);
  });

  it('AC-5: idempotent — second derive equals first', () => {
    const rec = mkRec('rec-1');
    const as = mkAsLedger([
      { id: 'as-1', recommendationId: 'rec-1', text: 't', status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
    ]);
    const dec = mkDecLedger([
      { id: 'dec-1', title: 't', rationale: 'r', recommendationId: 'rec-1', decidedAt: '2026-05-20T00:00:00.000Z' },
    ]);
    const once = deriveRecommendationLinks(mkRecLedger([rec]), as, dec);
    const twice = deriveRecommendationLinks(once, as, dec);
    expect(twice).toEqual(once);
  });

  it('preserves non-target fields verbatim on every rec', () => {
    const rec: Recommendation = {
      ...mkRec('rec-1'),
      suggestedMilestoneId: 'mil-1',
      suggestedBackendAction: 'cadence milestone propose',
      evidenceIds: ['ev-x'],
    };
    const out = deriveRecommendationLinks(mkRecLedger([rec]), mkAsLedger([]), mkDecLedger([]));
    expect(out.recommendations[0]).toEqual({ ...rec, assumptionIds: [], decisionIds: [] });
  });
});

describe('addAssumption backfill (Slice 11 / AC-6)', () => {
  it('updates rec.assumptionIds after addAssumption', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice11' });
    const rec = await addRecommendation(active.root, {
      title: 'host', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a = await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    const after = await readRecommendationLedger(active.root);
    const target = after.recommendations.find((r) => r.id === rec.id)!;
    expect(target.assumptionIds).toEqual([a.id]);
    // Non-target fields preserved
    expect(target.title).toBe('host');
    expect(target.evidenceIds).toEqual([]);
  });

  it('multi-assumption add accumulates ids in insertion order', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice11' });
    const rec = await addRecommendation(active.root, {
      title: 'host', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a1 = await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    const a2 = await addAssumption(active.root, { recommendationId: rec.id, text: 'A2' });
    const after = await readRecommendationLedger(active.root);
    expect(after.recommendations[0]!.assumptionIds).toEqual([a1.id, a2.id]);
  });
});

describe('addIntelligenceDecision backfill (Slice 11 / AC-7 + AC-8)', () => {
  it('AC-7: tied decision updates rec.decisionIds', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice11' });
    const rec = await addRecommendation(active.root, {
      title: 'host', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const d = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D1', rationale: 'r',
    });
    const after = await readRecommendationLedger(active.root);
    expect(after.recommendations[0]!.decisionIds).toEqual([d.id]);
  });

  it('AC-8: untied decision leaves recommendations.json byte-equal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice11' });
    await addRecommendation(active.root, {
      title: 'host', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const before = await readFile(recPath, 'utf8');
    await addIntelligenceDecision(active.root, {
      title: 'untied', rationale: 'r',
    });
    const afterBytes = await readFile(recPath, 'utf8');
    expect(afterBytes).toBe(before);
  });
});

describe('rec link backfill retroactive self-heal (Slice 11 / AC-9)', () => {
  it('pre-existing assumption picked up on next addAssumption against ANY rec', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice11' });
    const r1 = await addRecommendation(active.root, {
      title: 'r1', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const r2 = await addRecommendation(active.root, {
      title: 'r2', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    // Manually write an orphan assumption tied to r1 (simulates pre-Slice-11 / direct JSON edit)
    const asPath = join(active.root, '.cadence/intelligence/assumptions.json');
    await mkdir(dirname(asPath), { recursive: true });
    await writeFile(
      asPath,
      JSON.stringify({
        schemaVersion: 1,
        assumptions: [
          {
            id: 'as-19990101-001',
            recommendationId: r1.id,
            text: 'pre-Slice-11 orphan',
            status: 'open',
            createdAt: '1999-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    const before = await readRecommendationLedger(active.root);
    expect(before.recommendations.find((r) => r.id === r1.id)!.assumptionIds).toEqual([]);
    // Trigger any addAssumption — derives from full ledger
    const fresh = await addAssumption(active.root, {
      recommendationId: r2.id,
      text: 'fresh',
    });
    const after = await readRecommendationLedger(active.root);
    expect(after.recommendations.find((r) => r.id === r1.id)!.assumptionIds).toEqual([
      'as-19990101-001',
    ]);
    expect(after.recommendations.find((r) => r.id === r2.id)!.assumptionIds).toEqual([
      fresh.id,
    ]);
  });
});

describe('rec link backfill FK refusal preserved (Slice 11 / AC-11)', () => {
  it('addAssumption with unknown rec — no write on any ledger', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice11' });
    await addRecommendation(active.root, {
      title: 'r1', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const asPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const before = await readFile(recPath, 'utf8');
    await expect(
      addAssumption(active.root, { recommendationId: 'rec-bogus', text: 'x' }),
    ).rejects.toThrow(/unknown recommendation/);
    expect(await readFile(recPath, 'utf8')).toBe(before);
    // assumptions.json never created
    await expect(readFile(asPath, 'utf8')).rejects.toThrow();
  });
});

describe('decision status field (Slice 13 / AC-10 + AC-13 + AC-14)', () => {
  it('AC-10: legacy decisions.json (no status field) parses with Zod default active', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const path = join(active.root, '.cadence/intelligence/decisions.json');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        decisions: [
          {
            id: 'dec-legacy-001',
            title: 'old',
            rationale: 'r',
            decidedAt: '2026-05-15T00:00:00.000Z',
            // NO status field — pre-Slice-13 shape
          },
        ],
      }),
    );
    const ledger = await readIntelligenceDecisionLedger(active.root);
    expect(ledger.decisions[0]!.status).toBe('active');
  });

  it('AC-14: addIntelligenceDecision populates status=active on both tied + untied entries', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const tied = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'T', rationale: 'r',
    });
    expect(tied.status).toBe('active');
    const untied = await addIntelligenceDecision(active.root, { title: 'U', rationale: 'r' });
    expect(untied.status).toBe('active');
  });

  it('AC-13: Slice-12 `- decisions:` bullet renders even when decision is superseded (status-agnostic link arrays)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const d = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D', rationale: 'r',
    });
    await runDecisionTransition(active.root, d.id, 'supersede');
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMENDATIONS.md'),
      'utf8',
    );
    expect(md).toMatch(new RegExp(`## ${rec.id}[\\s\\S]*?- decisions: ${d.id}`));
  });
});

describe('rec MD link surfacing (Slice 12 / AC-6)', () => {
  it('addAssumption populates `- assumptions:` bullet under rec heading in RECOMMENDATIONS.md', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice12' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a = await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMENDATIONS.md'),
      'utf8',
    );
    expect(md).toMatch(new RegExp(`## ${rec.id}[\\s\\S]*?- assumptions: ${a.id}`));
    expect(md).not.toMatch(/- decisions:/);
  });

  it('addIntelligenceDecision (tied) populates `- decisions:` bullet under rec heading', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice12' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const d = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id,
      title: 'D1',
      rationale: 'r',
    });
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMENDATIONS.md'),
      'utf8',
    );
    expect(md).toMatch(new RegExp(`## ${rec.id}[\\s\\S]*?- decisions: ${d.id}`));
    expect(md).not.toMatch(/- assumptions:/);
  });

  it('addIntelligenceDecision (untied) leaves RECOMMENDATIONS.md without `- decisions:`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice12' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addIntelligenceDecision(active.root, {
      title: 'untied',
      rationale: 'r',
    });
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMENDATIONS.md'),
      'utf8',
    );
    expect(md).toMatch(new RegExp(`## ${rec.id}`));
    expect(md).not.toMatch(/- decisions:/);
  });
});
