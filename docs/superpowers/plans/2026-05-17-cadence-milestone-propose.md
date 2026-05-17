# CADENCE Milestone Propose — Milestone Shaping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cadence milestone propose | accept | defer | list` — a pure, deterministic clusterer that groups eligible recommendation-ledger entries into `IntelligenceMilestone` candidates with a deterministically-seeded scaffolded pre-mortem, persisting `.cadence/intelligence/milestones.json` + a rendered `MILESTONES.md`, plus guarded lifecycle transitions.

**Architecture:** Slice 4a of the Praxis milestone keystone, mirroring the shipped Slice 3 (recommend) layout under `packages/core/src/intelligence/`. New `@cadence/types` schemas (`MilestoneStatusZ`, `MilestonePreMortemZ`, `IntelligenceMilestoneZ`, `MilestoneLedgerZ`, `emptyMilestoneLedger`). One core module `milestone.ts` exporting pure `isEligible` / `seedPreMortem` / `clusterMilestones` / `applyTransition` plus thin IO glue `runProposeMilestones` / `runMilestoneTransition`; a pure renderer `render-milestone.ts`; store IO in `store.ts`; a `cadence milestone` CLI. Strategic-shaping layer only — reads the recommendation ledger read-only, **backend-free** (no `state.json` read/write, no loop transition), writes only `.cadence/intelligence/`.

**Tech Stack:** TypeScript, Zod, Commander, Vitest, existing CADENCE `atomicWriteJSON`/`atomicWriteText`, `@cadence/testkit` `tempRepo`, the shipped `store.ts` ledger reader.

**Spec:** `docs/superpowers/specs/2026-05-17-cadence-milestone-propose-design.md`

---

## Spec elaboration (faithful, not a scope change)

1. **Single module.** The spec lists `milestone.ts` as one module with pure exports plus glue. This plan keeps them in one file (co-located by responsibility, matching the spec and the shipped `recommend.ts` precedent); each task appends one export and grows the shared `milestone.test.ts` with a new `describe` block. `render-milestone.ts` is its own file (matches the spec and the shipped `render-recommend.ts` precedent).

2. **`addRecommendation` cannot reach the eligible state.** The Slice-1 `store.ts` `addRecommendation` always writes `status:'candidate'` with no `suggestedMilestoneId`; eligibility requires `status:'accepted'` + `readiness:'ready-for-*'`. The glue/CLI tests therefore seed `.cadence/intelligence/recommendations.json` **directly** with a Zod-valid `RecommendationLedger` via a small in-test `seedRecs` helper (`mkdir -p` the intelligence dir, `writeFile` the JSON). This is a faithful test-setup choice, not a scope change — no production code writes the recommendation ledger.

3. **`objective` / `name` derivation (deterministic, fixed).** Grouped milestone: `name` = the first bucket rec's raw `suggestedMilestoneId`; `objective` = `Deliver <N> recommendation(s): <first ≤3 titles joined by '; '>`. Singleton: `name` = the rec `title`; `objective` = the rec `summary` (Slice-1 schema guarantees `summary` is `min(1)`, satisfying `objective` `min(1)`).

4. **`createdAt` carry-forward.** On re-propose, a freshly built `proposed` milestone reuses the `createdAt` of an existing `proposed` milestone with the **same id** if one exists, else `now`. Combined with a fixed `now`, this makes `clusterMilestones` byte-stable across runs on an unchanged ledger (the deterministic-diff success criterion).

## File Structure

- Modify: `packages/types/src/intelligence.ts` (append milestone schemas at END)
- Verify: `packages/types/src/index.ts` (already `export * from './intelligence.js'` — no edit expected)
- Test: `packages/types/tests/intelligence.test.ts` (extend — add one `describe`)
- Create: `packages/core/src/intelligence/milestone.ts` (pure `isEligible`/`seedPreMortem`/`clusterMilestones`/`applyTransition` + `runProposeMilestones`/`runMilestoneTransition` glue) — built incrementally over Tasks 2, 3, 4, 6
- Test: `packages/core/tests/intelligence/milestone.test.ts` (grown over Tasks 2, 3, 4, 6)
- Create: `packages/core/src/intelligence/render-milestone.ts` (pure renderer — Task 5, before the glue that consumes it)
- Test: `packages/core/tests/intelligence/render-milestone.test.ts`
- Modify: `packages/core/src/intelligence/store.ts` (append `readMilestoneLedger`/`writeMilestoneLedger` — Task 6)
- Test: `packages/core/tests/intelligence/store.test.ts` (extend — add one `describe`)
- Create: `packages/core/src/cli/commands/milestone.ts`
- Modify: `packages/core/src/cli/register.ts` (+1 import, +1 call)
- Test: `packages/core/tests/cli/milestone.test.ts` (spawned CLI)
- Modify: `docs/reference/commands.md` (drift-marker block + ToC + `### milestone`)
- Modify: `CHANGELOG.md` (Unreleased → Added)

## Storage Contract

- `.cadence/intelligence/milestones.json`
- `.cadence/intelligence/MILESTONES.md`

Reuse `intelligenceDir(root)` from `packages/core/src/intelligence/store.js`. Never `.synth/`. Distinct from CADENCE's own execution-layer `.cadence/MILESTONES.md`.

## Commit Convention

Plan-doc-first (this file is committed before any task code), then per-task `feat`/`docs` commits on `praxis-intelligence-ledger`. Done-bar = full `pnpm turbo run lint typecheck test build` (Task 9).

