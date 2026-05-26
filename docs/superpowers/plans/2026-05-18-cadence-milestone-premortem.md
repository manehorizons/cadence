# CADENCE Milestone Pre-Mortem — First-Class Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cadence milestone premortem <id> [--json]` — recompute a deepened, deterministic pre-mortem for one `proposed`/`accepted` milestone against the current recommendation/assumption ledgers and write it back in-place; never touches loop state.

**Architecture:** Slice 6, mirroring the shipped slices. Extract the two reusable rules out of Slice-4a `seedPreMortem` into shared helpers (4a behavior frozen, byte-stability asserted). Add a pure superset `deepenPreMortem` (the 3 retained rules + 4 new deterministic families, `outOfScope` passed through). Thin IO glue `runMilestonePreMortem` in `intelligence/milestone.ts` (read milestone+rec+assumption ledgers → assert state ∈ {proposed,accepted} → `deepenPreMortem` → write back via `writeMilestoneLedger`, which auto re-renders `MILESTONES.md`). A 6th subcommand on the existing `cadence milestone` parent. No `@cadence/types` schema change; no new renderer; no new top-level command; no LLM; backend-free.

**Tech Stack:** TypeScript, Zod, Commander, Vitest, existing `store.ts` ledger IO (`readMilestoneLedger`/`writeMilestoneLedger`/`readRecommendationLedger`/`readAssumptionLedger`), `@cadence/testkit` `tempRepo`.

**Spec:** `docs/superpowers/specs/2026-05-18-cadence-milestone-premortem-design.md`

---

## Spec elaboration (faithful, not a scope change)

