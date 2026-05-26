# CADENCE `--format json` on show/stats/audit — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 20 (follow-on to Slice 14 — recommendation show; Slice 16 — assumption/decision show; Slice 18 — intelligence stats; Slice 19 — intelligence audit)
**Predecessor slice docs:**
- [`2026-05-20-cadence-recommendation-show-design.md`](2026-05-20-cadence-recommendation-show-design.md) (Slice 14 — § Follow-On `--format json`)
- [`2026-05-20-cadence-intelligence-stats-design.md`](2026-05-20-cadence-intelligence-stats-design.md) (Slice 18 — § Follow-On `--format json`)
- [`2026-05-20-cadence-intelligence-audit-design.md`](2026-05-20-cadence-intelligence-audit-design.md) (Slice 19 — § Follow-On `--format json`)

## Summary

**Slice 20** adds a `--format json` flag to five read-only CLI commands. Default remains terminal markdown (existing contract preserved). JSON mode emits `JSON.stringify(data, null, 2) + '\n'` with no markdown chrome. Machine-readable output enables CI/scripting workflows. Closes Slice-14/18/19 § Follow-On `--format json` entries in one slice.

Commands gaining `--format <terminal|json>`:
1. `cadence recommendation show <id>`
2. `cadence assumption show <id>`
3. `cadence decision show <id>`
4. `cadence intelligence stats [--by-rec]`
5. `cadence intelligence audit [--quiet]`

- **Default `--format terminal`** preserves the markdown contract verbatim.
- **`--format json`** outputs a pretty-printed JSON envelope (2-space indent, trailing newline).
- **Schema discoverable**: each command's JSON envelope is documented in commands.md.
- **No-results JSON shapes** (empty workspace, clean audit, unknown id) follow same pattern as terminal mode — JSON envelope always emitted on success path; stderr + exit 1 on unknown id (matches terminal).
- **Exit codes UNCHANGED** — same semantics as terminal mode. `audit` still exits 1 on findings unless `--quiet`.

It does **not** modify `@cadence/types` schemas, add JSON to write surfaces (intake/transition still terminal-only), change default output (back-compat), embed renderer markdown inside JSON, touch `state.json` / `STATE.md` / loop transition, perform fresh fs/git scan.

## Product Boundary

- Read-only across the 5 affected commands.
- No new ledger reads or writes.
- **NEVER** calls `cadence spec new` / touches `state.json` / `STATE.md` / loop transition.

## Scope

### In scope

- Add `--format <terminal|json>` option to 5 CLI subcommands.
- Default `terminal`. Validate enum; reject other values with commander error.
- Each command's JSON envelope documented inline + in commands.md.
- Spawn-CLI tests parse the JSON output and assert shape.

### JSON envelopes

**`recommendation show`** (`--format json`):
```json
{
  "recommendation": Recommendation,
  "linkedEvidence": Evidence[],
  "linkedAssumptions": Assumption[],
  "linkedDecisions": IntelligenceDecision[],
  "filters": { "openAssumptionsOnly": boolean, "activeDecisionsOnly": boolean }
}
```
Linked arrays are PRE-filter (unfiltered linked subset). Filters object documents which flags were active. Operator/script applies filtering downstream if desired.

**`assumption show`** (`--format json`):
```json
{ "assumption": Assumption, "recommendation": Recommendation | null }
```

**`decision show`** (`--format json`):
```json
{ "decision": IntelligenceDecision, "recommendation": Recommendation | null }
```

**`intelligence stats`** (`--format json`):
```json
IntelligenceStats  // full Slice-18 stats object verbatim
```
Empty workspace → `null` + exit 0 + nothing else on stdout? OR JSON `{"present": false}` matching reconcile result? Pick: emit `null` (matches "no data" idiom). No, better: emit zero-counts stats object (renders consistently). Pick the latter — operator gets parseable JSON regardless. The terminal-mode `No intelligence ledgers present` message becomes a no-op in JSON mode; just emit the zero stats.

Actually clearer: distinguish "empty workspace" from "populated but all-zero". Match terminal behavior: empty workspace → JSON `null`. Populated workspace → full IntelligenceStats.

Settled: empty workspace → JSON `null` + exit 0. Operator parses null vs object.

**`intelligence audit`** (`--format json`):
```json
IntelligenceAuditReport  // full Slice-19 report verbatim ({ findings, byKind })
```
Empty workspace → JSON `null` + exit 0.
Clean populated workspace → `{ findings: [], byKind: {...empty arrays...} }` + exit 0.
Findings → full report + exit 1 (unless `--quiet`).

### Out of scope

