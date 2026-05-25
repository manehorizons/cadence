# CADENCE `--include-untied` on `decision list` — Design

**Date:** 2026-05-25
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 32 (Slice-8 follow-on; operator-visibility flag for the untied-decision concept)
**Predecessor slice docs:**
- [`2026-05-20-cadence-recommendation-decision-intake-design.md`](2026-05-20-cadence-recommendation-decision-intake-design.md) (Slice 8 — introduced the optional `recommendationId` on decisions; named `--include-untied` as a future flag)
- [`2026-05-21-cadence-list-reverse-design.md`](2026-05-21-cadence-list-reverse-design.md) (Slice 27 — final list-shaping slice; § Follow-On listed `--include-untied`)

## Summary

**Slice 32** adds a new `--include-untied` boolean flag to `cadence decision list`. When combined with `--filter-rec <recId>`, the result expands to include decisions whose `recommendationId` is undefined ("untied"). Without `--filter-rec`, the flag is a no-op (the list already includes untied decisions). Decision-only — `assumption.recommendationId` and `evidence.recommendationId` are required by schema, so the concept doesn't apply elsewhere.

- **Single new flag** on `decision list`. No other surfaces touched.
- **Meaningful with `--filter-rec`**: result becomes `recommendationId === X OR recommendationId === undefined`.
- **No-op alone**: redundant valid input — matches Slice-26 `--offset 0` precedent of accepting harmless redundancy without refusal.
- **Filter order unchanged**: `status → rec(+untied) → text → reverse → offset → limit`. The flag tweaks the rec predicate rather than introducing a new filter stage.
- **Empty-result message extended** with `untied=incl` dim when both `--filter-rec` and `--include-untied` are set and the result is empty.
- **JSON envelope unchanged** in shape — array of full decisions.

## Product Boundary

Read only. No writes.

## Scope

### In scope

- `packages/core/src/cli/commands/decision.ts`: register the `--include-untied` option on the `list` subcommand; update the `--filter-rec` predicate to `d.recommendationId === opts.filterRec || (opts.includeUntied && d.recommendationId === undefined)`.
- Empty-result `filterDims` extension when both flags are set.
- CLI spawn tests.
- CHANGELOG entry.
- Predecessor reconciliation: strike Slice-8 / Slice-27 `§ Follow-On` `--include-untied` entries.

### Out of scope

- **Symmetric flag on `assumption list` or `evidence list`**: by schema, `assumption.recommendationId` and `evidence.recommendationId` are required (not optional). No untied subjects exist. A flag would be meaningless.
- **Refusing redundant `--include-untied` without `--filter-rec`**: no-op is operator-friendly. Slice 26 set the precedent for accepting harmless redundancy (`--offset 0`).
- **`--exclude-untied`**: the default behavior already excludes untied when `--filter-rec` narrows. A symmetric "exclude" flag would be redundant.
- **Surfacing untied decisions distinctly in output** (e.g., separator line, grouping): not in scope — terminal mode keeps the one-line-per-decision format; operator can read `—` (em-dash) in the rec column to identify untied entries.
- **`--filter-untied`** (i.e., show ONLY untied): out of scope. Could be a future slice if operators ask. Workaround today: `decision list --format json | jq '.[] | select(.recommendationId == null)'`.
- Any change to the loop, `state.json`, `STATE.md`, or other commands.

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/decision.ts` — one new option, one predicate update, one filterDims push.
- `packages/core/tests/cli/decision.test.ts` — new test cases.

### Untouched

- All other commands (recommendation list, assumption list, evidence list, intelligence audit, etc.).
- Store layer (no helper changes).
- All render modules.
- Schema (`IntelligenceDecisionZ` unchanged).
- `docs/reference/commands.md` — UNCHANGED (per Slice-28 precedent for sub-subcommand drift).
- CLI-reference drift guard.

## Implementation Pattern

### CLI

```ts
// In the list subcommand registration:
.option('--include-untied', 'When combined with --filter-rec, also include decisions with no recommendationId')
```

### Predicate

```ts
// Replace:
if (opts.filterRec !== undefined) {
  entries = entries.filter((d) => d.recommendationId === opts.filterRec);
}

