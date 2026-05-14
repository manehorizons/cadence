---
phase: 17-anomaly-notify
id: 17-02
tier: standard
status: APPROVED
---

# 17-02 — hook + reader emission surface

## Objective

Extend Phase 17.1's settle-only anomaly emission to two non-settle surfaces: a hook-side `files-outside-boundary` detection at edit time (catches outside-draft edits *as they happen*, not retroactively at settle) and a read-side `cadence status anomalies` subcommand that lists recorded events from `.cadence/anomalies.log` with filtering. 17.1 settled with auto-profile users only seeing anomalies at settle and only through the configured transport; this phase closes that gap on both axes.

## Acceptance Criteria

### AC-1: pre-tool-edit hook emits files-outside-boundary on outside edits
Given an active DRAFT exists (state.activeDraft + state.activePhase set), the gate set includes `'anomaly-notify'`, and `ctx.raw.files` contains paths not present in the union of the draft's `tasks[].files`
When the pre-tool-edit hook fires (any host that maps tool edits to this abstract event)
Then `handlePreToolEdit` dispatches one `files-outside-boundary` event per outside path through the configured `selectNotifier(config)` transport. The hook still returns `ok: true` (or whatever the build-gate path returns) — anomaly detection does not refuse the edit. Hook short-circuits cheaply when there is no active draft, when `ctx.raw.files` is empty/absent, or when `'anomaly-notify' ∉ gateSet.gates`. Notifier exceptions are caught and reduced to a single stderr warning so the hook contract is preserved.

