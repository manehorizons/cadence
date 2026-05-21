# CADENCE `RECOMMENDATIONS.md` Status-Aware Link Bullets — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 15 (follow-on to Slice 12 — Rec MD Render Links; Slice 13 — Decision Status + Transitions)
**Predecessor slice docs:**
- [`2026-05-20-cadence-rec-md-render-links-design.md`](2026-05-20-cadence-rec-md-render-links-design.md) (Slice 12 — shipped `- assumptions:` / `- decisions:` bullets with bare ids; Decision Log #2 + Follow-On both noted status-aware variant as future consumer slice)
- [`2026-05-20-cadence-decision-status-transitions-design.md`](2026-05-20-cadence-decision-status-transitions-design.md) (Slice 13 — added `decision.status`; § Follow-On listed "Status-aware variant of Slice-12 `- decisions:` MD bullet" as next consumer slice)
- [`2026-05-20-cadence-assumption-transitions-design.md`](2026-05-20-cadence-assumption-transitions-design.md) (Slice 9 — assumption status enum)

## Summary

**Slice 15** annotates each linked id in `RECOMMENDATIONS.md`'s per-rec `- assumptions:` and `- decisions:` bullets with its current status, turning `- assumptions: as-1, as-2` into `- assumptions: as-1 (open), as-2 (validated)` and `- decisions: dec-1, dec-2` into `- decisions: dec-1 (active), dec-2 (superseded)`. Pure render-layer change. No filtering — operator still sees all linked ids; status is now visible inline. Closes Slice-12 Decision Log #2 + Follow-On + Slice-13 § Follow-On "Status-aware variant of Slice-12 `- decisions:` MD bullet".

- **`- assumptions: as-1 (open), as-2 (validated), as-3 (rejected)`** — every linked id carries its parenthesised current status.
- **`- decisions: dec-1 (active), dec-2 (superseded), dec-3 (rescinded)`** — same shape for decisions.
- **`renderRecommendationsMd` signature gains two optional params** `asLedger?: AssumptionLedger`, `decLedger?: IntelligenceDecisionLedger`. When both supplied → annotated form. When either omitted → falls back to Slice-12 bare-id form (back-compat with any external caller; internal call sites always supply both after this slice).
- **`writeIntelligenceLedgers` reads both extra ledgers** before calling render, so the persisted MD always reflects current status.
- **Order within each bullet preserved** (no re-sort by status). Bullet remains conditional (omitted when source array empty).

It does **not** change `@cadence/types` schemas, modify `cadence assumption`/`decision`/`recommendation` CLI surfaces, change `deriveRecommendationLinks` (link arrays still status-agnostic — Slice 11 precedent holds), modify `ASSUMPTIONS.md` / `DECISIONS.md` render, change `cadence recommendation show` (Slice 14 already renders detailed per-entry shape), add a `--status` filter on the bullet (render shows all; operator scans the parens), or perform a fresh fs/git scan.

## Product Boundary

Strict read-only outside the recommendation MD render side effect:

- Writes ONLY to `.cadence/intelligence/RECOMMENDATIONS.md` (via existing `writeIntelligenceLedgers`).
- READS the two additional ledgers (`assumptions.json`, `decisions.json`) inside `writeIntelligenceLedgers` before each rec-MD render. Tiny cost (JSON read at ledger write time only).
- **NEVER** calls `cadence spec new`, **NEVER** reads/writes `state.json` / `STATE.md`, **NEVER** transitions `SPEC→DRAFT→BUILD→SETTLE`.

## Scope

### In scope

- Extend `renderRecommendationsMd(recLedger, evLedger)` signature with two new optional params: `asLedger?: AssumptionLedger`, `decLedger?: IntelligenceDecisionLedger`. When both provided → annotate each id with `(<status>)`. When either omitted → fall back to bare-id rendering (Slice-12 behavior).
- Inside the renderer, build local status lookup maps `Map<string, status>` from the supplied ledgers and emit annotated bullets.
- Extend `writeIntelligenceLedgers(root, recLedger, evLedger)` to internally `readAssumptionLedger(root)` + `readIntelligenceDecisionLedger(root)` and pass both into the render call. Single internal API change, no external signature break.
- New pure-function tests covering the annotated case (extend `render-recommendations.test.ts`).
- Extend Slice-12 store integration tests with annotated assertions.
- CHANGELOG entry under existing Praxis stream.
- Reconcile Slice-12 + Slice-13 § Follow-On entries.

### Out of scope (later / parked)

- A `--status open|active|all` filter flag (no CLI consumer of this render directly).
- Sorting within each bullet by status (insertion order preserved; mirrors Slice 11/12 precedent).
- Annotation on `cadence recommendation show` (Slice 14 already renders per-entry blocks with explicit `- status:` bullets; no need to duplicate inline).
- Status-aware filtering on `deriveRecommendationLinks` (Slice-11 Decision Log #2 precedent: link arrays stay status-agnostic; status partitioning lives in render layer).
- Annotated form on `cadence recommendation list` (terminal one-line surface; status visible via subject-specific list commands).
- Any `@cadence/types` schema change.
- `supersededBy <id>` graph rendering.

## Architecture

### MODIFIED files

- `packages/core/src/intelligence/render.ts`:
  - `renderRecommendationsMd` signature extended with `asLedger?` + `decLedger?`. Body builds status maps when supplied and emits annotated bullets.
- `packages/core/src/intelligence/store.ts`:
  - `writeIntelligenceLedgers` reads asLedger + decLedger internally before calling render.
- `packages/core/tests/intelligence/render-recommendations.test.ts`:
  - + AC-1..AC-5 annotated-form tests.
  - Existing Slice-12 tests UNCHANGED (continue passing because new params are optional; when omitted the render falls back to bare-id form).
- `packages/core/tests/intelligence/store.test.ts`:
  - Update existing Slice-12 integration assertions to match the new annotated form.

### NEW files

None.

### Untouched

- `cli/commands/recommendation.ts` — no surface change.
- `cli/register.ts` — no new top-level commands.
- `docs/reference/commands.md` `<!-- cadence:commands -->` marker block — UNCHANGED (Phase-31.1 drift guard untripped).
- `intelligence/store.ts` `addAssumption` / `addIntelligenceDecision` / `deriveRecommendationLinks` / transition machinery — link arrays remain status-agnostic.
- `intelligence/render-recommendation-detail.ts` (Slice 14) — separate per-entry render surface; untouched.
- `intelligence/render-assumption.ts` / `render-decision.ts` — bucket renders untouched.
- `@cadence/types` — no schema change.

## Data Model

No new types. Renderer signature uses existing `AssumptionLedger` and `IntelligenceDecisionLedger`.

```ts
export function renderRecommendationsMd(
  ledger: RecommendationLedger,
  evidenceLedger: EvidenceLedger,
  asLedger?: AssumptionLedger,
  decLedger?: IntelligenceDecisionLedger,
): string;
```

## Render Policy

### Annotated bullet shape

```
- assumptions: as-1 (open), as-2 (validated), as-3 (rejected)
- decisions: dec-1 (active), dec-2 (superseded), dec-3 (rescinded)
```

When `asLedger` is supplied:

```ts
const asStatusById = new Map(asLedger.assumptions.map((a) => [a.id, a.status] as const));
if (rec.assumptionIds.length > 0) {
  const items = rec.assumptionIds.map((id) => {
    const status = asStatusById.get(id);
    return status !== undefined ? `${id} (${status})` : id;
  });
  lines.push(`- assumptions: ${items.join(', ')}`);
}
```

When `asLedger` is omitted (back-compat fallback):

```ts
if (rec.assumptionIds.length > 0) {
  lines.push(`- assumptions: ${rec.assumptionIds.join(', ')}`);
}
```

Symmetric for decisions.

### Missing-status fallback

If a linked id has no status entry in the supplied ledger (e.g. operator manually edited `recommendations.json` to reference a deleted id), the render emits the bare id with NO parens. Self-documenting drift signal. No throw.

### Insertion order preserved

`rec.assumptionIds.map(...)` walks the array in persisted order. No sort.

### Empty arrays still omit bullet

Same conditional emission as Slice 12.

## Flow

```
addAssumption / addIntelligenceDecision / addRecommendation flow:
  ├─ writer side does its updates
  ├─ writeIntelligenceLedgers(root, recLedger, evLedger):
  │   ├─ asLedger = await readAssumptionLedger(root)
  │   ├─ decLedger = await readIntelligenceDecisionLedger(root)
  │   └─ renderRecommendationsMd(recLedger, evLedger, asLedger, decLedger)
  └─ MD now contains status-annotated bullets
```

Transition writers (`runAssumptionTransition`, `runDecisionTransition`) currently do NOT call `writeIntelligenceLedgers` — they only re-render their own subject MD (Slice 9/13 design). After this slice, transitions also flip the parenthesised status in `RECOMMENDATIONS.md` IFF the rec MD is re-rendered. Two options:

A) Force a re-render of rec MD on every transition (consistency wins; small write cost).
B) Defer rec MD update until next add (eventual consistency; matches Slice-11 self-heal model).