---

## Task 1: Add milestone types

**Files:**
- Modify: `packages/types/src/intelligence.ts`
- Verify: `packages/types/src/index.ts`
- Test: `packages/types/tests/intelligence.test.ts`

- [ ] **Step 1: Append failing tests** to the END of `packages/types/tests/intelligence.test.ts` (keep existing tests intact; merge the new symbols into the existing `from '../src/intelligence.js'` import line — do not duplicate it):

```ts
// add IntelligenceMilestoneZ, MilestoneLedgerZ, emptyMilestoneLedger
// to the existing intelligence.js import
import {
  IntelligenceMilestoneZ,
  MilestoneLedgerZ,
  emptyMilestoneLedger,
} from '../src/intelligence.js';

describe('intelligence milestone schema', () => {
  const validMilestone = {
    id: 'mil-grp-auth',
    name: 'auth hardening',
    objective: 'Deliver 2 recommendation(s): a; b',
    status: 'proposed' as const,
    recommendationIds: ['rec-1', 'rec-2'],
    preMortem: {
      likelyFailureModes: [],
      hiddenDependencies: [],
      driftRisks: [],
      outOfScope: [],
    },
    exportTargets: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };

  it('accepts a valid milestone', () => {
    const m = IntelligenceMilestoneZ.parse(validMilestone);
    expect(m.status).toBe('proposed');
    expect(m.recommendationIds).toHaveLength(2);
  });

  it('rejects an empty recommendationIds array', () => {
    const r = IntelligenceMilestoneZ.safeParse({
      ...validMilestone,
      recommendationIds: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown status', () => {
    const r = IntelligenceMilestoneZ.safeParse({
      ...validMilestone,
      status: 'nope',
    });
    expect(r.success).toBe(false);
  });

  it('accepts an export target shape', () => {
    const m = IntelligenceMilestoneZ.parse({
      ...validMilestone,
      status: 'exported' as const,
      exportTargets: [
        {
          backend: 'cadence' as const,
          artifactPath: '.cadence/phases/x/00-01-SPEC.md',
          exportedAt: '2026-05-17T01:00:00.000Z',
        },
      ],
    });
    expect(m.exportTargets[0].backend).toBe('cadence');
  });

  it('ledger rejects a wrong schemaVersion; empty helper is valid', () => {
    const bad = MilestoneLedgerZ.safeParse({
      schemaVersion: 2,
      milestones: [],
    });
    expect(bad.success).toBe(false);
    const empty = emptyMilestoneLedger();
    expect(MilestoneLedgerZ.parse(empty)).toEqual({
      schemaVersion: 1,
      milestones: [],
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @cadence/types test -- intelligence`
Expected: FAIL — `IntelligenceMilestoneZ` is not exported.

- [ ] **Step 3: Append schemas** to the END of `packages/types/src/intelligence.ts`:

```ts
export const MilestoneStatusZ = z.enum([
  'proposed',
  'accepted',
  'exported',
  'deferred',
  'closed',
]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusZ>;

export const MilestonePreMortemZ = z.object({
  likelyFailureModes: z.array(z.string()),
  hiddenDependencies: z.array(z.string()),
  driftRisks: z.array(z.string()),
  outOfScope: z.array(z.string()),
});
export type MilestonePreMortem = z.infer<typeof MilestonePreMortemZ>;

export const IntelligenceMilestoneZ = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objective: z.string().min(1),
  status: MilestoneStatusZ,
  recommendationIds: z.array(z.string()).min(1),
  preMortem: MilestonePreMortemZ,
  exportTargets: z.array(
    z.object({
      backend: z.literal('cadence'),
      artifactPath: z.string(),
      exportedAt: z.string().datetime({ offset: true }),
    }),
  ),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type IntelligenceMilestone = z.infer<typeof IntelligenceMilestoneZ>;

export const MilestoneLedgerZ = z.object({
  schemaVersion: z.literal(1),
  milestones: z.array(IntelligenceMilestoneZ),
});
export type MilestoneLedger = z.infer<typeof MilestoneLedgerZ>;

export function emptyMilestoneLedger(): MilestoneLedger {
  return { schemaVersion: 1, milestones: [] };
}
```

- [ ] **Step 4: Verify the index export**

Run: `pnpm exec grep -n "intelligence" packages/types/src/index.ts`
Expected: `export * from './intelligence.js';` already present (from the ledger slice). Edit only if missing.

- [ ] **Step 5: Build types + run tests + typecheck**

Run:
```bash
pnpm --filter @cadence/types build
pnpm --filter @cadence/types test -- intelligence
pnpm --filter @cadence/types typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/intelligence.ts packages/types/tests/intelligence.test.ts
git commit -m "feat(types): add intelligence milestone + ledger schemas"
```
(Include `packages/types/src/index.ts` only if Step 4 required an edit.)

---

## Task 2: `isEligible` + `seedPreMortem` (pure)

**Files:**
- Create: `packages/core/src/intelligence/milestone.ts`
- Test: `packages/core/tests/intelligence/milestone.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/intelligence/milestone.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@cadence/types';
import { isEligible, seedPreMortem } from '../../src/intelligence/milestone.js';

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
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/milestone`
Expected: FAIL — `../../src/intelligence/milestone.js` does not exist.

- [ ] **Step 3: Implement** `packages/core/src/intelligence/milestone.ts` (this initial version exports only `isEligible` + `seedPreMortem`; later tasks append to this file):

