# CADENCE `--filter-status` on list commands — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 22 (follow-on to Slice 21 — `--format json` on lists)
**Predecessor slice docs:**
- [`2026-05-20-cadence-json-format-lists-design.md`](2026-05-20-cadence-json-format-lists-design.md) (Slice 21 — § Follow-On listed filter flags)

## Summary

**Slice 22** adds a `--filter-status <status>` flag to the three `list` commands. Validates against each subject's status enum; rejects invalid values with exit 1. Filter applies in both terminal and JSON modes. Closes Slice-21 § Follow-On `--filter-status` entry.

Commands gaining `--filter-status <status>`:
1. `cadence recommendation list --filter-status <candidate|accepted|deferred|rejected|converted>`
2. `cadence assumption list --filter-status <open|validated|rejected>`
3. `cadence decision list --filter-status <active|superseded|rescinded>`

- **Optional flag.** Omitted → no filter (current behavior).
- **Validated against subject enum**. Invalid → exit 1 + stderr `<cmd> list failed: invalid status: <value>`.
- **Works in both `--format terminal` and `--format json`** modes.
- **Empty filtered result**: terminal mode → existing `No <subject> recorded.`-style message OR new "No <subject> matching status=X recorded." for clarity? Pick: same `No <subject>...` message in terminal mode (operator sees what they got); JSON mode → `[]`.

Actually for clarity in terminal mode let's emit a status-aware message: `No <subject> with status=<X> recorded.\n`. This distinguishes from "no entries at all".

It does **not** modify `@cadence/types` schemas, add multi-status filters (`--filter-status open,validated`; defer), filter by other fields (`--filter-rec`, `--filter-text`; defer), perform fresh fs/git scan.

## Product Boundary

Read-only. No new reads/writes.

## Scope

### In scope

- Add `--filter-status <status>` option to 3 list commands.
- Validate using each subject's existing Zod status enum.
- Apply filter to ledger array before output (terminal + JSON).
- Empty-after-filter terminal message: `No <subject> with status=<X> recorded.\n`.
- Tests per ACs.

### Out of scope

- Multi-status: `--filter-status open,validated` (defer; `jq` covers it in JSON mode).
- Other filters (`--filter-rec`, `--filter-text`, `--filter-priority`, etc.).
- `--include-untied` for decisions (defer).
- Wildcards or regex matching.

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/recommendation.ts` — `list` gains `--filter-status` + validation.
- `packages/core/src/cli/commands/assumption.ts` — `list` gains `--filter-status` + validation.
- `packages/core/src/cli/commands/decision.ts` — `list` gains `--filter-status` + validation.
- Existing CLI test files (`recommendation.test.ts`, `assumption.test.ts`, `decision.test.ts`) — add filter tests.
- `docs/reference/commands.md` — note `--filter-status` on each list command.

### NEW files

None.

### Untouched

- All store helpers + readers — return full ledgers; filter applied in CLI layer.
- `@cadence/types` — no schema change.
- `cli/register.ts` — no new top-level commands.

## Implementation Pattern

```ts
import { RecommendationStatusZ } from '@cadence/types';

.option('--filter-status <status>', 'Filter to only entries with this status', undefined)
.action(async (opts) => {
  // ... format validation
  const ledger = await readRecommendationLedger(process.cwd());
  let entries = ledger.recommendations;
  if (opts.filterStatus !== undefined) {
    const parse = RecommendationStatusZ.safeParse(opts.filterStatus);
    if (!parse.success) {
      process.stderr.write(`recommendation list failed: invalid status: ${opts.filterStatus}\n`);
      process.exitCode = 1;
      return;
    }
    entries = entries.filter((r) => r.status === parse.data);
  }
  if (format === 'json') {
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
    return;
  }
  if (entries.length === 0) {
    const msg = opts.filterStatus
      ? `No recommendations with status=${opts.filterStatus} recorded.\n`
      : 'No recommendations recorded.\n';
    process.stdout.write(msg);
    return;
  }
  // existing terminal loop
});
```

Repeat pattern across 3 commands with subject-specific enum.

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `recommendation list --filter-status accepted` → only `status === 'accepted'` entries in output (terminal + JSON modes). | `recommendation.test.ts` |
| AC-2 | `assumption list --filter-status open` symmetric. | `assumption.test.ts` |
| AC-3 | `decision list --filter-status active` symmetric. | `decision.test.ts` |
| AC-4 | Invalid status (`--filter-status bogus`) → exit 1, stderr `<cmd> list failed: invalid status: bogus`. | per-command tests |
| AC-5 | Empty after filter + terminal mode → `No <subject> with status=<X> recorded.\n`. | per-command tests |
| AC-6 | Empty after filter + JSON mode → `[]`. | per-command tests |
| AC-7 | Default (no `--filter-status`) preserves current behavior verbatim; all Slice-1/3/8/21 tests pass unchanged. | full `pnpm turbo run test` |
| AC-8 | Filter combines with `--format json` cleanly: JSON output is the filtered array, not full ledger. | per-command tests |
| AC-9 | Phase-31.1 drift guard UNCHANGED. | `tests/docs/cli-reference.test.ts` |

## Testing

- Spawn-CLI pattern across 3 test files. Filter + parse stdout shape.
- Done-bar: full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design — --filter-status on list commands (Praxis Slice 22)
feat(core): --filter-status on recommendation/assumption/decision list (Slice 22)
docs: document --filter-status + reconcile Slice-21 follow-ref (Slice 22)
```

Three commits.

## Success Criteria

1. All 9 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-21 § Follow-On `--filter-status` entry reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **Validate against existing Zod enum**, not custom string check. Single source of truth; auto-tracks future enum additions.
2. **Single status, not comma-separated.** `--filter-status open,validated` is `jq` territory in JSON mode; defer.
3. **Status-aware empty message** in terminal mode (`No X with status=Y recorded.`). Distinguishes from "no entries at all". JSON mode → bare `[]` (machine-readable; no friendly text).
4. **CLI-layer filter, not store-layer.** Store returns full ledger; CLI applies subset. Keeps store helpers narrow + reusable.
5. **No multi-subject status filter on rec list** (e.g. `--filter-rec-status accepted --filter-assumption-status open`). Single subject per list command; cross-subject filters belong on `show`/`stats`/`audit`.

## Follow-On

- **Multi-status filter** (`--filter-status open,validated`).
- **`--filter-rec <recId>`** on assumption/decision lists.
- **`--filter-text <substr>`** for body-text search.
- **`--limit <n>`** for paginated output.
- **`--format json-compact`** for pipe consumers.
- **`supersededBy <id>`** decision field.
- **Rec↔phase linkage** — biggest remaining scope.
- **Auto-dispatch / subagent routing** — forever-deferred.
