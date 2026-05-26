# CADENCE Recommend — Ranked Next-Moves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cadence recommend` — a pure, deterministic ranking synthesizer over the existing recommendation ledger plus read-only CADENCE backend status, persisting `.cadence/intelligence/recommend.json` + a rendered `RECOMMEND.md` and printing a ranked list with a single loop-aware next-action advisory.

**Architecture:** Third Praxis slice, mirroring the shipped inspection slice layout under `packages/core/src/intelligence/`. New `@cadence/types` schemas (`ScoreTermZ`, `RecommendationRankZ`, `RecommendationAdvisoryZ`, `RecommendationReportZ`). One core module `recommend.ts` exporting four pure functions (`scoreRecommendation`, `partitionLedger`, `buildAdvisory`, `synthesizeRecommendation`) plus a thin IO glue `runRecommend`; a pure renderer `render-recommend.ts`; a `cadence recommend` CLI. Strategic layer only — reads the ledger + `cadenceBackend.readStatus` read-only; never writes `state.json`, never transitions the loop, never forces an action.

**Tech Stack:** TypeScript, Zod, Commander, Vitest, existing CADENCE `atomicWriteJSON`/`atomicWriteText`, `@cadence/testkit` `tempRepo`, the shipped `store.ts` ledger reader + `backend/cadence.ts` adapter.

**Spec:** `docs/superpowers/specs/2026-05-17-cadence-recommend-design.md`

---

## Spec elaboration (faithful, not a scope change)

1. **Single module.** The spec's Architecture lists `recommend.ts` as one module with four pure exports plus glue. This plan keeps them in one file (co-located by responsibility, matching the spec); each task appends one export and grows the shared `recommend.test.ts` with a new `describe` block. `render-recommend.ts` is its own file (matches the spec and the shipped `render-inspection.ts` precedent).

2. **Worked-example arithmetic correction.** The spec's illustrative why-line states `… ⇒ raw 32.3 (score 82)`. Under the pinned `Math.round` (round-half-up), the exact normalization of `raw = 32.3` is `round((32.3 − (−23)) / 67 × 100) = round(82.537…) = 83`, not 82. The spec's `82` is an illustrative-arithmetic slip (flagged in spec review as advisory). This plan's tests assert the **exact computed** values (`raw 32.3`, `score 83`). This is a faithful correction of an example, not a scope or formula change — the formula, weights, and `MIN/MAX` bounds are exactly as the spec specifies.

3. **Deterministic rounding of `raw`/term values.** The spec asserts exact `display` and why-line term values in tests. To make rendering and assertions deterministic the implementation rounds `raw` and each `terms[].value` to one decimal via a local `r1(n) = Math.round(n*10)/10`; `display` is the integer `Math.round` of the normalized raw, clamped `[0,100]`. Sorting uses the (rounded) `raw`, tiebreak `createdAt` asc then `id` asc — exactly as the spec states.

4. **`activeSpec` is available.** The Slice-2 `BackendStatusZ` already carries `activeSpec` (nullable optional) and `backend/cadence.ts` already populates it; the advisory's in-flight guard consumes it with no schema change.

## File Structure

- Modify: `packages/types/src/intelligence.ts` (append recommend/report schemas at END)
- Verify: `packages/types/src/index.ts` (already `export * from './intelligence.js'` — no edit expected)
- Test: `packages/types/tests/intelligence.test.ts` (extend — add one `describe`)
- Create: `packages/core/src/intelligence/recommend.ts` (pure score/partition/advisory/synthesize + `runRecommend` glue) — built incrementally over Tasks 2, 3, 4, 6
- Test: `packages/core/tests/intelligence/recommend.test.ts` (grown over Tasks 2, 3, 4, 6)
- Create: `packages/core/src/intelligence/render-recommend.ts` (pure renderer — Task 5, before the synthesizer that consumes it)
- Test: `packages/core/tests/intelligence/render-recommend.test.ts`
- Create: `packages/core/src/cli/commands/recommend.ts`
- Modify: `packages/core/src/cli/register.ts` (+1 import, +1 call)
- Test: `packages/core/tests/cli/recommend.test.ts` (spawned CLI)
- Modify: `docs/reference/commands.md` (drift-marker block + ToC + `### recommend`)
- Modify: `CHANGELOG.md` (Unreleased → Added)

## Storage Contract

- `.cadence/intelligence/recommend.json`
- `.cadence/intelligence/RECOMMEND.md`

Reuse `intelligenceDir(root)` from `packages/core/src/intelligence/store.js`. Never `.synth/`.

## Commit Convention

Plan-doc-first (this file is committed before any task code), then per-task `feat`/`docs` commits on `praxis-intelligence-ledger`. Done-bar = full `pnpm turbo run lint typecheck test build` (Task 9).

---

## Task 1: Add recommend + report types

**Files:**
- Modify: `packages/types/src/intelligence.ts`
- Verify: `packages/types/src/index.ts`
- Test: `packages/types/tests/intelligence.test.ts`

- [ ] **Step 1: Append failing tests** to the END of `packages/types/tests/intelligence.test.ts` (keep existing tests intact; merge the new import into the existing `from '../src/intelligence.js'` import line — do not duplicate it):