**Pick A** for honesty: an operator who transitioned an assumption and then reads `RECOMMENDATIONS.md` expects the parenthesised status to match. Defer-until-next-add would surprise.

Implementation: `runAssumptionTransition` + `runDecisionTransition` call a new lightweight helper that re-renders rec MD using the (just-updated) subject ledger + freshly read sibling ledger. Or simpler: both transitions call `writeIntelligenceLedgers(root, recLedger, evLedger)` after their own writes — but that re-derives nothing, just re-renders. (Slice-11 `deriveRecommendationLinks` does NOT change under transition.)

Cleanest: after a successful transition write, ALSO re-render `RECOMMENDATIONS.md` via the existing `writeIntelligenceLedgers` path. recLedger is unchanged so the JSON re-write is byte-equal (safe); only the MD changes.

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `renderRecommendationsMd(recLedger, evLedger, asLedger, decLedger)` with rec having `assumptionIds: ['as-1', 'as-2']` and asLedger containing `{as-1: open, as-2: validated}` emits `- assumptions: as-1 (open), as-2 (validated)`. | `render-recommendations.test.ts` |
| AC-2 | Symmetric: decisions annotated with `(active)` / `(superseded)` / `(rescinded)`. | `render-recommendations.test.ts` |
| AC-3 | Both bullets populated and annotated; bullet order = assumptions before decisions (slot order preserved from Slice 12). | `render-recommendations.test.ts` |
| AC-4 | `renderRecommendationsMd(recLedger, evLedger)` (3-arg call — `asLedger`/`decLedger` omitted) falls back to bare-id Slice-12 form. Slice-12 tests continue to pass unchanged. | `render-recommendations.test.ts` (existing Slice-12 tests) |
| AC-5 | Missing-id fallback: rec references `as-1` but asLedger does not contain `as-1` → bullet emits bare `as-1` with no `(status)` parens. No throw. | `render-recommendations.test.ts` |
| AC-6 | Insertion order preserved within each annotated bullet — `['as-9', 'as-1', 'as-5']` renders as `as-9 (...), as-1 (...), as-5 (...)`. | `render-recommendations.test.ts` |
| AC-7 | `writeIntelligenceLedgers` reads both extra ledgers internally; on-disk `RECOMMENDATIONS.md` after `addAssumption` contains the annotated `(open)` bullet. | `store.test.ts` (extend Slice-12 integration block) |
| AC-8 | After `runAssumptionTransition(root, id, 'validate')`, `RECOMMENDATIONS.md` updates: linked rec entry now shows `as-X (validated)` (transition propagates to rec MD). | `store.test.ts` (new test) |
| AC-9 | After `runDecisionTransition(root, id, 'supersede')`, `RECOMMENDATIONS.md` updates: linked rec entry shows `dec-X (superseded)`. | `store.test.ts` (new test) |
| AC-10 | Phase-31.1 cli-reference drift guard passes UNCHANGED. NO new top-level commands. | `tests/docs/cli-reference.test.ts` |
| AC-11 | Regression: all Slice-1/3/5/11/12 tests asserting `RECOMMENDATIONS.md` content still pass (the annotated form supersedes the bare-id assertion in only the Slice-12 integration block; older tests asserting envelope content remain matched). | full `pnpm turbo run test`. |

