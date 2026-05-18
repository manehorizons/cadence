import { describe, expect, it, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import {
  addRecommendation,
  readRecommendationLedger,
  readMilestoneLedger,
  writeMilestoneLedger,
  readAssumptionLedger,
  readIntelligenceDecisionLedger,
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