### AC-2: `cadence status anomalies` reader command
Given `.cadence/anomalies.log` exists with N NDJSON entries
When `cadence status anomalies [--since <ISO>] [--type <type>] [--limit <n>]` runs
Then the command parses each line via `AnomalyEventZ.safeParse`, accumulates parse-failures, applies the filters (`--type` matches `AnomalyType` exactly; `--limit` defaults to 20 and slices the tail = newest), and prints the surviving events newest-first as a plain text table (columns: type / severity / message — no timestamp column because events do not carry one in 17.1's schema; document the limitation). `--since` is accepted but documented as a no-op in 17.2 with a one-line stderr note explaining the schema lacks `ts` (the schema bump is a separate, future phase). Empty result prints `No anomalies recorded.` on stdout (exit 0). Parse-failure count is reported on stderr (`(N unparseable lines skipped)`). Invalid `--since` (not parseable by `Date.parse`) exits 1 with a clear stderr message. Honors `config.notify.file` override and absolute paths.

### AC-3: docs + dogfood
Given Phase 17.2 lands
When DESIGN.md and README are read
Then DESIGN.md §3.3 notes the hook-side trigger is shipped; the `cadence status anomalies` reader appears under the README's Anomaly notify section with one usage example. AC-1..AC-3 are each referenced by ≥1 test file. Self-dogfood: 17.2's own settle runs cleanly without raising anomalies from the auto-profile gate set.

## Tasks

### T1: hook-side files-outside-boundary emission
- files: `packages/core/src/hooks/handlers.ts`, `packages/core/tests/hooks/handlers-anomaly.test.ts` (new)
- action: Extend `handlePreToolEdit`. New flow executed *before* the existing buildGate check: (1) early-out unless `state.activeDraft && state.activePhase` and `ctx.raw?.files?.length`; (2) load active DRAFT via `parseDraftMd` in a try/catch — malformed draft must not break the hook; (3) compute `allowed = new Set(draft.tasks.flatMap(t => t.files))`; (4) `outsiders = files.filter(p => !allowed.has(p))`; (5) if no outsiders, skip; (6) build `effectiveGateSet(state, config, draft)` and short-circuit when `'anomaly-notify' ∉ gates`; (7) per outsider push one `files-outside-boundary` event `{ type, severity: 'warn', message: \`${p} touched but not declared in any task's files:\`, context: { file: p } }`; (8) dispatch the batch through `selectNotifier(config)` inside a try/catch that downgrades any transport failure to `process.stderr.write('notify: <name> transport failed — <msg> (continuing)\n')`; (9) fall through to the existing buildGate check unchanged.
- verify: vitest unit tests with the dispatcher path. Tests cover (a) outside path → one event of the right shape (assert via `notify.transport: 'file'` to a temp path); (b) inside-path → no events; (c) absent active draft → no events; (d) gate absent (e.g., strict profile via draft.profile override) → no events; (e) malformed draft → hook still returns ok and emits nothing; (f) notifier throw via an injected failing transport → stderr warn, hook still returns ok.
- done: AC-1

### T2: `cadence status anomalies` subcommand
- files: `packages/core/src/cli/commands/status.ts`, `packages/core/tests/cli/status-anomalies.test.ts` (new)
- action: Convert the existing single-action `status` command into a parent command: keep its default action (`--json` text output) and add `anomalies` as a child. Reader: resolve `path = isAbsolute(config.notify.file ?? '.cadence/anomalies.log') ? p : join(cwd, p)`. Missing file → `No anomalies recorded.` exit 0. Parse line-by-line via `AnomalyEventZ.safeParse`, accumulate `bad` counter. `--since` parses via `Date.parse`; bail with exit 1 on `NaN` value AND a clear stderr message; otherwise the flag is accepted-but-no-op with a one-line stderr note. `--type` filters by exact `AnomalyType`. `--limit` defaults to 20 and slices the *tail* of the valid events (newest, since file is append-only). Output: header (`type`, `severity`, `message`), separator, each event padded into columns by max-width. Empty → `No anomalies recorded.`. Parse-failure count appended to stderr.
- verify: vitest spawns the built CLI against a tempRepo with a seeded `.cadence/anomalies.log`. Tests: (a) missing file → "No anomalies recorded."; (b) seeded events render newest-last → reader shows newest-first via tail-slice; (c) `--type files-outside-boundary` filters; (d) `--limit 1` truncates; (e) malformed lines → skipped + stderr count; (f) `--since not-iso` → exit 1 + clear message; (g) default `status` (no subcommand) still works.
- done: AC-2

### T3: docs + dogfood self-check
- files: `DESIGN.md`, `README.md`
- action: DESIGN.md §3.3 — note hook-side `files-outside-boundary` (Phase 17.2) fires at edit time on `pre-tool-edit`; settle-time `files-outside-boundary` (Phase 17.1) covers touched-files reconciliation. Section 10 punchlist gains a Phase 17.2 tick. README's `## Anomaly notify` section gains `### Reading recorded anomalies` with one `cadence status anomalies --type files-outside-boundary --limit 5` example. AC-1..AC-3 each referenced by ≥1 test file. Self-dogfood: settle this phase with `--auto --allow-missing-coverage` — should produce zero anomalies; if it does, that's a real signal to fix before settle.
- verify: visual read of DESIGN/README; `pnpm turbo run test` green; settle dogfood produces zero anomalies in `.cadence/anomalies.log`.
- done: AC-3

## Boundaries

- DO NOT add new `AnomalyType` enum members. The shipped six types cover 17.2's surface (`files-outside-boundary` reused at hook time).
- DO NOT add a `ts` field to `AnomalyEventZ`. Schema bump is a separate, intentional phase — pulling it forward here forces a settle-side payload migration that is out of scope.
- DO NOT make hook-side emission refuse the edit. Detection only.
- DO NOT couple the hook to settle's `collectAnomalies`. The hook emits a small array directly via `selectNotifier`. Two emission entry points, one transport contract.
- DO NOT load the draft if `ctx.raw.files` is empty or absent. Draft read is the most expensive hook step; gate on cheap checks first.
- DO NOT introduce a `--no-anomalies` CLI flag on `cadence status anomalies`. Reader is read-only.
- DO NOT add multi-transport composition. 17.1's single-transport selection is by design.
