# CADENCE `cadence assumption show <id>` + `cadence decision show <id>` — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 16 (follow-on to Slice 14 — `cadence recommendation show`)
**Predecessor slice docs:**
- [`2026-05-20-cadence-recommendation-show-design.md`](2026-05-20-cadence-recommendation-show-design.md) (Slice 14 — `cadence recommendation show`; § Follow-On listed parallel subject `show` commands as next)
- [`2026-05-20-cadence-assumption-decision-intake-design.md`](2026-05-20-cadence-assumption-decision-intake-design.md) (Slice 8 — assumption + decision ledger structure)
- [`2026-05-20-cadence-decision-status-transitions-design.md`](2026-05-20-cadence-decision-status-transitions-design.md) (Slice 13 — decision status enum)

## Summary

**Slice 16** ships symmetric deep-dive subcommands on `cadence assumption` and `cadence decision`: `cadence assumption show <id>` and `cadence decision show <id>`. Each reads its own ledger + the recommendation ledger (for cross-link annotation) and prints the subject's full envelope with the linked recommendation's id+title. Closes Slice-14 § Follow-On parallel-show entry.

- **`cadence assumption show <id>`** — prints the assumption's full envelope (`id`, `text`, `status`, `createdAt`) plus the tied recommendation as a one-line cross-ref (`- recommendation: rec-X — <title>`).
- **`cadence decision show <id>`** — symmetric: prints the decision's envelope (`id`, `title`, `status`, `decidedAt`, `rationale`) plus the tied recommendation cross-ref (if `recommendationId` set; omitted for untied decisions).
- **Refuses unknown id** with exit 1 + stderr `assumption <id> not found\n` / `decision <id> not found\n`. No partial output.
- **No filtering flags.** Single-subject deep-dive; no buckets to filter.

It does **not** write any file, change `@cadence/types` schemas, modify intake/transition surfaces, embed the full RECOMMENDATIONS.md envelope of the tied rec (one-line cross-ref only — `cadence recommendation show <rec-id>` is the rec deep-dive), add `--format json`, perform a fresh fs/git scan, or touch `state.json` / `STATE.md` / `cadence spec new` / loop transition.

## Product Boundary

Strict read-only:

- Writes nothing.
- Reads `.cadence/intelligence/{assumptions,decisions,recommendations}.json` only.
- **NEVER** calls `cadence spec new`, touches `state.json` / `STATE.md`, or transitions the loop.

## Scope

### In scope

- Two new pure renderers in new files:
  - `packages/core/src/intelligence/render-assumption-detail.ts` — `renderAssumptionDetail(as, rec?): string`.
  - `packages/core/src/intelligence/render-decision-detail.ts` — `renderDecisionDetail(dec, rec?): string`.
- Two new CLI subcommands:
  - `cadence assumption show <id>` (registered in `cli/commands/assumption.ts`).
  - `cadence decision show <id>` (registered in `cli/commands/decision.ts`).
- Each CLI subcommand reads subject ledger + recommendation ledger, finds the subject + (if applicable) the tied rec, calls renderer, prints to stdout.
- Test coverage per ACs.

### Out of scope

- `--format json`.
- `--to <path>` file-write variant.
- Embedding the full rec envelope or other-subject lists (operator can chain `cadence recommendation show <rec-id>` for that).
- `cadence evidence show <id>` (evidence is leaf data; no cross-refs needed beyond what `recommendation show` already surfaces).
- Schema changes.

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/assumption.ts` — + `show <id>` subcommand.
- `packages/core/src/cli/commands/decision.ts` — + `show <id>` subcommand.

### NEW files

- `packages/core/src/intelligence/render-assumption-detail.ts` — pure renderer.
- `packages/core/src/intelligence/render-decision-detail.ts` — pure renderer.
- `packages/core/tests/intelligence/render-assumption-detail.test.ts` — pure-function vitest.
- `packages/core/tests/intelligence/render-decision-detail.test.ts` — pure-function vitest.
- `packages/core/tests/cli/assumption-show.test.ts` — spawn-CLI tests.
- `packages/core/tests/cli/decision-show.test.ts` — spawn-CLI tests.

### Untouched

- `cli/register.ts` — no new top-level commands. Phase-31.1 drift guard untripped.
- `docs/reference/commands.md` `<!-- cadence:commands -->` marker block — UNCHANGED.
- `@cadence/types` — no schema change.
- `intelligence/store.ts` — no new readers / helpers.
- `intelligence/render-recommendation-detail.ts` (Slice 14) — untouched.

## Data Model

No new types. Renderer signatures use existing `Assumption`, `IntelligenceDecision`, `Recommendation`.

```ts
export function renderAssumptionDetail(
  as: Assumption,
  rec?: Recommendation,
): string;

export function renderDecisionDetail(
  dec: IntelligenceDecision,
  rec?: Recommendation,
): string;
```

## Render Policy

### `cadence assumption show <id>` output

```
# <as.id> — <as.text>

- status: <as.status>
- recommendation: <rec.id> — <rec.title>
- recorded: <as.createdAt>
```

When the tied rec is missing (stale link, manual JSON edit), the bullet falls back to `- recommendation: <as.recommendationId> (rec not found)` — self-documenting drift signal. Render does not throw.

### `cadence decision show <id>` output

```
# <dec.id> — <dec.title>

- status: <dec.status>
- recommendation: <rec.id> — <rec.title>          (omitted entirely for untied decisions)
- decided: <dec.decidedAt>

