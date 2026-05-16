---
phase: 32-testinfra-flake
id: 32-01
tier: standard
---

# 32-01 — test-infra flake root-fix

## Objective

Root-fix the recurring full-turbo-parallel pre-push flake (5000ms timeouts + Windows EBUSY/ENOTEMPTY rmdir) via a shared vitest base config and a tempRepo cleanup retry, retiring the per-test band-aids and unblocking the held Phase 31.1 push.

## Acceptance Criteria

### AC-1: shared base owns the timeout/pool knobs
Given the repo had no `testTimeout` in any of five vitest configs
When the fix lands
Then `vitest.shared.ts` exists at repo root and is the sole definition of `testTimeout`, `hookTimeout`, `pool`, and `poolOptions.forks.maxForks`.

### AC-2: all five configs extend the shared base
Given five near-duplicate vitest configs
When the fix lands
Then `vitest.config.ts` + the four `packages/*/vitest.config.ts` each `mergeConfig` the shared base and keep only their own `include` (root also keeps `coverage`); no per-config timeout/pool duplication remains.

### AC-3: tempRepo cleanup survives the Windows rmdir race
Given `tempRepo().cleanup()` called bare `rm(root, {recursive,force})`
When the fix lands
Then it passes `maxRetries` and `retryDelay` to `rm`, and `@cadence/testkit` is rebuilt so consumers get it.

### AC-4: per-test band-aids reverted
Given Phase 29.5 (`dispatcher.test.ts`) and Phase 30.2 (`build-per-task.test.ts`) added inline `{timeout:20000}` overrides
When the fix lands
Then those overrides and their now-obsolete comments are removed (the global budget supersedes them).

### AC-5: the previously-blocked gate is green and stays green
Given the full turbo gate flaked under parallel load on this Windows box
When the fix lands
Then `pnpm turbo run test` passes full-parallel across ≥3 consecutive runs and `pnpm -C packages/core test` still passes isolated.

### AC-6: pulled-forward delivery recorded
Given ROADMAP deferred test-infra to v1.2+
When the fix lands
Then `.cadence/ROADMAP.md`, `DESIGN.md` (§10 item 33), and `CHANGELOG.md` (`## [Unreleased] → ### Fixed`) record the pulled-forward delivery.

## Tasks

### T1: shared vitest base + rewrite five configs
- files: `vitest.shared.ts`, `vitest.config.ts`, `packages/core/vitest.config.ts`, `packages/testkit/vitest.config.ts`, `packages/types/vitest.config.ts`, `packages/host-claude-code/vitest.config.ts`
- action: create `vitest.shared.ts` (testTimeout/hookTimeout 20000, pool:'forks', maxForks:12); rewrite all five configs to `mergeConfig(shared, …)` keeping each `include` (root keeps `coverage`)
- verify: `pnpm -C packages/types build && pnpm -C packages/types test` PASS; `pnpm -C packages/core test -- run hooks/dispatcher` PASS isolated
- done: AC-1, AC-2

### T2: tempRepo cleanup rmdir retry
- files: `packages/testkit/src/fixture.ts`
- action: add `maxRetries: 5, retryDelay: 100` to the `rm` in the `cleanup` closure; rebuild testkit
- verify: `pnpm -C packages/testkit build` clean; `pnpm -C packages/core test -- run integration/end-to-end` PASS isolated
- done: AC-3

### T3: revert 29.5 + 30.2 per-test timeout band-aids
- files: `packages/core/tests/hooks/dispatcher.test.ts`, `packages/core/tests/cli/build-per-task.test.ts`
- action: remove the Phase 29.5 3-line comment + `, 20000` test arg; remove the Phase 30.2 4-line comment + `{ timeout: 20000 }` describe option
- verify: `pnpm -C packages/core test -- run hooks/dispatcher cli/build-per-task` PASS (no timeout)
- done: AC-4

### T4: tune maxForks against the real gate
- files: `vitest.shared.ts`
- action: full rebuild + `pnpm turbo run test` ×3 consecutive full-parallel; adjust `maxForks` down if any flake and restart the count; record final value
- verify: 3 consecutive clean full-parallel runs; `pnpm -C packages/core test` still green isolated
- done: AC-5

### T5: docs — ROADMAP / DESIGN §10 / CHANGELOG
- files: `.cadence/ROADMAP.md`, `DESIGN.md`, `CHANGELOG.md`
- action: remove the Deferred-v1.2+ "Test infra" bullet (record pulled-forward); add DESIGN §10 item 33; add CHANGELOG `## [Unreleased] → ### Fixed` entry
- verify: `git diff -- .cadence/ROADMAP.md DESIGN.md CHANGELOG.md` shows only intended hunks
- done: AC-6

## Boundaries

- DO NOT change any production code under `packages/*/src/` except the single `packages/testkit/src/fixture.ts` cleanup line.
- DO NOT add new assertion/unit tests — verification IS the previously-blocked turbo gate (spec rules out config unit-tests as test-theater).
- DO NOT touch the 6 held Phase 31.1 commits, unrelated files, `graphify-out/`, or `.keel/` history.
- DO NOT `git commit` per task (strict two-commit-per-phase convention); DO NOT `git push` (user-gated).
