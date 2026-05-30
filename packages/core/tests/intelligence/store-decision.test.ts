import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { IntelligenceDecisionLedgerZ } from '@manehorizons/cadence-types';
import {
  addIntelligenceDecision,
  addRecommendation,
} from '../../src/intelligence/store.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedRec(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 'seed', summary: 'seed', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  return r.id;
}

describe('addIntelligenceDecision (Slice 8)', () => {
  it('untied decision: omits recommendationId field entirely (AC-3)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const d = await addIntelligenceDecision(active.root, {
      title: 'switch to postgres',
      rationale: 'better concurrency story',
    });
    expect(d.id).toMatch(/^dec-\d{8}-001$/);
    expect(d.title).toBe('switch to postgres');
    expect(d.rationale).toBe('better concurrency story');
    expect(d.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect('recommendationId' in d).toBe(false); // OMITTED, not undefined
    const json = await readFile(join(active.root, '.cadence/intelligence/decisions.json'), 'utf8');
    const parsed = IntelligenceDecisionLedgerZ.parse(JSON.parse(json));
    expect('recommendationId' in parsed.decisions[0]!).toBe(false);
    const md = await readFile(join(active.root, '.cadence/intelligence/DECISIONS.md'), 'utf8');
    expect(md).toMatch(/^# CADENCE Decisions/m);
  });

  it('tied decision with known recId: persists with field present', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const recId = await seedRec(active.root);
    const d = await addIntelligenceDecision(active.root, {
      recommendationId: recId,
      title: 'tied decision',
      rationale: 'r',
    });
    expect(d.recommendationId).toBe(recId);
  });

  it('refuses unknown recommendationId only when --rec provided (AC-4)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    await seedRec(active.root);
    const jsonPath = join(active.root, '.cadence/intelligence/decisions.json');
    expect(existsSync(jsonPath)).toBe(false);
    await expect(
      addIntelligenceDecision(active.root, {
        recommendationId: 'rec-bogus',
        title: 't',
        rationale: 'r',
      }),
    ).rejects.toThrow('unknown recommendation "rec-bogus"');
    expect(existsSync(jsonPath)).toBe(false);
  });

  it('Slice 31 AC-7: new decisions return with supersedes: [] and persist it on every decision', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice31' });
    const recId = await seedRec(active.root);
    const d1 = await addIntelligenceDecision(active.root, {
      recommendationId: recId, title: 'D1', rationale: 'r',
    });
    expect(d1.supersedes).toEqual([]);
    const d2 = await addIntelligenceDecision(active.root, {
      title: 'D2 untied', rationale: 'r',
    });
    expect(d2.supersedes).toEqual([]);
    // Both decisions are persisted with the field populated.
    const jsonPath = join(active.root, '.cadence/intelligence/decisions.json');
    const raw = IntelligenceDecisionLedgerZ.parse(JSON.parse(await readFile(jsonPath, 'utf8')));
    expect(raw.decisions).toHaveLength(2);
    for (const dec of raw.decisions) {
      expect(dec.supersedes).toEqual([]);
    }
  });
});
