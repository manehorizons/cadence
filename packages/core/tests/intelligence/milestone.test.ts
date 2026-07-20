import { describe, expect, it, afterEach, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Assumption, IntelligenceMilestone, MilestoneLedger, Recommendation } from '@manehorizons/cadence-types';
import { applyTransition, clusterMilestones, deepenPreMortem, isEligible, seedPreMortem, runProposeMilestones, runMilestoneTransition, runMilestoneExport, runMilestonePreMortem, runMilestoneStatus, markOperatorEntry } from '../../src/intelligence/milestone.js';
import { readMilestoneLedger } from '../../src/intelligence/store/milestones.js';
import { isSameWorktree } from '../../src/git/worktrees.js';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

function mkRec(p: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-x',
    title: 't',
    summary: 's',
    source: 'manual',
    status: 'accepted',
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

describe('isEligible', () => {
  it('accepts accepted + ready-for-milestone/spec + non-rotted', () => {
    expect(isEligible(mkRec())).toBe(true);
    expect(isEligible(mkRec({ readiness: 'ready-for-cadence-spec' }))).toBe(true);
  });
  it('rejects non-accepted status', () => {
    expect(isEligible(mkRec({ status: 'candidate' }))).toBe(false);
    expect(isEligible(mkRec({ status: 'deferred' }))).toBe(false);
  });
  it('rejects non-ready readiness', () => {
    expect(isEligible(mkRec({ readiness: 'raw-idea' }))).toBe(false);
    expect(isEligible(mkRec({ readiness: 'needs-decision' }))).toBe(false);
    expect(isEligible(mkRec({ readiness: 'blocked' }))).toBe(false);
  });
  it('rejects superseded/contradicted decay', () => {
    expect(isEligible(mkRec({ decayState: 'superseded' }))).toBe(false);
    expect(isEligible(mkRec({ decayState: 'contradicted' }))).toBe(false);
    expect(isEligible(mkRec({ decayState: 'stale' }))).toBe(true);
  });
});

describe('seedPreMortem', () => {
  it('all empty when no facts trigger', () => {
    expect(seedPreMortem([mkRec({ id: 'a' })])).toEqual({
      likelyFailureModes: [],
      hiddenDependencies: [],
      driftRisks: [],
      outOfScope: [],
    });
  });

  it('shared file across >=2 recs -> sorted hidden dependency', () => {
    const pm = seedPreMortem([
      mkRec({ id: 'b', affectedFiles: ['src/x.ts'] }),
      mkRec({ id: 'a', affectedFiles: ['src/x.ts'] }),
      mkRec({ id: 'c', affectedFiles: ['src/solo.ts'] }),
    ]);
    expect(pm.hiddenDependencies).toEqual([
      'Shared file src/x.ts edited by a, b — ordering/coordination dependency.',
    ]);
  });

  it('doc surface via area, docs/ path, or DESIGN/README/CHANGELOG -> single drift risk', () => {
    const viaArea = seedPreMortem([mkRec({ affectedAreas: ['docs'] })]);
    const viaPath = seedPreMortem([mkRec({ affectedFiles: ['docs/x.md'] })]);
    const viaName = seedPreMortem([mkRec({ affectedFiles: ['DESIGN.md'] })]);
    for (const pm of [viaArea, viaPath, viaName]) {
      expect(pm.driftRisks).toEqual([
        'Milestone touches documentation surfaces — spec/doc drift risk.',
      ]);
    }
  });

  it('confidence < 0.5 -> failure mode (0.5 boundary excluded), sorted by id', () => {
    const pm = seedPreMortem([
      mkRec({ id: 'b', confidence: 0.2 }),
      mkRec({ id: 'a', confidence: 0.49 }),
      mkRec({ id: 'c', confidence: 0.5 }),
    ]);
    expect(pm.likelyFailureModes).toEqual([
      'Low-confidence input: a (confidence 0.49) — assumption may be wrong.',
      'Low-confidence input: b (confidence 0.20) — assumption may be wrong.',
    ]);
  });

  it('outOfScope is always empty', () => {
    expect(seedPreMortem([mkRec({ affectedAreas: ['docs'] })]).outOfScope).toEqual([]);
  });

  it('byte-stable across the helper extraction (frozen 4a contract)', () => {
    const out = seedPreMortem([
      mkRec({ id: 'b', confidence: 0.2, affectedFiles: ['src/x.ts'] }),
      mkRec({ id: 'a', confidence: 0.49, affectedFiles: ['src/x.ts', 'docs/y.md'] }),
      mkRec({ id: 'c' }),
    ]);
    expect(out).toEqual({
      likelyFailureModes: [
        'Low-confidence input: a (confidence 0.49) — assumption may be wrong.',
        'Low-confidence input: b (confidence 0.20) — assumption may be wrong.',
      ],
      hiddenDependencies: [
        'Shared file src/x.ts edited by a, b — ordering/coordination dependency.',
      ],
      driftRisks: ['Milestone touches documentation surfaces — spec/doc drift risk.'],
      outOfScope: [],
    });
  });
});

function mkA(p: Partial<Assumption> & { recommendationId: string }): Assumption {
  return {
    id: 'a-1',
    text: 't',
    status: 'open',
    createdAt: '2026-05-17T00:00:00.000Z',
    ...p,
  };
}

function mkMilestone(p: Partial<IntelligenceMilestone> & { id: string }): IntelligenceMilestone {
  return {
    name: p.id,
    objective: 'do the thing',
    status: 'accepted',
    recommendationIds: ['rec-1'],
    preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
    exportTargets: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...p,
  };
}

// NOTE: mkRec defaults evidenceIds:[] which trips F-new-4 (overestimated value).
// Goldens NOT testing F-new-4 pass evidenceIds:['e1'] to silence it — do not remove.
describe('deepenPreMortem', () => {
  it('retains the 3 4a rules via shared helpers', () => {
    const m = mkMilestone({ id: 'm', recommendationIds: ['a', 'b'] });
    const out = deepenPreMortem(
      m,
      [
        mkRec({ id: 'a', confidence: 0.3, affectedFiles: ['src/x.ts'] }),
        mkRec({ id: 'b', confidence: 0.9, affectedFiles: ['src/x.ts', 'docs/y.md'] }),
      ],
      [],
    );
    expect(out.hiddenDependencies).toEqual([
      'Shared file src/x.ts edited by a, b — ordering/coordination dependency.',
    ]);
    expect(out.driftRisks).toEqual([
      'Milestone touches documentation surfaces — spec/doc drift risk.',
    ]);
    expect(out.likelyFailureModes).toContain(
      'Low-confidence input: a (confidence 0.30) — assumption may be wrong.',
    );
  });

  it('F-new-1 decay/staleness', () => {
    const out = deepenPreMortem(
      mkMilestone({ id: 'm', recommendationIds: ['a'] }),
      [mkRec({ id: 'a', decayState: 'superseded', evidenceIds: ['e1'] })],
      [],
    );
    expect(out.likelyFailureModes).toEqual([
      'Decayed input: a (superseded) — milestone rests on a recommendation that has drifted since propose.',
    ]);
  });

  it('F-new-2 erosion + missing-member, distinct prefixes', () => {
    const out = deepenPreMortem(
      mkMilestone({ id: 'm', recommendationIds: ['a', 'gone'] }),
      [mkRec({ id: 'a', status: 'rejected', readiness: 'blocked', evidenceIds: ['e1'] })],
      [],
    );
    expect(out.likelyFailureModes).toEqual([
      'Eroded input: a (status rejected, readiness blocked) — no longer cleanly milestone-ready.',
      'Missing input: gone — member recommendation no longer in ledger (scope erosion).',
    ]);
  });

  it('F-new-3 open assumptions counted per member', () => {
    const out = deepenPreMortem(
      mkMilestone({ id: 'm', recommendationIds: ['a'] }),
      [mkRec({ id: 'a', evidenceIds: ['e1'] })],
      [
        mkA({ id: 'a1', recommendationId: 'a', status: 'open' }),
        mkA({ id: 'a2', recommendationId: 'a', status: 'open' }),
        mkA({ id: 'a3', recommendationId: 'a', status: 'validated' }),
      ],
    );
    expect(out.likelyFailureModes).toEqual([
      'Unvalidated assumptions: a rests on 2 open assumption(s).',
    ]);
  });

  it('F-new-4 overestimated value: lev<=3 & risk>=7, OR zero evidence', () => {
    const out = deepenPreMortem(
      mkMilestone({ id: 'm', recommendationIds: ['a', 'b'] }),
      [
        mkRec({ id: 'a', leverageScore: 2, riskScore: 8, evidenceIds: ['e1'], confidence: 0.9 }),
        mkRec({ id: 'b', leverageScore: 9, riskScore: 1, evidenceIds: [], confidence: 0.9 }),
      ],
      [],
    );
    expect(out.likelyFailureModes).toEqual([
      'Overestimated value: a (leverage 2, risk 8, evidence 1) — claimed value may be overstated.',
      'Overestimated value: b (leverage 9, risk 1, evidence 0) — claimed value may be overstated.',
    ]);
  });

  it('F-new-4 boundary: lev<=3 & risk>=7 inclusive; just-outside does not fire', () => {
    const out = deepenPreMortem(
      mkMilestone({ id: 'm', recommendationIds: ['on', 'lev-out', 'risk-out'] }),
      [
        // exact boundary lev=3, risk=7 → fires (<=, >= inclusive)
        mkRec({ id: 'on', leverageScore: 3, riskScore: 7, evidenceIds: ['e1'], confidence: 0.9 }),
        // lev just above threshold (4) → AND branch false; has evidence so OR branch false → no line
        mkRec({ id: 'lev-out', leverageScore: 4, riskScore: 7, evidenceIds: ['e1'], confidence: 0.9 }),
        // risk just below threshold (6) → AND branch false; has evidence → no line
        mkRec({ id: 'risk-out', leverageScore: 3, riskScore: 6, evidenceIds: ['e1'], confidence: 0.9 }),
      ],
      [],
    );
    expect(out.likelyFailureModes).toEqual([
      'Overestimated value: on (leverage 3, risk 7, evidence 1) — claimed value may be overstated.',
    ]);
  });

  it('family-blocked order, each block id-sorted', () => {
    const out = deepenPreMortem(
      mkMilestone({ id: 'm', recommendationIds: ['z', 'y'] }),
      [
        mkRec({ id: 'z', confidence: 0.1, decayState: 'stale', evidenceIds: ['e1'] }),
        mkRec({ id: 'y', confidence: 0.1, decayState: 'stale', evidenceIds: ['e1'] }),
      ],
      [],
    );
    expect(out.likelyFailureModes).toEqual([
      'Low-confidence input: y (confidence 0.10) — assumption may be wrong.',
      'Low-confidence input: z (confidence 0.10) — assumption may be wrong.',
      'Decayed input: y (stale) — milestone rests on a recommendation that has drifted since propose.',
      'Decayed input: z (stale) — milestone rests on a recommendation that has drifted since propose.',
    ]);
  });

  it('drop-stale: a no-longer-true risk disappears on rebuild', () => {
    const m = mkMilestone({ id: 'm', recommendationIds: ['a'] });
    const decayed = deepenPreMortem(m, [mkRec({ id: 'a', decayState: 'stale', confidence: 0.9, evidenceIds: ['e1'] })], []);
    expect(decayed.likelyFailureModes).toHaveLength(1);
    const healed = deepenPreMortem(m, [mkRec({ id: 'a', decayState: 'fresh', confidence: 0.9, evidenceIds: ['e1'] })], []);
    expect(healed.likelyFailureModes).toEqual([]);
  });

  it('outOfScope preserved verbatim, never written', () => {
    const m = mkMilestone({ id: 'm', recommendationIds: ['a'], preMortem: {
      likelyFailureModes: ['stale'], hiddenDependencies: [], driftRisks: [], outOfScope: ['operator boundary'],
    } });
    const out = deepenPreMortem(m, [mkRec({ id: 'a' })], []);
    expect(out.outOfScope).toEqual(['operator boundary']);
  });

  it('operator-marked likelyFailureModes/hiddenDependencies entries survive a refresh alongside fresh derivations', () => {
    const m = mkMilestone({
      id: 'm',
      recommendationIds: ['a'],
      preMortem: {
        likelyFailureModes: [markOperatorEntry('watch out for the vendor API rate limit')],
        hiddenDependencies: [markOperatorEntry('depends on the ops team migration window')],
        driftRisks: [],
        outOfScope: [],
      },
    });
    const out = deepenPreMortem(
      m,
      [mkRec({ id: 'a', decayState: 'stale', evidenceIds: ['e1'] })],
      [],
    );
    expect(out.likelyFailureModes).toEqual([
      'Decayed input: a (stale) — milestone rests on a recommendation that has drifted since propose.',
      markOperatorEntry('watch out for the vendor API rate limit'),
    ]);
    expect(out.hiddenDependencies).toEqual([
      markOperatorEntry('depends on the ops team migration window'),
    ]);
  });

  it('oneLine collapses newlines in interpolated id', () => {
    const out = deepenPreMortem(
      mkMilestone({ id: 'm', recommendationIds: ['a\nb'] }),
      [mkRec({ id: 'a\nb', decayState: 'stale', evidenceIds: ['e1'] })],
      [],
    );
    expect(out.likelyFailureModes[0]).toBe(
      'Decayed input: a b (stale) — milestone rests on a recommendation that has drifted since propose.',
    );
  });

  it('deterministic + input order independent', () => {
    const m = mkMilestone({ id: 'm', recommendationIds: ['a', 'b'] });
    const recsA = [mkRec({ id: 'a', decayState: 'stale' }), mkRec({ id: 'b', decayState: 'stale' })];
    const recsB = [mkRec({ id: 'b', decayState: 'stale' }), mkRec({ id: 'a', decayState: 'stale' })];
    expect(deepenPreMortem(m, recsA, [])).toEqual(deepenPreMortem(m, recsB, []));
  });
});

const NOW = new Date('2026-05-17T12:00:00.000Z');

describe('clusterMilestones', () => {
  it('groups by suggestedMilestoneId and falls back to per-rec singletons', () => {
    const out = clusterMilestones(
      [
        mkRec({ id: 'rec-1', title: 'A', suggestedMilestoneId: 'Auth Work' }),
        mkRec({ id: 'rec-2', title: 'B', suggestedMilestoneId: 'Auth Work' }),
        mkRec({ id: 'rec-3', title: 'Solo', summary: 'lone' }),
      ],
      [],
      NOW,
    );
    const byId = Object.fromEntries(out.map((m) => [m.id, m]));
    expect(Object.keys(byId).sort()).toEqual(['mil-grp-auth-work', 'mil-rec-rec-3']);
    expect(byId['mil-grp-auth-work'].recommendationIds).toEqual(['rec-1', 'rec-2']);
    expect(byId['mil-grp-auth-work'].name).toBe('Auth Work');
    expect(byId['mil-grp-auth-work'].objective).toBe(
      'Deliver 2 recommendation(s): A; B',
    );
    expect(byId['mil-rec-rec-3'].name).toBe('Solo');
    expect(byId['mil-rec-rec-3'].objective).toBe('lone');
    for (const m of out) expect(m.status).toBe('proposed');
  });

  it('filters ineligible recs and excludes empty-sanitized ids to singletons', () => {
    const out = clusterMilestones(
      [
        mkRec({ id: 'ok', suggestedMilestoneId: '   ' }),
        mkRec({ id: 'bad', status: 'candidate', suggestedMilestoneId: 'X' }),
      ],
      [],
      NOW,
    );
    expect(out.map((m) => m.id)).toEqual(['mil-rec-ok']);
  });

  it('refreshes proposed, preserves non-proposed, and excludes their recs', () => {
    const existing: IntelligenceMilestone[] = [
      {
        id: 'mil-grp-keep',
        name: 'keep',
        objective: 'kept',
        status: 'accepted',
        recommendationIds: ['rec-claimed'],
        preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
        exportTargets: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'mil-rec-stale',
        name: 'old proposed',
        objective: 'old',
        status: 'proposed',
        recommendationIds: ['rec-old'],
        preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
        exportTargets: [],
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      },
    ];
    const out = clusterMilestones(
      [
        mkRec({ id: 'rec-claimed', suggestedMilestoneId: 'keep' }),
        mkRec({ id: 'rec-new', title: 'New' }),
      ],
      existing,
      NOW,
    );
    const ids = out.map((m) => m.id).sort();
    expect(ids).toEqual(['mil-grp-keep', 'mil-rec-rec-new']);
    expect(out.find((m) => m.id === 'mil-grp-keep')!.status).toBe('accepted');
    // stale proposed dropped; claimed rec not re-proposed
    expect(out.some((m) => m.id === 'mil-rec-stale')).toBe(false);
  });

  it('carries forward createdAt of a same-id existing proposed milestone', () => {
    const existing: IntelligenceMilestone[] = [
      {
        id: 'mil-rec-rec-1',
        name: 'X',
        objective: 'x',
        status: 'proposed',
        recommendationIds: ['rec-1'],
        preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
        exportTargets: [],
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    ];
    const out = clusterMilestones([mkRec({ id: 'rec-1' })], existing, NOW);
    const m = out[0];
    expect(m.createdAt).toBe('2026-05-10T00:00:00.000Z');
    expect(m.updatedAt).toBe(NOW.toISOString());
  });

  it('is byte-stable for a fixed now on an unchanged ledger', () => {
    const recs = [mkRec({ id: 'rec-1', suggestedMilestoneId: 'g' }), mkRec({ id: 'rec-2' })];
    const a = clusterMilestones(recs, [], NOW);
    const b = clusterMilestones(recs, a, NOW);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('empty input -> empty output', () => {
    expect(clusterMilestones([], [], NOW)).toEqual([]);
  });

  it('does NOT emit a fresh bucket that collides with a non-proposed survivor id', () => {
    const existing: IntelligenceMilestone[] = [
      {
        id: 'mil-grp-auth-work',
        name: 'Auth Work',
        objective: 'kept',
        status: 'accepted',
        recommendationIds: ['rec-old'],
        preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
        exportTargets: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ];
    const out = clusterMilestones(
      [mkRec({ id: 'rec-new', suggestedMilestoneId: 'Auth Work' })],
      existing,
      NOW,
    );
    // exactly one milestone with this id, and it is the untouched accepted survivor
    expect(out.filter((m) => m.id === 'mil-grp-auth-work')).toHaveLength(1);
    const keep = out.find((m) => m.id === 'mil-grp-auth-work')!;
    expect(keep.status).toBe('accepted');
    expect(keep.recommendationIds).toEqual(['rec-old']);
  });

  it('truncates grouped objective to the first 3 titles', () => {
    const out = clusterMilestones(
      [
        mkRec({ id: 'r1', title: 'T1', suggestedMilestoneId: 'g', createdAt: '2026-05-01T00:00:00.000Z' }),
        mkRec({ id: 'r2', title: 'T2', suggestedMilestoneId: 'g', createdAt: '2026-05-02T00:00:00.000Z' }),
        mkRec({ id: 'r3', title: 'T3', suggestedMilestoneId: 'g', createdAt: '2026-05-03T00:00:00.000Z' }),
        mkRec({ id: 'r4', title: 'T4', suggestedMilestoneId: 'g', createdAt: '2026-05-04T00:00:00.000Z' }),
      ],
      [],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.objective).toBe('Deliver 4 recommendation(s): T1; T2; T3');
  });
});

function ledgerOf(...ms: IntelligenceMilestone[]): MilestoneLedger {
  return { schemaVersion: 1, milestones: ms };
}
function mk(id: string, status: IntelligenceMilestone['status']): IntelligenceMilestone {
  return {
    id,
    name: id,
    objective: 'o',
    status,
    recommendationIds: ['rec-1'],
    preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
    exportTargets: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };
}

async function seedRecs(root: string, recs: Recommendation[]): Promise<void> {
  const dir = join(root, '.cadence', 'intelligence');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'recommendations.json'),
    JSON.stringify({ schemaVersion: 1, recommendations: recs }, null, 2),
  );
}

let fx: Fixture | null = null;
afterEach(async () => {
  if (fx) {
    await fx.cleanup();
    fx = null;
  }
});

describe('runProposeMilestones', () => {
  it('clusters eligible recs and writes milestones.json + MILESTONES.md', async () => {
    fx = await tempRepo({ initialized: true });
    await seedRecs(fx.root, [
      mkRec({ id: 'rec-1', title: 'A', suggestedMilestoneId: 'grp' }),
      mkRec({ id: 'rec-2', status: 'candidate' }), // ineligible
    ]);
    const led = await runProposeMilestones(fx.root, new Date('2026-05-17T00:00:00.000Z'));
    expect(led.milestones.map((m) => m.id)).toEqual(['mil-grp-grp']);

    const jsonRaw = await readFile(
      join(fx.root, '.cadence', 'intelligence', 'milestones.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).milestones).toHaveLength(1);
    const md = await readFile(
      join(fx.root, '.cadence', 'intelligence', 'MILESTONES.md'),
      'utf8',
    );
    expect(md).toMatch(/### mil-grp-grp — grp/);
  });

  it('re-propose on an unchanged ledger is byte-identical', async () => {
    fx = await tempRepo({ initialized: true });
    await seedRecs(fx.root, [mkRec({ id: 'rec-1' })]);
    const T = new Date('2026-05-17T00:00:00.000Z');
    await runProposeMilestones(fx.root, T);
    const first = await readFile(
      join(fx.root, '.cadence', 'intelligence', 'milestones.json'),
      'utf8',
    );
    await runProposeMilestones(fx.root, T);
    const second = await readFile(
      join(fx.root, '.cadence', 'intelligence', 'milestones.json'),
      'utf8',
    );
    expect(second).toBe(first);
  });

  it('empty / absent recommendation ledger -> empty milestones, still writes', async () => {
    fx = await tempRepo({ initialized: true });
    const led = await runProposeMilestones(fx.root);
    expect(led.milestones).toEqual([]);
  });
});

describe('runProposeMilestones — accept→re-propose invariant', () => {
  it('re-propose after accept preserves the accepted record and does not re-propose its rec', async () => {
    fx = await tempRepo({ initialized: true });
    await seedRecs(fx.root, [mkRec({ id: 'rec-1', suggestedMilestoneId: 'keep' })]);
    const T = new Date('2026-05-17T00:00:00.000Z');
    await runProposeMilestones(fx.root, T);
    const id = 'mil-grp-keep';

    const acc = await runMilestoneTransition(fx.root, id, 'accept');
    expect(acc.ok).toBe(true);
    const afterAccept = await readMilestoneLedger(fx.root);
    const accepted = afterAccept.milestones.find((m) => m.id === id)!;
    expect(accepted.status).toBe('accepted');
    const acceptedCreatedAt = accepted.createdAt;

    // re-propose with the SAME ledger + a later clock
    await runProposeMilestones(fx.root, new Date('2026-06-01T00:00:00.000Z'));
    const after = await readMilestoneLedger(fx.root);

    // exactly one milestone with this id, still accepted, createdAt unchanged
    const matches = after.milestones.filter((m) => m.id === id);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.status).toBe('accepted');
    expect(matches[0]!.createdAt).toBe(acceptedCreatedAt);
    // its rec was NOT re-proposed as a fresh proposed bucket
    expect(after.milestones.filter((m) => m.status === 'proposed')).toHaveLength(0);
  });
});

describe('runMilestoneTransition', () => {
  it('accept persists; illegal transition returns ok:false and does not write', async () => {
    fx = await tempRepo({ initialized: true });
    await seedRecs(fx.root, [mkRec({ id: 'rec-1' })]);
    await runProposeMilestones(fx.root, new Date('2026-05-17T00:00:00.000Z'));
    const id = 'mil-rec-rec-1';

    const ok = await runMilestoneTransition(fx.root, id, 'accept');
    expect(ok.ok).toBe(true);
    expect((await readMilestoneLedger(fx.root)).milestones[0].status).toBe(
      'accepted',
    );

    const bad = await runMilestoneTransition(fx.root, id, 'accept');
    expect(bad.ok).toBe(false);
    // unchanged on disk
    expect((await readMilestoneLedger(fx.root)).milestones[0].status).toBe(
      'accepted',
    );

    const missing = await runMilestoneTransition(fx.root, 'nope', 'defer');
    expect(missing).toEqual({ ok: false, error: 'milestone nope not found' });
  });
});

describe('applyTransition', () => {
  const T = new Date('2026-05-17T12:00:00.000Z');

  it('accept: proposed -> accepted, bumps updatedAt, leaves others untouched', () => {
    const led = ledgerOf(mk('a', 'proposed'), mk('b', 'deferred'));
    const res = applyTransition(led, 'a', 'accept', T);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    const a = res.ledger.milestones.find((m) => m.id === 'a')!;
    expect(a.status).toBe('accepted');
    expect(a.updatedAt).toBe(T.toISOString());
    expect(res.ledger.milestones.find((m) => m.id === 'b')!.status).toBe('deferred');
    // original ledger not mutated
    expect(led.milestones.find((m) => m.id === 'a')!.status).toBe('proposed');
  });

  it('defer: allowed from proposed and accepted', () => {
    expect(applyTransition(ledgerOf(mk('a', 'proposed')), 'a', 'defer', T).ok).toBe(true);
    expect(applyTransition(ledgerOf(mk('a', 'accepted')), 'a', 'defer', T).ok).toBe(true);
  });

  it('rejects illegal transitions and unknown ids', () => {
    const r1 = applyTransition(ledgerOf(mk('a', 'accepted')), 'a', 'accept', T);
    expect(r1).toEqual({ ok: false, error: 'cannot accept milestone in status accepted' });
    const r2 = applyTransition(ledgerOf(mk('a', 'exported')), 'a', 'defer', T);
    expect(r2).toEqual({ ok: false, error: 'cannot defer milestone in status exported' });
    const r4 = applyTransition(ledgerOf(mk('a', 'closed')), 'a', 'defer', T);
    expect(r4).toEqual({ ok: false, error: 'cannot defer milestone in status closed' });
    const r3 = applyTransition(ledgerOf(mk('a', 'proposed')), 'zzz', 'accept', T);
    expect(r3).toEqual({ ok: false, error: 'milestone zzz not found' });
  });

  it('reopen: deferred -> proposed, bumps updatedAt (AC-1)', () => {
    const led = ledgerOf(mk('a', 'deferred'));
    const res = applyTransition(led, 'a', 'reopen', T);
    expect(res.ok).toBe(true); // AC-1: reopening a deferred milestone succeeds
    if (!res.ok) throw new Error('unreachable');
    const a = res.ledger.milestones.find((m) => m.id === 'a')!;
    expect(a.status).toBe('proposed'); // AC-1: lands in status proposed
    expect(a.updatedAt).toBe(T.toISOString());
    // original ledger not mutated
    expect(led.milestones.find((m) => m.id === 'a')!.status).toBe('deferred');
  });

  it('reopen: refuses from proposed/accepted/exported/closed, naming the current status (AC-2)', () => {
    for (const status of ['proposed', 'accepted', 'exported', 'closed'] as const) {
      const res = applyTransition(ledgerOf(mk('a', status)), 'a', 'reopen', T);
      // AC-2: refusal names the milestone's current status
      expect(res).toEqual({ ok: false, error: `cannot reopen milestone in status ${status}` });
    }
  });

  it('reopen: unknown id refuses (AC-4)', () => {
    const res = applyTransition(ledgerOf(mk('a', 'deferred')), 'zzz', 'reopen', T);
    expect(res).toEqual({ ok: false, error: 'milestone zzz not found' }); // AC-4
  });

  it('reopen: refuses when a recommendationId collides with a live (non-deferred/proposed) survivor milestone, naming both ids', () => {
    const target = mk('mil-dead', 'deferred'); // recommendationIds: ['rec-1']
    const survivor = mk('mil-live', 'accepted'); // recommendationIds: ['rec-1'] — same rec, still claimed
    const led = ledgerOf(target, survivor);
    const res = applyTransition(led, 'mil-dead', 'reopen', T);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.error).toContain('mil-live');
    expect(res.error).toContain('rec-1');
    // unmodified: neither milestone changed
    expect(led.milestones.find((m) => m.id === 'mil-dead')!.status).toBe('deferred');
  });

  it('reopen: does NOT treat another deferred or proposed milestone sharing a recommendationId as a collision', () => {
    const target = mk('mil-dead', 'deferred');
    const otherDeferred = mk('mil-other-dead', 'deferred'); // shares recommendationIds: ['rec-1']
    const otherProposed = mk('mil-other-proposed', 'proposed'); // shares recommendationIds: ['rec-1']
    const led = ledgerOf(target, otherDeferred, otherProposed);
    const res = applyTransition(led, 'mil-dead', 'reopen', T);
    expect(res.ok).toBe(true);
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
function mkMs(p: Partial<IntelligenceMilestone> & { id: string }): IntelligenceMilestone {
  return {
    name: p.id,
    objective: 'do the thing',
    status: 'accepted',
    recommendationIds: ['rec-1'],
    preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
    exportTargets: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...p,
  };
}

describe('runMilestoneExport', () => {
  it('exports an accepted milestone: staged SPEC + exported status + exportTarget', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedRecs(t.root, [mkRec({ id: 'rec-1', title: 'Ship it' })]);
      await seedMilestones(t.root, [mkMs({ id: 'mil-grp-x', name: 'X', recommendationIds: ['rec-1'] })]);

      const res = await runMilestoneExport(t.root, 'mil-grp-x', new Date('2026-05-17T09:00:00.000Z'));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('unreachable');
      expect(res.artifactPath).toBe('.cadence/intelligence/exports/mil-grp-x/SPEC.md');

      const spec = await readFile(join(t.root, res.artifactPath), 'utf8');
      expect(spec).toMatch(/# 00-00 — X/);
      expect(spec).toMatch(/### AC-1: Ship it/);

      const led = await readMilestoneLedger(t.root);
      const m = led.milestones.find((x) => x.id === 'mil-grp-x')!;
      expect(m.status).toBe('exported');
      expect(m.exportTargets).toEqual([
        { backend: 'cadence', artifactPath: '.cadence/intelligence/exports/mil-grp-x/SPEC.md', exportedAt: '2026-05-17T09:00:00.000Z' },
      ]);
      expect(m.updatedAt).toBe('2026-05-17T09:00:00.000Z');
      const md = await readFile(join(t.root, '.cadence', 'intelligence', 'MILESTONES.md'), 'utf8');
      expect(md).toMatch(/## Exported\n\n- mil-grp-x — X → \.cadence\/intelligence\/exports\/mil-grp-x\/SPEC\.md/);
    } finally {
      await t.cleanup();
    }
  });

  it('tolerates an unresolved rec id (AC name = bare id)', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedMilestones(t.root, [mkMs({ id: 'mil-a', recommendationIds: ['rec-missing'] })]);
      const res = await runMilestoneExport(t.root, 'mil-a', new Date('2026-05-17T09:00:00.000Z'));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('unreachable');
      const spec = await readFile(join(t.root, res.artifactPath), 'utf8');
      expect(spec).toMatch(/### AC-1: rec-missing/);
    } finally {
      await t.cleanup();
    }
  });

  it('refuses unknown id and non-accepted status without writing', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedMilestones(t.root, [mkMs({ id: 'mil-p', status: 'proposed' })]);
      const miss = await runMilestoneExport(t.root, 'nope');
      expect(miss).toEqual({ ok: false, error: 'milestone nope not found' });
      const bad = await runMilestoneExport(t.root, 'mil-p');
      expect(bad).toEqual({ ok: false, error: 'cannot export milestone in status proposed' });
      const led = await readMilestoneLedger(t.root);
      expect(led.milestones[0]!.status).toBe('proposed');
      await expect(readFile(join(t.root, '.cadence', 'intelligence', 'exports', 'mil-p', 'SPEC.md'), 'utf8')).rejects.toThrow();
    } finally {
      await t.cleanup();
    }
  });

  it('refuses re-export of an already-exported milestone', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedMilestones(t.root, [mkMs({ id: 'mil-e', status: 'exported' })]);
      const res = await runMilestoneExport(t.root, 'mil-e');
      expect(res).toEqual({ ok: false, error: 'cannot export milestone in status exported' });
    } finally {
      await t.cleanup();
    }
  });
});

describe('runMilestonePreMortem', () => {
  it('refreshes preMortem in-place for an accepted milestone, bumps updatedAt, re-renders MD, preserves outOfScope, leaves others untouched', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedRecs(t.root, [mkRec({ id: 'rec-1', decayState: 'superseded', confidence: 0.9, evidenceIds: ['e1'] })]);
      await seedMilestones(t.root, [
        mkMs({ id: 'mil-a', status: 'accepted', recommendationIds: ['rec-1'],
          preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: ['keep me'] } }),
        mkMs({ id: 'mil-other', status: 'proposed', recommendationIds: ['rec-1'] }),
      ]);
      const res = await runMilestonePreMortem(t.root, 'mil-a', new Date('2026-05-18T09:00:00.000Z'));
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('unreachable');
      const led = await readMilestoneLedger(t.root);
      const m = led.milestones.find((x) => x.id === 'mil-a')!;
      expect(m.preMortem.likelyFailureModes).toEqual([
        'Decayed input: rec-1 (superseded) — milestone rests on a recommendation that has drifted since propose.',
      ]);
      expect(m.preMortem.outOfScope).toEqual(['keep me']);
      expect(m.updatedAt).toBe('2026-05-18T09:00:00.000Z');
      const other = led.milestones.find((x) => x.id === 'mil-other')!;
      expect(other.updatedAt).toBe('2026-05-17T00:00:00.000Z');
      const md = await readFile(join(t.root, '.cadence', 'intelligence', 'MILESTONES.md'), 'utf8');
      expect(md).toMatch(/Decayed input: rec-1 \(superseded\)/);
    } finally {
      await t.cleanup();
    }
  });

  it('works on a proposed milestone', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedRecs(t.root, [mkRec({ id: 'rec-1', confidence: 0.1 })]);
      await seedMilestones(t.root, [mkMs({ id: 'mil-p', status: 'proposed', recommendationIds: ['rec-1'] })]);
      const res = await runMilestonePreMortem(t.root, 'mil-p', new Date('2026-05-18T09:00:00.000Z'));
      expect(res.ok).toBe(true);
      const m = (await readMilestoneLedger(t.root)).milestones[0]!;
      expect(m.preMortem.likelyFailureModes).toContain(
        'Low-confidence input: rec-1 (confidence 0.10) — assumption may be wrong.',
      );
    } finally {
      await t.cleanup();
    }
  });

  it('idempotent: same ledger + same now → identical milestones.json', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedRecs(t.root, [mkRec({ id: 'rec-1', decayState: 'stale', confidence: 0.9 })]);
      await seedMilestones(t.root, [mkMs({ id: 'mil-a', status: 'accepted', recommendationIds: ['rec-1'] })]);
      const NOW = new Date('2026-05-18T09:00:00.000Z');
      await runMilestonePreMortem(t.root, 'mil-a', NOW);
      const first = await readFile(join(t.root, '.cadence', 'intelligence', 'milestones.json'), 'utf8');
      await runMilestonePreMortem(t.root, 'mil-a', NOW);
      const second = await readFile(join(t.root, '.cadence', 'intelligence', 'milestones.json'), 'utf8');
      expect(second).toBe(first);
    } finally {
      await t.cleanup();
    }
  });

  it('refuses unknown id / exported / deferred / closed without writing', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedMilestones(t.root, [
        mkMs({ id: 'mil-e', status: 'exported' }),
        mkMs({ id: 'mil-d', status: 'deferred' }),
        mkMs({ id: 'mil-c', status: 'closed' }),
      ]);
      expect(await runMilestonePreMortem(t.root, 'nope')).toEqual({ ok: false, error: 'milestone nope not found' });
      expect(await runMilestonePreMortem(t.root, 'mil-e')).toEqual({ ok: false, error: 'cannot pre-mortem milestone in status exported' });
      expect(await runMilestonePreMortem(t.root, 'mil-d')).toEqual({ ok: false, error: 'cannot pre-mortem milestone in status deferred' });
      expect(await runMilestonePreMortem(t.root, 'mil-c')).toEqual({ ok: false, error: 'cannot pre-mortem milestone in status closed' });
      const led = await readMilestoneLedger(t.root);
      expect(led.milestones.map((m) => m.updatedAt)).toEqual([
        '2026-05-17T00:00:00.000Z', '2026-05-17T00:00:00.000Z', '2026-05-17T00:00:00.000Z',
      ]);
    } finally {
      await t.cleanup();
    }
  });

  it('tolerates absent rec/assumption ledgers (all members → Missing input)', async () => {
    const t = await tempRepo({ initialized: true });
    try {
      await seedMilestones(t.root, [mkMs({ id: 'mil-a', status: 'accepted', recommendationIds: ['rec-1', 'rec-2'] })]);
      const res = await runMilestonePreMortem(t.root, 'mil-a', new Date('2026-05-18T09:00:00.000Z'));
      expect(res.ok).toBe(true);
      const m = (await readMilestoneLedger(t.root)).milestones[0]!;
      expect(m.preMortem.likelyFailureModes).toEqual([
        'Missing input: rec-1 — member recommendation no longer in ledger (scope erosion).',
        'Missing input: rec-2 — member recommendation no longer in ledger (scope erosion).',
      ]);
    } finally {
      await t.cleanup();
    }
  });
});

