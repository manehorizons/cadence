# CADENCE `--reverse` on list commands — Design

**Date:** 2026-05-21
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 27 (follow-on to Slice 26 — `--offset` on lists; completes the pagination trio with `--limit` + `--offset` + `--reverse`)
**Predecessor slice docs:**
- [`2026-05-21-cadence-list-offset-design.md`](2026-05-21-cadence-list-offset-design.md) (Slice 26 — § Follow-On listed `--reverse`)
- [`2026-05-20-cadence-list-filter-text-design.md`](2026-05-20-cadence-list-filter-text-design.md) (Slice 25 — § Follow-On listed `--reverse`)
- [`2026-05-20-cadence-list-limit-design.md`](2026-05-20-cadence-list-limit-design.md) (Slice 24 — § Follow-On listed `--reverse`)

## Summary

**Slice 27** adds a `--reverse` boolean flag to the three `list` commands. Reverses the underlying entry order AFTER filters apply and BEFORE `--offset`/`--limit` page the reversed view. Closes Slice-24/25/26 § Follow-On `--reverse` entries.

Commands gaining `--reverse`:
1. `cadence recommendation list --reverse`
2. `cadence assumption list --reverse`
3. `cadence decision list --reverse`

- **Boolean flag.** Default false → insertion order preserved (current behavior).
- **Applied AFTER filters, BEFORE `--offset`/`--limit`**: status → rec → text → reverse → offset → limit.
- **No validation needed.** Commander `.option('--reverse', '...')` produces `boolean | undefined`.
- **Works in both terminal and JSON modes.** Terminal emits entries in reversed order; JSON array is reversed.
- **No new `filterDims` entry.** Reverse is an order change, not a narrowing dim — empty-after-filter message unchanged.

It does **not** support reverse-chronological sort by a specific field (`--sort-by created --reverse`), iteration direction other than full reverse, perform fresh fs/git scan.

## Product Boundary

Read-only.

## Scope

### In scope

- Add `--reverse` boolean option to 3 list commands.
- Apply `entries = entries.slice().reverse()` (or in-place `.reverse()` on a fresh slice copy) AFTER existing filters, BEFORE `--offset`/`--limit`.
- Tests per ACs.

### Out of scope

- `--sort-by <field>` (defer; reverse alone covers "newest first" since insertion order = chronological).
- `--reverse` interaction with a future stable-sort flag — out of this slice's surface.
- `filterDims` extension (reverse is not a narrowing dim).

## Architecture

### MODIFIED files

- All 3 CLI `list` commands.
- All 3 existing CLI test files.

### Untouched

- All store helpers / readers.
- `@cadence/types` — no schema change.
- `docs/reference/commands.md` — list sections are summary-level; cli-reference drift guard untripped.

## Implementation Pattern

```ts
.option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
.action(async (opts) => {
  // ... existing filters (status → rec → text)
  if (opts.reverse) {
    entries = entries.slice().reverse();
  }
  if (opts.offset !== undefined) {
    // ... existing offset logic
  }
  if (opts.limit !== undefined) {
    // ... existing limit logic
  }
  // ... existing output
});
```

`.slice().reverse()` copies first to avoid mutating the underlying ledger reference (defensive; the reader returns a fresh array but explicit-copy is cheap insurance).

Filter order: **status → rec → text → reverse → offset → limit**.

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `<cmd> list --reverse` on populated 3-entry ledger → terminal output shows entries in reverse insertion order. | per-command tests |
| AC-2 | `--reverse` + `--format json` → JSON array is reversed. | per-command tests |
| AC-3 | Combine `--reverse --offset 1 --limit 2` → reverses first, then skips 1, then caps at 2 (entries `[N-2, N-3]` for ledger of N). | per-command tests |
| AC-4 | Combine `--filter-status` + `--reverse` → filter first, then reverse the filtered subset. | per-command tests |
| AC-5 | `--reverse` flag default (omitted) preserves insertion order (existing tests unchanged). | per-command tests |
| AC-6 | Empty-after-filter message UNCHANGED by `--reverse` (reverse is order change, not narrowing). | per-command tests |
| AC-7 | Default (no `--reverse`) preserves existing behavior; all Slice-1/3/8/21/22/23/24/25/26 tests pass. | full `pnpm turbo run test` |
| AC-8 | Phase-31.1 drift guard UNCHANGED. | `tests/docs/cli-reference.test.ts` |

## Testing

- Spawn-CLI pattern. Combine with existing filter + offset + limit tests.
- Done-bar: full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design — --reverse on list commands (Praxis Slice 27)
feat(core): --reverse on recommendation/assumption/decision list (Slice 27)
docs: document --reverse + reconcile Slice-26 follow-ref (Slice 27)
```

Three commits.

## Success Criteria

1. All 8 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-26 (and Slice-24/25) § Follow-On `--reverse` entries reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **Boolean flag, not enum.** Reverse is binary; an enum `--order asc|desc` would be wider surface with the same expressiveness. `--reverse` is the established Unix idiom (`ls -r`, `sort -r`).
2. **Order: status → rec → text → reverse → offset → limit.** Reverse comes AFTER filters so the operator pages a reversed view of the *filtered* set. Inverse order (reverse before filter) would be equivalent for whole-set reverse but counter-intuitive when combined with offset/limit. Documented + tested via AC-3.
3. **`.slice().reverse()` not `.reverse()`.** Defensive copy — the reader returns a fresh array today, but explicit-copy survives a future change that returns a cached/shared reference.
4. **No `filterDims` extension.** Reverse changes order, not membership. Empty-after-filter message stays unchanged (operator who narrowed-to-empty and added `--reverse` still sees the same dim list).
5. **No `--sort-by` in this slice.** Insertion order = chronological in this ledger (id prefixes encode date). Sort-by-arbitrary-field is a separate slice with its own decision surface (which fields are sortable, stable-sort guarantees, etc.).
6. **CLI-layer slice.** Consistent with Slice 22/23/24/25/26.

## Follow-On

- ~~**`--reverse`** for reverse-chronological output.~~ **SHIPPED Slice 27** (this slice).
- **Sort flags** (`--sort-by created|status|...`) with stable-sort + multi-key support.
- **`--filter-regex <pattern>`** for power users.
- **`--filter-text-exact`** for case-sensitive match.
- **Per-field selection** (`--filter-text-in title,text`).
- **Multi-status filter**.
- **`--include-untied`** decision list.
- ~~**`supersededBy <id>`** decision field.~~ **SHIPPED Slice 28** — see [decision-supersededby design](2026-05-21-cadence-decision-supersededby-design.md). Optional `--by <newId>` on supersede; FK + self-ref + cycle checks; reactivate clears.
- **Bulk transitions** (`cadence assumption validate --all-rec <recId>`).
- **Rec↔phase linkage** — biggest remaining scope.
- **Auto-dispatch / subagent routing** — forever-deferred.