// With:
if (opts.filterRec !== undefined) {
  entries = entries.filter(
    (d) =>
      d.recommendationId === opts.filterRec ||
      (opts.includeUntied === true && d.recommendationId === undefined),
  );
}
```

### Empty-result filterDims

```ts
if (opts.filterRec) filterDims.push(`rec=${opts.filterRec}`);
if (opts.filterRec && opts.includeUntied) filterDims.push('untied=incl');
```

The dim only appears when meaningful (paired with `--filter-rec`). When `--include-untied` is set alone, it's a no-op and contributes nothing to the empty-result diagnostic.

### Behavior matrix

| Flags | Result |
|---|---|
| (no flags) | all decisions |
| `--filter-rec rec-X` | decisions where `recommendationId === 'rec-X'` |
| `--filter-rec rec-X --include-untied` | decisions where `recommendationId === 'rec-X'` OR `recommendationId === undefined` |
| `--include-untied` alone | all decisions (no-op — `--filter-rec` not set) |

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `decision list --filter-rec rec-X --include-untied` returns decisions tied to `rec-X` AND untied decisions (those with no `recommendationId`). Ledger-insertion-order preserved. | CLI test |
| AC-2 | `decision list --filter-rec rec-X` (no `--include-untied`) returns ONLY decisions tied to `rec-X`. Untied excluded. Slice-23 contract preserved. | CLI test (existing) |
| AC-3 | `decision list --include-untied` (no `--filter-rec`) returns ALL decisions (no-op). Identical to bare `decision list`. | CLI test |
| AC-4 | Empty-result message when both flags set: `No decisions matching rec=<id>, untied=incl recorded.\n`. Exit 0. | CLI test |
| AC-5 | `--include-untied` composes with `--format json`: JSON output includes both tied and untied entries when paired with `--filter-rec`. | CLI test |
| AC-6 | `--include-untied` composes with `--limit` / `--offset` / `--reverse`: applied AFTER the expanded rec filter, BEFORE pagination/order. | CLI test |
| AC-7 | `--include-untied` does not affect `--filter-status` or `--filter-text` semantics. | CLI test |
| AC-8 | Schema UNCHANGED. CLI-reference drift guard UNCHANGED. Other commands UNCHANGED. | drift-guard test |
| AC-9 | Full turbo gate green (16/16). | done-bar |

## Testing

- **CLI spawn tests** in `packages/core/tests/cli/decision.test.ts`: AC-1, AC-3, AC-4, AC-5, AC-6, AC-7. Use the existing tempRepo + `addIntelligenceDecision` setup; mix of tied (some to rec-X, some to rec-Y) and untied decisions.
- **Existing tests** for AC-2 (Slice 23 untied-excluded contract) and AC-8 (drift guard).
- **Done-bar**: full `pnpm turbo run lint typecheck test build` green (16/16).

## Commit Convention

```
docs: design — --include-untied on decision list (Praxis Slice 32)
feat(core): --include-untied on decision list (Slice 32)
docs: document --include-untied + reconcile Slice-8/27 follow-refs (Slice 32)
```

Three commits, per Praxis convention.

## Success Criteria

1. All 9 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-8 + Slice-27 `§ Follow-On` `--include-untied` entries reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. CLI-reference drift guard UNCHANGED. `docs/reference/commands.md` UNCHANGED.
6. Schema and store layer UNCHANGED.
7. Other list commands (recommendation, assumption, evidence) UNCHANGED.
8. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **Decision-only flag.** `assumption.recommendationId` and `evidence.recommendationId` are required by schema (no `.optional()`). Untied subjects don't exist for those kinds. Adding `--include-untied` to their `list` commands would be a no-op flag — confusing, not useful.
2. **No-op alone (without `--filter-rec`).** Slice 26's `--offset 0` set the precedent: redundant-but-valid flags are accepted, not refused. Operator-friendly. Avoids surfacing a usage error for combinations that are harmless.
3. **`untied=incl` dim only when meaningful.** The empty-result message lists the dimensions that narrowed the result. `--include-untied` alone WIDENS rather than narrows, so it contributes no dim. Paired with `--filter-rec`, it modifies the rec dim's behavior — listing `untied=incl` distinguishes the modified filter from the bare `rec=X` filter.
4. **Predicate composition, not a new filter stage.** Slice 27 finalized the apply order `status → rec → text → reverse → offset → limit`. `--include-untied` softens the rec predicate rather than introducing a new stage; order stays canonical.
5. **No `--exclude-untied`.** The default already excludes untied WHEN `--filter-rec` narrows. A symmetric flag would be redundant. If operators ever ask, it's a future slice.
6. **No `--filter-untied` (untied-only).** Out of scope. The JSON-mode + jq workaround works; if a real use case surfaces, it gets its own slice.
7. **No `docs/reference/commands.md` update.** Pre-existing drift, parked per Slice-28 precedent. CHANGELOG covers the operator-facing news.

## Follow-On

- **`--sort-by <field>`** stable sort with multi-key (Slice 27 follow-on; biggest remaining list-shaping item).
- **`--filter-regex`** / **`--filter-text-exact`** (Slice 25 follow-on).
- **`--filter-untied`** — untied-only filter on `decision list`. Defer unless asked.
- **Bulk transitions** (`cadence assumption validate --all-rec <recId>`).
- **`--filter-kind <kind>` on `intelligence audit`** (Slice 30 follow-on).
- **Slice-29 graph viewer optimization** — use `supersedes[]` directly (Slice 31 follow-on).
- **Rec↔phase linkage** — biggest remaining scope (handoff candidate #1).