```ts
import type {
  MilestonePreMortem,
  Recommendation,
  RecommendationReadiness,
} from '@cadence/types';

const ELIGIBLE_READINESS = new Set<RecommendationReadiness>([
  'ready-for-milestone',
  'ready-for-cadence-spec',
]);

export function isEligible(rec: Recommendation): boolean {
  return (
    rec.status === 'accepted' &&
    ELIGIBLE_READINESS.has(rec.readiness) &&
    rec.decayState !== 'superseded' &&
    rec.decayState !== 'contradicted'
  );
}

const DOC_PATH_RE = /(^|\/)docs\//i;
const DOC_NAME_RE = /(DESIGN|README|CHANGELOG)/i;

export function seedPreMortem(recs: Recommendation[]): MilestonePreMortem {
  const hiddenDependencies: string[] = [];
  const driftRisks: string[] = [];
  const likelyFailureModes: string[] = [];

  // shared file across >=2 recs -> coordination dependency
  const byFile = new Map<string, string[]>();
  for (const r of recs) {
    for (const f of r.affectedFiles) {
      const ids = byFile.get(f);
      if (ids) ids.push(r.id);
      else byFile.set(f, [r.id]);
    }
  }
  for (const f of [...byFile.keys()].sort()) {
    const ids = byFile.get(f)!;
    if (ids.length >= 2) {
      hiddenDependencies.push(
        `Shared file ${f} edited by ${[...ids].sort().join(', ')} — ordering/coordination dependency.`,
      );
    }
  }

  // doc surface touched -> drift risk (single entry)
  const docHit = recs.some(
    (r) =>
      r.affectedAreas.includes('docs') ||
      r.affectedFiles.some((f) => DOC_PATH_RE.test(f) || DOC_NAME_RE.test(f)),
  );
  if (docHit) {
    driftRisks.push(
      'Milestone touches documentation surfaces — spec/doc drift risk.',
    );
  }

  // low-confidence input
  for (const r of recs
    .filter((r) => r.confidence < 0.5)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    likelyFailureModes.push(
      `Low-confidence input: ${r.id} (confidence ${r.confidence.toFixed(2)}) — assumption may be wrong.`,
    );
  }

  return { likelyFailureModes, hiddenDependencies, driftRisks, outOfScope: [] };
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/milestone
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/milestone.ts packages/core/tests/intelligence/milestone.test.ts
git commit -m "feat(core): add milestone eligibility + pre-mortem seeding"
```

---

## Task 3: `clusterMilestones` (pure)

**Files:**
- Modify: `packages/core/src/intelligence/milestone.ts` (append)
- Test: `packages/core/tests/intelligence/milestone.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing test** to `packages/core/tests/intelligence/milestone.test.ts` (extend the `milestone.js` import with `clusterMilestones`; add `import type { IntelligenceMilestone } from '@cadence/types';`; reuse the existing `mkRec` helper):

```ts
// extend imports:
//   import type { IntelligenceMilestone, Recommendation } from '@cadence/types';
//   import { clusterMilestones } from '../../src/intelligence/milestone.js';

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
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/milestone`
Expected: FAIL — `clusterMilestones` is not exported.

- [ ] **Step 3: Append to** `packages/core/src/intelligence/milestone.ts` (add `IntelligenceMilestone` to the top `@cadence/types` import):

```ts
// top-of-file import becomes:
// import type {
//   IntelligenceMilestone,
//   MilestonePreMortem,
//   Recommendation,
//   RecommendationReadiness,
// } from '@cadence/types';