- Newline-delimited JSON (NDJSON) for streaming.
- Compact (non-pretty) output. Could be `--format json-compact` later; defer.
- YAML / TOML output.
- Schema files (`*.schema.json`) for JSON envelopes. Defer.
- `--format json` on write surfaces (`add`/transition CLI). Defer.
- `--format json` on list commands. Defer (separate slice if needed).
- `--format json` on reconcile (mutation result already trivially small).
- Any `@cadence/types` schema change.

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/recommendation.ts` — `show` gains `--format` option + JSON branch.
- `packages/core/src/cli/commands/assumption.ts` — `show` gains `--format` option + JSON branch.
- `packages/core/src/cli/commands/decision.ts` — `show` gains `--format` option + JSON branch.
- `packages/core/src/cli/commands/intelligence.ts` — `stats` + `audit` gain `--format` option + JSON branch.
- `packages/core/tests/cli/*-show.test.ts` (3 files) — add JSON-shape tests.
- `packages/core/tests/cli/intelligence-stats.test.ts` — add JSON-shape tests.
- `packages/core/tests/cli/intelligence-audit.test.ts` — add JSON-shape tests.
- `docs/reference/commands.md` — document `--format` flag on each command.

### NEW files

None. Pure CLI-side additions.

### Untouched

- All pure renderers (markdown).
- All store helpers / compute functions.
- `@cadence/types` — no schema change.
- `cli/register.ts` — no new top-level commands.
- Phase-31.1 cli-reference marker block — UNCHANGED.

## Data Model

No new types. CLI flag definition:

```ts
.option('--format <format>', 'Output format: terminal | json', 'terminal')
```

Validation: on action, if `opts.format !== 'terminal' && opts.format !== 'json'`, throw "unsupported format" exit 1 + stderr.

## Implementation Pattern

Shared helper per command file (or inline):

```ts
async function handleShow(/* args */) {
  // ... existing read logic
  if (opts.format === 'json') {
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    return;
  }
  // terminal default
  const md = renderXyzDetail(...);
  process.stdout.write(md);
  if (!md.endsWith('\n')) process.stdout.write('\n');
}
```

Repeated pattern across 5 commands. No abstraction extracted (each command's envelope shape differs).

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `cadence recommendation show <id> --format json` → exit 0, stdout is valid JSON parseable to `{ recommendation, linkedEvidence, linkedAssumptions, linkedDecisions, filters }`. | `recommendation-show.test.ts` |
| AC-2 | `recommendation show --format json --open-assumptions-only --active-decisions-only` → JSON envelope includes `filters: { openAssumptionsOnly: true, activeDecisionsOnly: true }`. Linked arrays are PRE-filter. | `recommendation-show.test.ts` |
| AC-3 | `cadence assumption show <id> --format json` → JSON `{ assumption, recommendation }`; tied rec missing → `recommendation: null`. | `assumption-show.test.ts` |
| AC-4 | `cadence decision show <id> --format json` → JSON `{ decision, recommendation }`; untied dec → `recommendation: null`. | `decision-show.test.ts` |
| AC-5 | `cadence intelligence stats --format json` → JSON of full `IntelligenceStats` object. Empty workspace → JSON `null`. | `intelligence-stats.test.ts` |
| AC-6 | `cadence intelligence audit --format json` → JSON of full `IntelligenceAuditReport`. Empty workspace → JSON `null`. Findings present → exit 1 (or 0 with `--quiet`). | `intelligence-audit.test.ts` |
| AC-7 | Default `--format terminal` (and absence of flag) preserves existing markdown output verbatim. All Slice-14/16/18/19 tests still pass unchanged. | full `pnpm turbo run test`. |
| AC-8 | Invalid `--format <foo>` → exit 1, stderr `<command> failed: unsupported format: foo` (or commander rejection). | one test per affected command. |
| AC-9 | Unknown id with `--format json` → exit 1, stderr matches terminal mode (`<subject> <id> not found\n`). NO partial JSON on stdout. | per-command tests. |
| AC-10 | Phase-31.1 drift guard UNCHANGED. No new top-level commands. | `tests/docs/cli-reference.test.ts` |

## Testing

- **Spawn-CLI pattern** for all ACs. Parse `JSON.parse(stdout)` to assert envelope shape.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design + plan — --format json on show/stats/audit (Praxis Slice 20)
feat(core): --format json on recommendation/assumption/decision show (Slice 20)
feat(core): --format json on intelligence stats + audit (Slice 20)
docs: document --format json + reconcile Slice-14/18/19 follow-refs (Slice 20)
```

Four commits.

## Success Criteria

1. All 10 ACs pass.
2. Full turbo gate green (16/16; lint included).
3. Slice-14 + Slice-18 + Slice-19 § Follow-On `--format json` entries reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard passes UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **Default `terminal`, not auto-detect TTY.** Predictable; explicit; back-compat. Auto-detect would surprise piped consumers.
2. **Pretty-printed JSON with 2-space indent.** Readable in terminal + diffs; trivial to re-parse. Compact form deferred.
3. **Empty workspace = `null` (not zero-stats object).** Distinguishes "no data" from "all-zero data" cleanly for scripts.
4. **Linked arrays in `recommendation show --format json` are PRE-filter.** Filters are reported in `filters` block; consumer applies post-filter if needed. Avoids data loss; script can compute both views.
5. **No abstraction over the 5 commands.** Each envelope shape is different; sharing would invent a generic wrapper that benefits nobody.
6. **No `--format json-compact`.** Defer until consumer asks. One format option clarifies the path forward (terminal vs machine).
7. **No `--format json` on write surfaces in this slice.** Mutations have minimal output already; JSON adds little. Defer.
8. **Drift guard UNCHANGED.** No new top-level commands; existing commands gain a flag.

## Follow-On

- **`--format json-compact`** for stream-pipe consumers.
- ~~**`--format json` on list commands** (`recommendation list`, `assumption list`, `decision list`).~~ **SHIPPED Slice 21** — see [json-format-lists design](2026-05-20-cadence-json-format-lists-design.md).
- **JSON schemas** (`*.schema.json`) for envelope documentation.
- **NDJSON** streaming for very large ledgers (if needed).
- **`--format json` on write surfaces** (add/transition).
- **`supersededBy <id>`** decision field + supersession-graph.
- **Rec↔phase linkage** — biggest remaining scope.
- **Auto-dispatch / subagent routing** — forever-deferred.