describe('runMilestoneStatus — non-worktree branches (AC-2, AC-3)', () => {
  it('unconverted recommendation appears as not-yet-converted rather than being dropped (AC-2)', async () => {
    fx = await tempRepo({ initialized: true });
    await seedRecs(fx.root, [mkRec({ id: 'rec-1' })]); // no convertedToPhaseId
    await seedMilestones(fx.root, [mkMs({ id: 'mil-a', recommendationIds: ['rec-1'] })]);

    const res = await runMilestoneStatus(fx.root, 'mil-a');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    // AC-2: not-yet-converted recs still appear in the output array
    expect(res.phases).toEqual([{ recommendationId: 'rec-1', status: 'not-yet-converted' }]);
  });

  it('converted recommendation with no matching worktree -> no-worktree-found, still appears (AC-2)', async () => {
    fx = await tempRepo({ initialized: true });
    await seedRecs(fx.root, [mkRec({ id: 'rec-1', convertedToPhaseId: 'phase-99' })]);
    await seedMilestones(fx.root, [mkMs({ id: 'mil-a', recommendationIds: ['rec-1'] })]);

    const res = await runMilestoneStatus(fx.root, 'mil-a');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    // AC-2: a converted phase with no matching local/sibling worktree is reported,
    // not silently omitted
    expect(res.phases).toEqual([
      { recommendationId: 'rec-1', phaseId: 'phase-99', status: 'no-worktree-found' },
    ]);
  });

  it('unknown milestone id -> ok:false with a clear "not found" error (AC-2)', async () => {
    fx = await tempRepo({ initialized: true });
    const res = await runMilestoneStatus(fx.root, 'nope');
    // AC-2: cadence milestone status <unknown-id> refuses with a "not found" message
    expect(res).toEqual({ ok: false, error: 'milestone nope not found' });
  });
});

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** Init a git repo with a deterministic `main` branch and an initial commit —
 *  mirrors `packages/core/tests/handoff/candidates.test.ts`'s `initRepo`. */
