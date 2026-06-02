---
phase: 43-boundary-check
id: 43-01
tier: standard
status: DONE
---

# 43-01 — Drain boundary-check into `checks/boundary.ts`

## Objective

(Architecture review candidate #5.) `handlePreToolEdit` (`hooks/handlers.ts`) inlines files-outside-boundary detection; settle's `collectAnomalies` (`notify/collect.ts`) re-derives the same rule independently. Extract `checks/boundary.ts` with `runBoundaryCheck(input)` — a pure events-builder both sites call. One rule, two emission points; emission (gate membership, notify, stderr-degrade) stays at each call site. Pure bit-identical refactor, parameterized over the three call-site differences (candidate-file order/dedup, context shape, ts strategy). Boundary is NOT in the `Gate` enum (it is a hook-time + settle-time anomaly check), so it lives in `checks/` alongside skill-audit (39.6), outside the Phase 44.1 registry.

## Acceptance Criteria

### AC-1: detection lives in one module under `checks/`
Given the new `checks/boundary.ts`
When boundary detection is needed
Then `runBoundaryCheck(input)` + shared `boundaryMessage(file)` are the single home for the rule "a touched file not in the union of task `files:` is an outsider," emitting one `warn` `files-outside-boundary` event per outsider

### AC-2: hook and settle both call it
Given `handlePreToolEdit` and `collectAnomalies`
When each detects boundary violations
Then both delegate to `runBoundaryCheck(...)` — one rule, two emission points — the hook passing raw `ctx.raw.files` with `extraContext: { source: 'hook.preToolEdit' }` and a single-`ts` `stamp`, settle passing a deduped `Set` of `progress.*.touchedFiles` with its per-event `stamp`

### AC-3: hook handler shrinks
Given `handlePreToolEdit`
When boundary detection is extracted
Then the handler shrinks to read/parse + check + gate/notify, with no inline event construction, and the now-unused `AnomalyEvent` import is dropped

### AC-4: tests target the check
Given the new `tests/checks/boundary.test.ts`
When the suite runs
Then it targets `runBoundaryCheck` directly — exact event shape, the no-internal-dedup/order contract, the `extraContext` merge after the `file` key, the per-event `stamp`, and the message — not the hook

### AC-5: bit-identical at both call sites
Given the extraction
When the existing suites run
Then behavior is bit-identical at both call sites and the existing `hooks/handlers-anomaly`, `notify/collect`, and `cli/status-anomalies` suites pass unchanged

## Tasks

### T1: boundary check unit test (TDD red)
- files: `packages/core/tests/checks/boundary.test.ts`
- action: assert exact `files-outside-boundary` event shape, the no-dedup/order-preserved contract (caller owns dedup), the `extraContext` merge after `file`, and per-event `stamp()`
- verify: red against absent module
- done: AC-1, AC-4

### T2: add checks/boundary.ts + rewire both call sites (green)
- files: `packages/core/src/checks/boundary.ts`, `packages/core/src/hooks/handlers.ts`, `packages/core/src/notify/collect.ts`
- action: add `runBoundaryCheck(input)` + `boundaryMessage(file)` (iterate touchedFiles as given, merge caller `extraContext` after `file`, call caller `stamp()` per event); rewire `handlePreToolEdit` (raw files + source marker + single ts, drop `AnomalyEvent` import) and `collectAnomalies` (deduped Set + per-event ts) to delegate
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run checks/boundary hooks/handlers-anomaly notify/collect cli/status-anomalies`
- done: AC-1, AC-2, AC-3

### T3: full gate + bit-identical regression
- files: (none — verification)
- action: run the full `pnpm turbo run lint typecheck test build` gate; confirm hook + collect + status-anomalies suites pass unchanged
- verify: full gate green; suites unchanged
- done: AC-5

## Boundaries

- DO NOT move emission into the check — only *detection* is shared. The hook keeps its `anomaly-notify` gate-membership check + `selectNotifier` + notify/stderr fallback; settle keeps pushing returned events into its anomaly array.
- DO NOT couple the check to `SettleContext` — it is a pure events-builder (the hook has no `SettleContext`).
- DO NOT dedup or reorder candidate files internally — the caller owns dedup/order.
- DO NOT add boundary to the `Gate` enum — it stays a `checks/` module outside the Phase 44.1 registry.
- DO NOT alter emitted bytes at either site — message (`<file> touched but not declared in any task's files:`), context shapes, and ts strategy are bit-identical.