```ts
// add RecommendationReportZ to the existing intelligence.js import
import { RecommendationReportZ } from '../src/intelligence.js';

describe('recommendation report schema', () => {
  const validReport = {
    schemaVersion: 1 as const,
    generatedAt: '2026-05-17T00:00:00.000Z',
    ranked: [
      {
        id: 'rec-1',
        title: 'do the thing',
        raw: 32.3,
        score: 83,
        status: 'accepted' as const,
        readiness: 'ready-for-milestone' as const,
        priority: 'high' as const,
        decayState: 'fresh' as const,
        terms: [{ label: 'lev 7', value: 7 }],
      },
    ],
    parked: [
      { id: 'rec-2', title: 'later', status: 'deferred' as const, readiness: 'raw-idea' as const },
    ],
    needsAttention: [
      { id: 'rec-3', title: 'rotten', decayState: 'contradicted' as const },
    ],
    advisory: { kind: 'top-recommendation' as const, primary: 'cadence milestone propose' },
    totals: { total: 3, ranked: 1, parked: 1, needsAttention: 1, excluded: 0 },
  };

  it('accepts a valid report', () => {
    const parsed = RecommendationReportZ.parse(validReport);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.ranked).toHaveLength(1);
  });

  it('rejects a wrong schemaVersion', () => {
    const r = RecommendationReportZ.safeParse({ ...validReport, schemaVersion: 2 });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown advisory kind', () => {
    const r = RecommendationReportZ.safeParse({
      ...validReport,
      advisory: { kind: 'not-a-kind', primary: 'x' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a score out of range', () => {
    const r = RecommendationReportZ.safeParse({
      ...validReport,
      ranked: [{ ...validReport.ranked[0], score: 101 }],
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @cadence/types test -- intelligence`
Expected: FAIL — `RecommendationReportZ` is not exported.

- [ ] **Step 3: Append schemas** to the END of `packages/types/src/intelligence.ts` (these reference `RecommendationStatusZ`/`RecommendationReadinessZ`/`RecommendationPriorityZ`/`RecommendationDecayStateZ` already defined earlier in the same file):

```ts
export const ScoreTermZ = z.object({
  label: z.string().min(1),
  value: z.number(),
});
export type ScoreTerm = z.infer<typeof ScoreTermZ>;

export const RecommendationRankZ = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  raw: z.number(),
  score: z.number().int().min(0).max(100),
  status: RecommendationStatusZ,
  readiness: RecommendationReadinessZ,
  priority: RecommendationPriorityZ,
  decayState: RecommendationDecayStateZ,
  terms: z.array(ScoreTermZ),
  suggestedBackendAction: z.string().optional(),
});
export type RecommendationRank = z.infer<typeof RecommendationRankZ>;

export const RecommendationAdvisoryZ = z.object({
  kind: z.enum(['finish-loop', 'top-recommendation', 'spec-new', 'empty']),
  primary: z.string().min(1),
  secondary: z.string().optional(),
});
export type RecommendationAdvisory = z.infer<typeof RecommendationAdvisoryZ>;

export const RecommendationReportZ = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  ranked: z.array(RecommendationRankZ),
  parked: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      status: RecommendationStatusZ,
      readiness: RecommendationReadinessZ,
    }),
  ),
  needsAttention: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      decayState: RecommendationDecayStateZ,
    }),
  ),
  advisory: RecommendationAdvisoryZ,
  totals: z.object({
    total: z.number().int(),
    ranked: z.number().int(),
    parked: z.number().int(),
    needsAttention: z.number().int(),
    excluded: z.number().int(),
  }),
});
export type RecommendationReport = z.infer<typeof RecommendationReportZ>;
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
git commit -m "feat(types): add recommendation rank + advisory + report schemas"
```
(Include `packages/types/src/index.ts` only if Step 4 required an edit.)

---

## Task 2: `scoreRecommendation` (pure)

**Files:**
- Create: `packages/core/src/intelligence/recommend.ts`
- Test: `packages/core/tests/intelligence/recommend.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/intelligence/recommend.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@cadence/types';
import { scoreRecommendation } from '../../src/intelligence/recommend.js';

function mkRec(p: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-x',
    title: 't',
    summary: 's',
    source: 'manual',
    status: 'candidate',
    readiness: 'raw-idea',
    priority: 'low',
    leverageScore: 0,
    riskScore: 0,
    confidence: 0,
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

describe('scoreRecommendation', () => {
  it('computes the spec worked example exactly (raw 32.3, score 83)', () => {
    const r = scoreRecommendation(
      mkRec({
        leverageScore: 7,
        confidence: 0.8,
        riskScore: 3,
        status: 'accepted',
        readiness: 'ready-for-milestone',
        decayState: 'fresh',
        priority: 'high',
      }),
    );
    expect(r.raw).toBe(32.3);
    expect(r.score).toBe(83);
    expect(r.terms.map((t) => t.label)).toEqual([
      'lev 7',
      'conf 0.80',
      'risk 3',
      'status accepted',
      'ready ready-for-milestone',
      'decay fresh',
      'prio high',
    ]);
    expect(r.terms.find((t) => t.label === 'conf 0.80')?.value).toBe(4.8);
    expect(r.terms.find((t) => t.label === 'risk 3')?.value).toBe(-1.5);
  });

  it('clamps the ranked-universe minimum to 0', () => {
    const r = scoreRecommendation(
      mkRec({
        leverageScore: 0,
        confidence: 0,
        riskScore: 10,
        status: 'candidate',
        readiness: 'blocked',
        decayState: 'stale',
        priority: 'low',
      }),
    );
    expect(r.raw).toBe(-23);
    expect(r.score).toBe(0);
  });

  it('clamps the ranked-universe maximum to 100', () => {
    const r = scoreRecommendation(
      mkRec({
        leverageScore: 10,
        confidence: 1,
        riskScore: 0,
        status: 'accepted',
        readiness: 'ready-for-cadence-spec',
        decayState: 'fresh',
        priority: 'critical',
      }),
    );
    expect(r.raw).toBe(44);
    expect(r.score).toBe(100);
  });

  it('applies each categorical penalty (stale and needs-revalidation sink)', () => {
    const stale = scoreRecommendation(mkRec({ decayState: 'stale' }));
    const fresh = scoreRecommendation(mkRec({ decayState: 'fresh' }));
    expect(fresh.raw - stale.raw).toBe(10); // +4 − (−6)
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/recommend`
Expected: FAIL — `../../src/intelligence/recommend.js` does not exist.