async function initStatusGitRepo(root: string): Promise<void> {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(root, 'README.md'), '# test\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);
}

/** Writes a minimal but complete `.cadence/state.json` at `root` with the
 *  given live loop position — mirrors candidates.test.ts's `writeState`. */
async function writeStatusState(root: string, loopPosition: string): Promise<void> {
  const dir = join(root, '.cadence');
  await mkdir(dir, { recursive: true });
  const state = {
    schemaVersion: 1,
    project: { name: 'test', createdAt: '2026-01-01T00:00:00.000Z' },
    activePhase: null,
    activeDraft: null,
    activeSpec: null,
    loopPosition,
    tier: null,
    draftReadAt: null,
    openDrafts: [],
    decisions: [],
    deferred: [],
    session: { tokenUtilization: 0, lastHandoff: null, subagentSpawns: 0 },
    skillAudit: { required: [], invoked: [] },
    activeTask: null,
  };
  await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2));
}

/** Writes a `.cadence/handoff/<fileName>.md` doc advertising `activePhase` via
 *  the `active_phase:` frontmatter key that `gatherHandoffCandidates` reads —
 *  mirrors candidates.test.ts's `writeHandoffDoc`. */
async function writeStatusHandoffDoc(
  root: string,
  fileName: string,
  generatedAt: string,
  activePhase: string,
): Promise<void> {
  const dir = join(root, '.cadence', 'handoff');
  await mkdir(dir, { recursive: true });
  const lines = [
    '---',
    'cadence_handoff: 1',
    `generated_at: ${generatedAt}`,
    `active_phase: ${activePhase}`,
    '---',
    '# Session Handoff',
    '',
  ];
  await writeFile(join(dir, fileName), lines.join('\n'));
}

