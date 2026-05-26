# CADENCE `--limit <n>` on list commands — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 24 (follow-on to Slice 23 — `--filter-rec` on lists)
**Predecessor slice docs:**
- [`2026-05-20-cadence-list-filter-rec-design.md`](2026-05-20-cadence-list-filter-rec-design.md) (Slice 23 — § Follow-On listed `--limit`)

## Summary

**Slice 24** adds a `--limit <n>` flag to the three `list` commands. Caps output to first N entries after filters apply. Validates positive integer; rejects 0, negative, fractional, or non-numeric with exit 1. Works in both terminal and JSON modes. Closes Slice-23 § Follow-On `--limit` entry.

Commands gaining `--limit <n>`:
1. `cadence recommendation list --limit <n>`
2. `cadence assumption list --limit <n>`
3. `cadence decision list --limit <n>`

- **Optional flag.** Omitted → no cap (current behavior).
- **Validated as positive integer (n >= 1).** Reject `0`, negative, fractional, non-numeric.
- **Applied AFTER filters.** `--filter-status open --limit 5` → first 5 open entries.
- **No "showing X of Y total" footer.** Operator can run unbounded for counts; `--limit` is for output capping. JSON consumers see truncation via array length.

It does **not** support negative offsets, page numbers, `--skip <n>`/`--offset <n>`, sorting flags (insertion order preserved), perform fresh fs/git scan.

## Product Boundary

Read-only.

## Scope

### In scope

- Add `--limit <n>` option to 3 list commands.
- Parse as `Number(value)`; validate `Number.isInteger && >= 1`.
- Apply `.slice(0, n)` AFTER existing filters.
- Tests per ACs.

### Out of scope

- `--offset <n>` / `--skip <n>` (defer).
- `--reverse` (defer; insertion order preserved).
- "showing X of Y" footer.
- Sort flags (defer).

## Architecture

### MODIFIED files

- All 3 CLI `list` commands.
- Existing CLI test files.
- `docs/reference/commands.md` — note `--limit`.

### Untouched

- All store helpers / readers.
- `@cadence/types` — no schema change.

## Implementation Pattern

```ts
.option('--limit <n>', 'Cap output to first N entries (after filters)')
.action(async (opts) => {
  // ... format + filter logic
  if (opts.limit !== undefined) {
    const n = Number(opts.limit);
    if (!Number.isInteger(n) || n < 1) {
      process.stderr.write(`<cmd> list failed: invalid limit: ${opts.limit}\n`);
      process.exitCode = 1;
      return;
    }
    entries = entries.slice(0, n);
  }
  // ... existing output
});
```

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `<cmd> list --limit 2` on populated ledger → terminal output shows first 2 entries only. | per-command tests |
| AC-2 | `--limit` + `--format json` → JSON array length === min(limit, totalAfterFilters). | per-command tests |
| AC-3 | Combine `--limit` + `--filter-status` + `--filter-rec` → all filters applied first, then `.slice(0, n)`. | per-command tests |
| AC-4 | Invalid `--limit 0` → exit 1 + stderr `<cmd> list failed: invalid limit: 0`. | per-command tests |
| AC-5 | Invalid `--limit -3` / `--limit abc` / `--limit 1.5` → exit 1 + stderr. | per-command tests |
| AC-6 | `--limit N` larger than total entries → returns all entries (no error). | per-command tests |
| AC-7 | Default (no `--limit`) preserves existing behavior; all Slice-1/3/8/21/22/23 tests pass. | full `pnpm turbo run test` |
| AC-8 | Phase-31.1 drift guard UNCHANGED. | `tests/docs/cli-reference.test.ts` |

## Testing

- Spawn-CLI pattern. Combine with existing filter tests.
- Done-bar: full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design — --limit on list commands (Praxis Slice 24)
feat(core): --limit on recommendation/assumption/decision list (Slice 24)
docs: document --limit + reconcile Slice-23 follow-ref (Slice 24)
```

Three commits.

## Success Criteria

1. All 8 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-23 § Follow-On `--limit` entry reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **`Number.isInteger` + `>= 1`** validation. Rejects 0, fractional, negative, `NaN`. Explicit positive cap; `--limit 0` is an operator typo, not an empty-result request.
2. **Limit applied AFTER filters.** Predictable: filter dimensions narrow first, then top-N. Inverse order would surprise.
3. **No "showing X of Y" footer.** Adds noise; operator can re-run unbounded for counts. JSON consumers see truncation in array length.
4. **No `--offset`/`--skip` in this slice.** Defer until pagination is needed.
5. **No sort flag.** Insertion order preserved across the codebase; sorting is `jq` territory in JSON mode.
6. **CLI-layer slice, not store-layer.** Consistent with Slice 22/23.

## Follow-On

- ~~**`--offset <n>`** / **`--skip <n>`** for pagination.~~ **SHIPPED Slice 26** — see [list-offset design](2026-05-21-cadence-list-offset-design.md). Non-negative integer (vs `--limit`'s positive-integer); applied between filters and `--limit`.
- **`--reverse`** for reverse-chronological output.
- **Sort flags** (`--sort-by created|status|...`).
- ~~**`--filter-text <substr>`** body-text search.~~ **SHIPPED Slice 25** — see [list-filter-text design](2026-05-20-cadence-list-filter-text-design.md). Case-insensitive substring match.
- **Multi-status filter**.
- **`supersededBy <id>`** decision field.
- **Rec↔phase linkage** — biggest remaining scope.
- **Auto-dispatch / subagent routing** — forever-deferred.
