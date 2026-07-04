import { describe, expect, it, afterEach } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IntelligenceMilestone, MilestoneLedger, Recommendation } from '@manehorizons/cadence-types';
import { applyTransition, runMilestoneTransition } from '../../src/intelligence/milestone.js';
import { readMilestoneLedger } from '../../src/intelligence/store/milestones.js';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

// Issue #135 / phase 149: `close` transitions an `exported` milestone to `closed`.
// AC-1: close transitions exported -> closed
// AC-2: close refuses from any other status
// AC-3: --ref is stored and rendered
// AC-4: advisory warning on unshipped members

function mkMs(p: Partial<IntelligenceMilestone> & { id: string }): IntelligenceMilestone {
  return {
    name: p.id,
    objective: 'do the thing',
    status: 'exported',
    recommendationIds: ['rec-1'],
    preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
    exportTargets: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...p,
  };
}

function ledgerOf(...ms: IntelligenceMilestone[]): MilestoneLedger {
  return { schemaVersion: 1, milestones: ms };
}

function mkRec(p: Partial<Recommendation> & { id: string; status: Recommendation['status'] }): Recommendation {
  return {
    title: 't',
    summary: 's',
    source: 'manual',
    readiness: 'ready-for-milestone',
    priority: 'low',
    leverageScore: 0,
    riskScore: 0,
    confidence: 0.9,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...p,
  };
}

describe('applyTransition — close (pure)', () => {
  const T = new Date('2026-07-03T12:00:00.000Z');

  it('AC-1: exported -> closed, refreshes updatedAt, leaves other milestones untouched', () => {
    const led = ledgerOf(
      mkMs({ id: 'mil-a', status: 'exported' }),
      mkMs({ id: 'mil-b', status: 'accepted' }),
    );
    const res = applyTransition(led, 'mil-a', 'close', T);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    const a = res.ledger.milestones.find((m) => m.id === 'mil-a')!;
    expect(a.status).toBe('closed');
    expect(a.updatedAt).toBe(T.toISOString());
    expect(res.ledger.milestones.find((m) => m.id === 'mil-b')!.status).toBe('accepted');
    // original ledger not mutated
    expect(led.milestones.find((m) => m.id === 'mil-a')!.status).toBe('exported');
  });

  it('AC-2: refuses from proposed, accepted, deferred, and already-closed', () => {
    for (const status of ['proposed', 'accepted', 'deferred', 'closed'] as const) {
      const led = ledgerOf(mkMs({ id: 'mil-a', status }));
      const res = applyTransition(led, 'mil-a', 'close', T);
      expect(res).toEqual({ ok: false, error: `cannot close milestone in status ${status}` });
    }
  });

  it('AC-2: refuses unknown id', () => {
    const res = applyTransition(ledgerOf(mkMs({ id: 'mil-a', status: 'exported' })), 'nope', 'close', T);
    expect(res).toEqual({ ok: false, error: 'milestone nope not found' });
  });

  it('AC-3: --ref sets closedRef on the target only', () => {
    const led = ledgerOf(
      mkMs({ id: 'mil-a', status: 'exported' }),
      mkMs({ id: 'mil-b', status: 'exported' }),
    );
    const res = applyTransition(led, 'mil-a', 'close', T, 'PR #131');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.ledger.milestones.find((m) => m.id === 'mil-a')!.closedRef).toBe('PR #131');
    expect(res.ledger.milestones.find((m) => m.id === 'mil-b')!.closedRef).toBeUndefined();
  });

  it('close without --ref leaves closedRef unset', () => {
    const res = applyTransition(ledgerOf(mkMs({ id: 'mil-a', status: 'exported' })), 'mil-a', 'close', T);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.ledger.milestones[0]!.closedRef).toBeUndefined();
  });

  it('ref is refused for accept/defer (only valid for close)', () => {
    const acceptRes = applyTransition(
      ledgerOf(mkMs({ id: 'mil-a', status: 'proposed' })),
      'mil-a',
      'accept',
      T,
      'PR #1',
    );
    expect(acceptRes).toEqual({ ok: false, error: 'ref is only valid for the close action' });
    const deferRes = applyTransition(
      ledgerOf(mkMs({ id: 'mil-a', status: 'proposed' })),
      'mil-a',
      'defer',
      T,
      'PR #1',
    );
    expect(deferRes).toEqual({ ok: false, error: 'ref is only valid for the close action' });
  });
});

