import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import type { IntelligenceDecisionLedger } from '@cadence/types';
import {
  addIntelligenceDecision,
  addRecommendation,
  applyDecisionTransition,
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

function mkLedger(
  items: IntelligenceDecisionLedger['decisions'],
): IntelligenceDecisionLedger {
  return { schemaVersion: 1, decisions: items };
}

async function seedRecAndDecision(
  root: string,
): Promise<{ recId: string; decisionId: string }> {
  const r = await addRecommendation(root, {
    title: 't',
    summary: 's',
    priority: 'medium',
    readiness: 'raw-idea',
    affectedAreas: [],
    affectedFiles: [],
  });
  const d = await addIntelligenceDecision(root, {
    recommendationId: r.id,
    title: 'D1',
    rationale: 'r',
  });
  return { recId: r.id, decisionId: d.id };
}

describe('applyDecisionTransition (Slice 13 / AC-1)', () => {
  it('supersede: active → superseded (decidedAt + other fields preserved)', () => {
    const ledger = mkLedger([
      {
        id: 'dec-1',
        recommendationId: 'rec-1',
        title: 'D1',
        rationale: 'r1',
        status: 'active',
        decidedAt: '2026-05-20T00:00:00.000Z',
      },
      {
        id: 'dec-2',
        title: 'D2',
        rationale: 'r2',
        status: 'active',
        decidedAt: '2026-05-20T01:00:00.000Z',
      },
    ]);
    const res = applyDecisionTransition(ledger, 'dec-1', 'supersede');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.decisions[0]).toEqual({
      id: 'dec-1',
      recommendationId: 'rec-1',
      title: 'D1',
      rationale: 'r1',
      status: 'superseded',
      decidedAt: '2026-05-20T00:00:00.000Z',
    });
    expect(res.ledger.decisions[1]).toBe(ledger.decisions[1]);
  });

  it('rescind: active → rescinded', () => {
    const ledger = mkLedger([
      {
        id: 'dec-1',
        title: 'D1',
        rationale: 'r',
        status: 'active',
        decidedAt: '2026-05-20T00:00:00.000Z',
      },
    ]);
    const res = applyDecisionTransition(ledger, 'dec-1', 'rescind');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.decisions[0]!.status).toBe('rescinded');
  });

  it('reactivate: superseded → active', () => {
    const ledger = mkLedger([
      {
        id: 'dec-1',
        title: 'D1',
        rationale: 'r',
        status: 'superseded',
        decidedAt: '2026-05-20T00:00:00.000Z',
      },
    ]);
    const res = applyDecisionTransition(ledger, 'dec-1', 'reactivate');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.decisions[0]!.status).toBe('active');
  });

  it('reactivate: rescinded → active', () => {
    const ledger = mkLedger([
      {
        id: 'dec-1',
        title: 'D1',
        rationale: 'r',
        status: 'rescinded',
        decidedAt: '2026-05-20T00:00:00.000Z',
      },
    ]);
    const res = applyDecisionTransition(ledger, 'dec-1', 'reactivate');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.decisions[0]!.status).toBe('active');
  });
});

describe('applyDecisionTransition refusals (AC-2 + AC-3)', () => {
  it('id not in ledger', () => {
    const ledger = mkLedger([]);
    const res = applyDecisionTransition(ledger, 'dec-bogus', 'supersede');
    expect(res).toEqual({ ok: false, error: 'decision dec-bogus not found' });
  });

  it.each([
    ['superseded', 'supersede', 'cannot supersede decision in status superseded'],
    ['rescinded', 'supersede', 'cannot supersede decision in status rescinded'],
    ['superseded', 'rescind', 'cannot rescind decision in status superseded'],
    ['rescinded', 'rescind', 'cannot rescind decision in status rescinded'],
    ['active', 'reactivate', 'cannot reactivate decision in status active'],
  ] as const)(
    'wrong source status %s -> %s refused',
    (status, action, expectedError) => {
      const ledger = mkLedger([
        {
          id: 'dec-1',
          title: 'D',
          rationale: 'r',
          status,
          decidedAt: '2026-05-20T00:00:00.000Z',
        },
      ]);
      const res = applyDecisionTransition(ledger, 'dec-1', action);
      expect(res).toEqual({ ok: false, error: expectedError });
    },
  );
});

