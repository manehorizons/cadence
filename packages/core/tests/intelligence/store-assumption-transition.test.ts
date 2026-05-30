import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import type { AssumptionLedger } from '@manehorizons/cadence-types';
import {
  addAssumption,
  addRecommendation,
  applyAssumptionTransition,
  readAssumptionLedger,
  runAssumptionTransition,
} from '../../src/intelligence/store.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

function mkLedger(items: AssumptionLedger['assumptions']): AssumptionLedger {
  return { schemaVersion: 1, assumptions: items };
}

async function seedRecAndAssumption(
  root: string,
): Promise<{ recId: string; assumptionId: string }> {
  const r = await addRecommendation(root, {
    title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  const a = await addAssumption(root, { recommendationId: r.id, text: 'A1' });
  return { recId: r.id, assumptionId: a.id };
}

describe('applyAssumptionTransition (Slice 9 / AC-1)', () => {
  it('validate: open → validated (createdAt + other fields preserved)', () => {
    const ledger = mkLedger([
      { id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'open',
        createdAt: '2026-05-20T00:00:00.000Z' },
      { id: 'as-2', recommendationId: 'r-2', text: 't2', status: 'open',
        createdAt: '2026-05-20T01:00:00.000Z' },
    ]);
    const res = applyAssumptionTransition(ledger, 'as-1', 'validate');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.assumptions[0]).toEqual({
      id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'validated',
      createdAt: '2026-05-20T00:00:00.000Z',
    });
    // Non-target preserved byte-equal
    expect(res.ledger.assumptions[1]).toBe(ledger.assumptions[1]);
  });

  it('reject: open → rejected (createdAt preserved)', () => {
    const ledger = mkLedger([
      { id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'open',
        createdAt: '2026-05-20T00:00:00.000Z' },
    ]);
    const res = applyAssumptionTransition(ledger, 'as-1', 'reject');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.assumptions[0]!.status).toBe('rejected');
    expect(res.ledger.assumptions[0]!.createdAt).toBe('2026-05-20T00:00:00.000Z');
  });

  it('reopen: validated → open (non-target preserved byte-equal, createdAt preserved)', () => {
    const ledger = mkLedger([
      { id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'validated',
        createdAt: '2026-05-20T00:00:00.000Z' },
      { id: 'as-2', recommendationId: 'r-2', text: 't2', status: 'rejected',
        createdAt: '2026-05-20T01:00:00.000Z' },
    ]);
    const res = applyAssumptionTransition(ledger, 'as-1', 'reopen');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.assumptions[0]).toEqual({
      id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'open',
      createdAt: '2026-05-20T00:00:00.000Z',
    });
    expect(res.ledger.assumptions[1]).toBe(ledger.assumptions[1]);
  });

  it('reopen: rejected → open (createdAt preserved)', () => {
    const ledger = mkLedger([
      { id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'rejected',
        createdAt: '2026-05-20T00:00:00.000Z' },
    ]);
    const res = applyAssumptionTransition(ledger, 'as-1', 'reopen');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.assumptions[0]!.status).toBe('open');
    expect(res.ledger.assumptions[0]!.createdAt).toBe('2026-05-20T00:00:00.000Z');
  });
});

describe('applyAssumptionTransition refusals (AC-2 + AC-3)', () => {
  it('id not in ledger', () => {
    const ledger = mkLedger([]);
    const res = applyAssumptionTransition(ledger, 'as-bogus', 'validate');
    expect(res).toEqual({ ok: false, error: 'assumption as-bogus not found' });
  });

  it.each([
    ['validated', 'validate', 'cannot validate assumption in status validated'],
    ['rejected',  'validate', 'cannot validate assumption in status rejected'],
    ['validated', 'reject',   'cannot reject assumption in status validated'],
    ['rejected',  'reject',   'cannot reject assumption in status rejected'],
    ['open',      'reopen',   'cannot reopen assumption in status open'],
  ] as const)(
    'wrong source status %s -> %s refused',
    (status, action, expectedError) => {
      const ledger = mkLedger([
        { id: 'as-1', recommendationId: 'r-1', text: 't1', status,
          createdAt: '2026-05-20T00:00:00.000Z' },
      ]);
      const res = applyAssumptionTransition(ledger, 'as-1', action);
      expect(res).toEqual({ ok: false, error: expectedError });
    },
  );
});