## Testing

- **Pure-function vitest** for the annotated render (AC-1..AC-6).
- **In-process `tempRepo` via `@cadence/testkit`** for integration (AC-7..AC-9).
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design — recommendation MD status-aware bullets (Praxis Slice 15)
feat(core): renderRecommendationsMd status-annotated link bullets (Slice 15)
feat(core): transitions propagate status into RECOMMENDATIONS.md (Slice 15)
docs: document rec MD status bullets + reconcile Slice-12/13 follow-refs (Slice 15)
```

Four commits.

## Success Criteria

1. All 11 ACs pass.
2. Full turbo gate green at every task's done-bar (16/16; lint included).
3. Slice-12 Decision Log #2 + Slice-12 § Follow-On + Slice-13 § Follow-On entries reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 cli-reference drift guard passes UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft + unmerged.

## Decision Log

1. **Optional params, not breaking signature.** External callers (none exist today, but the shape is exported) can still call 2-arg. Internal call site updated to always pass 4-arg.
2. **Inline parens annotation, not a structured table.** Compact terminal-glance shape; readable in a diff.
3. **Insertion order preserved, no status-sort.** Mirrors Slice-11 derive order. Sort-by-status would re-order the bullet on every transition — diff noise.
4. **Missing-id fallback emits bare id, no throw.** Self-documenting drift signal. Operator can grep for "bare ids" to find link/ledger mismatches.
5. **Transitions propagate to rec MD.** Eventual consistency would surprise. Cost: one extra ~1ms write per transition. Worth it.
6. **Status filtering still NOT applied to link arrays.** Slice-11 Decision Log #2 invariant preserved: link arrays mirror persisted ledger; render layer can annotate but not filter.
7. **No CLI consumer of this render needed.** `cadence recommendation show` (Slice 14) already renders per-entry blocks with `- status:` bullets; the rec-MD inline-annotated form is the operator's audit-doc surface.
8. **`renderRecommendationsMd` stays a single function.** No fork into "annotated" vs "bare" variants. Same function, optional inputs.

## Follow-On (not in this slice)

- **`supersededBy <id>`** field on decision + graph rendering.
- **`cadence intelligence reconcile`** standalone admin command (Slice-11 § Follow-On still open).
- **Rec↔phase linkage** display.
- **`cadence assumption show <id>` / `cadence decision show <id>`** parallels of Slice 14.
- **`--format json`** on `cadence recommendation show`.
- **Auto-dispatch / subagent routing** — forever-deferred.