- [ ] **Step 3: Implement** `packages/core/src/intelligence/recommend.ts` (this initial version exports only `scoreRecommendation` + its types; later tasks append to this file):

```ts
import type { Recommendation, ScoreTerm } from '@cadence/types';

const STATUS_PTS: Record<Recommendation['status'], number> = {
  candidate: 0,
  accepted: 6,
  deferred: 0,
  rejected: 0,
  converted: 0,
};
const READINESS_PTS: Record<Recommendation['readiness'], number> = {
  'raw-idea': 0,
  'needs-evidence': 1,
  'needs-decision': 2,
  'ready-for-milestone': 7,
  'ready-for-cadence-spec': 10,
  blocked: -12,
};
const DECAY_PTS: Record<Recommendation['decayState'], number> = {
  fresh: 4,
  aging: 1,
  stale: -6,
  'needs-revalidation': -5,
  superseded: 0,
  contradicted: 0,
};
const PRIORITY_PTS: Record<Recommendation['priority'], number> = {
  low: 0,
  medium: 2,
  high: 5,
  critical: 8,
};
const SCORE_MIN = -23;
const SCORE_MAX = 44;

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type ScoreResult = { raw: number; display: number; terms: ScoreTerm[] };

export function scoreRecommendation(rec: Recommendation): ScoreResult {
  const lev = rec.leverageScore * 1.0;
  const conf = rec.confidence * 10 * 0.6;
  const risk = rec.riskScore * 0.5;
  const statusPts = STATUS_PTS[rec.status];
  const readinessPts = READINESS_PTS[rec.readiness];
  const decayPts = DECAY_PTS[rec.decayState];
  const priorityPts = PRIORITY_PTS[rec.priority];

  const raw = r1(
    lev + conf - risk + statusPts + readinessPts + decayPts + priorityPts,
  );
  const display = Math.max(
    0,
    Math.min(
      100,
      Math.round(((raw - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100),
    ),
  );
  const terms: ScoreTerm[] = [
    { label: `lev ${rec.leverageScore}`, value: r1(lev) },
    { label: `conf ${rec.confidence.toFixed(2)}`, value: r1(conf) },
    { label: `risk ${rec.riskScore}`, value: r1(-risk) },
    { label: `status ${rec.status}`, value: statusPts },
    { label: `ready ${rec.readiness}`, value: readinessPts },
    { label: `decay ${rec.decayState}`, value: decayPts },
    { label: `prio ${rec.priority}`, value: priorityPts },
  ];
  return { raw, display, terms };
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/recommend
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/recommend.ts packages/core/tests/intelligence/recommend.test.ts
git commit -m "feat(core): add deterministic recommendation scorer"
```

---

## Task 3: `partitionLedger` (pure)

**Files:**
- Modify: `packages/core/src/intelligence/recommend.ts` (append)
- Test: `packages/core/tests/intelligence/recommend.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing test** to `packages/core/tests/intelligence/recommend.test.ts` (add to the import from `recommend.js`: `partitionLedger`; reuse the existing `mkRec` helper):

```ts
// extend the recommend.js import: add partitionLedger
import { partitionLedger } from '../../src/intelligence/recommend.js';