describe('runAssumptionTransition no-write-on-failure (AC-4)', () => {
  it('refused transition leaves assumptions.json + ASSUMPTIONS.md byte-equal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const { assumptionId } = await seedRecAndAssumption(active.root);
    // First validate succeeds — flips status
    const ok1 = await runAssumptionTransition(active.root, assumptionId, 'validate');
    expect(ok1.ok).toBe(true);
    // Snapshot files BEFORE the refused call
    const jsonPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const mdPath = join(active.root, '.cadence/intelligence/ASSUMPTIONS.md');
    const jsonBefore = await readFile(jsonPath, 'utf8');
    const mdBefore = await readFile(mdPath, 'utf8');
    // Second validate refused (already validated)
    const refused = await runAssumptionTransition(active.root, assumptionId, 'validate');
    expect(refused).toEqual({
      ok: false,
      error: 'cannot validate assumption in status validated',
    });
    // Files byte-equal
    expect(await readFile(jsonPath, 'utf8')).toBe(jsonBefore);
    expect(await readFile(mdPath, 'utf8')).toBe(mdBefore);
  });

  it('refused unknown id leaves ledger empty (no write created)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const jsonPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const mdPath = join(active.root, '.cadence/intelligence/ASSUMPTIONS.md');
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(mdPath)).toBe(false);
    const res = await runAssumptionTransition(active.root, 'as-bogus', 'validate');
    expect(res).toEqual({ ok: false, error: 'assumption as-bogus not found' });
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(mdPath)).toBe(false);
  });

  it('successful transition writes via writeAssumptionLedger (JSON + MD)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const { assumptionId } = await seedRecAndAssumption(active.root);
    const res = await runAssumptionTransition(active.root, assumptionId, 'validate');
    expect(res.ok).toBe(true);
    const ledger = await readAssumptionLedger(active.root);
    expect(ledger.assumptions[0]!.status).toBe('validated');
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Validated[\s\S]*?### as-/);
    expect(md).toMatch(/## Open[\s\S]*?_\(none\)_/);
  });

  it('refused reopen-from-open leaves files byte-equal (Slice 10)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const { assumptionId } = await seedRecAndAssumption(active.root);
    const jsonPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const mdPath = join(active.root, '.cadence/intelligence/ASSUMPTIONS.md');
    const jsonBefore = await readFile(jsonPath, 'utf8');
    const mdBefore = await readFile(mdPath, 'utf8');
    const refused = await runAssumptionTransition(active.root, assumptionId, 'reopen');
    expect(refused).toEqual({
      ok: false,
      error: 'cannot reopen assumption in status open',
    });
    expect(await readFile(jsonPath, 'utf8')).toBe(jsonBefore);
    expect(await readFile(mdPath, 'utf8')).toBe(mdBefore);
  });

  it('reopen round-trip: validate then reopen → status=open, MD back in ## Open (Slice 10)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const { assumptionId } = await seedRecAndAssumption(active.root);
    const v = await runAssumptionTransition(active.root, assumptionId, 'validate');
    expect(v.ok).toBe(true);
    const r = await runAssumptionTransition(active.root, assumptionId, 'reopen');
    expect(r.ok).toBe(true);
    const ledger = await readAssumptionLedger(active.root);
    expect(ledger.assumptions[0]!.status).toBe('open');
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Open[\s\S]*?### as-/);
    expect(md).toMatch(/## Validated[\s\S]*?_\(none\)_/);
  });
});
