# CADENCE `Decision.supersedes: dec-X[]` derived backfill — Design

**Date:** 2026-05-25
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 31 (Slice-29 follow-on; bidirectional reverse-link backfill for the supersededBy edge)
**Predecessor slice docs:**
- [`2026-05-21-cadence-decision-supersededby-design.md`](2026-05-21-cadence-decision-supersededby-design.md) (Slice 28 — § Follow-On listed "Bidirectional reverse-link backfill (`Decision.supersedes: dec-X[]` array on the replacement — derived, not user-input; like Slice 11 `assumptionIds`/`decisionIds` backfill pattern)")
- [`2026-05-25-cadence-decision-graph-design.md`](2026-05-25-cadence-decision-graph-design.md) (Slice 29 — § Follow-On listed "Bidirectional `Decision.supersedes: dec-X[]` derived backfill" with the same rationale)
- [`2026-05-20-cadence-recommendation-link-arrays-design.md`](2026-05-20-cadence-recommendation-link-arrays-design.md) (Slice 11 — the original derived-link backfill pattern this slice mirrors)

## Summary

**Slice 31** adds `supersedes: string[]` to `IntelligenceDecisionZ` as a **derived** reverse-link, mirroring Slice 11's `Recommendation.assumptionIds`/`decisionIds` pattern. For every decision X, `X.supersedes` holds the ids of decisions whose `supersededBy === X.id`. The field is recomputed on every write that could affect supersession (add, transition, reconcile) — operators do not set it directly. Pre-Slice-31 ledgers parse cleanly (`.default([])`); after the first post-Slice-31 write, every decision has an explicit `supersedes: []` (possibly empty), exactly like Slice 11's `assumptionIds: []` shape.

- **Derived, not user-input.** No CLI flag. No way to set `supersedes` from operator input. Always computed from current `supersededBy` values.
- **One pure helper.** `deriveDecisionInverseLinks(ledger)` returns a new ledger with every decision's `supersedes` array recomputed. Mirrors Slice 11's `deriveRecommendationLinks` shape.
- **Always-present array, default `[]`.** Matches Slice-11 precedent for derived link arrays. Empty arrays serialize as `[]` (not omitted), unlike Slice 28's exact-optional `supersededBy?`.
- **Wired at three places.** `addIntelligenceDecision` re-derives after adding; `applyDecisionTransition` re-derives after updating the target's `supersededBy`; `runIntelligenceReconcile` re-derives as part of its existing rederive sweep.
- **`render-decision-detail.ts` surfaces the field.** Operator running `cadence decision show <id>` sees `- supersedes: dec-X, dec-Y` when the decision is the replacement for one or more older ones; omitted when `supersedes` is empty.
- **Slice 29 graph viewer is NOT optimized this slice.** Slice 29's `walkAncestorTree` still uses inverse-lookup. Optimization to use `supersedes` directly is a follow-on (cleaner correctness boundary — current viewer works on any ledger; optimized version assumes `supersedes` is consistent).

## Product Boundary

Read+write (writes to `decisions.json`; touches the same write paths as Slices 8/13/28).

## Scope

### In scope

