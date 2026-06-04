import { afterEach, describe, expect, it } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { readRecommendationLedger } from '../../src/intelligence/store/io.js';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import { addAssumption } from '../../src/intelligence/store/assumptions.js';
import { addIntelligenceDecision } from '../../src/intelligence/store/decisions.js';
import { runIntelligenceReconcile } from '../../src/intelligence/store/reconcile.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('runIntelligenceReconcile (Slice 17)', () => {
  it('AC-1: empty workspace → { present: false }, no files created', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice17' });
    const res = await runIntelligenceReconcile(active.root);
    expect(res).toEqual({
      present: false,
      recommendations: 0,
      assumptions: 0,
      decisions: 0,
    });
    expect(existsSync(join(active.root, '.cadence/intelligence/recommendations.json'))).toBe(false);
    expect(existsSync(join(active.root, '.cadence/intelligence/RECOMMENDATIONS.md'))).toBe(false);
  });

  it('AC-2: populated workspace → re-derives links, writes recommendations.json + 3 MDs, counts match', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice17' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D1', rationale: 'r',
    });
    const res = await runIntelligenceReconcile(active.root);
    expect(res.present).toBe(true);
    expect(res.recommendations).toBe(1);
    expect(res.assumptions).toBe(1);
    expect(res.decisions).toBe(1);
    expect(existsSync(join(active.root, '.cadence/intelligence/RECOMMENDATIONS.md'))).toBe(true);
    expect(existsSync(join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'))).toBe(true);
    expect(existsSync(join(active.root, '.cadence/intelligence/DECISIONS.md'))).toBe(true);
  });

  it('AC-3: idempotency — second call leaves all 4 files byte-equal to first', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice17' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    await runIntelligenceReconcile(active.root);
    const files = ['recommendations.json', 'RECOMMENDATIONS.md', 'ASSUMPTIONS.md', 'DECISIONS.md'];
    const snap = new Map<string, string>();
    for (const f of files) {
      snap.set(f, await readFile(join(active.root, '.cadence/intelligence', f), 'utf8'));
    }
    await runIntelligenceReconcile(active.root);
    for (const f of files) {
      const after = await readFile(join(active.root, '.cadence/intelligence', f), 'utf8');
      expect(after).toBe(snap.get(f));
    }
  });

  it('AC-4: drift correction — manual JSON edit picked up on reconcile', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice17' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    // Manually plant an assumption into assumptions.json (bypass addAssumption)
    const asPath = join(active.root, '.cadence/intelligence/assumptions.json');
    await mkdir(dirname(asPath), { recursive: true });
    await writeFile(
      asPath,
      JSON.stringify({
        schemaVersion: 1,
        assumptions: [
          {
            id: 'as-manual-001',
            recommendationId: rec.id,
            text: 'planted',
            status: 'open',
            createdAt: '2026-05-20T00:00:00.000Z',
          },
        ],
      }),
    );
    // Pre-reconcile: rec.assumptionIds still empty
    const before = await readRecommendationLedger(active.root);
    expect(before.recommendations[0]!.assumptionIds).toEqual([]);
    // Reconcile picks it up
    await runIntelligenceReconcile(active.root);
    const after = await readRecommendationLedger(active.root);
    expect(after.recommendations[0]!.assumptionIds).toEqual(['as-manual-001']);
  });

  it('AC-5: MD re-render reflects current status after manual JSON edit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice17' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a = await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const mdPath = join(active.root, '.cadence/intelligence/RECOMMENDATIONS.md');
    const before = await readFile(mdPath, 'utf8');
    expect(before).toMatch(new RegExp(`- assumptions: ${a.id} \\(open\\)`));
    // Manually flip status to validated in JSON
    const asPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const asJson = JSON.parse(await readFile(asPath, 'utf8'));
    asJson.assumptions[0].status = 'validated';
    await writeFile(asPath, JSON.stringify(asJson));
    await runIntelligenceReconcile(active.root);
    const after = await readFile(mdPath, 'utf8');
    expect(after).toMatch(new RegExp(`- assumptions: ${a.id} \\(validated\\)`));
  });

  it('AC-6: assumptions.json + decisions.json content UNCHANGED by reconcile', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice17' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D', rationale: 'r',
    });
    const asPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const decPath = join(active.root, '.cadence/intelligence/decisions.json');
    const asBefore = await readFile(asPath, 'utf8');
    const decBefore = await readFile(decPath, 'utf8');
    await runIntelligenceReconcile(active.root);
    expect(await readFile(asPath, 'utf8')).toBe(asBefore);
    // Slice 31: reconcile now writes decisions.json (to re-derive supersedes
    // arrays). On a ledger that's already canonical (every supersedes array
    // matches the derivation), byte-equality holds.
    expect(await readFile(decPath, 'utf8')).toBe(decBefore);
  });

  it('Slice 31 AC-10: manually-stale `supersedes` array fixed by reconcile', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice31' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const d1 = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D1', rationale: 'r',
    });
    const d2 = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D2', rationale: 'r',
    });
    // Wire the supersededBy edge manually but break the inverse: D2.supersedes
    // ends up wrong (contains an id that doesn't actually reference D2).
    const decPath = join(active.root, '.cadence/intelligence/decisions.json');
    const raw = JSON.parse(await readFile(decPath, 'utf8'));
    for (const dec of raw.decisions) {
      if (dec.id === d1.id) {
        dec.status = 'superseded';
        dec.supersededBy = d2.id;
      }
      if (dec.id === d2.id) {
        dec.supersedes = ['dec-9']; // bogus — dec-9 doesn't reference d2
      }
    }
    await writeFile(decPath, JSON.stringify(raw, null, 2) + '\n', 'utf8');
    await runIntelligenceReconcile(active.root);
    const after = JSON.parse(await readFile(decPath, 'utf8'));
    const d1After = after.decisions.find((d: { id: string }) => d.id === d1.id);
    const d2After = after.decisions.find((d: { id: string }) => d.id === d2.id);
    expect(d1After.supersedes).toEqual([]);
    expect(d2After.supersedes).toEqual([d1.id]);
  });
});
