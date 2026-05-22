# CADENCE `--format json` on list Commands — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 21 (follow-on to Slice 20 — `--format json` on show/stats/audit)
**Predecessor slice docs:**
- [`2026-05-20-cadence-json-format-design.md`](2026-05-20-cadence-json-format-design.md) (Slice 20 — established `--format <terminal|json>` flag pattern; § Follow-On listed list commands)

## Summary

**Slice 21** extends Slice-20's `--format <terminal|json>` flag to the three remaining read-only `list` commands. Each `list` already prints compact one-line-per-entry text; JSON mode emits the full ledger entities array. Empty ledger → JSON `[]` (not `null` — list output is always a sequence; empty list is empty array).

Commands gaining `--format <terminal|json>`:
1. `cadence recommendation list`
2. `cadence assumption list`
3. `cadence decision list`

- **Default `--format terminal`** preserves the existing compact-line contract.
- **`--format json`** outputs `JSON.stringify(ledger.<subject>, null, 2) + '\n'` — array of full entities.
- **Empty ledger**: JSON mode emits `[]` (exit 0). Terminal mode emits the existing `No <subject> recorded.` message.

It does **not** modify `@cadence/types` schemas, add filter flags (defer; consumers can `jq` the JSON), perform fresh fs/git scan, touch `state.json` / `STATE.md` / loop transition.

## Product Boundary

Read-only across the 3 affected commands. No new reads or writes.

## Scope

### In scope

- Add `--format <terminal|json>` option to 3 list CLI subcommands.
- Default `terminal`. Validate enum identical to Slice 20.
- JSON output = full entities array (NOT the wrapping ledger envelope `{schemaVersion: 1, ...}` — the array is enough; consumers don't need schemaVersion).
- Spawn-CLI tests verify JSON shape + back-compat with terminal mode.

### Out of scope

- `--filter-status` and other filter flags (defer; `jq` handles it).
- `--format json` on write surfaces (add/transition).
- NDJSON streaming.
- Schema version in JSON output (entities are self-describing; consumers parse against `@cadence/types` if needed).

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/recommendation.ts` — `list` gains `--format` + JSON branch.
- `packages/core/src/cli/commands/assumption.ts` — `list` gains `--format` + JSON branch.
- `packages/core/src/cli/commands/decision.ts` — `list` gains `--format` + JSON branch.
- 3 existing CLI test files — extend with JSON-shape assertions.
- `docs/reference/commands.md` — note `--format` on list commands.

### NEW files

None.

### Untouched

- All store helpers + readers — already return full ledgers.
- `@cadence/types` — no schema change.
- `cli/register.ts` — no new top-level commands.

## Data Model

JSON envelope per command:
- `recommendation list --format json` → `Recommendation[]`
- `assumption list --format json` → `Assumption[]`
- `decision list --format json` → `IntelligenceDecision[]`

Pretty-printed (2-space indent + trailing newline), matching Slice 20.

## Implementation Pattern

```ts
const format = opts.format ?? 'terminal';
if (format !== 'terminal' && format !== 'json') {
  process.stderr.write(`<cmd> list failed: unsupported format: ${format}\n`);
  process.exitCode = 1;
  return;
}
const ledger = await read<Subject>Ledger(process.cwd());
if (format === 'json') {
  process.stdout.write(JSON.stringify(ledger.<subject>, null, 2) + '\n');
  return;
}
// existing terminal path
```

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `recommendation list --format json` → exit 0, stdout parses to array of `Recommendation`. Populated ledger → entries present. | `recommendation.test.ts` |
| AC-2 | `assumption list --format json` symmetric. | `assumption.test.ts` |
| AC-3 | `decision list --format json` symmetric. | `decision.test.ts` |
| AC-4 | Empty ledger with `--format json` → exit 0, stdout `[]\n`. Terminal mode unchanged (`No <subject> recorded.`). | per-command tests |
| AC-5 | Invalid `--format <foo>` → exit 1 + stderr `<cmd> list failed: unsupported format: <foo>`. | per-command tests |
| AC-6 | Default (no `--format` flag) → terminal output verbatim; all Slice-1/3/8 list tests pass unchanged. | full `pnpm turbo run test` |
| AC-7 | Phase-31.1 drift guard UNCHANGED. | `tests/docs/cli-reference.test.ts` |

## Testing

- Spawn-CLI pattern across 3 test files. JSON.parse stdout for shape assertions.
- Done-bar: full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design — --format json on list commands (Praxis Slice 21)
feat(core): --format json on recommendation/assumption/decision list (Slice 21)
docs: document --format json on lists + reconcile Slice-20 follow-ref (Slice 21)
```

Three commits.

## Success Criteria

1. All 7 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-20 § Follow-On `--format json on list commands` entry reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard passes UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **Empty ledger → `[]`, not `null`.** Lists are always sequences; empty is empty array. Different from `stats`/`audit` where `null` distinguishes "no ledgers at all".
2. **JSON output is entity array, NOT full ledger envelope** (`{schemaVersion, recommendations: [...]}`). Consumers don't need the wrapper — `jq` can drill in either way, but the array is the actual data.
3. **No filter flags in this slice.** Consumers `jq '.[] | select(.status == "open")' for filtering. Adding filters multiplies surface area; defer.
4. **Same validation + error path as Slice 20.** No abstraction; trivial repetition keeps each file self-contained.
5. **Pretty-printed JSON.** Consistent with Slice 20. Compact form deferred.

## Follow-On

- ~~**`--filter-status`** and other filter flags on list commands.~~ **`--filter-status` SHIPPED Slice 22** — see [list-filter-status design](2026-05-20-cadence-list-filter-status-design.md). Other filters still deferred.
- **`--format json-compact`** for piped consumers.
- **`--format json` on write surfaces** (add/transition).
- **NDJSON streaming** for very large ledgers.
- **`supersededBy <id>`** decision field.
- **Rec↔phase linkage** — biggest remaining scope.
- **Auto-dispatch / subagent routing** — forever-deferred.
