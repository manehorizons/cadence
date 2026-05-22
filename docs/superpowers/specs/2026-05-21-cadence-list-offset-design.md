# CADENCE `--offset <n>` on list commands — Design

**Date:** 2026-05-21
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 26 (follow-on to Slice 25 — `--filter-text` on lists; pagination companion to Slice 24 `--limit`)
**Predecessor slice docs:**
- [`2026-05-20-cadence-list-limit-design.md`](2026-05-20-cadence-list-limit-design.md) (Slice 24 — § Follow-On listed `--offset` / `--skip`)
- [`2026-05-20-cadence-list-filter-text-design.md`](2026-05-20-cadence-list-filter-text-design.md) (Slice 25 — § Follow-On listed `--offset`)

## Summary

**Slice 26** adds a `--offset <n>` flag to the three `list` commands. Skips the first N entries after filters apply and before `--limit` caps output. Pagination companion to Slice-24 `--limit`. Validates non-negative integer; rejects negative, fractional, or non-numeric with exit 1 (note: `--offset 0` is valid no-op, unlike `--limit 0`). Works in both terminal and JSON modes. Closes Slice-24 + Slice-25 § Follow-On `--offset` entries.

Commands gaining `--offset <n>`:
1. `cadence recommendation list --offset <n>`
2. `cadence assumption list --offset <n>`
3. `cadence decision list --offset <n>`

- **Optional flag.** Omitted → no skip (current behavior).
- **Validated as non-negative integer (n >= 0).** Reject negative, fractional, non-numeric. `0` is valid no-op (mirrors array-slice semantics; operator-friendly for templated pagination).
- **Applied AFTER filters, BEFORE `--limit`**: status → rec → text → offset → limit. Page N of size K = `--offset (N-1)*K --limit K`.
- **Offset beyond total** → empty result, exit 0. Terminal mode emits the same "matching" message as other filters (offset is a structural narrowing dim). JSON mode → `[]`.

It does **not** support negative offsets, reverse iteration, page-number sugar (`--page <n> --page-size <k>`), perform fresh fs/git scan.

## Product Boundary

Read-only.

## Scope

### In scope

- Add `--offset <n>` option to 3 list commands.
- Parse as `Number(value)`; validate `Number.isInteger && >= 0`.
- Apply `.slice(n)` (or `.slice(n, n + limit)` when combined with `--limit`) AFTER existing filters, BEFORE `--limit` cap.
- Empty-after-filter terminal message includes `offset=<n>` dimension when active.
- Tests per ACs.

### Out of scope

- `--page <n> --page-size <k>` sugar (defer; computable via `--offset` + `--limit`).
- `--reverse` / sort flags (still deferred).
- Showing "page X of Y" / "skipped N" footer.

## Architecture

### MODIFIED files

- All 3 CLI `list` commands.
- All 3 existing CLI test files.

### Untouched

- All store helpers / readers.
- `@cadence/types` — no schema change.
- `docs/reference/commands.md` — list sections are summary-level (do not enumerate every flag); cli-reference drift guard untripped.

## Implementation Pattern

```ts
.option('--offset <n>', 'Skip the first N entries (after filters)')
.action(async (opts) => {
  // ... existing filters (status → rec → text)
  if (opts.offset !== undefined) {
    const n = Number(opts.offset);
    if (!Number.isInteger(n) || n < 0) {
      process.stderr.write(`<cmd> list failed: invalid offset: ${opts.offset}\n`);
      process.exitCode = 1;
      return;
    }
    entries = entries.slice(n);
  }
  if (opts.limit !== undefined) {
    // existing --limit logic, applied AFTER offset
    entries = entries.slice(0, n);
  }
  // ... existing output
  // Empty-filter message extends `filterDims`:
  if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
});
```

Filter order: **status → rec → text → offset → limit**.

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `<cmd> list --offset 2` on populated 5-entry ledger → terminal output shows entries 3..5 (skips first 2). | per-command tests |
| AC-2 | `--offset` + `--format json` → JSON array starts at index `offset`. | per-command tests |
| AC-3 | Combine `--offset 1 --limit 2` → returns entries `[1..3]` (slice(1).slice(0,2)). | per-command tests |
| AC-4 | Combine `--filter-status` + `--offset` + `--limit` → all filters first, then offset, then limit cap. | per-command tests |
| AC-5 | `--offset 0` → no-op (returns full filtered set). | per-command tests |
| AC-6 | Invalid `--offset -1` / `--offset abc` / `--offset 1.5` → exit 1 + stderr `<cmd> list failed: invalid offset: <value>`. | per-command tests |
| AC-7 | `--offset N` >= total → empty result, exit 0 (terminal: `No <subject> matching offset=N recorded.\n`; JSON: `[]`). | per-command tests |
| AC-8 | Default (no `--offset`) preserves existing behavior; all Slice-1/3/8/21/22/23/24/25 tests pass. | full `pnpm turbo run test` |
| AC-9 | Phase-31.1 drift guard UNCHANGED. | `tests/docs/cli-reference.test.ts` |

## Testing

- Spawn-CLI pattern. Combine with existing filter + limit tests.
- Done-bar: full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design — --offset on list commands (Praxis Slice 26)
feat(core): --offset on recommendation/assumption/decision list (Slice 26)
docs: document --offset + reconcile Slice-24/25 follow-ref (Slice 26)
```

Three commits.

## Success Criteria

1. All 9 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-24 + Slice-25 § Follow-On `--offset` / `--skip` entries reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **`Number.isInteger` + `>= 0`** validation. Differs from `--limit` (which requires `>= 1`): `--offset 0` is a meaningful no-op for templated pagination loops (`for page in 0..n: --offset $((page * k)) --limit k`) — refusing it would force callers to special-case the first page. `--limit 0` has no such use (it would mean "return zero"; operator wants `head -n 0` if that's the intent, which is upstream).
2. **Order: status → rec → text → offset → limit.** Offset is structural (skip N of the filtered set), so it sits between filters and the limit cap. Page N of size K = `--offset (N-1)*K --limit K`. Inverse order (limit before offset) would silently lose entries.
3. **Offset beyond total → empty + exit 0.** Operator paginating past the end is normal end-of-stream, not error. Mirrors `--filter-status` empty-result semantics.
4. **Empty-filter message includes `offset=<n>`.** Operator who paginated off the end sees explicit reason. Joins existing `filterDims` array unchanged.
5. **No `--page`/`--page-size` sugar.** Two-flag composition is explicit and `jq`-friendly; sugar would be a surface multiplier with no behavior change.
6. **CLI-layer slice.** Consistent with Slice 22/23/24/25.

## Follow-On

- ~~**`--offset <n>`** / **`--skip <n>`** for pagination.~~ **SHIPPED Slice 26** (this slice).
- **`--reverse`** for reverse-chronological output.
- **Sort flags** (`--sort-by created|status|...`).
- **`--filter-regex <pattern>`** for power users.
- **`--filter-text-exact`** for case-sensitive match.
- **Per-field selection** (`--filter-text-in title,text`).
- **Multi-status filter**.
- **`--include-untied`** decision list.
- **`supersededBy <id>`** decision field.
- **Rec↔phase linkage** — biggest remaining scope.
- **Auto-dispatch / subagent routing** — forever-deferred.