describe('runDecisionTransition no-write-on-failure (AC-4)', () => {
  it('refused transition leaves decisions.json + DECISIONS.md byte-equal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const { decisionId } = await seedRecAndDecision(active.root);
    const ok1 = await runDecisionTransition(active.root, decisionId, 'supersede');
    expect(ok1.ok).toBe(true);
    const jsonPath = join(active.root, '.cadence/intelligence/decisions.json');
    const mdPath = join(active.root, '.cadence/intelligence/DECISIONS.md');
    const jsonBefore = await readFile(jsonPath, 'utf8');
    const mdBefore = await readFile(mdPath, 'utf8');
    const refused = await runDecisionTransition(
      active.root,
      decisionId,
      'supersede',
    );
    expect(refused).toEqual({
      ok: false,
      error: 'cannot supersede decision in status superseded',
    });
    expect(await readFile(jsonPath, 'utf8')).toBe(jsonBefore);
    expect(await readFile(mdPath, 'utf8')).toBe(mdBefore);
  });

  it('refused unknown id leaves ledger empty (no write created)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const jsonPath = join(active.root, '.cadence/intelligence/decisions.json');
    const mdPath = join(active.root, '.cadence/intelligence/DECISIONS.md');
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(mdPath)).toBe(false);
    const res = await runDecisionTransition(
      active.root,
      'dec-bogus',
      'supersede',
    );
    expect(res).toEqual({ ok: false, error: 'decision dec-bogus not found' });
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(mdPath)).toBe(false);
  });

  it('round-trip: supersede then reactivate restores active status', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice13' });
    const { decisionId } = await seedRecAndDecision(active.root);
    await runDecisionTransition(active.root, decisionId, 'supersede');
    const reAct = await runDecisionTransition(
      active.root,
      decisionId,
      'reactivate',
    );
    expect(reAct.ok).toBe(true);
    const ledger = await readIntelligenceDecisionLedger(active.root);
    expect(ledger.decisions[0]!.status).toBe('active');
  });
});

describe('applyDecisionTransition --by (Slice 28)', () => {
  const baseLedger = (): IntelligenceDecisionLedger =>
    mkLedger([
      { id: 'dec-1', title: 'D1', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
      { id: 'dec-2', title: 'D2', rationale: 'r', status: 'active', decidedAt: '2026-05-20T01:00:00.000Z' },
      { id: 'dec-3', title: 'D3', rationale: 'r', status: 'active', decidedAt: '2026-05-20T02:00:00.000Z' },
    ]);

  it('AC-1: supersede without --by works as Slice 13 (no supersededBy persisted)', () => {
    const res = applyDecisionTransition(baseLedger(), 'dec-1', 'supersede');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.decisions[0]!.status).toBe('superseded');
    expect('supersededBy' in res.ledger.decisions[0]!).toBe(false);
  });

  it('AC-2: supersede with valid --by persists supersededBy', () => {
    const res = applyDecisionTransition(baseLedger(), 'dec-1', 'supersede', 'dec-2');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.decisions[0]!.status).toBe('superseded');
    expect(res.ledger.decisions[0]!.supersededBy).toBe('dec-2');
  });

  it('AC-3: --by self-ref refused', () => {
    const res = applyDecisionTransition(baseLedger(), 'dec-1', 'supersede', 'dec-1');
    expect(res).toEqual({ ok: false, error: 'cannot supersede: decision cannot supersede itself' });
  });

  it('AC-4: --by unknown id refused', () => {
    const res = applyDecisionTransition(baseLedger(), 'dec-1', 'supersede', 'dec-bogus');
    expect(res).toEqual({ ok: false, error: 'cannot supersede: decision dec-bogus not found' });
  });

  it('AC-5: cycle dec-1→dec-2 then supersede dec-2 --by dec-1 refused', () => {
    const ledger = mkLedger([
      { id: 'dec-1', title: 'D1', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-2' },
      { id: 'dec-2', title: 'D2', rationale: 'r', status: 'active', decidedAt: '2026-05-20T01:00:00.000Z' },
    ]);
    const res = applyDecisionTransition(ledger, 'dec-2', 'supersede', 'dec-1');
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected refusal');
    expect(res.error).toBe('cannot supersede: would create cycle (dec-1 → dec-2)');
  });

  it('AC-6: longer cycle dec-1→dec-2→dec-3 then supersede dec-3 --by dec-1 refused with full chain', () => {
    const ledger = mkLedger([
      { id: 'dec-1', title: 'D1', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-2' },
      { id: 'dec-2', title: 'D2', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T01:00:00.000Z', supersededBy: 'dec-3' },
      { id: 'dec-3', title: 'D3', rationale: 'r', status: 'active', decidedAt: '2026-05-20T02:00:00.000Z' },
    ]);
    const res = applyDecisionTransition(ledger, 'dec-3', 'supersede', 'dec-1');
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected refusal');
    expect(res.error).toBe('cannot supersede: would create cycle (dec-1 → dec-2 → dec-3)');
  });

  it('AC-7: reactivate clears supersededBy', () => {
    const ledger = mkLedger([
      { id: 'dec-1', title: 'D1', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-2' },
      { id: 'dec-2', title: 'D2', rationale: 'r', status: 'active', decidedAt: '2026-05-20T01:00:00.000Z' },
    ]);
    const res = applyDecisionTransition(ledger, 'dec-1', 'reactivate');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.decisions[0]!.status).toBe('active');
    expect('supersededBy' in res.ledger.decisions[0]!).toBe(false);
  });
});