describe('runMilestoneStatus — worktree resolution (AC-1, real git worktree fixtures)', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-mstatus-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
      () => {},
    );
  });

  it("converted rec whose phase's sibling worktree is IDLE -> resolved, settled true (AC-1)", async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-idle-')));
    await initStatusGitRepo(main);

    const sib = join(parent, `sib-idle-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-idle', sib]);
    await writeStatusState(sib, 'IDLE');
    await writeStatusHandoffDoc(
      sib,
      'SESSION-2026-07-01-a.md',
      '2026-07-01T10:00:00.000Z',
      'phase-idle',
    );

    await seedRecs(main, [mkRec({ id: 'rec-1', convertedToPhaseId: 'phase-idle' })]);
    await seedMilestones(main, [mkMs({ id: 'mil-a', recommendationIds: ['rec-1'] })]);

    const res = await runMilestoneStatus(main, 'mil-a');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.phases).toHaveLength(1);
    const entry = res.phases[0]!;
    expect(entry.status).toBe('resolved');
    if (entry.status !== 'resolved') throw new Error('unreachable');
    expect(entry.source).toBe('sibling');
    const sibReal = await realpath(sib);
    // Compare via isSameWorktree, not string equality — git worktree list vs.
    // realpath disagree on separator style on Windows (native git.exe backslashes
    // vs. Node's realpath forward slashes) even for the same directory.
    expect(isSameWorktree(entry.worktreePath, sibReal)).toBe(true);
    expect(entry.worktreeBranch).toBe('feature-idle');
    expect(entry.liveLoopPosition).toBe('IDLE');
    // AC-1: a phase whose worktree reports IDLE is marked settled
    expect(entry.settled).toBe(true);
  });

  it("converted rec whose phase's sibling worktree is BUILD -> resolved, settled false (AC-1)", async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-build-')));
    await initStatusGitRepo(main);

    const sib = join(parent, `sib-build-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-build', sib]);
    await writeStatusState(sib, 'BUILD');
    await writeStatusHandoffDoc(
      sib,
      'SESSION-2026-07-01-a.md',
      '2026-07-01T10:00:00.000Z',
      'phase-build',
    );

    await seedRecs(main, [mkRec({ id: 'rec-1', convertedToPhaseId: 'phase-build' })]);
    await seedMilestones(main, [mkMs({ id: 'mil-a', recommendationIds: ['rec-1'] })]);

    const res = await runMilestoneStatus(main, 'mil-a');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.phases).toHaveLength(1);
    const entry = res.phases[0]!;
    expect(entry.status).toBe('resolved');
    if (entry.status !== 'resolved') throw new Error('unreachable');
    expect(entry.source).toBe('sibling');
    expect(entry.liveLoopPosition).toBe('BUILD');
    // AC-1: a phase whose worktree reports a non-IDLE loop position is not settled
    expect(entry.settled).toBe(false);
  });
});
