import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { AssumptionLedgerZ } from '@cadence/types';
import {
  addAssumption,
  addRecommendation,
  readAssumptionLedger,
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
    title: 'seed rec',
    summary: 'seed',
    priority: 'medium',
    readiness: 'raw-idea',
    affectedAreas: [],
    affectedFiles: [],
  });
  return r.id;
}

describe('addAssumption (Slice 8)', () => {
  it('allocates `as-<YYYYMMDD>-001`, sets status=open, persists assumptions.json + ASSUMPTIONS.md', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const recId = await seedRec(active.root);
    const a = await addAssumption(active.root, { recommendationId: recId, text: 'db reachable' });
    expect(a.id).toMatch(/^as-\d{8}-001$/);
    expect(a.recommendationId).toBe(recId);
    expect(a.text).toBe('db reachable');
    expect(a.status).toBe('open');
    expect(a.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const json = await readFile(join(active.root, '.cadence/intelligence/assumptions.json'), 'utf8');
    const parsed = AssumptionLedgerZ.parse(JSON.parse(json));
    expect(parsed.assumptions).toHaveLength(1);
    expect(parsed.assumptions[0]!.id).toBe(a.id);
    const md = await readFile(join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'), 'utf8');
    expect(md).toMatch(/^# CADENCE Assumptions/m);
    expect(md).toMatch(new RegExp(`## ${a.id} — db reachable`));
  });

  it('counter increments monotone per-day per-ledger (001 → 002 → 003)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const recId = await seedRec(active.root);
    const a1 = await addAssumption(active.root, { recommendationId: recId, text: 'A1' });
    const a2 = await addAssumption(active.root, { recommendationId: recId, text: 'A2' });
    const a3 = await addAssumption(active.root, { recommendationId: recId, text: 'A3' });
    const prefix = a1.id.slice(0, -3);
    expect(a1.id).toBe(`${prefix}001`);
    expect(a2.id).toBe(`${prefix}002`);
    expect(a3.id).toBe(`${prefix}003`);
  });

  it('refuses unknown recommendationId with Error and NO write side effects (AC-2)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    await seedRec(active.root);
    const jsonPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const mdPath = join(active.root, '.cadence/intelligence/ASSUMPTIONS.md');
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(mdPath)).toBe(false);
    await expect(
      addAssumption(active.root, { recommendationId: 'rec-bogus', text: 'will fail' }),
    ).rejects.toThrow('unknown recommendation "rec-bogus"');
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(mdPath)).toBe(false);
    const ledger = await readAssumptionLedger(active.root);
    expect(ledger.assumptions).toHaveLength(0);
  });
});