- `@cadence/types`: extend `IntelligenceDecisionZ` with `supersedes: z.array(z.string()).default([])`. Schema-additive.
- `packages/core/src/intelligence/store.ts`: add `deriveDecisionInverseLinks(ledger)` pure helper. Call it inside `applyDecisionTransition` (final step before returning the ledger) and inside `addIntelligenceDecision` (after pushing the new decision); extend `runIntelligenceReconcile` to re-derive `supersedes` arrays.
- `packages/core/src/intelligence/render-decision-detail.ts`: emit `- supersedes: dec-X, dec-Y` bullet when `dec.supersedes.length > 0`. Missing-id check via `decLedger` (same convention as Slice 28's missing-id fallback) — drift signal `dec-X (not found)` when one of the listed ids isn't in the ledger.
- `packages/core/src/intelligence/render-decision.ts` (DECISIONS.md bucket render): **NO change.** Bucket render already shows superseded-by going forward; adding the inverse would be visual noise. Operator cross-refs `decision show` or `decision graph` for the inverse view.
- Tests on the derivation function (pure unit), on the wired-up store functions (round-trip through add and transition), on the renderer (new bullet), and on `intelligence reconcile` (re-derives `supersedes` arrays).
- CHANGELOG entry.
- Predecessor reconciliation: strike Slice-28 and Slice-29 `§ Follow-On` bidirectional-backfill entries.

### Out of scope

- **Slice-29 graph viewer optimization.** The viewer still uses inverse-lookup. Switching to `supersedes` is a correctness narrowing (would assume the field is consistent); deferred to a follow-on slice IFF performance becomes a problem (current chains are short — O(n) inverse-lookup is fine).
- **`DECISIONS.md` bucket render annotation.** No new bullet. Inverse view lives in `decision show` and `decision graph`.
- **`render-decision.ts` modification** beyond the bucket — none needed.
- **Audit dim for stale `supersedes`.** `supersedes` is fully derived from `supersededBy`; the only drift surface is manual JSON edits, which `intelligence reconcile` fixes automatically. The integrity check for the underlying `supersededBy` references is already Slice 30's `stale-supersededby`.
- **User-input `supersedes` field.** Operators must use `cadence decision supersede <oldId> --by <newId>`; setting `supersedes` directly is not supported.
- **`decision list` projection of `supersedes`.** List remains the short summary line; `show`/`graph` are the deep-dive surfaces.

## Architecture

### MODIFIED files

- `packages/types/src/intelligence.ts` — additive schema field on `IntelligenceDecisionZ`.
- `packages/core/src/intelligence/store.ts` — new `deriveDecisionInverseLinks` helper; calls added to `applyDecisionTransition`, `addIntelligenceDecision`, and `runIntelligenceReconcile`.
- `packages/core/src/intelligence/render-decision-detail.ts` — new bullet rendered when `dec.supersedes.length > 0`.

### NEW test files (or extensions)

- `packages/core/tests/intelligence/derive-decision-inverse-links.test.ts` (new) — pure helper tests.
- `packages/core/tests/intelligence/store-decision-transition.test.ts` — extend with Slice-31 cases for transition wiring (supersede populates replacement's `supersedes`; reactivate clears it from the previous replacement).
- `packages/core/tests/intelligence/store.test.ts` (if it has the add-decision tests) OR `packages/core/tests/intelligence/store-decision.test.ts` — extend with add-decision wiring test (new decisions start with `supersedes: []`).
- `packages/core/tests/intelligence/render-decision-detail.test.ts` — extend with the new bullet test cases.
- `packages/core/tests/intelligence/store-reconcile.test.ts` — extend with the reconcile wiring test (manually-stale `supersedes` array fixed by reconcile).

Existing tests that assert exact decision-entity shape will get a minor update to include `supersedes: []` in expected fixtures. The Zod schema default fills it in on parse, so persisted decisions without the field still load — but freshly-added/transitioned decisions now write the field explicitly.

### Untouched

- `cli/commands/decision.ts` — no CLI surface change.
- `cli/commands/intelligence.ts` — no flag changes (reconcile already runs the full rederive sweep; `supersedes` joins the existing derivation pass).
- Slice-28's `walkSupersededByChain` — UNCHANGED.
- Slice-29's `graph-decision.ts` / `render-decision-graph.ts` — UNCHANGED (still uses inverse-lookup; optimization deferred).
- Slice-30's audit dim — UNCHANGED.
- `RECOMMENDATIONS.md` render — UNCHANGED.
- `docs/reference/commands.md` — UNCHANGED (no new flags / subcommands).
- CLI-reference drift guard — UNCHANGED.

## Implementation Pattern

### Schema (additive)

```ts
// packages/types/src/intelligence.ts

export const IntelligenceDecisionZ = z.object({
  id: z.string().min(1),
  recommendationId: z.string().optional(),
  title: z.string().min(1),
  rationale: z.string().min(1),
  status: z.enum(['active', 'superseded', 'rescinded']).default('active'),
  decidedAt: z.string().datetime({ offset: true }),
  supersededBy: z.string().optional(),               // Slice 28
  supersedes: z.array(z.string()).default([]),       // Slice 31 — derived inverse
});
```

### Pure helper

```ts
// packages/core/src/intelligence/store.ts (added after walkSupersededByChain)

// Slice 31: re-derive every decision's `supersedes: string[]` from current
// `supersededBy` values. Pure; ledger-in, ledger-out. Mirrors Slice 11's
// deriveRecommendationLinks shape but operates within one ledger.
export function deriveDecisionInverseLinks(
  ledger: IntelligenceDecisionLedger,
): IntelligenceDecisionLedger {
  return {
    schemaVersion: 1,
    decisions: ledger.decisions.map((d) => ({
      ...d,
      supersedes: ledger.decisions
        .filter((other) => other.supersededBy === d.id)
        .map((other) => other.id),
    })),
  };
}
```

### Wiring: `applyDecisionTransition`

```ts
// At the end of applyDecisionTransition, after building ledgerOut:

return { ok: true, ledger: deriveDecisionInverseLinks(ledgerOut) };
```

This ensures the returned ledger is fully consistent: target's `supersededBy` updated AND every replacement's `supersedes` recomputed. One additional helper call; no architectural change.

### Wiring: `addIntelligenceDecision`

```ts
// After decLedger.decisions.push(out); BEFORE writeIntelligenceDecisionLedger:

const derived = deriveDecisionInverseLinks(decLedger);
await writeIntelligenceDecisionLedger(root, derived);
```

(New decisions start with `supersedes: []`. If somehow an existing decision points its `supersededBy` at the new one — impossible via the CLI, but possible via manual JSON edits — the derivation captures the inverse on add.)

### Wiring: `runIntelligenceReconcile`

```ts
// Inside runIntelligenceReconcile, where decLedger is loaded and other
// ledgers are re-derived, add a parallel call to derive decision inverse links:

const derivedDec = deriveDecisionInverseLinks(decLedger);
// ... then writeIntelligenceDecisionLedger(root, derivedDec) ...
```

`reconcile` is the operator's "force re-derive everything" command (per Slice 11's plan); `supersedes` joins the existing rec-link rederive pass.

### Render: `render-decision-detail.ts`

```ts
// After the supersededBy bullet (Slice 28), add:

if (dec.supersedes.length > 0) {
  const parts = dec.supersedes.map((id) => {
    const exists = decLedger?.decisions.some((x) => x.id === id) ?? true;
    return exists ? id : `${id} (not found)`;
  });
  lines.push(`- supersedes: ${parts.join(', ')}`);
}
```

Empty `supersedes` → bullet omitted. Missing-id fallback `(not found)` matches Slice 28/16 convention.

### Examples

A clean three-decision chain D1→D2→D3 (D1.supersededBy=D2, D2.supersededBy=D3):

| Decision | `supersededBy` | `supersedes` (derived) |
|---|---|---|
| D1 | D2 | `[]` |
| D2 | D3 | `[D1]` |
| D3 | (absent) | `[D2]` |

`cadence decision show D2` adds the bullet:

```
# D2 — title

- status: superseded
- decided: 2026-05-25T...
- superseded-by: D3
- supersedes: D1

rationale
```

A replacement that consolidated two older decisions (D1.supersededBy=D3, D2.supersededBy=D3):

| Decision | `supersededBy` | `supersedes` |
|---|---|---|
| D1 | D3 | `[]` |
| D2 | D3 | `[]` |
| D3 | (absent) | `[D1, D2]` |

`cadence decision show D3`:

```
- supersedes: D1, D2
```

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `IntelligenceDecisionZ` parse on pre-Slice-31 fixture (no `supersedes` key) succeeds; loaded decision has `supersedes: []`. | schema unit test |
| AC-2 | `deriveDecisionInverseLinks` on empty ledger → empty ledger. | helper unit test |
| AC-3 | `deriveDecisionInverseLinks` on a chain D1→D2→D3 → D1.supersedes=[], D2.supersedes=[D1], D3.supersedes=[D2]. Order of D2.supersedes follows ledger insertion order. | helper unit test |
| AC-4 | `deriveDecisionInverseLinks` on a converging graph (D1→D3, D2→D3) → D3.supersedes=[D1, D2] in ledger insertion order. | helper unit test |
| AC-5 | `deriveDecisionInverseLinks` is idempotent — running it twice produces a byte-identical ledger. | helper unit test |
| AC-6 | `deriveDecisionInverseLinks` ignores stale `supersededBy` refs (decisions whose target is missing don't contribute to any `supersedes` array). | helper unit test |
| AC-7 | `addIntelligenceDecision` returns a decision with `supersedes: []`. Persisted ledger has the field on every decision (not just the new one). | store integration test |
| AC-8 | `applyDecisionTransition` with `action='supersede'`, `by=D2` on D1 → returned ledger has D1.supersededBy=D2 AND D2.supersedes contains D1. | store unit test |
| AC-9 | `applyDecisionTransition` with `action='reactivate'` on D1 (which had `supersededBy=D2`) → returned ledger has D1.supersededBy absent AND D2.supersedes no longer contains D1. | store unit test |
| AC-10 | `runIntelligenceReconcile` on a ledger with manually-stale `supersedes` arrays (e.g., manually edited JSON has `D2.supersedes=[D9]` where D9 doesn't reference D2) → after reconcile, every `supersedes` array matches the derivation from current `supersededBy` values. | reconcile integration test |
| AC-11 | `cadence decision show D2 --format terminal` when D2.supersedes=[D1] → output contains `- supersedes: D1`. | render unit test |
| AC-12 | `cadence decision show D2 --format terminal` when D2.supersedes=[] → no `- supersedes:` bullet emitted. | render unit test |
| AC-13 | `cadence decision show D2 --format json` envelope's `decision.supersedes` is a present array (possibly empty). | CLI integration test |
| AC-14 | Missing-id render fallback: when `D2.supersedes=[D-missing]` (e.g., manually edited JSON), terminal renders `- supersedes: D-missing (not found)`. | render unit test |
| AC-15 | Slice-29 graph viewer behavior UNCHANGED: `cadence decision graph` still uses inverse-lookup and produces byte-identical output on any pre-existing fixture. | graph tests (existing) |
| AC-16 | Slice-28 transition contracts UNCHANGED: `supersede --by` cycle/FK/self-ref refusals all still apply; reactivate still clears `supersededBy`. | store transition tests (existing) |
| AC-17 | CLI-reference drift guard UNCHANGED. `docs/reference/commands.md` UNCHANGED. | drift-guard test |
| AC-18 | Full turbo gate green (16/16). | done-bar |

## Testing

- **New file `derive-decision-inverse-links.test.ts`**: AC-2 through AC-6. Pure unit tests; in-memory ledger fixtures; no disk.
- **Extend `store-decision-transition.test.ts`**: AC-8, AC-9.
- **Extend `store-decision.test.ts`** (or wherever `addIntelligenceDecision` is tested): AC-7.
- **Extend `store-reconcile.test.ts`**: AC-10.
- **Extend `render-decision-detail.test.ts`**: AC-11, AC-12, AC-14.
- **CLI spawn test** (extend existing `decision-show.test.ts`): AC-13.
- **Existing tests**: confirm AC-15, AC-16, AC-17 stay green without modification.
- **Schema parse test**: AC-1 (extend the existing intelligence schema test or add a tiny one).
- **Done-bar**: full `pnpm turbo run lint typecheck test build` green (16/16).

**Test-fixture migration:** Any existing test that constructs an `IntelligenceDecision` literal via `{ id, title, rationale, status, decidedAt, ... }` without `supersedes` will still work — Zod's `.default([])` fills it in on parse, AND the helper functions return ledgers with the field populated. Tests that compare entity shape exactly via `toEqual` may need `supersedes: []` added to the expected fixture. This is mechanical; resolve as failures appear during implementation.

## Commit Convention

```
docs: design — Decision.supersedes derived backfill (Praxis Slice 31)
feat(core): Decision.supersedes derived inverse-link (Slice 31)
docs: document Decision.supersedes + reconcile Slice-28/29 follow-refs (Slice 31)
```

Three commits, per Praxis convention.

## Success Criteria

1. All 18 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-28 and Slice-29 `§ Follow-On` bidirectional-backfill entries reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. CLI-reference drift guard UNCHANGED. `docs/reference/commands.md` UNCHANGED.
6. Slice-29 graph viewer and Slice-30 audit behavior UNCHANGED.
7. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **`supersedes` is DERIVED, not user-input.** Operators set the supersession edge via `cadence decision supersede <old> --by <new>` (Slice 28). The inverse-link is computed from current `supersededBy` values on every write that could affect it. Eliminates a whole class of "did I forget to update both sides?" bugs.
2. **Always-present array with `default([])`, not exact-optional.** Mirrors Slice 11's `assumptionIds`/`decisionIds`/`evidenceIds` shape. Trade-off: marginal JSON bloat (most decisions have `supersedes: []`) vs. consumer ergonomics (`d.supersedes.length` always works, no `?.length ?? 0` guard). Same trade-off Slice 11 resolved.
3. **Re-derive at three call sites: add, transition, reconcile.** Same pattern as Slice 11. `applyDecisionTransition` calls the helper internally as the final step before returning the ledger (so the pure function returns a fully-consistent ledger; tests can rely on this). `addIntelligenceDecision` calls it after pushing the new decision. `runIntelligenceReconcile` calls it as part of its existing force-rederive sweep.
4. **`render-decision.ts` (bucket render) NOT extended.** The bucket render already shows the FORWARD edge (`- superseded-by: <id>` on superseded entries). Adding the INVERSE edge to active entries would create visual noise — most active decisions don't supersede anything; the few that do are better viewed via `decision show` or `decision graph` (which are the deep-dive surfaces). Operator can cross-ref.
5. **`render-decision-detail.ts` (show) IS extended.** `show` is the per-decision deep dive; surfacing both edges there is the natural place. Bullet emitted only when `supersedes.length > 0` (omitted on the common case).
6. **Slice 29 graph viewer NOT optimized this slice.** The viewer's `walkAncestorTree` could swap inverse-lookup for direct `supersedes[]` access (O(n) → O(1) per level), but doing so couples the viewer's correctness to `supersedes` being consistent. Current inverse-lookup works on ANY ledger including ones where `supersedes` arrays drifted (e.g., partial manual edits). Optimization is a separate slice if performance ever matters.
7. **No audit dim for stale `supersedes`.** `supersedes` is fully derived from `supersededBy`; the underlying integrity is already audited by Slice 30's `stale-supersededby` finding kind. `intelligence reconcile` fixes any drift automatically. A separate audit kind would be redundant.
8. **Slice-11 pattern is the precedent, not Slice 28's exact-optional.** `supersededBy` is a singleton field (a string-or-absent); `supersedes` is a collection (zero-or-more). Different cardinalities → different conventions. Slice 11 already resolved the array case with `default([])`.
9. **Order within `supersedes` follows ledger insertion order.** Matches Slice 11's `assumptionIds`/`decisionIds` — they're built by `.filter(...).map(...)` on the source ledger; insertion order is preserved. Deterministic, byte-stable across reconcile runs.
10. **Backwards compat: pre-Slice-31 ledgers parse via `.default([])`.** First post-Slice-31 write of any decision rewrites the entire ledger via `writeIntelligenceDecisionLedger`, so every decision gets the explicit `supersedes: []`. Read-then-write idempotency holds.

## Follow-On

- ~~**Slice-29 graph viewer optimization** — swap `walkAncestorTree`'s inverse-lookup for direct `supersedes[]` access. Defer until performance matters.~~ **CLOSED — won't do (Slice 39 brainstorm, 2026-05-29).** `supersedes[]` is, by construction (`deriveDecisionInverseLinks`, store.ts), the *cached output of the exact filter* `walkAncestorTree` already runs. Reading the cache instead of recomputing buys nothing measurable: (1) chains are short and ledgers small — there is still no performance problem, the original defer condition ("until performance matters") never triggered; (2) reading `supersedes[]` does not even yield O(1)/level without also adding an id→decision `Map` for child lookups, and once you have that Map you can keep recomputing the inverse with O(1) lookups — so the field is not on the critical path of any real optimization; (3) trusting `supersedes[]` would couple viewer correctness to that derived field staying consistent (a hand-edited ledger could drift), trading a genuine robustness property — the viewer derives everything from the owned `supersededBy` edge (Slice 28) and is correct on *any* ledger — for no gain. Decision: keep `walkAncestorTree` reading `supersededBy`. If a future change ever makes the graph walk hot, the correctness-preserving move is a shared id-index `Map` over `supersededBy`, **not** trusting `supersedes[]`.
- **`decision list --format json` projection control** — possibly `--include-supersedes`-style flag if list output gets noisy. Defer.
- **Render-decision (bucket) annotation** — IF operators ask to see the inverse edge in DECISIONS.md. Currently judged visual noise.
- **`--sort-by <field>`** stable sort with multi-key (Slice 27 follow-on).
- **Bulk transitions** (`cadence assumption validate --all-rec <recId>`).
- **`--filter-regex`** / **`--filter-text-exact`** on list commands.
- **`--include-untied`** on `decision list` (handoff candidate #8).
- **`--filter-kind <kind>`** on `intelligence audit` (Slice 30 follow-on).
- **Rec↔phase linkage** — biggest remaining scope (handoff candidate #1).
