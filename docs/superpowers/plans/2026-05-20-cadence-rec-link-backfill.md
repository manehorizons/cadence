# CADENCE Recommendation Link Backfill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-populate `Recommendation.assumptionIds[]` and `Recommendation.decisionIds[]` arrays via a new pure helper `deriveRecommendationLinks(recLedger, asLedger, decLedger)` called from `addAssumption` + `addIntelligenceDecision`. Forward + retroactive self-heal via full re-derivation per add. No schema change, no CLI change, no consumer-render change.

**Architecture:** Pure additive. Re-uses the existing `writeIntelligenceLedgers(root, recLedger, evidenceLedger)` writer (renders `RECOMMENDATIONS.md`) and `writeAssumptionLedger`/`writeIntelligenceDecisionLedger` writers. Two-step write: subject ledger first, recLedger second. Failures in step 2 leave a recoverable drift that the next add self-heals via re-derivation.

**Tech Stack:** TypeScript, Zod v3, vitest, Commander; pnpm + turbo.

**Spec:** [`docs/superpowers/specs/2026-05-20-cadence-rec-link-backfill-design.md`](../specs/2026-05-20-cadence-rec-link-backfill-design.md)

**Branch:** `praxis-intelligence-ledger` (long-lived Praxis workstream; PR #9 stays draft).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/intelligence/store.ts` | Modify | + `deriveRecommendationLinks(recLedger, asLedger, decLedger): RecommendationLedger` pure helper. Wire into `addAssumption` (write asLedger first, then derive + write recLedger via `writeIntelligenceLedgers`). Wire into `addIntelligenceDecision` (write decLedger first; for tied decisions, then derive + write recLedger; for untied, skip rec write entirely). |
| `packages/core/tests/intelligence/store.test.ts` | Modify | + Pure helper tests (AC-1 through AC-5). + Integration tests (AC-6, AC-7, AC-8). + Retroactive self-heal (AC-9). Existing tests untouched (AC-10, AC-11). |

**Slice-9 / Slice-10 reference patterns (mirror in spirit):**

- `applyAssumptionTransition` at `packages/core/src/intelligence/store.ts:268-301` — pure helper returns new ledger from old; `.map()` non-target preservation idiom; useful template for `deriveRecommendationLinks`.
- `writeIntelligenceLedgers` at `store.ts:114-126` — atomic rec + evidence write + MD render. Re-used unchanged.
- `addAssumption` at `store.ts:236-256` — FK pre-check + atomic write. Extend with derive + second write.
- `addIntelligenceDecision` at `store.ts:336-358` — FK pre-check (conditional) + atomic write. Extend identically.

---

## Per-task done-bar (apply to EVERY task before committing)

Slice-7 / Slice-8 / Slice-9 / Slice-10 carried gotcha: per-task subset checks miss `lint` regressions. Full turbo gate is the done-bar.

```bash
pnpm turbo run lint typecheck test build
```

Expect 16/16 successful. Do NOT commit if red.

---

## Task 1: `deriveRecommendationLinks` + auto-backfill in `addAssumption`

**Files:**
- Modify: `packages/core/src/intelligence/store.ts`
- Modify: `packages/core/tests/intelligence/store.test.ts`

- [ ] **Step 1: Add `deriveRecommendationLinks` helper**

In `packages/core/src/intelligence/store.ts`, add export near the other intelligence helpers (e.g., after `runAssumptionTransition`):

```ts
export function deriveRecommendationLinks(
  recLedger: RecommendationLedger,
  asLedger: AssumptionLedger,
  decLedger: IntelligenceDecisionLedger,
): RecommendationLedger {
  return {
    schemaVersion: 1,
    recommendations: recLedger.recommendations.map((r) => ({
      ...r,
      assumptionIds: asLedger.assumptions
        .filter((a) => a.recommendationId === r.id)
        .map((a) => a.id),
      decisionIds: decLedger.decisions
        .filter((d) => d.recommendationId === r.id)
        .map((d) => d.id),
    })),
  };
}
```

- [ ] **Step 2: Wire into `addAssumption`**

Rewrite the post-FK-check body to:

```ts
export async function addAssumption(
  root: string,
  input: AddAssumptionInput,
): Promise<Assumption> {
  const recLedger = await readRecommendationLedger(root);
  if (!recLedger.recommendations.some((r) => r.id === input.recommendationId)) {
    throw new Error(`unknown recommendation "${input.recommendationId}"`);
  }
  const asLedger = await readAssumptionLedger(root);
  const now = new Date();
  const a: Assumption = {
    id: nextAssumptionId(asLedger, now),
    recommendationId: input.recommendationId,
    text: input.text,
    status: 'open',
    createdAt: now.toISOString(),
  };
  asLedger.assumptions.push(a);
  await writeAssumptionLedger(root, asLedger);
  // Slice 11: backfill rec.assumptionIds via full re-derivation
  const decLedger = await readIntelligenceDecisionLedger(root);
  const evLedger = await readEvidenceLedger(root);
  const derivedRec = deriveRecommendationLinks(recLedger, asLedger, decLedger);
  await writeIntelligenceLedgers(root, derivedRec, evLedger);
  return a;
}
```

- [ ] **Step 3: Pure-helper tests (AC-1 through AC-5)**

In `packages/core/tests/intelligence/store.test.ts`, add a new describe block:

```ts
describe('deriveRecommendationLinks (Slice 11)', () => {
  function emptyDec(): IntelligenceDecisionLedger {
    return { schemaVersion: 1, decisions: [] };
  }
  function emptyAs(): AssumptionLedger {
    return { schemaVersion: 1, assumptions: [] };
  }
  function emptyRec(): RecommendationLedger {
    return { schemaVersion: 1, recommendations: [] };
  }

  it('AC-1: empty inputs → empty recommendations array', () => {
    const r = deriveRecommendationLinks(emptyRec(), emptyAs(), emptyDec());
    expect(r).toEqual({ schemaVersion: 1, recommendations: [] });
  });

  // AC-2, AC-3, AC-4, AC-5 — see spec
});
```

Fill in AC-2 through AC-5 with inline ledger fixtures (mirror the existing `store-assumption-transition.test.ts` `mkLedger` pattern).

- [ ] **Step 4: Integration tests (AC-6)**

Add a `describe('addAssumption backfill (Slice 11)', ...)` block in `store.test.ts` that:
1. Seeds a rec via `addRecommendation`.
2. Adds an assumption via `addAssumption({rec.id, text})`.
3. Re-reads `recLedger` and asserts the rec's `assumptionIds === [a.id]`.

- [ ] **Step 5: Full turbo gate**

```bash
pnpm turbo run lint typecheck test build
```

Must be 16/16 green.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(core): deriveRecommendationLinks + auto-backfill in addAssumption (Slice 11)"
```

---

## Task 2: Wire derive into `addIntelligenceDecision`

**Files:**
- Modify: `packages/core/src/intelligence/store.ts`
- Modify: `packages/core/tests/intelligence/store.test.ts`

- [ ] **Step 1: Extend `addIntelligenceDecision`**

```ts
export async function addIntelligenceDecision(
  root: string,
  input: AddIntelligenceDecisionInput,
): Promise<IntelligenceDecision> {
  let recLedger: RecommendationLedger | null = null;
  if (input.recommendationId !== undefined) {
    recLedger = await readRecommendationLedger(root);
    if (!recLedger.recommendations.some((r) => r.id === input.recommendationId)) {
      throw new Error(`unknown recommendation "${input.recommendationId}"`);
    }
  }
  const decLedger = await readIntelligenceDecisionLedger(root);
  const now = new Date();
  const out: IntelligenceDecision = {
    id: nextIntelligenceDecisionId(decLedger, now),
    title: input.title,
    rationale: input.rationale,
    decidedAt: now.toISOString(),
  };
  if (input.recommendationId !== undefined) out.recommendationId = input.recommendationId;
  decLedger.decisions.push(out);
  await writeIntelligenceDecisionLedger(root, decLedger);
  // Slice 11: backfill rec.decisionIds only when the decision is tied
  if (input.recommendationId !== undefined && recLedger !== null) {
    const asLedger = await readAssumptionLedger(root);
    const evLedger = await readEvidenceLedger(root);
    const derivedRec = deriveRecommendationLinks(recLedger, asLedger, decLedger);
    await writeIntelligenceLedgers(root, derivedRec, evLedger);
  }
  return out;
}
```

- [ ] **Step 2: Integration tests (AC-7, AC-8)**

Add a `describe('addIntelligenceDecision backfill (Slice 11)', ...)` block that:
1. AC-7: seeds rec; calls `addIntelligenceDecision({rec.id, ...})`; asserts rec's `decisionIds === [dec.id]`.
2. AC-8: seeds rec; snapshots `recommendations.json` byte content; calls `addIntelligenceDecision({/* no rec */, ...})`; reads `recommendations.json` and asserts byte-equal.

- [ ] **Step 3: Full turbo gate**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(core): auto-backfill in addIntelligenceDecision (Slice 11)"
```

---

## Task 3: Retroactive self-heal test (AC-9)

**Files:**
- Modify: `packages/core/tests/intelligence/store.test.ts`

- [ ] **Step 1: Self-heal test**

Add the keystone test asserting pure-derivation:

```ts
it('AC-9: pre-Slice-11 assumption gets backfilled on next addAssumption', async () => {
  active = await tempRepo({ initialized: true, projectName: 'slice11' });
  // Seed two recs
  const r1 = await addRecommendation(active.root, { /* ... */ });
  const r2 = await addRecommendation(active.root, { /* ... */ });
  // Manually write an asLedger entry tied to r1 (simulates pre-Slice-11 state OR direct JSON edit)
  const asPath = join(active.root, '.cadence/intelligence/assumptions.json');
  const orphan = {
    schemaVersion: 1,
    assumptions: [
      {
        id: 'as-20260520-001',
        recommendationId: r1.id,
        text: 'pre-Slice-11 orphan',
        status: 'open',
        createdAt: '2026-05-20T00:00:00.000Z',
      },
    ],
  };
  await mkdir(dirname(asPath), { recursive: true });
  await writeFile(asPath, JSON.stringify(orphan, null, 2));
  // recLedger still has empty assumptionIds for r1 because no addAssumption ran
  const before = await readRecommendationLedger(active.root);
  expect(before.recommendations.find((r) => r.id === r1.id)!.assumptionIds).toEqual([]);
  // Trigger addAssumption — derives from full ledger including orphan
  const fresh = await addAssumption(active.root, {
    recommendationId: r2.id,
    text: 'new entry tied to r2',
  });
  const after = await readRecommendationLedger(active.root);
  expect(after.recommendations.find((r) => r.id === r1.id)!.assumptionIds).toEqual([
    'as-20260520-001',
  ]);
  expect(after.recommendations.find((r) => r.id === r2.id)!.assumptionIds).toEqual([
    fresh.id,
  ]);
});
```

Note: the orphan's `id` must NOT collide with `nextAssumptionId`'s sequence. Use a far-future-or-low-counter id, OR use the actual sequence (`as-${todayDate}-001`) and accept that the fresh add will get `as-${todayDate}-002`.

- [ ] **Step 2: Full turbo gate**

- [ ] **Step 3: Commit**

```bash
git commit -m "test(core): retroactive self-heal of rec link arrays (Slice 11 AC-9)"
```

---

## Task 4: Docs reconcile + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-05-17-cadence-context-packets-design.md` (Slice 5 — Follow-On if it lists this)
- Modify: `docs/superpowers/specs/2026-05-18-cadence-milestone-premortem-design.md` (Slice 6 — F-new-3 forward-ref if present)
- Modify: `docs/superpowers/specs/2026-05-18-cadence-context-packets-review-agent-design.md` (Slice 7)
- Modify: `docs/superpowers/specs/2026-05-20-cadence-assumption-decision-intake-design.md` (Slice 8 — Follow-On)
- Modify: `docs/superpowers/specs/2026-05-20-cadence-assumption-reopen-design.md` (Slice 10 — Follow-On)

- [ ] **Step 1: CHANGELOG**

Add an Unreleased Slice 11 bullet documenting `deriveRecommendationLinks`, the auto-backfill in `addAssumption` / `addIntelligenceDecision`, and the retroactive self-heal property.

- [ ] **Step 2: Reconcile forward-refs**

For every prior slice that lists "auto-backfill `assumptionIds[]`/`decisionIds[]` arrays on Recommendation" in its § Follow-On (or anywhere else), apply the established strike-and-annotate convention:

```
~~Auto-backfill `assumptionIds[]`/`decisionIds[]` arrays on Recommendation.~~ **SHIPPED Slice 11** — see [`2026-05-20-cadence-rec-link-backfill-design.md`](2026-05-20-cadence-rec-link-backfill-design.md).
```

Run a quick grep first to enumerate the exact occurrences:

```bash
grep -rn "auto-backfill\|assumptionIds.*decisionIds\|backfill.*Recommendation" docs/superpowers/specs/
```

- [ ] **Step 3: Full turbo gate**

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: document recommendation link backfill + reconcile Slice-5/6/7/8/10 follow-refs (Slice 11)"
```

---

## Task 5: Final pre-push gate + push

- [ ] **Step 1: Verify commit log**

```bash
git log --oneline origin/praxis-intelligence-ledger..HEAD
```

Expect 6 commits (design, plan, derive+assumption, decision, self-heal test, docs).

- [ ] **Step 2: Full gate one more time** (pre-push hook runs this anyway)

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 3: Push**

```bash
git push
```

PR #9 stays draft.

---

## Definition of Done

- [ ] All 12 ACs in `2026-05-20-cadence-rec-link-backfill-design.md` pass.
- [ ] Full `pnpm turbo run lint typecheck test build` green at every task's done-bar.
- [ ] Slice-5 / Slice-6 / Slice-7 / Slice-8 / Slice-10 design Follow-On entries reconciled (strike + annotate).
- [ ] CHANGELOG entry added.
- [ ] `cli-reference.test.ts` (Phase-31.1 drift guard) passes UNCHANGED — no command-surface change.
- [ ] No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
- [ ] Branch pushed to `origin/praxis-intelligence-ledger`. PR #9 stays draft.
