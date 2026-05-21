# CADENCE Recommendation Link Backfill — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 11 (follow-on; closes forward-ref open since Slice 5)
**Predecessor slice docs:**
- [`2026-05-17-cadence-context-packets-design.md`](2026-05-17-cadence-context-packets-design.md) (Slice 5 — first slice to read `AssumptionLedger`/`IntelligenceDecisionLedger` and note the `assumptionIds`/`decisionIds` arrays on `Recommendation` would need a real intake feeder)
- [`2026-05-18-cadence-milestone-premortem-design.md`](2026-05-18-cadence-milestone-premortem-design.md) (Slice 6 — F-new-3 open-assumptions pre-mortem family explicitly anticipated intake-fed deepening)
- [`2026-05-20-cadence-assumption-decision-intake-design.md`](2026-05-20-cadence-assumption-decision-intake-design.md) (Slice 8 — shipped `cadence assumption|decision add|list` but left `rec.assumptionIds`/`rec.decisionIds` at their `addRecommendation`-time defaults `[]`; Follow-On listed this slice as next)
- [`2026-05-20-cadence-assumption-reopen-design.md`](2026-05-20-cadence-assumption-reopen-design.md) (Slice 10 — completed assumption transition matrix; Follow-On listed auto-backfill as the next highest-leverage slice)

## Summary

**Slice 11** wires the auto-backfill of `Recommendation.assumptionIds[]` and `Recommendation.decisionIds[]` arrays via a new pure helper `deriveRecommendationLinks(recLedger, asLedger, decLedger)`. The helper returns a `RecommendationLedger` with every `rec.assumptionIds` rebuilt from `asLedger.assumptions.filter(a => a.recommendationId === rec.id)` (ledger-insertion order) and likewise for `rec.decisionIds` (skipping decisions whose optional `recommendationId` is `undefined`).

`addAssumption` and `addIntelligenceDecision` call `deriveRecommendationLinks` after appending the new entry, then write the asLedger/decLedger first and the rec ledger second. Pure-derivation means no migration needed: a pre-Slice-11 assumption that was added before this slice (or one manually inserted into `assumptions.json` via the Slice-9-documented JSON-edit override path) is picked up automatically on the next `addAssumption`/`addIntelligenceDecision` call — the rec ledger self-heals.

