# CADENCE `--filter-text <substr>` on list commands — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 25 (follow-on to Slice 24 — `--limit` on lists)
**Predecessor slice docs:**
- [`2026-05-20-cadence-list-limit-design.md`](2026-05-20-cadence-list-limit-design.md) (Slice 24 — § Follow-On listed `--filter-text`)

## Summary

**Slice 25** adds a `--filter-text <substr>` flag to the three `list` commands. Case-insensitive substring match against each subject's body field(s). Closes Slice-24 § Follow-On `--filter-text` entry.

Match fields per subject:
- `recommendation list --filter-text <s>` matches `title` OR `summary`.
- `assumption list --filter-text <s>` matches `text`.
- `decision list --filter-text <s>` matches `title` OR `rationale`.

- **Optional flag.** Omitted → no text filter.
- **Case-insensitive substring match** (`String.prototype.toLowerCase().includes(...)`). No regex (defer).
- **Empty `<substr>`** → matches everything (operator can confirm by running unbounded; better than special-casing).
- **Applied AFTER status + rec filters, BEFORE `--limit`**: status → rec → text → limit.
- **Combines with all existing filters via AND semantics.**

It does **not** support regex, `--filter-text-exact` (case-sensitive), multi-field selection, fuzzy match, perform fresh fs/git scan.

## Product Boundary

Read-only.

## Scope

### In scope

- Add `--filter-text <substr>` option to 3 list commands.
- Case-insensitive substring match using `toLowerCase().includes()`.
- Per-subject match fields documented + tested.
- Empty-after-filter terminal message includes `text` dimension when active.
- Tests per ACs.

### Out of scope

- Regex (`--filter-regex`).
- Case-sensitive variant (`--filter-text-exact`).
- Per-field selection (`--filter-text-in <fields>`).
- Fuzzy match (Levenshtein, etc.).
- Highlighted snippet output.

## Architecture

### MODIFIED files

- 3 CLI list commands.
- 3 existing CLI test files.
- `docs/reference/commands.md` — note `--filter-text`.

### Untouched

- All store helpers / readers.
- `@cadence/types` — no schema change.

## Implementation Pattern

```ts
.option('--filter-text <substr>', 'Case-insensitive substring search')
.action(async (opts) => {
  // ... existing filters
  if (opts.filterText !== undefined) {
    const needle = opts.filterText.toLowerCase();
    entries = entries.filter((entry) =>
      // per subject
      entry.title.toLowerCase().includes(needle) ||
      entry.summary.toLowerCase().includes(needle),
    );
  }
  // ... limit + output
  // Empty-filter message extends `filterDims`:
  if (opts.filterText) filterDims.push(`text="${opts.filterText}"`);
});
```

Match field lists per subject:
- Rec: `title || summary`
- Assumption: `text`
- Decision: `title || rationale`

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `recommendation list --filter-text postgres` → only entries whose `title` or `summary` contains "postgres" (case-insensitive). | recommendation tests |
| AC-2 | `assumption list --filter-text X` → only entries whose `text` contains "X". | assumption tests |
| AC-3 | `decision list --filter-text X` → only entries whose `title` or `rationale` contains "X". | decision tests |
| AC-4 | Case-insensitive: `--filter-text POSTGRES` matches "postgres". | per-command tests |
| AC-5 | Combine `--filter-text` + `--filter-status` + `--filter-rec` + `--limit` → AND semantics, slice last. | per-command tests |
| AC-6 | Empty after filter + terminal mode → `No <subject> matching ... text="<s>" ... recorded.\n`. | per-command tests |
| AC-7 | Empty `--filter-text ""` → matches all (no narrowing). | per-command tests |
| AC-8 | Default (no `--filter-text`) preserves existing behavior. | full `pnpm turbo run test` |
| AC-9 | Phase-31.1 drift guard UNCHANGED. | `tests/docs/cli-reference.test.ts` |

## Testing

- Spawn-CLI pattern. Combined-filter tests.
- Done-bar: full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design — --filter-text on list commands (Praxis Slice 25)
feat(core): --filter-text on recommendation/assumption/decision list (Slice 25)
docs: document --filter-text + reconcile Slice-24 follow-ref (Slice 25)
```

Three commits.

## Success Criteria

1. All 9 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-24 § Follow-On `--filter-text` entry reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **Case-insensitive substring match.** `toLowerCase().includes()` — minimal surface, predictable. Operator typing `postgres` finds `Postgres` and `POSTGRES`.
2. **Multi-field OR per subject.** Rec searches title+summary; decision searches title+rationale. Operator memory of "where I said it" is fuzzy; OR-ing fields is forgiving.
3. **Empty `<substr>` = match all.** Predictable; no special case. Operator who passes empty string gets unbounded result.
4. **Filter order: status → rec → text → limit.** Documented + tested. Text comes after structural filters (cheap predicate; substring search on already-narrow set).
5. **No regex in this slice.** Operator + script use case is substring; regex is `jq` territory in JSON mode (`jq 'map(select(.text | test("..."; "i")))'`).
6. **Per-subject match fields hard-coded.** Not configurable; would multiply surface area.
7. **No exact-case variant.** Defer; case-sensitive search is rarely what operator wants.
8. **CLI-layer filter.** Consistent with Slice 22/23/24.

## Follow-On

- **`--filter-regex <pattern>`** for power users.
- **`--filter-text-exact`** for case-sensitive match.
- **Per-field selection** (`--filter-text-in title,text`).
- ~~**`--offset <n>`** pagination.~~ **SHIPPED Slice 26** — see [list-offset design](2026-05-21-cadence-list-offset-design.md). Non-negative integer; applied after filters, before `--limit`.
- **`--reverse`** + sort flags.
- **`--include-untied`** decision list.
- **`supersededBy <id>`** decision field.
- **Rec↔phase linkage** — biggest remaining scope.
- **Auto-dispatch / subagent routing** — forever-deferred.
