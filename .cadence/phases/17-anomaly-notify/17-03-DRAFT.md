---
phase: 17-anomaly-notify
id: 17-03
tier: standard
status: APPROVED
---

# 17-03 — AnomalyEvent.ts + live --since filter

## Objective

Close the timestamp gap deferred in 17.2: add a required `ts: ISO8601` field to `AnomalyEventZ`, stamp it at both emission surfaces (settle's `collectAnomalies` and the pre-tool-edit hook), and convert `cadence status anomalies --since` from a documented no-op into a live boundary filter. With this, an `auto`-profile user can answer "what anomalies fired since my last release?" — which is what the `--since` flag was always meant to do.

## Acceptance Criteria

### AC-1: AnomalyEventZ requires ts (ISO8601, offset-aware)
Given the types package
When `AnomalyEventZ.parse(...)` runs against an event payload missing `ts`, or with a `ts` that fails `z.string().datetime({ offset: true })` (e.g., `'2026-05-14'` or `'yesterday'`)
Then the parse fails. Valid ISO8601 with offset (`'2026-05-14T22:30:00.000Z'`, `'2026-05-14T22:30:00.000-05:00'`) round-trips. Schema documents `ts` as "wall-clock when the event was constructed; emitters stamp via `new Date().toISOString()`".

### AC-2: settle emits stamp ts on every event
Given the `'anomaly-notify'` gate is active and any settle-side condition fires (BLOCKED task, force-used, coverage-bypassed, files-outside-boundary, etc.)
When the resulting NDJSON line is written to `.cadence/anomalies.log` or rendered to stderr
Then every event carries a populated `ts` field whose value parses via `Date.parse(...)` (non-NaN). `collectAnomalies` accepts a `now?: () => Date` parameter (defaults to `() => new Date()`) so tests can pin time; production callers omit it.

### AC-3: hook emits stamp ts on every event
Given the `'anomaly-notify'` gate is active and `handlePreToolEdit` detects an outside path
When the hook dispatches its event batch
Then every event carries a populated `ts` (same defaulting/test-injection rule as AC-2, kept consistent so both surfaces use one clock).

### AC-4: `cadence status anomalies --since` is a live filter
Given `.cadence/anomalies.log` contains events spanning a known time range
When `cadence status anomalies --since <ISO>` runs
Then only events with `Date.parse(event.ts) >= Date.parse(--since)` survive the filter; ordering remains newest-first; `--limit` applies after the time filter; invalid `--since` still exits 1 (unchanged). The 17.2-era stderr line `"--since is accepted but currently a no-op"` is removed. Reader gracefully handles legacy log lines: events lacking `ts` fail `AnomalyEventZ.safeParse` and are counted as `bad`, but the reader does not crash.

### AC-5: full suite + docs + dogfood
Given Phase 17.3 lands
When `pnpm turbo run test` runs
Then ~366 → ~380+ tests pass. DESIGN.md §3.3 drops the "no `ts`" caveat and notes `ts: ISO8601` on the event row. README's reader subsection updates the `--since` blurb to live behavior with one example. AC-1..AC-5 each referenced by ≥1 test file. Self-dogfood: 17.3's own settle runs cleanly (one expected `coverage-bypassed` warn).

## Tasks

### T1: schema + collectAnomalies + hook emitters stamp ts
- files: `packages/types/src/anomaly.ts`, `packages/types/tests/anomaly.test.ts`, `packages/core/src/notify/collect.ts`, `packages/core/tests/notify/collect.test.ts`, `packages/core/src/hooks/handlers.ts`, `packages/core/tests/hooks/handlers-anomaly.test.ts`, `packages/core/src/cli/commands/settle.ts`
- action: Add required `ts: z.string().datetime({ offset: true })` to `AnomalyEventZ`. Update doc comment. Extend `collectAnomalies(ctx, opts?: { now?: () => Date })` — every push gets `ts: (opts.now?.() ?? new Date()).toISOString()`. Update the settle call site to pass through `now` only if provided in future (current call needs no change beyond schema compatibility). For `handlePreToolEdit`: stamp `ts: new Date().toISOString()` on each pushed event. Existing tests in `anomaly.test.ts` / `collect.test.ts` / `handlers-anomaly.test.ts` need their event fixtures updated to include `ts`. New assertions: schema requires `ts`; events from `collectAnomalies` all carry the same `ts` when `now` is pinned; hook events carry `ts` that parses as a real date.
- verify: vitest green; existing tests adjusted, new assertions added; no schema regressions.
- done: AC-1, AC-2, AC-3

### T2: reader live --since
- files: `packages/core/src/cli/commands/status.ts`, `packages/core/tests/cli/status-anomalies.test.ts`
- action: Drop the 17.2 stderr line about "--since is currently a no-op". Apply `Date.parse(opts.since)` once (already validates); then filter events with `Date.parse(e.ts) >= sinceMs`. Order of operations: line-by-line `safeParse` → (optional `--type`) → (optional `--since`) → reverse for newest-first → `--limit` slice. Update the existing `accepts valid --since but documents it as a no-op` test to assert *live* boundary behavior instead. Add: events at-or-after `--since` survive; events strictly before are excluded; combining `--since` with `--type` AND-s; combining `--since` with `--limit` clamps after the time filter; legacy lines without `ts` are skipped + counted bad.
- verify: vitest green.
- done: AC-4

### T3: docs + dogfood + full-suite confirm
- files: `DESIGN.md`, `README.md`
- action: DESIGN.md §3.3 — note `ts: ISO8601 (offset-aware, emitter-stamped)` in the event-shape blurb; drop the "until events carry timestamps" qualifier from the reader paragraph and just say `--since <ISO>` filters live. README's "Reading recorded anomalies" subsection updates the `--since` line to live behavior + adds one example: `cadence status anomalies --since 2026-05-14T00:00:00Z`. Section 10 punchlist ticks `Phase 17.3 — AnomalyEvent.ts + live --since`. AC-1..AC-5 each referenced by ≥1 test file. Dogfood: settle this phase with `--auto --allow-missing-coverage` — accepts one `coverage-bypassed` event (it now carries `ts`).
- verify: visual read; full-suite green; settle produces a clean SUMMARY.
- done: AC-5

## Boundaries

- DO NOT make `ts` optional or backwards-compatible. Once the schema requires it, legacy lines in a pre-existing `.cadence/anomalies.log` are *unparseable* — counted bad and skipped. Operational state, not durable user data.
- DO NOT add a "ts-less" fallback to the reader. One parse path.
- DO NOT use `Date.now()` direct inside emitters. Settle goes through `opts.now?` for testability. Hook can use `new Date()` directly (hook test fixtures assert "parses as a date", not exact-equal).
- DO NOT change `Notifier.notify` signature. Events grow a field; transport contract unchanged.
- DO NOT add `--until` (paired upper bound) in this phase. Surface stays to deferred `--since` only.
- DO NOT touch the `AnomalyType` enum.
