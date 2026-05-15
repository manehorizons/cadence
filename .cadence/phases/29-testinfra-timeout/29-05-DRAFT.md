---
phase: 29-testinfra-timeout
id: 29-05
tier: quick-fix
---

# 29-05 — dispatcher FIFO-cap test timeout (parallel-load flake)

## Objective

Give the `skill-invoke caps at 100 entries with FIFO drop` test a timeout that fits its real IO cost (105 serial atomic state-file writes) so the full `pnpm turbo run test` gate is deterministically green and stops blocking the `main` pre-push hook.

## Context

`tests/hooks/dispatcher.test.ts` "skill-invoke caps at 100 entries with FIFO drop" issues 105 sequential `await d.dispatch(...)` calls, each a read-modify-atomic-write of `state.json`. Under turbo/vitest parallel load on a slower box this exceeds vitest's 5000ms default `testTimeout` every full run (passes ~740ms isolated). Not a logic defect — IO volume vs. default timeout; the earlier `ENOTEMPTY` rmdir was the downstream `afterEach` cleanup racing the in-flight write after the timeout. Narrowest correct fix is a generous per-test timeout (vitest 3rd arg). Surfaced in Phase 29.4; deferred test-infra serialized lane stays v1.2+ — this only unblocks the gate.

## Acceptance Criteria

### AC-1: FIFO-cap test no longer times out under full parallel load
Given the FIFO-cap test runs inside the full `pnpm turbo run test` (parallel) on this machine
When the suite executes
Then the test passes (no 5000ms timeout, no ENOTEMPTY) and the full turbo suite is green, with no change to the test's assertions (still 105 pushes, cap 100, FIFO drop `skill-5`..`skill-104`).

## Tasks

### T1: generous per-test timeout
- files: `packages/core/tests/hooks/dispatcher.test.ts`
- action: add a per-test timeout (vitest `it(name, fn, 20000)`) to the FIFO-cap test only; add a one-line `// AC-1` comment stating the why (105 serial atomic writes exceed the 5s default under parallel load). No assertion / loop-count change.
- verify: `pnpm turbo run test` green end-to-end (not just isolated).
- done: AC-1

## Boundaries

- DO NOT change the test's logic — keep 105 pushes and the cap-100 / FIFO assertions exactly.
- DO NOT alter production code (`dispatcher.ts`, atomic-write, state backend) — this is a test-timeout fit only.
- DO NOT raise the global vitest `testTimeout` or serialize the suite — that is the ROADMAP-deferred test-infra lane (v1.2+); scope here is this one test.