async function seedMilestones(root: string, ms: IntelligenceMilestone[]): Promise<void> {
  const dir = join(root, '.cadence', 'intelligence');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'milestones.json'),
    JSON.stringify({ schemaVersion: 1, milestones: ms }, null, 2),
  );
}

async function seedRecs(root: string, recs: Recommendation[], archived: Recommendation[] = []): Promise<void> {
  const dir = join(root, '.cadence', 'intelligence');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'recommendations.json'),
    JSON.stringify({ schemaVersion: 1, recommendations: recs, archived }, null, 2),
  );
}

let fx: Fixture | null = null;
afterEach(async () => {
  if (fx) {
    await fx.cleanup();
    fx = null;
  }
});

describe('runMilestoneTransition — close (I/O)', () => {
  it('AC-1: exported -> closed, writes milestones.json with refreshed updatedAt', async () => {
    fx = await tempRepo({ initialized: true });
    await seedMilestones(fx.root, [mkMs({ id: 'mil-a', status: 'exported' })]);

    const res = await runMilestoneTransition(fx.root, 'mil-a', 'close');
    expect(res.ok).toBe(true);

    const led = await readMilestoneLedger(fx.root);
    const m = led.milestones.find((x) => x.id === 'mil-a')!;
    expect(m.status).toBe('closed');
    expect(m.updatedAt).not.toBe('2026-05-17T00:00:00.000Z');
  });

  it('AC-2: refuses from every other status, does not write, names the status', async () => {
    fx = await tempRepo({ initialized: true });
    await seedMilestones(fx.root, [
      mkMs({ id: 'mil-p', status: 'proposed' }),
      mkMs({ id: 'mil-acc', status: 'accepted' }),
      mkMs({ id: 'mil-d', status: 'deferred' }),
      mkMs({ id: 'mil-c', status: 'closed' }),
    ]);

    for (const [id, status] of [
      ['mil-p', 'proposed'],
      ['mil-acc', 'accepted'],
      ['mil-d', 'deferred'],
      ['mil-c', 'closed'],
    ] as const) {
      const res = await runMilestoneTransition(fx.root, id, 'close');
      expect(res).toEqual({ ok: false, error: `cannot close milestone in status ${status}` });
    }

    // untouched on disk
    const led = await readMilestoneLedger(fx.root);
    expect(led.milestones.map((m) => m.updatedAt)).toEqual([
      '2026-05-17T00:00:00.000Z',
      '2026-05-17T00:00:00.000Z',
      '2026-05-17T00:00:00.000Z',
      '2026-05-17T00:00:00.000Z',
    ]);
  });

  it('AC-3: --ref persists as closedRef and renders in MILESTONES.md', async () => {
    fx = await tempRepo({ initialized: true });
    await seedMilestones(fx.root, [mkMs({ id: 'mil-a', name: 'Auth Work', status: 'exported' })]);

    const res = await runMilestoneTransition(fx.root, 'mil-a', 'close', 'PR #131');
    expect(res.ok).toBe(true);

    const led = await readMilestoneLedger(fx.root);
    const m = led.milestones.find((x) => x.id === 'mil-a')!;
    expect(m.closedRef).toBe('PR #131');

    const md = await readFile(join(fx.root, '.cadence', 'intelligence', 'MILESTONES.md'), 'utf8');
    expect(md).toMatch(/## Closed\n\n- mil-a — Auth Work \(ref: PR #131\)/);
  });

  it('close without --ref renders the unchanged one-liner (no "(ref: ...)" suffix)', async () => {
    fx = await tempRepo({ initialized: true });
    await seedMilestones(fx.root, [mkMs({ id: 'mil-a', name: 'Auth Work', status: 'exported' })]);
    await runMilestoneTransition(fx.root, 'mil-a', 'close');
    const md = await readFile(join(fx.root, '.cadence', 'intelligence', 'MILESTONES.md'), 'utf8');
    expect(md).toMatch(/## Closed\n\n- mil-a — Auth Work\n/);
    expect(md).not.toMatch(/mil-a — Auth Work \(ref:/);
  });

  it('AC-4: warns naming unshipped recommendation(s); close still succeeds', async () => {
    fx = await tempRepo({ initialized: true });
    await seedMilestones(fx.root, [
      mkMs({ id: 'mil-a', status: 'exported', recommendationIds: ['rec-1', 'rec-2'] }),
    ]);
    await seedRecs(fx.root, [
      mkRec({ id: 'rec-1', status: 'shipped' }),
      mkRec({ id: 'rec-2', status: 'converted' }),
    ]);

    const res = await runMilestoneTransition(fx.root, 'mil-a', 'close');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.warning).toContain('rec-2');
    expect(res.warning).not.toContain('rec-1');

    // close still happened despite the warning
    const led = await readMilestoneLedger(fx.root);
    expect(led.milestones.find((m) => m.id === 'mil-a')!.status).toBe('closed');
  });

  it('AC-4: checks the archived array too (auto-archived shipped recs)', async () => {
    fx = await tempRepo({ initialized: true });
    await seedMilestones(fx.root, [
      mkMs({ id: 'mil-a', status: 'exported', recommendationIds: ['rec-1'] }),
    ]);
    // rec-1 shipped and auto-archived — no longer in the live `recommendations` array
    await seedRecs(fx.root, [], [mkRec({ id: 'rec-1', status: 'shipped' })]);

    const res = await runMilestoneTransition(fx.root, 'mil-a', 'close');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.warning).toBeUndefined();
  });

  it('AC-4: no warning when every member is shipped', async () => {
    fx = await tempRepo({ initialized: true });
    await seedMilestones(fx.root, [
      mkMs({ id: 'mil-a', status: 'exported', recommendationIds: ['rec-1'] }),
    ]);
    await seedRecs(fx.root, [mkRec({ id: 'rec-1', status: 'shipped' })]);

    const res = await runMilestoneTransition(fx.root, 'mil-a', 'close');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.warning).toBeUndefined();
  });

  it('AC-4: best-effort — missing recommendations.json never throws and close still succeeds', async () => {
    fx = await tempRepo({ initialized: true });
    await seedMilestones(fx.root, [
      mkMs({ id: 'mil-a', status: 'exported', recommendationIds: ['rec-1'] }),
    ]);
    // no recommendations.json at all

    const res = await runMilestoneTransition(fx.root, 'mil-a', 'close');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    // rec-1 unresolved -> still surfaced as advisory (never silently dropped)
    expect(res.warning).toContain('rec-1');

    const led = await readMilestoneLedger(fx.root);
    expect(led.milestones.find((m) => m.id === 'mil-a')!.status).toBe('closed');
  });

  it('AC-4: best-effort — corrupt recommendations.json never throws and close still succeeds', async () => {
    fx = await tempRepo({ initialized: true });
    await seedMilestones(fx.root, [
      mkMs({ id: 'mil-a', status: 'exported', recommendationIds: ['rec-1'] }),
    ]);
    const dir = join(fx.root, '.cadence', 'intelligence');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'recommendations.json'), '{ not valid json');

    const res = await runMilestoneTransition(fx.root, 'mil-a', 'close');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    // never throws; degrades to no warning
    expect(res.warning).toBeUndefined();

    const led = await readMilestoneLedger(fx.root);
    expect(led.milestones.find((m) => m.id === 'mil-a')!.status).toBe('closed');
    // the corrupt file itself is left untouched (close never writes recommendations.json)
    const raw = await readFile(join(dir, 'recommendations.json'), 'utf8');
    expect(raw).toBe('{ not valid json');
  });
});