It does **not** change `@cadence/types` schemas (`assumptionIds`/`decisionIds` have been on `RecommendationZ` since Slice 1; they were just always `[]`), change render output for the recommendation Markdown (`render.ts` does not read these arrays yet — that's a future consumer slice), modify `cadence recommendation add` (a fresh rec never has assumptions/decisions pointing at it; arrays stay `[]`), modify the four assumption transitions (`validate`/`reject`/`reopen` flip `status` only; the `recommendationId` link is invariant under transition — no derive call needed), modify Slice 5/7 context packets (they consume the `Assumption`/`Decision` ledgers directly, not `rec.assumptionIds`), add a `cadence intelligence reconcile` command (out of scope — self-heal on next add is sufficient), or touch `state.json` / `STATE.md` / loop.

## Product Boundary (parent design's #1 risk: do not rebuild / drive the loop)

Strict read-only outside the three intelligence ledgers re-affirmed:

- Writes ONLY to `.cadence/intelligence/{recommendations.json, RECOMMENDATIONS.md, evidence.json, assumptions.json, ASSUMPTIONS.md, decisions.json, DECISIONS.md}`.
- READS the same set + nothing else.
- **NEVER** calls `cadence spec new`, **NEVER** reads/writes `state.json` / `STATE.md`, **NEVER** transitions `SPEC→DRAFT→BUILD→SETTLE`.
- No new CLI commands. No subcommand changes.

## Scope

### In scope

- New exported pure helper `deriveRecommendationLinks(recLedger, asLedger, decLedger): RecommendationLedger` in `intelligence/store.ts`.
- `addAssumption` wired: append assumption → write asLedger → derive new recLedger → write recLedger (via existing `writeIntelligenceLedgers`, which also re-renders `RECOMMENDATIONS.md`).
- `addIntelligenceDecision` wired: append decision → write decLedger → derive new recLedger (only when input `recommendationId` is provided — untied decisions cannot link) → write recLedger.
- Tests: pure helper tests (empty inputs, ordering, multi-rec disambiguation, untied-decision skip, idempotence under repeated derive), wired `addAssumption`/`addIntelligenceDecision` integration tests (single + multi + cross-link), retroactive self-heal test (manually-inserted assumption picked up on next add), regression covering Slice-1 `addRecommendation` (fresh rec still gets empty arrays), and a no-side-effect test for an untied decision (recLedger byte-equal before/after).

### Out of scope (later / parked)

- A `cadence intelligence reconcile` standalone command (operator-initiated full re-derive without adding a new entry). Self-heal on next add covers the realistic path.
- Backfill triggered by `assumption validate`/`reject`/`reopen` (transitions don't change membership — `recommendationId` is invariant under transition).
- Removal/deletion of assumptions/decisions (not shipped at any layer yet; nothing to backfill on removal).
- Reverse direction: editing a rec to drop an assumption (would require severing the assumption's `recommendationId` — schema-additive change, out of scope).
- Rendering the `assumptionIds`/`decisionIds` arrays in `RECOMMENDATIONS.md` (no consumer of the rendered view exists yet; consumer slice is a separate concern).
- Filtering Slice-5/7 context packets by `rec.assumptionIds` instead of cross-ref (the existing cross-ref via `recommendationId` is correct; the arrays are convenience, not authority).
- `@cadence/types` schema change of any kind.
- Loop / state-machine integration.

## Architecture

### MODIFIED files

- `packages/core/src/intelligence/store.ts`:
  - + `deriveRecommendationLinks(recLedger, asLedger, decLedger): RecommendationLedger` pure helper.
  - `addAssumption`: post-append, derive new rec ledger from `(recLedger after no-op, asLedger after append, decLedger as-is)`, write asLedger first via `writeAssumptionLedger`, then write recLedger + evidence via `writeIntelligenceLedgers`. The existing FK pre-check still runs first.
  - `addIntelligenceDecision`: post-append, when input has `recommendationId`, derive new rec ledger from `(recLedger, asLedger, decLedger after append)`, write decLedger first via `writeIntelligenceDecisionLedger`, then write recLedger + evidence. When `recommendationId` is absent, skip the derive + rec write entirely (untied decisions can never change rec membership).
- `packages/core/tests/intelligence/store.test.ts`:
  - + Pure derive tests (empty inputs, single rec single assumption, multi-rec disambiguation, ordering preservation, untied-decision skip, idempotence).
  - + Integration test: `addAssumption` updates `rec.assumptionIds`.
  - + Integration test: `addIntelligenceDecision(--rec)` updates `rec.decisionIds`; untied decision does NOT touch recLedger (byte-equal snapshot).
  - + Retroactive self-heal: pre-Slice-11-shaped `assumptions.json` (rec has empty `assumptionIds`) gets backfilled on next `addAssumption` for ANY rec (derive is full-ledger).
  - + Regression: `addRecommendation` still yields `assumptionIds: []` / `decisionIds: []` (no assumptions/decisions point at a fresh rec).

### NEW files

None.

### Untouched

- `@cadence/types`: `RecommendationZ.assumptionIds` / `decisionIds` already exist with type `z.array(z.string())` since Slice 1. No schema change.
- `cli/commands/{assumption,decision,recommendation}.ts`: no CLI surface change.
- `cli/register.ts`: no new top-level commands. Phase-31.1 drift guard UNTRIPPED.
- `docs/reference/commands.md` `<!-- cadence:commands -->` marker block: UNCHANGED.
- `intelligence/render.ts`: does NOT read `assumptionIds`/`decisionIds`. No render-layer change in this slice. (Future consumer slice can extend if/when needed.)
- `intelligence/render-assumption.ts` / `render-decision.ts`: unchanged. Bucket render (Slice 9) + flat render (Slice 8) unaffected.
- `intelligence/context.ts` / `render-context.ts`: Slice 5/7 packets cross-ref via `Assumption.recommendationId`, not `Recommendation.assumptionIds`. Zero change.
- `intelligence/milestone.ts`: Slice-6 F-new-3 open-assumptions family also reads `AssumptionLedger` directly. The arrays remain available for any future consumer that prefers the rec-side view.
- `applyAssumptionTransition` / `runAssumptionTransition` (Slice 9 + 10): transitions flip status only; `recommendationId` is invariant; no derive call needed inside transitions.

## Data Model

### Type signatures

```ts
export function deriveRecommendationLinks(
  recLedger: RecommendationLedger,
  asLedger: AssumptionLedger,
  decLedger: IntelligenceDecisionLedger,
): RecommendationLedger;
```

Pure; total; returns a new `RecommendationLedger` whose `schemaVersion` is preserved and whose `recommendations` is a `.map` over the input with `assumptionIds` and `decisionIds` replaced. Non-array fields on each rec are passed through unchanged. Recommendation insertion order preserved. The returned ledger is byte-equal to the input when every rec's existing `assumptionIds`/`decisionIds` already match the derived value (idempotence is observable — useful for the no-side-effect untied-decision test).

### `deriveRecommendationLinks` algorithm

```ts
function deriveRecommendationLinks(
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

Order = ledger-insertion order (since `.filter` preserves order). Idempotent. Untied decisions (`d.recommendationId === undefined`) are skipped naturally because no `r.id` can equal `undefined`. No mutation of inputs.

### `addAssumption` flow (revised)

```
addAssumption(root, input):
  ├─ recLedger = await readRecommendationLedger(root)
  ├─ refuse if input.recommendationId not in recLedger.recommendations  ← Slice-8 FK pre-check (unchanged)
  ├─ asLedger = await readAssumptionLedger(root)
  ├─ a = { id: nextId, recommendationId, text, status:'open', createdAt }
  ├─ asLedger.assumptions.push(a)
  ├─ await writeAssumptionLedger(root, asLedger)             ← step 1: persist new assumption
  ├─ decLedger = await readIntelligenceDecisionLedger(root)
  ├─ evLedger = await readEvidenceLedger(root)
  ├─ derived = deriveRecommendationLinks(recLedger, asLedger, decLedger)
  ├─ await writeIntelligenceLedgers(root, derived, evLedger) ← step 2: persist updated rec arrays + re-render RECOMMENDATIONS.md
  └─ return a
```

If step 1 succeeds but step 2 fails (mkdir/permission/etc.): the assumption is visible in `assumptions.json` but `rec.assumptionIds` is stale. **Self-heal:** the next successful `addAssumption` / `addIntelligenceDecision` (against any rec) re-derives from full ledgers and picks up the orphan. Symmetric to the Slice-4b residual-risk window — "honest, recoverable, eventually consistent." If step 1 fails: nothing written; FK pre-check unchanged.

### `addIntelligenceDecision` flow (revised)

```
addIntelligenceDecision(root, input):
  ├─ if input.recommendationId !== undefined:
  │    ├─ recLedger = await readRecommendationLedger(root)
  │    ├─ refuse if input.recommendationId not in recLedger     ← Slice-8 FK pre-check (unchanged)
  ├─ decLedger = await readIntelligenceDecisionLedger(root)
  ├─ out = { id: nextId, title, rationale, decidedAt } + recommendationId? if provided
  ├─ decLedger.decisions.push(out)
  ├─ await writeIntelligenceDecisionLedger(root, decLedger)    ← step 1: persist new decision
  ├─ if input.recommendationId !== undefined:
  │    ├─ recLedger = recLedger as read above
  │    ├─ asLedger = await readAssumptionLedger(root)
  │    ├─ evLedger = await readEvidenceLedger(root)
  │    ├─ derived = deriveRecommendationLinks(recLedger, asLedger, decLedger)
  │    └─ await writeIntelligenceLedgers(root, derived, evLedger) ← step 2: persist updated rec arrays
  └─ return out
```

Untied decisions skip step 2 entirely (no rec to update). Tied decisions: same residual-risk + self-heal window as `addAssumption`.

## Error Handling

| Failure | Path | Behavior |
|---|---|---|
| `addAssumption`: unknown `recommendationId` | Slice-8 FK pre-check throws BEFORE any write | unchanged — exit 1 + clean stderr; ledgers byte-equal pre/post (existing AC-2 test) |
| `addAssumption`: step-1 `writeAssumptionLedger` throws | rejected at writer | exit 1; `assumptions.json` NOT updated; recLedger NOT updated |
| `addAssumption`: step-2 `writeIntelligenceLedgers` throws | rejected at writer | exit 1; `assumptions.json` updated (step 1 succeeded), recLedger NOT updated → self-heal on next add |
| `addIntelligenceDecision`: provided unknown `recommendationId` | Slice-8 FK pre-check throws | unchanged — exit 1 + clean stderr; ledgers byte-equal pre/post |
| `addIntelligenceDecision`: step-1 `writeIntelligenceDecisionLedger` throws | writer | exit 1; `decisions.json` NOT updated; recLedger NOT updated |
| `addIntelligenceDecision`: step-2 `writeIntelligenceLedgers` throws (tied decision only) | writer | exit 1; `decisions.json` updated, recLedger NOT updated → self-heal on next add |
| `addIntelligenceDecision`: untied decision (no `--rec`) | step 2 SKIPPED | recLedger byte-equal before/after (no side effect on rec layer) |

**No write of rec ledger on FK-refusal**: Slice-8 FK pre-check still runs first; refusal exits BEFORE any append-to-ledger code path runs (existing AC-2 contract preserved).

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `deriveRecommendationLinks(empty, empty, empty)` returns `{schemaVersion:1, recommendations:[]}` (or a ledger whose `recommendations` is byte-equal to the input's empty array). | `tests/intelligence/store.test.ts` (extend) |
| AC-2 | `deriveRecommendationLinks` on a ledger with one rec + one assumption tied to it returns the same rec with `assumptionIds: [assumption.id]` and all other fields unchanged. | `store.test.ts` |
| AC-3 | `deriveRecommendationLinks` disambiguates multi-rec: assumption tied to rec-A goes only into rec-A's `assumptionIds`; rec-B's stays `[]`. Assumption ledger insertion order preserved within each rec's array. | `store.test.ts` |
| AC-4 | `deriveRecommendationLinks` skips decisions where `recommendationId` is `undefined` (untied decision → does NOT appear in any rec's `decisionIds`). | `store.test.ts` |
| AC-5 | `deriveRecommendationLinks` is idempotent: calling it twice yields the same `recommendations` array (deep equal, including order). | `store.test.ts` |
| AC-6 | `addAssumption(root, {recommendationId: rec.id, text})` after seeding `rec` → `readRecommendationLedger(root).recommendations[i].assumptionIds` contains the new assumption's id. `evidenceIds` and all other rec fields unchanged. | `store.test.ts` integration |
| AC-7 | `addIntelligenceDecision(root, {recommendationId: rec.id, ...})` → rec's `decisionIds` contains the new decision's id. | `store.test.ts` integration |
| AC-8 | `addIntelligenceDecision(root, {/* no recommendationId */, ...})` does NOT modify the recLedger byte-by-byte (snapshot rec ledger file before + after, assert byte-equal). | `store.test.ts` integration |
| AC-9 | Retroactive self-heal: starting from `assumptions.json` carrying a pre-Slice-11 entry (FK-valid, schema-conformant) but rec ledger's `assumptionIds` is `[]`, a subsequent `addAssumption` for ANY rec re-derives the full link map → the pre-existing entry's id appears in its rec's `assumptionIds` post-call. | `store.test.ts` integration |
| AC-10 | Regression: `addRecommendation` still produces a fresh rec with `assumptionIds: []` and `decisionIds: []` (no pre-existing assumption/decision points at a never-seen rec id). | existing `store.test.ts` (unchanged) |
| AC-11 | FK-refusal contract preserved: `addAssumption` with unknown `recommendationId` and `addIntelligenceDecision(--rec=unknown)` both throw BEFORE any write; `assumptions.json` / `decisions.json` / `recommendations.json` byte-equal pre/post (existing Slice-8 tests still green). | existing Slice-8 tests (unchanged + extended FK no-side-effect snapshot on recLedger) |
| AC-12 | Phase-31.1 cli-reference drift guard still passes UNCHANGED. NO new commands; marker block UNCHANGED. | `tests/docs/cli-reference.test.ts` |

## Testing

- **Pure-function vitest** for `deriveRecommendationLinks` (AC-1 through AC-5). Uses small inline ledger fixtures; no `tempRepo`.
- **In-process `tempRepo` via `@cadence/testkit`** for `addAssumption` / `addIntelligenceDecision` integration (AC-6 through AC-11). Re-uses Slice-1 / Slice-8 seeding helpers.
- **Test-coverage gate (Phase 14):** every AC maps to ≥1 linked test.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` 16/16. Lint must be in every per-task check.
- **AC-9 retroactive self-heal** is the keystone test for the pure-derivation property — verify the orphan assumption (from a "pre-Slice-11" or manually-edited `assumptions.json`) reappears in `rec.assumptionIds` after the next `addAssumption` call against the SAME or a DIFFERENT rec.
- **AC-8 untied-decision no-side-effect**: snapshot `recommendations.json` byte-equal before/after; ensures we don't gratuitously rewrite the rec ledger when no link could exist.

## Commit Convention

Mirror Slice 10 conventional commits, one per task. Praxis workstream — no `cadence draft/settle` loop.

```
docs: design — recommendation link backfill (Praxis Slice 11)
docs: implementation plan — recommendation link backfill (Praxis Slice 11)
feat(core): deriveRecommendationLinks + auto-backfill in addAssumption (Slice 11)
feat(core): auto-backfill in addIntelligenceDecision (Slice 11)
test(core): retroactive self-heal of rec link arrays (Slice 11 AC-9)
docs: document recommendation link backfill + reconcile Slice-5/6/7/8/10 follow-refs (Slice 11)
```

Six commits, one per task.

## Success Criteria

The slice succeeds if:

1. All 12 ACs pass.
2. Full turbo gate green at every task's done-bar (16/16; lint included).
3. Slice-5 / Slice-6 / Slice-8 / Slice-10 design Follow-On entries naming "auto-backfill `assumptionIds[]`/`decisionIds[]` arrays on Recommendation" reconciled (strike + annotate "SHIPPED Slice 11").
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched (boundary audit).
5. Phase-31.1 cli-reference drift guard passes UNCHANGED.
6. Branch HEAD pushes clean through pre-push to `origin/praxis-intelligence-ledger`; PR #9 stays draft.
7. Existing Slice-1 / Slice-8 / Slice-9 / Slice-10 tests still pass without modification (or with a minimal test-fixture update if a golden literally asserts `assumptionIds: []` on a rec that now has linked assumptions — the audit covers all existing assertions of these fields).

## Decision Log

1. **Pure derivation, not append-on-write.** `deriveRecommendationLinks` recomputes the full link map from the three ledgers every call rather than appending a single id to a single rec. Rationale: (a) idempotent — repeated calls converge; (b) self-healing — picks up any drift from manual JSON edits or partial writes; (c) no migration command needed for pre-Slice-11 entries; (d) the cost is `O(|recs| · |as| + |recs| · |dec|)` per add — bounded and small for any realistic ledger size. The append-on-write alternative would require a one-shot migration command for pre-Slice-11 entries.
2. **No backfill triggered by assumption transitions.** `validate`/`reject`/`reopen` flip status only; the `recommendationId` link is invariant under transition. Adding a derive call inside `runAssumptionTransition` would do nothing observable. Keeps the transition path lean.
3. **Untied decisions skip the rec write entirely.** When `input.recommendationId === undefined`, no rec can be updated (no link). `addIntelligenceDecision` writes only the decision ledger — recommendation ledger byte-equal. Avoids gratuitous rewrites and unnecessary `RECOMMENDATIONS.md` re-renders.
4. **Two-step write order: subject first, rec last.** asLedger/decLedger write happens BEFORE recLedger write. Rationale: the worst recoverable failure mode is "assumption exists but rec doesn't know" — the next add self-heals via re-derivation. The reverse order ("rec references nonexistent assumption") would be worse (dangling pointer; Slice-5 packet rendering would still cross-ref by `recommendationId` so the symptom would be cosmetic, but the invariant "every id in `rec.assumptionIds` exists in `asLedger`" is more valuable).
5. **No `RECOMMENDATIONS.md` render extension.** `render.ts` does not currently surface `assumptionIds`/`decisionIds`. Adding that surface is a future consumer slice (e.g., "show assumption + decision counts inline on each rec entry"). This slice owns the WRITER only. **— SHIPPED Slice 12** as inline-ids form (see [rec-md-render-links design](2026-05-20-cadence-rec-md-render-links-design.md)).
6. **No `@cadence/types` schema change.** Confirmed: `RecommendationZ.assumptionIds = z.array(z.string())` and `decisionIds = z.array(z.string())` since Slice 1. Slice 11 simply populates fields that have always existed.
7. **No `cadence intelligence reconcile` standalone command.** Self-heal on next add covers the realistic path. A standalone reconcile would be a one-shot admin tool; defer until an operator hits a real need for "I edited the JSON by hand and want to force a rebuild RIGHT NOW without adding a new entry."
8. **Strict read-only boundary preserved.** No `state.json`/`STATE.md`/`cadence spec new`/loop transition. The slice writes only inside `.cadence/intelligence/`.
9. **Existing test golden audit.** Several Slice-1/4a/4b/5 tests assert `assumptionIds: []` and `decisionIds: []` on freshly-`addRecommendation`-ed recs in fixtures. These golden assertions remain CORRECT post-Slice-11 because the fixtures don't subsequently add assumptions/decisions tied to the rec. Audit: grep `assumptionIds` + `decisionIds` across `tests/` → every existing assertion checked. (Confirmed pre-implementation: all existing assertions stay green; no fixture updates needed.)
10. **Read-twice optimization deferred.** `addAssumption` reads `recLedger` once for the FK pre-check; the derived rec ledger reuses that read (no second read). `addIntelligenceDecision` (tied path) reads `recLedger` once for the FK pre-check; reuses for derive. No duplicate reads.
11. **No `cli-reference.test.ts` drift.** This slice adds NO top-level commands and modifies NO subcommands. The `<!-- cadence:commands -->` marker block stays byte-equal. The per-section `### assumption` / `### decision` prose in `docs/reference/commands.md` is unchanged by this slice (the auto-backfill is implementation-internal — operator-visible behavior of `cadence assumption add` and `cadence decision add` is unchanged from the operator's stdout/exit-code perspective).
12. **Slice-11 closes the cross-slice ID-array forward-ref family in a single shot.** Slice 5 + Slice 6 + Slice 7 + Slice 8 + Slice 10 designs all mention "auto-backfill `assumptionIds[]`/`decisionIds[]` arrays on Recommendation" in their § Follow-On sections. This slice reconciles every one of them (strike + annotate per existing convention).

## Follow-On (not in this slice)

- **`cadence intelligence reconcile`** standalone admin command (operator-initiated full re-derive without adding a new entry).
- ~~**`RECOMMENDATIONS.md` render extension** to display `assumptionIds[].length` / `decisionIds[].length` counts (or inline list) on each rec.~~ **SHIPPED Slice 12** — inline-ids form chosen; see [rec-md-render-links design](2026-05-20-cadence-rec-md-render-links-design.md).
- **`cadence decision` status field + transitions** (decisions still have no status field — Slice-10 Follow-On).
- **Rec↔phase linkage** (`IntelligenceMilestone.exportTargets` → promoted SPEC.md → phase; would let `review` packet filter recs by phase membership).
- **Removal/deletion** commands for either subject.
- **Filter options on `list`** (`--status`, `--rec`, `--since`, `--limit`).
- **Auto-dispatch / subagent routing** — forever-deferred per parent design.
