---
phase: 30-testinfra-build-per-task
id: 30-02
tier: quick-fix
status: PENDING
---

# 30-02 — build-per-task spawn-CLI test timeout (parallel-load flake)

## Objective

Give the `cadence build task (Phase 24.2 — per-task verifier gate)` describe block a generous timeout so its spawned-CLI tests stop timing out under the full `pnpm turbo run` parallel gate, unblocking the `main` pre-push hook.

## Context

`packages/core/tests/cli/build-per-task.test.ts` — every `it` in the Phase 24.2 describe spawns the built CLI as a subprocess (plus `execSync` git + tempRepo IO). Under the pre-push hook's `pnpm turbo run lint typecheck test build` (max parallel contention) on this machine, 3 of them exceed vitest's 5000ms default `testTimeout` (`Test timed out in 5000ms`, not assertion failures). Core run in isolation is 417/417 green — not a regression, and unrelated to the Phase 30.1 local-provider code. Same systemic class Phase 29.5 fixed for `dispatcher.test.ts`; the broad fix (test-infra serialization / global timeout) stays ROADMAP-deferred (v1.2+). This is the accepted interim pattern: a targeted generous timeout. Recurrence (2nd test file now) reinforces the v1.2 lane.

## Acceptance Criteria

### AC-1: per-task describe no longer times out under the full parallel gate
Given the Phase 24.2 per-task describe runs inside `pnpm turbo run test` (full gate, parallel) on this machine
When the suite executes
Then none of its spawned-CLI tests time out, the full turbo suite is green, and no test logic/assertion is changed.

## Tasks

### T1: generous describe-level timeout
- files: `packages/core/tests/cli/build-per-task.test.ts`
- action: pass a describe-level options object with `timeout: 20000` (same value Phase 29.5 used) to the `describe('cadence build task (Phase 24.2 — per-task verifier gate)', …)` block — vitest `describe(name, { timeout }, fn)` form — so all its CLI-spawn `it`s inherit the headroom. Add a one-line `// AC-1` comment stating why (spawned-CLI IO exceeds the 5s default under turbo-parallel load). No assertion/logic change.
- verify: `pnpm turbo run test` green end-to-end (not just isolated core).
- done: AC-1

## Boundaries

- DO NOT change any test's logic, assertions, spawn args, or fixtures.
- DO NOT alter production/source code — test-timeout fit only.
- DO NOT raise the global vitest `testTimeout` or serialize the suite — that is the ROADMAP-deferred test-infra lane (v1.2+); scope here is this one describe block.
- DO NOT touch other test files (dispatcher already handled in 29.5).