describe('partitionLedger', () => {
  it('excludes rejected and converted (count only)', () => {
    const p = partitionLedger([
      mkRec({ id: 'a', status: 'rejected' }),
      mkRec({ id: 'b', status: 'converted' }),
      mkRec({ id: 'c', status: 'candidate' }),
    ]);
    expect(p.excludedCount).toBe(2);
    expect(p.ranked.map((r) => r.id)).toEqual(['c']);
    expect(p.parked).toEqual([]);
    expect(p.needsAttention).toEqual([]);
  });

  it('routes superseded/contradicted to needs-attention, overriding deferred', () => {
    const p = partitionLedger([
      mkRec({ id: 'a', status: 'deferred', decayState: 'contradicted' }),
      mkRec({ id: 'b', status: 'candidate', decayState: 'superseded' }),
    ]);
    expect(p.needsAttention.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(p.parked).toEqual([]);
    expect(p.ranked).toEqual([]);
  });

  it('parks plain deferred and ranks candidate/accepted (stale still ranked)', () => {
    const p = partitionLedger([
      mkRec({ id: 'a', status: 'deferred', decayState: 'fresh' }),
      mkRec({ id: 'b', status: 'candidate', decayState: 'stale' }),
      mkRec({ id: 'c', status: 'accepted', decayState: 'fresh' }),
    ]);
    expect(p.parked.map((r) => r.id)).toEqual(['a']);
    expect(p.ranked.map((r) => r.id).sort()).toEqual(['b', 'c']);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/recommend`
Expected: FAIL — `partitionLedger` is not exported.

- [ ] **Step 3: Append to** `packages/core/src/intelligence/recommend.ts`:

```ts
export type Partition = {
  ranked: Recommendation[];
  parked: Recommendation[];
  needsAttention: Recommendation[];
  excludedCount: number;
};

export function partitionLedger(recs: Recommendation[]): Partition {
  const ranked: Recommendation[] = [];
  const parked: Recommendation[] = [];
  const needsAttention: Recommendation[] = [];
  let excludedCount = 0;
  for (const rec of recs) {
    if (rec.status === 'rejected' || rec.status === 'converted') {
      excludedCount += 1;
    } else if (
      rec.decayState === 'superseded' ||
      rec.decayState === 'contradicted'
    ) {
      needsAttention.push(rec);
    } else if (rec.status === 'deferred') {
      parked.push(rec);
    } else {
      ranked.push(rec);
    }
  }
  return { ranked, parked, needsAttention, excludedCount };
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/recommend
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/recommend.ts packages/core/tests/intelligence/recommend.test.ts
git commit -m "feat(core): add recommendation ledger partition"
```

---

## Task 4: `buildAdvisory` (pure)

**Files:**
- Modify: `packages/core/src/intelligence/recommend.ts` (append)
- Test: `packages/core/tests/intelligence/recommend.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing test** (extend the `recommend.js` import with `buildAdvisory`; add a `BackendStatus` import from `@cadence/types`):

```ts
// extend imports:
//   import type { BackendStatus, Recommendation } from '@cadence/types';
//   import { buildAdvisory } from '../../src/intelligence/recommend.js';

const idleBackend: BackendStatus = {
  present: true,
  kind: 'cadence',
  loopPosition: 'IDLE',
  activePhase: null,
  activeDraft: null,
  activeSpec: null,
  tier: null,
  legalActions: ['cadence draft new <phase> <num> --title=…'],
};

describe('buildAdvisory', () => {
  it('finish-loop when a draft is in flight, surfacing the legal action + secondary', () => {
    const a = buildAdvisory(
      mkRec({ suggestedBackendAction: 'cadence milestone propose' }),
      {
        ...idleBackend,
        loopPosition: 'DRAFT',
        activeDraft: 'p-1-01',
        legalActions: ['cadence build task T1'],
      },
      { needsAttention: 0 },
    );
    expect(a.kind).toBe('finish-loop');
    expect(a.primary).toMatch(/cadence build task T1/);
    expect(a.secondary).toBe('cadence milestone propose');
  });

  it('an inconsistent loop (DRAFT, no active draft) is treated as not-in-flight', () => {
    const a = buildAdvisory(
      mkRec({ readiness: 'ready-for-milestone' }),
      { ...idleBackend, loopPosition: 'DRAFT', activeDraft: null },
      { needsAttention: 0 },
    );
    expect(a.kind).not.toBe('finish-loop');
    expect(a.kind).toBe('top-recommendation');
  });

  it('spec-new when the top item is ready for a CADENCE spec', () => {
    const a = buildAdvisory(
      mkRec({ readiness: 'ready-for-cadence-spec' }),
      idleBackend,
      { needsAttention: 0 },
    );
    expect(a).toEqual({ kind: 'spec-new', primary: 'cadence spec new' });
  });

  it('top-recommendation falls back to the default action when none suggested', () => {
    const a = buildAdvisory(
      mkRec({ readiness: 'ready-for-milestone', suggestedBackendAction: undefined }),
      idleBackend,
      { needsAttention: 0 },
    );
    expect(a).toEqual({ kind: 'top-recommendation', primary: 'cadence milestone propose' });
  });

  it('empty when no ranked items, noting needs-attention count', () => {
    const a = buildAdvisory(null, idleBackend, { needsAttention: 2 });
    expect(a.kind).toBe('empty');
    expect(a.primary).toMatch(/cadence recommendation add/);
    expect(a.primary).toMatch(/2 recommendation\(s\) need revalidation/);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/recommend`
Expected: FAIL — `buildAdvisory` is not exported.

- [ ] **Step 3: Append to** `packages/core/src/intelligence/recommend.ts` (add `BackendStatus`, `RecommendationAdvisory` to the top `@cadence/types` import):

```ts
// top of file import becomes:
// import type {
//   BackendStatus,
//   Recommendation,
//   RecommendationAdvisory,
//   ScoreTerm,
// } from '@cadence/types';

function resolvedAction(rec: Recommendation): string {
  return rec.suggestedBackendAction ?? 'cadence milestone propose';
}

export function buildAdvisory(
  topRanked: Recommendation | null,
  backend: BackendStatus,
  counts: { needsAttention: number },
): RecommendationAdvisory {
  const inFlight =
    backend.present === true &&
    backend.loopPosition !== undefined &&
    backend.loopPosition !== 'IDLE' &&
    (Boolean(backend.activeDraft) || Boolean(backend.activeSpec));

  if (inFlight) {
    const legal = backend.legalActions[0];
    const advisory: RecommendationAdvisory = {
      kind: 'finish-loop',
      primary: `Finish in-flight CADENCE loop work first${
        legal ? ` — ${legal}` : ''
      }.`,
    };
    if (topRanked) advisory.secondary = resolvedAction(topRanked);
    return advisory;
  }

  if (topRanked) {
    if (topRanked.readiness === 'ready-for-cadence-spec') {
      return { kind: 'spec-new', primary: 'cadence spec new' };
    }
    return { kind: 'top-recommendation', primary: resolvedAction(topRanked) };
  }

  let primary =
    'No actionable recommendations — add one with `cadence recommendation add`.';
  if (counts.needsAttention > 0) {
    primary += ` ${counts.needsAttention} recommendation(s) need revalidation (\`cadence inspect\`).`;
  }
  return { kind: 'empty', primary };
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/recommend
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/recommend.ts packages/core/tests/intelligence/recommend.test.ts
git commit -m "feat(core): add loop-aware recommendation advisory"
```

---

## Task 5: `render-recommend.ts` (pure)

The renderer has zero dependency on the synthesizer (it only imports `RecommendationReport` from `@cadence/types`). It is sequenced before Task 6 so that Task 6's `runRecommend`, which imports `renderRecommendMd`, builds cleanly with no ordering caveat.

**Files:**
- Create: `packages/core/src/intelligence/render-recommend.ts`
- Test: `packages/core/tests/intelligence/render-recommend.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/intelligence/render-recommend.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RecommendationReport } from '@cadence/types';
import { renderRecommendMd } from '../../src/intelligence/render-recommend.js';

const base: RecommendationReport = {
  schemaVersion: 1,
  generatedAt: '2026-05-17T00:00:00.000Z',
  ranked: [
    {
      id: 'rec-a',
      title: 'ship the thing',
      raw: 32.3,
      score: 83,
      status: 'accepted',
      readiness: 'ready-for-milestone',
      priority: 'high',
      decayState: 'fresh',
      terms: [
        { label: 'lev 7', value: 7 },
        { label: 'risk 3', value: -1.5 },
      ],
      suggestedBackendAction: 'cadence milestone propose',
    },
  ],
  parked: [
    { id: 'rec-p', title: 'later idea', status: 'deferred', readiness: 'raw-idea' },
  ],
  needsAttention: [
    { id: 'rec-r', title: 'rotten one', decayState: 'contradicted' },
  ],
  advisory: { kind: 'top-recommendation', primary: 'cadence milestone propose' },
  totals: { total: 3, ranked: 1, parked: 1, needsAttention: 1, excluded: 0 },
};

describe('renderRecommendMd', () => {
  it('renders heading, advisory, ranked rows with why-line, parked, needs-attention, totals', () => {
    const md = renderRecommendMd(base);
    expect(md).toMatch(/^# CADENCE Recommended Next Moves/m);
    expect(md).toMatch(/## Advisory/);
    expect(md).toMatch(/- cadence milestone propose/);
    expect(md).toMatch(/### rec-a — ship the thing/);
    expect(md).toMatch(/score: 83\/100 \(raw 32\.3\)/);
    expect(md).toMatch(/why: lev 7 \+7 · risk 3 -1\.5 ⇒ raw 32\.3 \(score 83\)/);
    expect(md).toMatch(/## Parked \(deferred\)/);
    expect(md).toMatch(/rec-p — later idea \(deferred, raw-idea\)/);
    expect(md).toMatch(/## Needs attention/);
    expect(md).toMatch(/rec-r — rotten one \(contradicted\)/);
    expect(md).toMatch(/total 3 · ranked 1 · parked 1 · needs-attention 1 · excluded 0/);
  });

  it('renders the empty-ledger shape', () => {
    const md = renderRecommendMd({
      ...base,
      ranked: [],
      parked: [],
      needsAttention: [],
      advisory: { kind: 'empty', primary: 'No actionable recommendations — add one with `cadence recommendation add`.' },
      totals: { total: 0, ranked: 0, parked: 0, needsAttention: 0, excluded: 0 },
    });
    expect(md).toMatch(/No actionable recommendations\./);
    expect(md).toMatch(/## Ranked/);
    expect(md).toMatch(/None\./);
  });

  it('renders the finish-loop advisory secondary', () => {
    const md = renderRecommendMd({
      ...base,
      advisory: {
        kind: 'finish-loop',
        primary: 'Finish in-flight CADENCE loop work first — cadence build task T1.',
        secondary: 'cadence milestone propose',
      },
    });
    expect(md).toMatch(/Finish in-flight CADENCE loop work first/);
    expect(md).toMatch(/then: cadence milestone propose/);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/render-recommend`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** `packages/core/src/intelligence/render-recommend.ts`:

```ts
import type { RecommendationReport } from '@cadence/types';

export function renderRecommendMd(report: RecommendationReport): string {
  const lines: string[] = [
    '# CADENCE Recommended Next Moves',
    '',
    '> Generated from `.cadence/intelligence/recommend.json`.',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    '## Advisory',
    '',
    `- ${report.advisory.primary}`,
  ];
  if (report.advisory.secondary) {
    lines.push(`- then: ${report.advisory.secondary}`);
  }
  lines.push('');

  lines.push('## Ranked', '');
  if (report.ranked.length === 0) {
    lines.push('No actionable recommendations.');
  } else {
    for (const r of report.ranked) {
      lines.push(`### ${r.id} — ${r.title}`);
      lines.push('');
      lines.push(`- score: ${r.score}/100 (raw ${r.raw})`);
      lines.push(
        `- status: ${r.status} · ready: ${r.readiness} · priority: ${r.priority} · decay: ${r.decayState}`,
      );
      const why = r.terms
        .map((t) => `${t.label} ${t.value >= 0 ? '+' : ''}${t.value}`)
        .join(' · ');
      lines.push(`- why: ${why} ⇒ raw ${r.raw} (score ${r.score})`);
      if (r.suggestedBackendAction) {
        lines.push(`- next: ${r.suggestedBackendAction}`);
      }
      lines.push('');
    }
  }

  lines.push('## Parked (deferred)', '');
  if (report.parked.length === 0) {
    lines.push('None.');
  } else {
    for (const p of report.parked) {
      lines.push(`- ${p.id} — ${p.title} (${p.status}, ${p.readiness})`);
    }
  }
  lines.push('');

  lines.push('## Needs attention (superseded / contradicted)', '');
  if (report.needsAttention.length === 0) {
    lines.push('None.');
  } else {
    for (const n of report.needsAttention) {
      lines.push(`- ${n.id} — ${n.title} (${n.decayState})`);
    }
  }
  lines.push('');

  lines.push('## Totals', '');
  lines.push(
    `- total ${report.totals.total} · ranked ${report.totals.ranked} · parked ${report.totals.parked} · needs-attention ${report.totals.needsAttention} · excluded ${report.totals.excluded}`,
  );
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/render-recommend
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/render-recommend.ts packages/core/tests/intelligence/render-recommend.test.ts
git commit -m "feat(core): add recommendation report renderer"
```

---

## Task 6: `synthesizeRecommendation` + `runRecommend` glue

**Files:**
- Modify: `packages/core/src/intelligence/recommend.ts` (append)
- Test: `packages/core/tests/intelligence/recommend.test.ts` (append a `describe`)

`render-recommend.ts` already exists (Task 5), so `runRecommend`'s import of `renderRecommendMd` resolves with no ordering caveat.

- [ ] **Step 1: Append the failing test** (extend the `recommend.js` import with `synthesizeRecommendation, runRecommend`; add `tempRepo`, `readFile`, `join`, `addRecommendation`):

```ts
// extend imports:
//   import { afterEach } from 'vitest';
//   import { readFile } from 'node:fs/promises';
//   import { join } from 'node:path';
//   import { tempRepo, type Fixture } from '@cadence/testkit';
//   import { addRecommendation } from '../../src/intelligence/store.js';
//   import { synthesizeRecommendation, runRecommend } from '../../src/intelligence/recommend.js';

describe('synthesizeRecommendation', () => {
  it('ranks by raw desc, tiebreak createdAt then id; assembles totals', () => {
    const recs = [
      mkRec({ id: 'low', leverageScore: 1, status: 'candidate', readiness: 'raw-idea' }),
      mkRec({ id: 'hi', leverageScore: 9, status: 'accepted', readiness: 'ready-for-milestone' }),
      mkRec({ id: 'rej', status: 'rejected' }),
      mkRec({ id: 'def', status: 'deferred', decayState: 'fresh' }),
      mkRec({ id: 'rot', status: 'candidate', decayState: 'contradicted' }),
    ];
    const report = synthesizeRecommendation(recs, idleBackend, new Date('2026-05-17T00:00:00.000Z'));
    expect(report.schemaVersion).toBe(1);
    expect(report.ranked.map((r) => r.id)).toEqual(['hi', 'low']);
    expect(report.parked.map((r) => r.id)).toEqual(['def']);
    expect(report.needsAttention.map((r) => r.id)).toEqual(['rot']);
    expect(report.totals).toEqual({
      total: 5, ranked: 2, parked: 1, needsAttention: 1, excluded: 1,
    });
    expect(report.advisory.kind).toBe('top-recommendation');
  });

  it('stable tiebreak: equal raw → createdAt asc then id asc', () => {
    const a = mkRec({ id: 'b', createdAt: '2026-05-17T00:00:00.000Z' });
    const b = mkRec({ id: 'a', createdAt: '2026-05-17T00:00:00.000Z' });
    const c = mkRec({ id: 'z', createdAt: '2026-05-16T00:00:00.000Z' });
    const report = synthesizeRecommendation([a, b, c], idleBackend, new Date());
    expect(report.ranked.map((r) => r.id)).toEqual(['z', 'a', 'b']);
  });
});

let activeRec: Fixture | null = null;
afterEach(async () => {
  if (activeRec) {
    await activeRec.cleanup();
    activeRec = null;
  }
});

describe('runRecommend', () => {
  it('writes recommend.json + RECOMMEND.md and returns the report', async () => {
    activeRec = await tempRepo({ initialized: true, projectName: 'recommend-fix' });
    await addRecommendation(activeRec.root, {
      title: 'ship the thing',
      summary: 'because',
      priority: 'high',
      readiness: 'ready-for-milestone',
      affectedAreas: [],
      affectedFiles: [],
    });

    const report = await runRecommend(activeRec.root);
    expect(report.schemaVersion).toBe(1);
    expect(report.ranked).toHaveLength(1);

    const jsonRaw = await readFile(
      join(activeRec.root, '.cadence', 'intelligence', 'recommend.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);

    const md = await readFile(
      join(activeRec.root, '.cadence', 'intelligence', 'RECOMMEND.md'),
      'utf8',
    );
    expect(md).toMatch(/# CADENCE Recommended Next Moves/);
  });

  it('degrades cleanly on an empty ledger', async () => {
    activeRec = await tempRepo({ initialized: true });
    const report = await runRecommend(activeRec.root);
    expect(report.ranked).toEqual([]);
    expect(report.advisory.kind).toBe('empty');
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cadence/core test -- intelligence/recommend`
Expected: FAIL — `synthesizeRecommendation`/`runRecommend` not exported.

- [ ] **Step 3: Append to** `packages/core/src/intelligence/recommend.ts` (add the remaining imports at the top of the file; `render-recommend.ts` already exists from Task 5):

```ts
// add to the top of recommend.ts:
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  RecommendationReportZ,
  type RecommendationRank,
  type RecommendationReport,
} from '@cadence/types';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { intelligenceDir, readRecommendationLedger } from './store.js';
import { cadenceBackend } from './backend/cadence.js';
import { renderRecommendMd } from './render-recommend.js';

export function synthesizeRecommendation(
  recs: Recommendation[],
  backend: BackendStatus,
  now: Date = new Date(),
): RecommendationReport {
  const { ranked, parked, needsAttention, excludedCount } =
    partitionLedger(recs);

  const scored = ranked
    .map((rec) => ({ rec, ...scoreRecommendation(rec) }))
    .sort((a, b) => {
      if (b.raw !== a.raw) return b.raw - a.raw;
      if (a.rec.createdAt !== b.rec.createdAt) {
        return a.rec.createdAt < b.rec.createdAt ? -1 : 1;
      }
      return a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0;
    });

  const rankedOut: RecommendationRank[] = scored.map((s) => {
    const rank: RecommendationRank = {
      id: s.rec.id,
      title: s.rec.title,
      raw: s.raw,
      score: s.display,
      status: s.rec.status,
      readiness: s.rec.readiness,
      priority: s.rec.priority,
      decayState: s.rec.decayState,
      terms: s.terms,
    };
    if (s.rec.suggestedBackendAction) {
      rank.suggestedBackendAction = s.rec.suggestedBackendAction;
    }
    return rank;
  });

  const [first] = scored;
  const advisory = buildAdvisory(first ? first.rec : null, backend, {
    needsAttention: needsAttention.length,
  });

  return RecommendationReportZ.parse({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    ranked: rankedOut,
    parked: parked.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      readiness: r.readiness,
    })),
    needsAttention: needsAttention.map((r) => ({
      id: r.id,
      title: r.title,
      decayState: r.decayState,
    })),
    advisory,
    totals: {
      total: recs.length,
      ranked: rankedOut.length,
      parked: parked.length,
      needsAttention: needsAttention.length,
      excluded: excludedCount,
    },
  });
}

export async function runRecommend(
  root: string,
  now: Date = new Date(),
): Promise<RecommendationReport> {
  const ledger = await readRecommendationLedger(root);
  const backend = await cadenceBackend.readStatus(root);
  const report = synthesizeRecommendation(ledger.recommendations, backend, now);

  const dir = intelligenceDir(root);
  await mkdir(dir, { recursive: true });
  await atomicWriteJSON(join(dir, 'recommend.json'), report);
  await atomicWriteText(join(dir, 'RECOMMEND.md'), renderRecommendMd(report));
  return report;
}
```

- [ ] **Step 4: Build core + run test**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence/recommend
```
Expected: PASS (requires Task 6's `render-recommend.ts` to exist — see executor instruction).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/recommend.ts packages/core/tests/intelligence/recommend.test.ts
git commit -m "feat(core): add recommendation synthesizer + runRecommend glue"
```

---

## Task 7: `cadence recommend` CLI

**Files:**
- Create: `packages/core/src/cli/commands/recommend.ts`
- Modify: `packages/core/src/cli/register.ts`
- Test: `packages/core/tests/cli/recommend.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/tests/cli/recommend.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence recommend', () => {
  it('writes artifacts and prints the ranked view', async () => {
    active = await tempRepo({ initialized: true, projectName: 'recommend-cli' });

    const r = await run(['recommend'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/# CADENCE Recommended Next Moves/);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'recommend.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMEND.md'),
      'utf8',
    );
    expect(md).toMatch(/## Advisory/);
  });

  it('--json emits parseable JSON to stdout', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['recommend', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(Array.isArray(parsed.ranked)).toBe(true);
  });

  it('degrades cleanly with no .cadence backend', async () => {
    active = await tempRepo({ initialized: false });
    const r = await run(['recommend'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/No actionable recommendations\./);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- cli/recommend
```
Expected: FAIL — `recommend` is not a registered command.

- [ ] **Step 3: Implement** `packages/core/src/cli/commands/recommend.ts`:

```ts
import type { Command } from 'commander';
import { runRecommend } from '../../intelligence/recommend.js';
import { renderRecommendMd } from '../../intelligence/render-recommend.js';

export function registerRecommendCommand(program: Command): void {
  program
    .command('recommend')
    .description(
      'Rank actionable strategic recommendations and advise the next move (read-only)',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const report = await runRecommend(process.cwd());
        if (opts.json) {
          process.stdout.write(JSON.stringify(report) + '\n');
        } else {
          process.stdout.write(renderRecommendMd(report));
        }
      } catch (err) {
        process.stderr.write(
          `recommend failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
```

- [ ] **Step 4: Register the command** — modify `packages/core/src/cli/register.ts`:

Add the import after `import { registerInspectCommand } from './commands/inspect.js';`:
```ts
import { registerRecommendCommand } from './commands/recommend.js';
```
Add the call at the END of `registerAllCommands`, after `registerInspectCommand(program);`:
```ts
  registerRecommendCommand(program);
```

- [ ] **Step 5: Build core + run test + typecheck**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- cli/recommend
pnpm --filter @cadence/core typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cli/commands/recommend.ts packages/core/src/cli/register.ts packages/core/tests/cli/recommend.test.ts
git commit -m "feat(core): add cadence recommend command"
```

---

## Task 8: Documentation + drift guard

**Files:**
- Modify: `docs/reference/commands.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add `recommend` to the drift-marker block** in `docs/reference/commands.md` — insert `recommend` as the last line inside the marker block, immediately after `inspect`:

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
<!-- cadence:commands:end -->
```

- [ ] **Step 2: Add the ToC entry** — in the `## Table of contents` list, add under `cadence` immediately after the `- [inspect](#inspect)` line:

```md
  - [recommend](#recommend)
```

- [ ] **Step 3: Add the command section** — insert a `### recommend` section immediately after the `### inspect` section's trailing `---` and before `## cadence-host-claude-code`. Match the existing `### inspect` / `### status` style exactly (a plain three-backtick fence for the `Usage:` block — the file does NOT use nested fences):

````md
### recommend

```
Usage: cadence recommend [options]

Rank actionable strategic recommendations and advise the next move (read-only)
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `-h, --help` | Display help for command |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis).
Reads the recommendation ledger and CADENCE loop state **read-only** (never
mutates `state.json` or transitions the loop), then: partitions the ledger
(rejected/converted excluded; superseded/contradicted surfaced as
needs-attention; deferred parked; candidate/accepted ranked), scores each
ranked recommendation with a transparent additive 0–100 model whose every
term is shown in a per-item why-line, and derives one loop-aware next-action
advisory (a loop in flight yields a finish-first advisory; otherwise the top
recommendation's action, or `cadence spec new` when it is ready for a CADENCE
spec).

Writes:

- `.cadence/intelligence/recommend.json`
- `.cadence/intelligence/RECOMMEND.md`

With `--json`, the report object is emitted to stdout instead of the
rendered text. The advisory only ever names already-legal commands as text;
it never executes or forces a loop transition. Distinct from `cadence
status`/`progress` (execution loop) and `cadence inspect` (strategic status).

**Exit codes** — exits non-zero only on a genuine failure (e.g. artifact
write error). An empty ledger, a missing git repo, or a missing `.cadence/`
backend degrades gracefully and still exits 0.

---
````

(The four-backtick wrapper above is only this plan's mechanism for displaying a snippet that itself contains a fence. Insert the inner content verbatim with a normal ```` ``` ```` fence, matching the surrounding `### inspect` section.)

- [ ] **Step 4: Update CHANGELOG** — add to the `## [Unreleased]` → `### Added` list in `CHANGELOG.md`, immediately after the existing `cadence inspect` bullet:

```md
- Added `cadence recommend`: read-only ranked next-moves over the recommendation ledger — a transparent additive 0–100 score (leverage/confidence/risk + status/readiness/decay/priority adjustments, every term shown in a per-item why-line), ledger partition (rejected/converted excluded, superseded/contradicted surfaced as needs-attention, deferred parked, candidate/accepted ranked), and one loop-aware next-action advisory; writes `.cadence/intelligence/recommend.json` + `RECOMMEND.md`.
```

- [ ] **Step 5: Run the drift guard + docs tests**

Run:
```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- docs
```
Expected: PASS — `cli-reference.test.ts` sees `recommend` in both `registerAllCommands` and the marker block.

- [ ] **Step 6: Commit**

```bash
git add docs/reference/commands.md CHANGELOG.md
git commit -m "docs: document cadence recommend"
```

---

## Task 9: Final verification

**Files:** none unless verification reveals a failure.

- [ ] **Step 1: Focused tests**

Run:
```bash
pnpm --filter @cadence/types test -- intelligence
pnpm --filter @cadence/core test -- intelligence cli/recommend docs
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
Expected: PASS (all tasks; `@cadence/core` test count increases by the new suites). Per the durable lesson (Phases 35.1/36.1/38.1): the done-bar is the full four-task turbo run, not a subset. If it fails outside the touched intelligence/CLI files, capture the failure in the handoff and do not change unrelated code without a separate decision.

- [ ] **Step 4: Confirm git state**

Run:
```bash
git status --short --branch
git log --oneline -12
```
Expected: branch `praxis-intelligence-ledger`; clean tree (only `graphify-out/` untracked is acceptable); the plan-doc commit + per-task `feat`/`docs` commits present. Push is user-authorized for this branch but is a separate explicit step after the gate is green — do not push as part of plan execution.

---

## Follow-On (not in this slice)

- `cadence milestone propose` / `cadence milestone export --to cadence` (SPEC-export slice).
- Context packets; milestone pre-mortems.
- `cadence analyze code` evidence-backed recommendation intake.
- Folding live recent-activity/telemetry signals into ranking (only with a concrete, low-false-positive signal).
