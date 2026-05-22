# CADENCE `--filter-rec` on assumption/decision list — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 23 (follow-on to Slice 22 — `--filter-status` on lists)
**Predecessor slice docs:**
- [`2026-05-20-cadence-list-filter-status-design.md`](2026-05-20-cadence-list-filter-status-design.md) (Slice 22 — § Follow-On listed `--filter-rec`)

## Summary

**Slice 23** adds a `--filter-rec <recId>` flag to the `assumption list` and `decision list` commands. Filters output to entries whose `recommendationId === <recId>`. For `decision list`, **untied decisions** (`recommendationId === undefined`) are EXCLUDED by `--filter-rec` (operator scoped the query to a specific rec; untied don't belong). Recommendation list has no `recommendationId` field so the flag is not added there. Combines with `--filter-status` and `--format json`.

Commands gaining `--filter-rec <recId>`:
1. `cadence assumption list --filter-rec <recId>`
2. `cadence decision list --filter-rec <recId>`

- **Optional flag.** Omitted → no rec filter (current behavior).
- **No id validation**: any string accepted; empty result speaks for itself. Avoids a second ledger read.
- **Combines with `--filter-status`**: both filters applied AND-wise.
- **Empty-after-filter terminal message** includes the filter dimensions: `No <subject> matching filters recorded.\n` (when any filter active).

It does **not** validate the rec id against the recommendation ledger (defer), add `--filter-rec` on `recommendation list` (no FK), support comma-separated lists, perform fresh fs/git scan.

## Product Boundary

Read-only.

## Scope

### In scope

- Add `--filter-rec <recId>` to `assumption list` + `decision list`.
- Filter applies in both terminal and JSON modes.
- Combines with `--filter-status` (AND semantics).
- Empty-after-filter terminal message reflects active filter dimensions.
- Tests per ACs.

### Out of scope

- Validate `<recId>` against recommendation ledger (extra read; defer).
- `--filter-rec` on `recommendation list` (no FK to filter on).
- Multi-rec: `--filter-rec rec-A,rec-B` (defer).
- `--include-untied` for decisions (defer).
- Filters on other fields.

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/assumption.ts` — `list` gains `--filter-rec`.
- `packages/core/src/cli/commands/decision.ts` — `list` gains `--filter-rec` (excludes untied).
- Existing CLI test files — add tests.
- `docs/reference/commands.md` — note `--filter-rec`.

### Untouched

- `recommendation list` (no FK).
- All store helpers / readers.
- `@cadence/types` — no schema change.
- `cli/register.ts` — no new top-level commands.

## Implementation Pattern

```ts
.option('--filter-rec <recId>', 'Filter to only entries tied to this recommendation')
.action(async (opts) => {
  // ... format validation
  const ledger = await readAssumptionLedger(process.cwd());
  let entries = ledger.assumptions;
  if (opts.filterStatus !== undefined) {
    // existing Slice-22 status filter
  }
  if (opts.filterRec !== undefined) {
    entries = entries.filter((a) => a.recommendationId === opts.filterRec);
  }
  // ... existing output logic
  // Empty-after-filter message reflects active filters
  if (entries.length === 0) {
    const filters: string[] = [];
    if (opts.filterStatus) filters.push(`status=${opts.filterStatus}`);
    if (opts.filterRec) filters.push(`rec=${opts.filterRec}`);
    const msg = filters.length > 0
      ? `No assumptions matching ${filters.join(', ')} recorded.\n`
      : 'No assumptions recorded.\n';
    process.stdout.write(msg);
    return;
  }
});
```

For `decision list`, the filter discards untied because `dec.recommendationId === undefined !== opts.filterRec`. No special case needed.

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `assumption list --filter-rec <recId>` → only entries with `recommendationId === <recId>`. | `assumption.test.ts` |
| AC-2 | `decision list --filter-rec <recId>` → only tied decisions with matching id; untied decisions EXCLUDED. | `decision.test.ts` |
| AC-3 | Combine `--filter-rec` + `--filter-status` → AND semantics; both filters applied. | per-command tests |
| AC-4 | Combine `--filter-rec` + `--format json` → JSON output is the filtered array. | per-command tests |
| AC-5 | Empty after `--filter-rec` filter + terminal mode → `No <subject> matching rec=<id> recorded.\n`. With combined filters: `No <subject> matching status=<X>, rec=<id> recorded.\n`. | per-command tests |
| AC-6 | Unknown rec id (no validation) → empty result, exit 0. No stderr. | per-command tests |
| AC-7 | Default (no `--filter-rec`) preserves current behavior; all Slice-8/21/22 tests pass unchanged. | full `pnpm turbo run test` |
| AC-8 | Phase-31.1 drift guard UNCHANGED. | `tests/docs/cli-reference.test.ts` |

## Testing

- Spawn-CLI pattern. Verify combined filter results in both terminal + JSON.
- Done-bar: full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design — --filter-rec on assumption/decision list (Praxis Slice 23)
feat(core): --filter-rec on assumption/decision list (Slice 23)
docs: document --filter-rec + reconcile Slice-22 follow-ref (Slice 23)
```

Three commits.

## Success Criteria

1. All 8 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-22 § Follow-On `--filter-rec` entry reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **No id validation.** Operator can `cadence recommendation list` to discover ids; empty filter result speaks for itself. Avoids extra ledger read.
2. **Untied decisions EXCLUDED by `--filter-rec`.** Operator scoped the query; untied are out-of-scope by definition. No `--include-untied` flag — different command (full list).
3. **AND semantics for combined filters.** Predictable; matches operator mental model.
4. **Empty message reflects active filter dimensions.** Operator sees which filters narrowed the result to empty.
5. **No `--filter-rec` on recommendation list.** No FK field; skip.
6. **CLI-layer filter, not store-layer.** Consistent with Slice 22.

## Follow-On

- **Validate rec id against ledger** (with hint suggestion on unknown).
- **Multi-rec filter** (`--filter-rec rec-A,rec-B`).
- **`--include-untied`** on decision list when `--filter-rec` set.
- **`--filter-text <substr>`** body-text search.
- ~~**`--limit <n>`** pagination.~~ **`--limit` SHIPPED Slice 24** — see [list-limit design](2026-05-20-cadence-list-limit-design.md). Offset/skip still deferred.
- **`supersededBy <id>`** decision field.
- **Rec↔phase linkage** — biggest remaining scope.
- **Auto-dispatch / subagent routing** — forever-deferred.