function sanitize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function bySortedId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function clusterMilestones(
  recs: Recommendation[],
  existing: IntelligenceMilestone[],
  now: Date = new Date(),
): IntelligenceMilestone[] {
  const ts = now.toISOString();

  const survivors = existing.filter((m) => m.status !== 'proposed');
  const claimed = new Set<string>();
  for (const m of survivors) {
    for (const id of m.recommendationIds) claimed.add(id);
  }
  const priorProposedCreatedAt = new Map<string, string>();
  for (const m of existing) {
    if (m.status === 'proposed') priorProposedCreatedAt.set(m.id, m.createdAt);
  }

  const pool = recs.filter((r) => isEligible(r) && !claimed.has(r.id));

  // bucket key -> { key, raw suggestedMilestoneId | null, recs }
  type Bucket = { id: string; rawName: string | null; recs: Recommendation[] };
  const buckets = new Map<string, Bucket>();
  for (const r of pool) {
    const sug = r.suggestedMilestoneId ?? '';
    const slug = sanitize(sug);
    const id = slug ? `mil-grp-${slug}` : `mil-rec-${r.id}`;
    const rawName = slug ? sug : null;
    const b = buckets.get(id);
    if (b) b.recs.push(r);
    else buckets.set(id, { id, rawName, recs: [r] });
  }

  const fresh: IntelligenceMilestone[] = [];
  for (const id of [...buckets.keys()].sort()) {
    const b = buckets.get(id)!;
    const sorted = [...b.recs].sort((x, y) =>
      x.createdAt !== y.createdAt
        ? x.createdAt < y.createdAt
          ? -1
          : 1
        : bySortedId(x, y),
    );
    // Each bucket is constructed with >=1 rec, so head is always defined;
    // the non-null assertion is required under `noUncheckedIndexedAccess`
    // (the mirrored recommend.ts guards `[0]` access the same way).
    const head = sorted[0]!;
    const grouped = b.rawName !== null;
    const name = grouped ? b.rawName! : head.title;
    const objective = grouped
      ? `Deliver ${sorted.length} recommendation(s): ${sorted
          .slice(0, 3)
          .map((r) => r.title)
          .join('; ')}`
      : head.summary;
    fresh.push({
      id,
      name,
      objective,
      status: 'proposed',
      recommendationIds: sorted.map((r) => r.id).sort(),
      preMortem: seedPreMortem(sorted),
      exportTargets: [],
      createdAt: priorProposedCreatedAt.get(id) ?? ts,
      updatedAt: ts,
    });
  }

  return [...survivors, ...fresh];
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/milestone
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/milestone.ts packages/core/tests/intelligence/milestone.test.ts
git commit -m "feat(core): add deterministic milestone clustering"
```

---

## Task 4: `applyTransition` (pure)

**Files:**
- Modify: `packages/core/src/intelligence/milestone.ts` (append)
- Test: `packages/core/tests/intelligence/milestone.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing test** (extend the `milestone.js` import with `applyTransition`; add `import type { MilestoneLedger } from '@cadence/types';`):

```ts
// extend imports:
//   import type { IntelligenceMilestone, MilestoneLedger, Recommendation } from '@cadence/types';
//   import { applyTransition } from '../../src/intelligence/milestone.js';

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
    expect(r2.ok).toBe(false);
    const r3 = applyTransition(ledgerOf(mk('a', 'proposed')), 'zzz', 'accept', T);
    expect(r3).toEqual({ ok: false, error: 'milestone zzz not found' });
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/milestone`
Expected: FAIL — `applyTransition` is not exported.

- [ ] **Step 3: Append to** `packages/core/src/intelligence/milestone.ts` (add `MilestoneLedger` to the top `@cadence/types` import):

```ts
export type TransitionAction = 'accept' | 'defer';
export type TransitionResult =
  | { ok: true; ledger: MilestoneLedger }
  | { ok: false; error: string };

export function applyTransition(
  ledger: MilestoneLedger,
  id: string,
  action: TransitionAction,
  now: Date = new Date(),
): TransitionResult {
  const target = ledger.milestones.find((m) => m.id === id);
  if (!target) return { ok: false, error: `milestone ${id} not found` };

  const allowed: Record<TransitionAction, IntelligenceMilestone['status'][]> = {
    accept: ['proposed'],
    defer: ['proposed', 'accepted'],
  };
  if (!allowed[action].includes(target.status)) {
    return {
      ok: false,
      error: `cannot ${action} milestone in status ${target.status}`,
    };
  }

  const nextStatus: IntelligenceMilestone['status'] =
    action === 'accept' ? 'accepted' : 'deferred';
  const ledgerOut: MilestoneLedger = {
    schemaVersion: 1,
    milestones: ledger.milestones.map((m) =>
      m.id === id
        ? { ...m, status: nextStatus, updatedAt: now.toISOString() }
        : m,
    ),
  };
  return { ok: true, ledger: ledgerOut };
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/milestone
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/milestone.ts packages/core/tests/intelligence/milestone.test.ts
git commit -m "feat(core): add guarded milestone transitions"
```

---

## Task 5: `render-milestone.ts` (pure)

The renderer has zero dependency on the synthesizer/glue (it only imports `MilestoneLedger` from `@cadence/types`). It is sequenced before Task 6 so that Task 6's `writeMilestoneLedger`, which imports `renderMilestonesMd`, builds cleanly with no ordering caveat.

**Files:**
- Create: `packages/core/src/intelligence/render-milestone.ts`
- Test: `packages/core/tests/intelligence/render-milestone.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/intelligence/render-milestone.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { IntelligenceMilestone, MilestoneLedger } from '@cadence/types';
import { renderMilestonesMd } from '../../src/intelligence/render-milestone.js';

function mk(p: Partial<IntelligenceMilestone> & { id: string }): IntelligenceMilestone {
  return {
    name: p.id,
    objective: 'do it',
    status: 'proposed',
    recommendationIds: ['rec-1'],
    preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
    exportTargets: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...p,
  };
}
const led = (...m: IntelligenceMilestone[]): MilestoneLedger => ({
  schemaVersion: 1,
  milestones: m,
});

describe('renderMilestonesMd', () => {
  it('renders heading, generated-from note, and all sections with empty literals', () => {
    const md = renderMilestonesMd(led());
    expect(md).toMatch(/^# CADENCE Milestone Candidates/m);
    expect(md).toMatch(/> Generated from `\.cadence\/intelligence\/milestones\.json`\./);
    expect(md).not.toMatch(/Generated at:/);
    for (const s of ['## Proposed', '## Accepted', '## Deferred', '## Exported', '## Closed']) {
      expect(md).toContain(s);
    }
    expect(md.match(/None\./g)?.length).toBe(5);
  });

  it('proposed/accepted get the detail block; pre-mortem placeholders only when empty', () => {
    const md = renderMilestonesMd(
      led(
        mk({
          id: 'mil-grp-a',
          name: 'A',
          status: 'proposed',
          recommendationIds: ['rec-1', 'rec-2'],
          preMortem: {
            likelyFailureModes: ['boom'],
            hiddenDependencies: [],
            driftRisks: [],
            outOfScope: [],
          },
        }),
      ),
    );
    expect(md).toMatch(/### mil-grp-a — A/);
    expect(md).toMatch(/- objective: do it/);
    expect(md).toMatch(/- recommendations: rec-1, rec-2/);
    expect(md).toMatch(/- boom/); // seeded entry rendered
    // a seeded section must NOT also emit its placeholder prompt
    expect(md).not.toMatch(/_\(why might this fail\?\)_/);
    // empty sections show the placeholder prompt
    expect(md).toMatch(/_\(what must already be true\?\)_/);
    expect(md).toMatch(/_\(what docs\/specs will drift\?\)_/);
    expect(md).toMatch(/_\(what is explicitly NOT in this milestone\?\)_/);
  });

  it('deferred/exported/closed render as one-liners, id-sorted', () => {
    const md = renderMilestonesMd(
      led(
        mk({ id: 'mil-b', status: 'deferred' }),
        mk({ id: 'mil-a', status: 'deferred' }),
        mk({
          id: 'mil-x',
          status: 'exported',
          exportTargets: [
            { backend: 'cadence', artifactPath: '.cadence/phases/p/00-01-SPEC.md', exportedAt: '2026-05-17T01:00:00.000Z' },
          ],
        }),
        mk({ id: 'mil-c', status: 'closed' }),
      ),
    );
    const deferred = md.slice(md.indexOf('## Deferred'), md.indexOf('## Exported'));
    expect(deferred.indexOf('mil-a')).toBeLessThan(deferred.indexOf('mil-b'));
    expect(md).toMatch(/- mil-x — mil-x → \.cadence\/phases\/p\/00-01-SPEC\.md/);
    expect(md).toMatch(/## Closed\n\n- mil-c — mil-c/);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/render-milestone`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** `packages/core/src/intelligence/render-milestone.ts`:

```ts
import type {
  IntelligenceMilestone,
  MilestoneLedger,
} from '@cadence/types';

const PROMPTS: Record<keyof IntelligenceMilestone['preMortem'], string> = {
  likelyFailureModes: '_(why might this fail?)_',
  hiddenDependencies: '_(what must already be true?)_',
  driftRisks: '_(what docs/specs will drift?)_',
  outOfScope: '_(what is explicitly NOT in this milestone?)_',
};
const PM_ORDER: Array<[keyof IntelligenceMilestone['preMortem'], string]> = [
  ['likelyFailureModes', 'likely failure modes'],
  ['hiddenDependencies', 'hidden dependencies'],
  ['driftRisks', 'drift risks'],
  ['outOfScope', 'out of scope'],
];

function byId(a: IntelligenceMilestone, b: IntelligenceMilestone): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function detailBlock(m: IntelligenceMilestone, lines: string[]): void {
  lines.push(`### ${m.id} — ${m.name}`);
  lines.push('');
  lines.push(`- objective: ${m.objective}`);
  lines.push(`- status: ${m.status}`);
  lines.push(`- recommendations: ${m.recommendationIds.join(', ')}`);
  lines.push('- pre-mortem:');
  for (const [key, label] of PM_ORDER) {
    lines.push(`  - ${label}:`);
    const entries = m.preMortem[key];
    if (entries.length === 0) {
      lines.push(`    - ${PROMPTS[key]}`);
    } else {
      for (const e of entries) lines.push(`    - ${e}`);
    }
  }
  lines.push('');
}