<dec.rationale>
```

Untied decisions (`recommendationId` absent) omit the recommendation bullet entirely.

### One-line rec cross-ref

`rec.id — rec.title` keeps the cross-ref short. Operator can `cadence recommendation show <rec-id>` for the full rec deep-dive. No envelope duplication.

## Flow

```
cadence assumption show <id>:
  ├─ readAssumptionLedger
  ├─ if id not in ledger: stderr `assumption <id> not found`, exit 1
  ├─ readRecommendationLedger
  ├─ rec = recLedger.recommendations.find(r => r.id === as.recommendationId)  // may be undefined
  ├─ render = renderAssumptionDetail(as, rec)
  └─ stdout.write(render)

cadence decision show <id>:
  ├─ readIntelligenceDecisionLedger
  ├─ if id not in ledger: stderr `decision <id> not found`, exit 1
  ├─ if dec.recommendationId: readRecommendationLedger + find rec; else rec = undefined
  ├─ render = renderDecisionDetail(dec, rec)
  └─ stdout.write(render)
```

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `renderAssumptionDetail(as)` emits header (`# <id> — <text>`), `- status:`, `- recorded:`. No `- recommendation:` bullet when `rec` arg is omitted (treated as missing-rec). | `render-assumption-detail.test.ts` |
| AC-2 | `renderAssumptionDetail(as, rec)` emits `- recommendation: <rec.id> — <rec.title>` between status and recorded. | `render-assumption-detail.test.ts` |
| AC-3 | `renderAssumptionDetail(as, undefined)` with `as.recommendationId` set emits `- recommendation: <as.recommendationId> (rec not found)` fallback. | `render-assumption-detail.test.ts` |
| AC-4 | `renderDecisionDetail(dec, rec)` emits header, status bullet, recommendation cross-ref, decided bullet, blank line, rationale paragraph. | `render-decision-detail.test.ts` |
| AC-5 | `renderDecisionDetail(dec)` untied (no `recommendationId`) omits the `- recommendation:` bullet entirely. | `render-decision-detail.test.ts` |
| AC-6 | `renderDecisionDetail(dec, undefined)` tied but rec missing emits fallback `- recommendation: <dec.recommendationId> (rec not found)`. | `render-decision-detail.test.ts` |
| AC-7 | CLI `cadence assumption show <id>` on existing → exit 0, stdout contains header + status + recorded. Tied rec → recommendation cross-ref present. | `tests/cli/assumption-show.test.ts` |
| AC-8 | CLI `cadence assumption show <id>` on unknown → exit 1, stderr `assumption <id> not found\n`, no stdout. | `assumption-show.test.ts` |
| AC-9 | CLI `cadence decision show <id>` symmetric: existing tied → exit 0 with cross-ref; untied → exit 0 without cross-ref. | `tests/cli/decision-show.test.ts` |
| AC-10 | CLI `cadence decision show <id>` on unknown → exit 1, stderr `decision <id> not found\n`. | `decision-show.test.ts` |
| AC-11 | Phase-31.1 cli-reference drift guard passes UNCHANGED. No new top-level commands. | `tests/docs/cli-reference.test.ts` |
| AC-12 | Strict read-only: no file writes occur during a `show` invocation (snapshot byte-equality). | `assumption-show.test.ts` + `decision-show.test.ts` |

## Testing

- **Pure-function vitest** for both renderers (AC-1..AC-6).
- **Spawn-CLI pattern** for both subcommands (AC-7..AC-10, AC-12).
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design + plan — assumption/decision show parallels (Praxis Slice 16)
feat(core): renderAssumptionDetail + CLI cadence assumption show (Slice 16)
feat(core): renderDecisionDetail + CLI cadence decision show (Slice 16)
docs: document assumption/decision show + reconcile Slice-14 follow-ref (Slice 16)
```

Four commits.

## Success Criteria

1. All 12 ACs pass.
2. Full turbo gate green at every task's done-bar.
3. Slice-14 § Follow-On parallel-show entry reconciled.
4. No state.json / STATE.md / cadence spec new / loop transition touched.
5. Phase-31.1 cli-reference drift guard passes UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **One-line rec cross-ref, not full envelope.** Operator chains to `cadence recommendation show <rec-id>` for the full picture; avoids duplication.
2. **Missing-rec fallback emits `(rec not found)`**, not a throw. Self-documenting drift signal — same pattern as Slice-15 missing-id link fallback.
3. **Untied decisions omit the cross-ref bullet entirely**, not `- recommendation: —`. Matches Slice-8 untied-decision JSON behavior (field omitted, not undefined).
4. **No filtering flags.** Single-subject view; no buckets.
5. **Renderers take optional `rec` param**, not full `RecommendationLedger`. Caller does the lookup; renderer stays dumb. Keeps the API narrow.
6. **No `cadence evidence show <id>`.** Evidence is leaf data referenced from rec MD already; no cross-refs to surface.
7. **Subcommand on existing parent**, no new top-level commands. Drift guard untripped.
8. **Both subcommands ship in one slice.** Tightly symmetric; splitting would create artificial complexity.

## Follow-On

- **`cadence intelligence reconcile`** standalone admin command.
- **`supersededBy <id>`** field on decision + graph rendering.
- **Rec↔phase linkage** display.
- **`--format json`** on all three `show` commands.
- **Bulk transitions** (`cadence assumption validate --all-rec <recId>`).
- **Auto-dispatch / subagent routing** — forever-deferred.