1. **No schema task.** `MilestonePreMortemZ` already has the 4 fields; `IntelligenceMilestoneZ` already has `preMortem` + `updatedAt`. The overestimated-value finding is folded into `likelyFailureModes` (Decision 6 — same pattern as 4a's low-confidence fold). No `@cadence/types` edit; no Task for it.
2. **`seedPreMortem` behavior is frozen.** Task 1 extracts `sharedFileDeps`/`docDriftRisk` and rewires `seedPreMortem` through them; its returned object stays byte-identical (the existing 4a `describe('seedPreMortem')` tests stay green unchanged + a new explicit byte-stability assertion). `clusterMilestones`'s `seedPreMortem(sorted)` call at the propose site is untouched.
3. **`likelyFailureModes` ordering is family-blocked, each block id-sorted.** Fixed family order: low-confidence → decayed → eroded → unvalidated-assumptions → overestimated-value → missing-member. Each block is the id-sorted members matching that family (4a precedent: 4a's `likelyFailureModes` is exactly the low-confidence block, sorted by id). This is deterministic and keeps each family's lines contiguous and independently assertable.
4. **`now` is unused by the pure function.** `deepenPreMortem`'s rules are clock-free (`decayState` is read off the rec, never recomputed from a time window). `now` is accepted only for signature symmetry with sibling glue and is the glue-side `updatedAt` source. Name it `_now` in the pure fn to satisfy `no-unused-vars`.
5. **Backend-free.** `milestone.ts` already imports `cadenceBackend` (for 4b). Slice 6 adds no backend call — `deepenPreMortem`/`runMilestonePreMortem` never touch `cadenceBackend`, `state/simple`, or `progress`. No new import cycle (only `./store.js` gains the already-exported `readAssumptionLedger`).
6. **`premortem` is a subcommand, not a top-level command.** It extends `registerMilestoneCommand`; `register.ts` is untouched. The Phase 31.1 drift guard (`packages/core/tests/docs/cli-reference.test.ts`) set-compares **top-level** `program.commands` vs the `commands.md` marker block, so a subcommand does not trip it (verify in Task 5; update the human-readable `### milestone` subcommand list regardless for doc-truth).
7. **`mkRec` default is an F-new-4 landmine — neutralize it in every exact-`toEqual` golden.** The existing `mkRec` helper defaults `evidenceIds: []`. F-new-4 fires on `(lev<=3 & risk>=7) OR evidenceIds.length === 0`, so a **default `mkRec` unconditionally emits an `Overestimated value:` line**. Any golden that asserts `likelyFailureModes` with whole-array `toEqual` and is NOT testing F-new-4 MUST pass `evidenceIds: ['e1']` (and keep scores non-triggering — default `leverageScore:0/riskScore:0` does not trip the lev/risk branch since `risk 0 < 7`, so `evidenceIds:['e1']` alone silences F-new-4). The F-new-4 dedicated test deliberately leaves it firing. `toContain`/field-scoped/no-rec assertions are immune. This rule is pre-applied in the Task 2/3 fixtures below — preserve it.
8. **New `mkMilestone` test helper (not reuse of `mkMs`).** The `deepenPreMortem` describe is inserted near the top of the file (after `seedPreMortem`, ~line 102), *before* the existing `mkMs` is declared (~line 428). A local `mkMilestone` is therefore introduced for Task 2; Task 3 reuses the file's existing `mkMs`/`seedRecs`/`seedMilestones` (declared by then).

## File Structure

- Modify: `packages/core/src/intelligence/milestone.ts` — add `sharedFileDeps`/`docDriftRisk` helpers, rewire `seedPreMortem`, add `deepenPreMortem`, `PreMortemResult`, `runMilestonePreMortem`, value/type imports.
- Test: `packages/core/tests/intelligence/milestone.test.ts` — extend: 4a byte-stability; `deepenPreMortem` goldens; `runMilestonePreMortem` integration.
- Modify: `packages/core/src/cli/commands/milestone.ts` — add `premortem <id>` subcommand + import.
- Test: `packages/core/tests/cli/milestone.test.ts` — extend: spawned-CLI `premortem`.
- Modify: `docs/reference/commands.md` — `### milestone` Subcommands list + behavior sentence.
- Modify: the user-docs CLI page that lists `milestone` subcommands (locate under `docs/`; same file the 4b export slice updated).
- Modify: `CHANGELOG.md` — Unreleased → Added.
- Modify: `docs/superpowers/specs/2026-05-17-cadence-milestone-export-design.md` (Follow-On line) and the Slice-5 context-packets design Follow-On — drop the now-fulfilled "milestone pre-mortems as a first-class command" forward-ref (durable gotcha (e)).

## Storage Contract

Milestone ledger update via the existing `writeMilestoneLedger` (Zod + atomic JSON + `MILESTONES.md` re-render). Never `.cadence/phases/`, never `state.json`/`STATE.md`, never `.synth/`. Reads `recommendations.json`/`assumptions.json` read-only (both empty-if-absent).

## Commit Convention

Plan-doc-first: this file is committed (`docs: implementation plan — CADENCE Milestone Pre-Mortem (Praxis Slice 6)`) before any task code. Then per-task commits on `praxis-intelligence-ledger`: Task 1 = `refactor(core): extract shared pre-mortem helpers (Slice 6)`; Task 2 = `feat(core): add pure deepenPreMortem (Slice 6)`; Task 3 = `feat(core): add runMilestonePreMortem IO glue (Slice 6)`; Task 4 = `feat(core): add cadence milestone premortem command (Slice 6)`; Task 5 = `docs: document milestone premortem + reconcile forward-refs (Slice 6)` then `test:`/gate. Done-bar = full `pnpm turbo run lint typecheck test build` (Task 5) — full, not a subset (durable lesson: a subset check let a lint regression through). Push is user-authorised; PR #9 stays DRAFT, not merged to `main`.

---

## Task 1: Extract shared pre-mortem helpers, freeze `seedPreMortem` behavior

**Files:**
- Modify: `packages/core/src/intelligence/milestone.ts` (around lines 35–80)
- Test: `packages/core/tests/intelligence/milestone.test.ts` (extend the existing `describe('seedPreMortem')`)

- [ ] **Step 1: Add a byte-stability test** to `packages/core/tests/intelligence/milestone.test.ts`, appended inside the existing `describe('seedPreMortem', () => { … })` block (the file already imports `seedPreMortem`, `mkRec`):

```ts
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
```

- [ ] **Step 2: Run it to confirm it passes against the CURRENT `seedPreMortem`** (this pins the contract before refactor):

Run: `pnpm --filter @cadence/core test -- milestone.test.ts -t "byte-stable across the helper extraction"`
Expected: PASS (the test encodes current behavior).

- [ ] **Step 3: Extract the helpers and rewire `seedPreMortem`.** In `packages/core/src/intelligence/milestone.ts`, immediately after the `DOC_PATH_RE`/`DOC_NAME_RE` consts (line ~33), add:

```ts
function sharedFileDeps(recs: ReadonlyArray<Recommendation>): string[] {
  const byFile = new Map<string, string[]>();
  for (const r of recs) {
    for (const f of r.affectedFiles) {
      const ids = byFile.get(f);
      if (ids) ids.push(r.id);
      else byFile.set(f, [r.id]);
    }
  }
  const out: string[] = [];
  for (const f of [...byFile.keys()].sort()) {
    const ids = byFile.get(f)!;
    if (ids.length >= 2) {
      out.push(
        `Shared file ${f} edited by ${[...ids].sort().join(', ')} — ordering/coordination dependency.`,
      );
    }
  }
  return out;
}

function docDriftRisk(recs: ReadonlyArray<Recommendation>): string[] {
  const docHit = recs.some(
    (r) =>
      r.affectedAreas.includes('docs') ||
      r.affectedFiles.some((f) => DOC_PATH_RE.test(f) || DOC_NAME_RE.test(f)),
  );
  return docHit
    ? ['Milestone touches documentation surfaces — spec/doc drift risk.']
    : [];
}
```

Then replace the entire body of `seedPreMortem` (lines ~35–80) with:

```ts
export function seedPreMortem(recs: Recommendation[]): MilestonePreMortem {
  const likelyFailureModes: string[] = [];
  for (const r of recs
    .filter((r) => r.confidence < 0.5)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    likelyFailureModes.push(
      `Low-confidence input: ${r.id} (confidence ${r.confidence.toFixed(2)}) — assumption may be wrong.`,
    );
  }
  return {
    likelyFailureModes,
    hiddenDependencies: sharedFileDeps(recs),
    driftRisks: docDriftRisk(recs),
    outOfScope: [],
  };
}
```

- [ ] **Step 4: Run the full `seedPreMortem` describe to verify byte-stability** (all pre-existing 4a cases + the new one):

Run: `pnpm --filter @cadence/core test -- milestone.test.ts -t "seedPreMortem"`
Expected: PASS (all cases, including `clusterMilestones` tests downstream are unaffected — run the file: `pnpm --filter @cadence/core test -- milestone.test.ts` → PASS).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/milestone.ts packages/core/tests/intelligence/milestone.test.ts
git commit -m "refactor(core): extract shared pre-mortem helpers (Slice 6)"
```

---

## Task 2: Pure `deepenPreMortem`

**Files:**
- Modify: `packages/core/src/intelligence/milestone.ts`
- Test: `packages/core/tests/intelligence/milestone.test.ts`

- [ ] **Step 1: Write the failing tests.** Append to `packages/core/tests/intelligence/milestone.test.ts` a new top-level `describe` (after the `seedPreMortem` block). Extend the existing type import line (line 4) to add `Assumption`, and the milestone import line (line 5) to add `deepenPreMortem`. Add an `mkA` assumption helper near `mkRec`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cadence/core test -- milestone.test.ts -t "deepenPreMortem"`
Expected: FAIL (`deepenPreMortem is not exported` / not a function).

- [ ] **Step 3: Implement `deepenPreMortem`.** In `packages/core/src/intelligence/milestone.ts`: extend the `@cadence/types` type import to add `Assumption`, `RecommendationDecayState`, `RecommendationStatus` (alongside the existing `IntelligenceMilestone, MilestoneLedger, MilestonePreMortem, Recommendation, RecommendationReadiness`). Then add, immediately after `seedPreMortem`:

```ts
const LEV_LOW = 3;
const RISK_HIGH = 7;

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, ' ').trim();
const byIdAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const DECAYED_STATES = new Set<RecommendationDecayState>([
  'superseded',
  'contradicted',
  'stale',
  'needs-revalidation',
]);
const ERODED_STATUS = new Set<RecommendationStatus>(['rejected', 'deferred']);
const ERODED_READINESS = new Set<RecommendationReadiness>([
  'blocked',
  'needs-evidence',
  'needs-decision',
]);

export function deepenPreMortem(
  milestone: IntelligenceMilestone,
  recs: ReadonlyArray<Recommendation>,
  assumptions: ReadonlyArray<Assumption>,
  _now: Date = new Date(),
): MilestonePreMortem {
  const byId = new Map(recs.map((r) => [r.id, r]));
  const members: Recommendation[] = [];
  const missingIds: string[] = [];
  for (const rid of milestone.recommendationIds) {
    const r = byId.get(rid);
    if (r) members.push(r);
    else missingIds.push(rid);
  }
  const sorted = [...members].sort((a, b) => byIdAsc(a.id, b.id));

  const openByRec = new Map<string, number>();
  for (const a of assumptions) {
    if (a.status === 'open') {
      openByRec.set(a.recommendationId, (openByRec.get(a.recommendationId) ?? 0) + 1);
    }
  }

  const lowConf = sorted
    .filter((r) => r.confidence < 0.5)
    .map(
      (r) =>
        `Low-confidence input: ${oneLine(r.id)} (confidence ${r.confidence.toFixed(2)}) — assumption may be wrong.`,
    );
  const decayed = sorted
    .filter((r) => DECAYED_STATES.has(r.decayState))
    .map(
      (r) =>
        `Decayed input: ${oneLine(r.id)} (${r.decayState}) — milestone rests on a recommendation that has drifted since propose.`,
    );
  const eroded = sorted
    .filter((r) => ERODED_STATUS.has(r.status) || ERODED_READINESS.has(r.readiness))
    .map(
      (r) =>
        `Eroded input: ${oneLine(r.id)} (status ${r.status}, readiness ${r.readiness}) — no longer cleanly milestone-ready.`,
    );
  const unvalidated = sorted
    .filter((r) => (openByRec.get(r.id) ?? 0) > 0)
    .map(
      (r) =>
        `Unvalidated assumptions: ${oneLine(r.id)} rests on ${openByRec.get(r.id) ?? 0} open assumption(s).`,
    );
  const overestimated = sorted
    .filter(
      (r) =>
        (r.leverageScore <= LEV_LOW && r.riskScore >= RISK_HIGH) ||
        r.evidenceIds.length === 0,
    )
    .map(
      (r) =>
        `Overestimated value: ${oneLine(r.id)} (leverage ${String(r.leverageScore)}, risk ${String(r.riskScore)}, evidence ${String(r.evidenceIds.length)}) — claimed value may be overstated.`,
    );
  const missing = [...missingIds]
    .sort(byIdAsc)
    .map(
      (rid) =>
        `Missing input: ${oneLine(rid)} — member recommendation no longer in ledger (scope erosion).`,
    );

  return {
    likelyFailureModes: [
      ...lowConf,
      ...decayed,
      ...eroded,
      ...unvalidated,
      ...overestimated,
      ...missing,
    ],
    hiddenDependencies: sharedFileDeps(members),
    driftRisks: docDriftRisk(members),
    outOfScope: milestone.preMortem.outOfScope,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @cadence/core test -- milestone.test.ts -t "deepenPreMortem"`
Expected: PASS (all `deepenPreMortem` cases). Also re-run `-t "seedPreMortem"` → still PASS (helpers shared, unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/milestone.ts packages/core/tests/intelligence/milestone.test.ts
git commit -m "feat(core): add pure deepenPreMortem (Slice 6)"
```

---

## Task 3: IO glue `runMilestonePreMortem`

**Files:**
- Modify: `packages/core/src/intelligence/milestone.ts` (append after `runMilestoneExport`)
- Test: `packages/core/tests/intelligence/milestone.test.ts` (extend; reuse the file's existing `seedRecs`, `seedMilestones`, `mkMs`, `tempRepo`)

- [ ] **Step 1: Write the failing integration tests.** Append a new `describe` to `packages/core/tests/intelligence/milestone.test.ts`. Extend the milestone import (line 5) to add `runMilestonePreMortem`. (Helpers `seedRecs(root, recs)`, `seedMilestones(root, ms)`, `mkMs({id})`, `mkRec`, `tempRepo` already exist in the file.)

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cadence/core test -- milestone.test.ts -t "runMilestonePreMortem"`
Expected: FAIL (`runMilestonePreMortem is not exported`).

- [ ] **Step 3: Implement the glue.** In `packages/core/src/intelligence/milestone.ts`: add `readAssumptionLedger` to the existing `./store.js` import (joining `readMilestoneLedger, readRecommendationLedger, writeMilestoneLedger`). Append after `runMilestoneExport`:

```ts
export type PreMortemResult =
  | { ok: true; ledger: MilestoneLedger }
  | { ok: false; error: string };

export async function runMilestonePreMortem(
  root: string,
  id: string,
  now: Date = new Date(),
): Promise<PreMortemResult> {
  const ledger = await readMilestoneLedger(root);
  const target = ledger.milestones.find((m) => m.id === id);
  if (!target) return { ok: false, error: `milestone ${id} not found` };
  if (target.status !== 'proposed' && target.status !== 'accepted') {
    return {
      ok: false,
      error: `cannot pre-mortem milestone in status ${target.status}`,
    };
  }

  const recs = (await readRecommendationLedger(root)).recommendations;
  const assumptions = (await readAssumptionLedger(root)).assumptions;
  const preMortem = deepenPreMortem(target, recs, assumptions, now);

  const ts = now.toISOString();
  const next: MilestoneLedger = {
    schemaVersion: 1,
    milestones: ledger.milestones.map((m) =>
      m.id === id ? { ...m, preMortem, updatedAt: ts } : m,
    ),
  };
  await writeMilestoneLedger(root, next);
  return { ok: true, ledger: next };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @cadence/core test -- milestone.test.ts`
Expected: PASS (whole file — `runMilestonePreMortem` + all prior describes still green).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/intelligence/milestone.ts packages/core/tests/intelligence/milestone.test.ts
git commit -m "feat(core): add runMilestonePreMortem IO glue (Slice 6)"
```

---

## Task 4: CLI `cadence milestone premortem <id> [--json]`

**Files:**
- Modify: `packages/core/src/cli/commands/milestone.ts`
- Test: `packages/core/tests/cli/milestone.test.ts` (extend; reuse the file's existing `run`, `seedRecs`, `tempRepo`)

- [ ] **Step 1: Write the failing spawned-CLI tests.** Append inside the existing `describe('cadence milestone', …)` in `packages/core/tests/cli/milestone.test.ts`. (`run(args, cwd)`, `seedRecs(root)` [seeds a single `rec-1`], `tempRepo`, the `active` Fixture afterEach all already exist. To seed a milestone the file uses `cadence milestone propose` then `accept`; mirror the existing `export --to cadence` test's setup which is just above this one at line ~143.)

```ts
  it('premortem refreshes an accepted milestone and --json emits the ledger', async () => {
    const t = await tempRepo({ initialized: true });
    active = t;
    await seedRecs(t.root); // rec-1, accepted, ready-for-milestone
    expect((await run(['milestone', 'propose'], t.root)).code).toBe(0);
    // the singleton bucket id is deterministic: mil-rec-rec-1
    expect((await run(['milestone', 'accept', 'mil-rec-rec-1'], t.root)).code).toBe(0);

    const j = await run(['milestone', 'premortem', 'mil-rec-rec-1', '--json'], t.root);
    expect(j.code).toBe(0);
    const ledger = JSON.parse(j.stdout);
    expect(ledger.schemaVersion).toBe(1);
    const m = ledger.milestones.find((x: { id: string }) => x.id === 'mil-rec-rec-1');
    expect(m.preMortem).toBeDefined();

    const plain = await run(['milestone', 'premortem', 'mil-rec-rec-1'], t.root);
    expect(plain.code).toBe(0);
    expect(plain.stdout).toContain('milestone mil-rec-rec-1 → pre-mortem refreshed');
  });

  it('premortem refuses an unknown id and a non-proposed/accepted status (exit 1, stderr)', async () => {
    const t = await tempRepo({ initialized: true });
    active = t;
    const miss = await run(['milestone', 'premortem', 'nope'], t.root);
    expect(miss.code).toBe(1);
    expect(miss.stderr).toContain('milestone premortem refused: milestone nope not found');
  });
```

> Note: if `mil-rec-rec-1` is not the actual singleton id produced by `propose` for `rec-1`, derive it from `run(['milestone','list','--json'],…)` in the test instead of hard-coding (the 4b export CLI test directly above does exactly this — copy its id-discovery approach rather than guessing).

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @cadence/core build && pnpm --filter @cadence/core test -- cli/milestone.test.ts -t "premortem"`
Expected: FAIL (`unknown command 'premortem'` → commander exit, or assertion fail). (The spawned-CLI tests run `dist/cli/index.js`, so a build precedes them.)

- [ ] **Step 3: Add the subcommand.** In `packages/core/src/cli/commands/milestone.ts`: add `runMilestonePreMortem` to the existing `../../intelligence/milestone.js` import. Insert this block after the `export <id>` subcommand and before `list` (mirrors the propose/export idiom exactly — `process.exitCode = 1`, `refused:`/`failed:`):

```ts
  cmd
    .command('premortem <id>')
    .description(
      'Refresh the deterministic pre-mortem for a proposed/accepted milestone',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const res = await runMilestonePreMortem(process.cwd(), id);
        if (!res.ok) {
          process.stderr.write(`milestone premortem refused: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        if (opts.json) {
          process.stdout.write(JSON.stringify(res.ledger) + '\n');
        } else {
          process.stdout.write(`milestone ${id} → pre-mortem refreshed\n`);
        }
      } catch (err) {
        process.stderr.write(
          `milestone premortem failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
```

- [ ] **Step 4: Rebuild + run to verify pass**

Run: `pnpm --filter @cadence/core build && pnpm --filter @cadence/core test -- cli/milestone.test.ts`
Expected: PASS (whole CLI milestone file — new `premortem` cases + all prior cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cli/commands/milestone.ts packages/core/tests/cli/milestone.test.ts
git commit -m "feat(core): add cadence milestone premortem command (Slice 6)"
```

---

## Task 5: Docs, forward-ref reconciliation, full gate

**Files:**
- Modify: `docs/reference/commands.md`
- Modify: the user-docs CLI page that enumerates `milestone` subcommands (find it: `grep -rl "milestone export" docs/` excluding `docs/superpowers/`; it is the same page the 4b slice updated)
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-05-17-cadence-milestone-export-design.md`
- Modify: the Slice-5 context-packets design doc (`docs/superpowers/specs/2026-05-1*-cadence-context-packets-design.md`)

- [ ] **Step 1: `docs/reference/commands.md`.** In the `### milestone` section, add `premortem <id> [--json]` to the Subcommands list with a one-line behavior sentence: *"`premortem <id>` — recompute the deterministic pre-mortem for a `proposed`/`accepted` milestone in place (refuses other statuses)."* Do NOT touch the `<!-- cadence:commands:start -->`…`<!-- cadence:commands:end -->` top-level marker block (premortem is a subcommand, not a top-level command — the drift guard set-compares top-level only).

- [ ] **Step 2: Verify the drift guard.** Run: `pnpm --filter @cadence/core test -- cli-reference.test.ts` (real path `packages/core/tests/docs/cli-reference.test.ts`; vitest's substring filename filter matches).
Expected: PASS unchanged (the guard iterates top-level `program.commands` only — a subcommand cannot trip it; verified). If it unexpectedly fails about a subcommand, add `premortem` wherever the guard's expected set is sourced (follow the failure message).

- [ ] **Step 3: User-docs CLI page.** Add a `premortem` row/paragraph mirroring the existing `export`/`propose` entries' style on that page.

- [ ] **Step 4: `CHANGELOG.md`.** Under Unreleased → Added: *"`cadence milestone premortem <id>` — re-runnable deterministic milestone pre-mortem (decay/erosion/open-assumption/overestimated-value signals; refreshes in place; `outOfScope` operator-owned)."*

- [ ] **Step 5: Reconcile stale forward-refs (durable gotcha (e)).** In `docs/superpowers/specs/2026-05-17-cadence-milestone-export-design.md` Follow-On section, edit the line that reads *"Context packets (`cadence context <scope>`); milestone pre-mortems as a first-class command."* — remove the now-fulfilled "milestone pre-mortems as a first-class command" clause (Slice 5 shipped context packets; Slice 6 ships this). In the Slice-5 context-packets design doc Follow-On, similarly drop/annotate the "Milestone pre-mortems as a first-class command" later-slice item as **shipped in Slice 6 (`docs/superpowers/specs/2026-05-18-cadence-milestone-premortem-design.md`)**. `grep -rn "pre-mortems as a first-class" docs/superpowers/` to find every occurrence; reconcile **only the forward-ref occurrences** — the 4b export design Follow-On (~line 201) and the context-packets design Follow-On (~line 238) — NOT self-references in this slice's own spec/plan (the grep will also match this plan and the Slice-6 spec; leave those).

- [ ] **Step 6: Full gate (the done-bar — full, not a subset).**

Run: `pnpm turbo run lint typecheck test build`
Expected: 16/16 green. (Per durable gotcha (c): `lint` must be in this run — a per-task subset misses `no-unused-vars`; note `_now` is intentionally underscore-prefixed; confirm no orphaned import/const from the Task-1 refactor.)

- [ ] **Step 7: Commit**

```bash
git add docs/reference/commands.md docs/ CHANGELOG.md docs/superpowers/specs/2026-05-17-cadence-milestone-export-design.md docs/superpowers/specs/2026-05-18-cadence-milestone-premortem-design.md
git commit -m "docs: document milestone premortem + reconcile forward-refs (Slice 6)"
```

(If the Slice-5 context-packets design doc is a separate path, include it in the `git add`.)

---

## Verification Checklist (goal-backward)

- `cadence milestone premortem <proposed|accepted-id>` rewrites that milestone's `likelyFailureModes`/`hiddenDependencies`/`driftRisks` from current ledger state, preserves `outOfScope`, bumps `updatedAt`, re-renders `MILESTONES.md`; `--json` emits the `MilestoneLedger`.
- The 4 new families fire exactly per spec §Deepening Rules; family-blocked id-sorted order; a healed risk drops on re-run.
- `seedPreMortem` output byte-identical to pre-slice (Task-1 frozen test + all 4a `seedPreMortem`/`clusterMilestones` tests green).
- Refused (exitCode 1, zero writes) for unknown id / `exported` / `deferred` / `closed`.
- No `@cadence/types` change, no new renderer, no new top-level command, no LLM, no `state.json`/loop/`spec new`/`PraxisBackend` use; writes confined to `.cadence/intelligence/`.
- Stale "pre-mortems as a first-class command" forward-refs reconciled.
- `pnpm turbo run lint typecheck test build` 16/16.