export function renderMilestonesMd(ledger: MilestoneLedger): string {
  const lines: string[] = [
    '# CADENCE Milestone Candidates',
    '',
    '> Generated from `.cadence/intelligence/milestones.json`.',
    '',
  ];
  const pick = (s: IntelligenceMilestone['status']) =>
    ledger.milestones.filter((m) => m.status === s).sort(byId);

  // detail sections
  for (const [title, status] of [
    ['## Proposed', 'proposed'],
    ['## Accepted', 'accepted'],
  ] as const) {
    lines.push(title, '');
    const ms = pick(status);
    if (ms.length === 0) lines.push('None.', '');
    else for (const m of ms) detailBlock(m, lines);
  }

  // one-liner sections
  lines.push('## Deferred', '');
  const deferred = pick('deferred');
  if (deferred.length === 0) lines.push('None.');
  else for (const m of deferred) lines.push(`- ${m.id} — ${m.name}`);
  lines.push('');

  lines.push('## Exported', '');
  const exported = pick('exported');
  if (exported.length === 0) lines.push('None.');
  else
    for (const m of exported) {
      const paths = m.exportTargets.map((t) => t.artifactPath).join(', ');
      lines.push(`- ${m.id} — ${m.name}${paths ? ` → ${paths}` : ''}`);
    }
  lines.push('');

  lines.push('## Closed', '');
  const closed = pick('closed');
  if (closed.length === 0) lines.push('None.');
  else for (const m of closed) lines.push(`- ${m.id} — ${m.name}`);
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/render-milestone
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/render-milestone.ts packages/core/tests/intelligence/render-milestone.test.ts
git commit -m "feat(core): add milestone candidates renderer"
```

---

## Task 6: store IO + `runProposeMilestones` / `runMilestoneTransition` glue

**Files:**
- Modify: `packages/core/src/intelligence/store.ts` (append milestone IO)
- Modify: `packages/core/src/intelligence/milestone.ts` (append glue)
- Test: `packages/core/tests/intelligence/store.test.ts` (append a `describe`)
- Test: `packages/core/tests/intelligence/milestone.test.ts` (append a `describe`)

`render-milestone.ts` already exists (Task 5), so `store.ts`'s import of `renderMilestonesMd` resolves with no ordering caveat.

- [ ] **Step 1a: Append the failing store test** to `packages/core/tests/intelligence/store.test.ts` (merge the new symbols into the existing `store.js` import — do not duplicate the import line; `tempRepo` is already imported in this file from `@cadence/testkit`. The sample below uses a self-contained per-test `try/finally` cleanup intentionally — do NOT wire it into the file's module-level shared `afterEach`; both styles coexist fine):

```ts
// extend the store.js import: readMilestoneLedger, writeMilestoneLedger
import {
  readMilestoneLedger,
  writeMilestoneLedger,
} from '../../src/intelligence/store.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
```

- [ ] **Step 1b: Append the failing glue test** to `packages/core/tests/intelligence/milestone.test.ts` (extend the `milestone.js` import with `runProposeMilestones, runMilestoneTransition`; add the imports below; reuse `mkRec`):

```ts
// extend imports:
//   import { afterEach } from 'vitest';
//   import { mkdir, readFile, writeFile } from 'node:fs/promises';
//   import { join } from 'node:path';
//   import { tempRepo, type Fixture } from '@cadence/testkit';
//   import { runProposeMilestones, runMilestoneTransition } from '../../src/intelligence/milestone.js';

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
```

(Add `readMilestoneLedger` to the `milestone.test.ts` import from `../../src/intelligence/store.js` for the assertions above.)

- [ ] **Step 2: Run them — verify they fail**

Run:
```bash
pnpm --filter @cadence/core test -- intelligence/store intelligence/milestone
```
Expected: FAIL — `readMilestoneLedger`/`writeMilestoneLedger`/`runProposeMilestones`/`runMilestoneTransition` not exported.

- [ ] **Step 3a: Append milestone IO to** `packages/core/src/intelligence/store.ts`. Merge the new type imports into the existing `@cadence/types` import block; add the `render-milestone.js` import next to the existing `./render.js` import:

```ts
// merge into the existing '@cadence/types' import:
//   MilestoneLedgerZ, emptyMilestoneLedger, type MilestoneLedger
// add near the existing `import { renderRecommendationsMd } from './render.js';`:
import { renderMilestonesMd } from './render-milestone.js';

const MILESTONES_JSON = 'milestones.json';
const MILESTONES_MD = 'MILESTONES.md';

function milestonesPath(root: string): string {
  return join(intelligenceDir(root), MILESTONES_JSON);
}
function milestonesMdPath(root: string): string {
  return join(intelligenceDir(root), MILESTONES_MD);
}

export async function readMilestoneLedger(
  root: string,
): Promise<MilestoneLedger> {
  const path = milestonesPath(root);
  if (!existsSync(path)) return emptyMilestoneLedger();
  const raw = await readFile(path, 'utf8');
  return MilestoneLedgerZ.parse(JSON.parse(raw));
}

export async function writeMilestoneLedger(
  root: string,
  ledger: MilestoneLedger,
): Promise<void> {
  await mkdir(intelligenceDir(root), { recursive: true });
  MilestoneLedgerZ.parse(ledger);
  await atomicWriteJSON(milestonesPath(root), ledger);
  await atomicWriteText(milestonesMdPath(root), renderMilestonesMd(ledger));
}
```

(`readFile`, `mkdir`, `existsSync`, `join`, `atomicWriteJSON`, `atomicWriteText`, `intelligenceDir` are all already imported/defined in `store.ts` from the Slice-1 recommendation IO — reuse them, do not re-import.)

- [ ] **Step 3b: Append the glue to** `packages/core/src/intelligence/milestone.ts`:

```ts
// add to the top of milestone.ts:
import type { MilestoneLedger } from '@cadence/types';
import {
  readMilestoneLedger,
  readRecommendationLedger,
  writeMilestoneLedger,
} from './store.js';

export async function runProposeMilestones(
  root: string,
  now: Date = new Date(),
): Promise<MilestoneLedger> {
  const recs = (await readRecommendationLedger(root)).recommendations;
  const existing = await readMilestoneLedger(root);
  const next: MilestoneLedger = {
    schemaVersion: 1,
    milestones: clusterMilestones(recs, existing.milestones, now),
  };
  await writeMilestoneLedger(root, next);
  return next;
}

export async function runMilestoneTransition(
  root: string,
  id: string,
  action: TransitionAction,
): Promise<TransitionResult> {
  const ledger = await readMilestoneLedger(root);
  const res = applyTransition(ledger, id, action, new Date());
  if (!res.ok) return res;
  await writeMilestoneLedger(root, res.ledger);
  return res;
}
```

(`MilestoneLedger` is already in the top type import from Task 4 — merge, don't duplicate. `readRecommendationLedger` is the existing Slice-1 export in `store.ts`.)

- [ ] **Step 4: Build core + run tests**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/store intelligence/milestone
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/store.ts packages/core/src/intelligence/milestone.ts packages/core/tests/intelligence/store.test.ts packages/core/tests/intelligence/milestone.test.ts
git commit -m "feat(core): add milestone ledger IO + propose/transition glue"
```

---

## Task 7: `cadence milestone` CLI

**Files:**
- Create: `packages/core/src/cli/commands/milestone.ts`
- Modify: `packages/core/src/cli/register.ts`
- Test: `packages/core/tests/cli/milestone.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/cli/milestone.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

async function seedRecs(root: string): Promise<void> {
  const dir = join(root, '.cadence', 'intelligence');
  await mkdir(dir, { recursive: true });
  const rec = {
    id: 'rec-1',
    title: 'ship it',
    summary: 'because',
    source: 'manual',
    status: 'accepted',
    readiness: 'ready-for-milestone',
    priority: 'high',
    leverageScore: 5,
    riskScore: 2,
    confidence: 0.8,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
  await writeFile(
    join(dir, 'recommendations.json'),
    JSON.stringify({ schemaVersion: 1, recommendations: [rec] }, null, 2),
  );
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence milestone', () => {
  it('propose writes artifacts and prints the rendered view', async () => {
    active = await tempRepo({ initialized: true, projectName: 'milestone-cli' });
    await seedRecs(active.root);

    const r = await run(['milestone', 'propose'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/# CADENCE Milestone Candidates/);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'milestones.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).milestones[0].id).toBe('mil-rec-rec-1');
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'MILESTONES.md'),
      'utf8',
    );
    expect(md).toMatch(/### mil-rec-rec-1 — ship it/);
  });

  it('accept then illegal re-accept exits 1; defer works; list --json parses', async () => {
    active = await tempRepo({ initialized: true });
    await seedRecs(active.root);
    await run(['milestone', 'propose'], active.root);

    const ok = await run(['milestone', 'accept', 'mil-rec-rec-1'], active.root);
    expect(ok.code).toBe(0);

    const bad = await run(['milestone', 'accept', 'mil-rec-rec-1'], active.root);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toMatch(/cannot accept milestone in status accepted/);

    const def = await run(['milestone', 'defer', 'mil-rec-rec-1'], active.root);
    expect(def.code).toBe(0);

    const list = await run(['milestone', 'list', '--json'], active.root);
    expect(list.code).toBe(0);
    const parsed = JSON.parse(list.stdout);
    expect(parsed.milestones[0].status).toBe('deferred');
  });

  it('propose degrades cleanly with an empty ledger (exit 0)', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['milestone', 'propose'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/## Proposed/);
    expect(r.stdout).toMatch(/None\./);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- cli/milestone
```
Expected: FAIL — `milestone` is not a registered command.

- [ ] **Step 3: Implement** `packages/core/src/cli/commands/milestone.ts`:

```ts
import type { Command } from 'commander';
import {
  runMilestoneTransition,
  runProposeMilestones,
} from '../../intelligence/milestone.js';
import { readMilestoneLedger } from '../../intelligence/store.js';
import { renderMilestonesMd } from '../../intelligence/render-milestone.js';

export function registerMilestoneCommand(program: Command): void {
  const cmd = program
    .command('milestone')
    .description(
      'Shape recommendations into milestone candidates (read-narrow; never transitions the loop)',
    );

  cmd
    .command('propose')
    .description(
      'Cluster eligible recommendations into proposed milestone candidates',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const ledger = await runProposeMilestones(process.cwd());
        if (opts.json) {
          process.stdout.write(JSON.stringify(ledger) + '\n');
        } else {
          process.stdout.write(renderMilestonesMd(ledger));
        }
      } catch (err) {
        process.stderr.write(
          `milestone propose failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  for (const action of ['accept', 'defer'] as const) {
    cmd
      .command(`${action} <id>`)
      .description(
        action === 'accept'
          ? 'Mark a proposed milestone accepted'
          : 'Defer a proposed or accepted milestone',
      )
      .action(async (id: string) => {
        try {
          const res = await runMilestoneTransition(process.cwd(), id, action);
          if (!res.ok) {
            process.stderr.write(`milestone ${action} refused: ${res.error}\n`);
            process.exitCode = 1;
            return;
          }
          console.log(`milestone ${id} → ${action === 'accept' ? 'accepted' : 'deferred'}`);
        } catch (err) {
          process.stderr.write(
            `milestone ${action} failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      });
  }

  cmd
    .command('list')
    .description('Show the current milestone ledger')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const ledger = await readMilestoneLedger(process.cwd());
        if (opts.json) {
          process.stdout.write(JSON.stringify(ledger) + '\n');
        } else {
          process.stdout.write(renderMilestonesMd(ledger));
        }
      } catch (err) {
        process.stderr.write(
          `milestone list failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
```

- [ ] **Step 4: Register the command** — modify `packages/core/src/cli/register.ts`:

Add the import after `import { registerRecommendCommand } from './commands/recommend.js';`:
```ts
import { registerMilestoneCommand } from './commands/milestone.js';
```
Add the call at the END of `registerAllCommands`, after `registerRecommendCommand(program);`:
```ts
  registerMilestoneCommand(program);
```

- [ ] **Step 5: Build core + run test + typecheck**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- cli/milestone
pnpm --filter @cadence/core typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cli/commands/milestone.ts packages/core/src/cli/register.ts packages/core/tests/cli/milestone.test.ts
git commit -m "feat(core): add cadence milestone command"
```

---

## Task 8: Documentation + drift guard

**Files:**
- Modify: `docs/reference/commands.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add `milestone` to the drift-marker block** in `docs/reference/commands.md` — insert `milestone` as the last line inside the marker block, immediately after `recommend`:

```md
<!-- cadence:commands:start -->
config
init
draft
spec
hook
build
done
block
needs-context
settle
progress
status
recommendation
inspect
recommend
milestone
<!-- cadence:commands:end -->
```

- [ ] **Step 2: Add the ToC entry** — in the `## Table of contents` list under `cadence`, add immediately after the `- [recommend](#recommend)` line:

```md
  - [milestone](#milestone)
```

- [ ] **Step 3: Add the command section** — insert a `### milestone` section immediately after the `### recommend` section's trailing `---` and before `## cadence-host-claude-code`. Match the existing `### recommend` style exactly (plain three-backtick fence for the `Usage:` block — the file does NOT use nested fences):

````md
### milestone

```
Usage: cadence milestone [options] [command]

Shape recommendations into milestone candidates (read-narrow; never transitions the loop)
```

**Subcommands**

| Subcommand | Synopsis |
|---|---|
| `propose [--json]` | Cluster eligible recommendations into proposed milestone candidates |
| `accept <id>` | Mark a proposed milestone accepted |
| `defer <id>` | Defer a proposed or accepted milestone |
| `list [--json]` | Show the current milestone ledger |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis).
`propose` reads the recommendation ledger **read-only** (it is backend-free —
it never reads or writes `state.json` and never transitions the loop),
clusters recommendations that are `accepted` and `ready-for-milestone`/
`ready-for-cadence-spec` (excluding `superseded`/`contradicted`) by their
`suggestedMilestoneId` (each ungrouped rec becomes its own singleton
candidate), and attaches a deterministically-seeded scaffolded pre-mortem
(facts-only: shared-file dependencies, doc-surface drift, low-confidence
inputs — every other pre-mortem entry is left for a human to fill).
Re-running `propose` regenerates only `proposed` records; `accepted`/
`deferred`/`exported`/`closed` milestones and their recommendations are never
clobbered or re-proposed. `accept`/`defer` enforce guarded status
transitions.

Writes:

- `.cadence/intelligence/milestones.json`
- `.cadence/intelligence/MILESTONES.md`

With `--json`, the milestone ledger object is emitted to stdout instead of
the rendered text. Distinct from CADENCE's own execution-layer
`.cadence/MILESTONES.md`. SPEC export (`milestone export --to cadence`) is a
later slice.

**Exit codes** — exits non-zero only on a genuine failure (artifact write
error, or an illegal/unknown-id `accept`/`defer`). An empty/absent
recommendation ledger degrades gracefully and still exits 0.

---
````

(The four-backtick wrapper above is only this plan's mechanism for displaying a snippet that itself contains a fence. Insert the inner content verbatim with a normal three-backtick fence, matching the surrounding `### recommend` section.)

- [ ] **Step 4: Update CHANGELOG** — add to the `## [Unreleased]` → `### Added` list in `CHANGELOG.md`, immediately after the existing `cadence recommend` bullet:

```md
- Added `cadence milestone propose | accept | defer | list`: read-only, backend-free milestone shaping over the recommendation ledger — clusters `accepted` + `ready-for-*` recommendations by `suggestedMilestoneId` (singleton fallback) into proposed milestone candidates with a deterministically-seeded scaffolded pre-mortem; re-propose refreshes only `proposed` records and never clobbers or re-proposes human-decided ones; guarded `accept`/`defer` transitions; writes `.cadence/intelligence/milestones.json` + `MILESTONES.md`.
```

- [ ] **Step 5: Run the drift guard + docs tests**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- docs
```
Expected: PASS — `cli-reference.test.ts` sees `milestone` in both `registerAllCommands` and the marker block.

- [ ] **Step 6: Commit**

```bash
git add docs/reference/commands.md CHANGELOG.md
git commit -m "docs: document cadence milestone"
```

---

## Task 9: Final verification

**Files:** none unless verification reveals a failure.

- [ ] **Step 1: Focused tests**

Run:
```bash
pnpm --filter @cadence/types test -- intelligence
pnpm --filter @cadence/core test -- intelligence cli/milestone docs
```
Expected: PASS.

- [ ] **Step 2: Package checks**

Run:
```bash
pnpm --filter @cadence/types typecheck
pnpm --filter @cadence/core typecheck
pnpm --filter @cadence/core build
```
Expected: PASS.

- [ ] **Step 3: Full repo gate (the real done-bar — mirrors `.githooks/pre-push`)**

Run:
```bash
pnpm turbo run lint typecheck test build
```
Expected: PASS (all tasks; `@cadence/core` + `@cadence/types` test counts increase by the new suites). Per the durable lesson (Phases 35.1/36.1/38.1, Slices 2–3): the done-bar is the full four-task turbo run, not a subset. If it fails outside the touched intelligence/CLI files, capture the failure in the handoff and do not change unrelated code without a separate decision.

- [ ] **Step 4: Confirm git state**

Run:
```bash
git status --short --branch
git log --oneline -14
```
Expected: branch `praxis-intelligence-ledger`; clean tree (only `graphify-out/` untracked is acceptable); the design-doc + plan-doc commits + per-task `feat`/`docs` commits present. Push is user-authorized for this branch but is a separate explicit step after the gate is green — do not push as part of plan execution.

---

## Follow-On (Slice 4b / not in this slice)

- `cadence milestone export --to cadence <id>` — converts an `accepted` milestone into one or more CADENCE-compatible `<id>-SPEC.md` draft artifacts, records `exportTargets`, sets `status:'exported'`, leaving approval/execution to the normal loop (never auto-transitions; never writes `state.json`).
- First `PraxisBackend` write method (`renderSpecDraft` / `exportMilestone`) — extends the Slice-2 read-only interface.
- Open 4b brainstorm question: export cardinality (one SPEC per milestone vs per recommendation) and artifact location (Praxis-owned `.cadence/intelligence/exports/…` staging vs `.cadence/phases/…`).
