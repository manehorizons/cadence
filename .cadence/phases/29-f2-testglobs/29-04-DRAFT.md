---
phase: 29-f2-testglobs
id: 29-04
tier: standard
---

# 29-04 — F2: init layout-detected testGlobs

## Objective

Make `cadence init` detect repo layout and write a `verification.testGlobs` that actually matches the project's tests, so the test-coverage gate is satisfiable on single-package repos (F2 — the v1.1 publish-blocker from Phase 29.1 shakedown).

## Context

`init` spreads the preset config, whose `verification.testGlobs` default is `['packages/**/*.test.ts','packages/**/*.test.tsx']` (correct only for cadence's own monorepo). On any single-package repo (tests under `tests/` or co-located in `src/`) the coverage scanner matches zero files → every AC unsatisfiable out of the box. Fix is init-time layout detection only; the scanner glob engine ([coverage.ts](../../../packages/core/src/verify/coverage.ts)) already handles `**/*.test.ts` and prunes `node_modules/dist/.git/.turbo`. Pulled forward from the full Phase 29.4 remediation because it blocks publish (30.1).

## Acceptance Criteria

### AC-1: Monorepo layout keeps the packages glob (cadence self-regression guard)
Given a repo with a `packages/` directory at the init cwd
When `cadence init` runs
Then `.cadence/config.json` `verification.testGlobs` equals `["packages/**/*.test.ts","packages/**/*.test.tsx"]` (cadence's own init is unchanged).

### AC-2: Single-package layout gets a satisfiable glob
Given a repo with no `packages/` directory and tests under `tests/`
When `cadence init` runs
Then `verification.testGlobs` equals `["**/*.test.ts","**/*.test.tsx"]`, and `scanTestCoverage` with that glob finds an `AC-N` reference in a `tests/*.test.ts` file (the F2 runtime failure is gone).

### AC-3: init summary reports the detected layout + effective globs
Given either layout
When `cadence init` finishes
Then the post-init summary prints the detected layout and the effective `testGlobs` (the silent monorepo over-fit was part of F2's harm — operator must see what was chosen).

## Tasks

### T1: layout detection in init
- files: `packages/core/src/cli/commands/init.ts`
- action: add `detectTestGlobs(cwd)` — `packages/` dir present → `['packages/**/*.test.ts','packages/**/*.test.tsx']`, else `['**/*.test.ts','**/*.test.tsx']`. Build `cfg` with `verification.testGlobs` overridden by it. Add a summary line printing detected layout + effective globs.
- verify: `cadence init` in a temp single-package repo writes the `**` glob; in a `packages/` repo writes the packages glob.
- done: AC-1, AC-2, AC-3

### T2: tests
- files: `packages/core/tests/cli/init.test.ts`
- action: add a monorepo case (assert packages glob, regression guard for AC-1) and a single-package case (assert `**` glob for AC-2, plus a `scanTestCoverage` assertion proving an `AC-2` ref in a `tests/x.test.ts` file is found under the written glob). Reference `AC-1`/`AC-2`/`AC-3` tokens so the coverage gate links them.
- verify: `pnpm -C packages/core test init` green.
- done: AC-1, AC-2

### T3: docs + full suite
- files: `DESIGN.md`, `CHANGELOG.md`
- action: tick DESIGN.md §10 punchlist / note the init layout-detection behavior; add a CHANGELOG entry under unreleased. Confirm `pnpm turbo run test` green.
- verify: full suite green; DESIGN/CHANGELOG reflect AC-3 behavior.
- done: AC-3

## Boundaries

- DO NOT change preset/`defaultConfig` `testGlobs` defaults in `@cadence/types` — cadence's own monorepo glob must stay correct; the fix is init-time detection only.
- DO NOT add a new CLI flag (`--test-globs` etc.) — scope is automatic detection per the 29.1 F2 disposition; explicit override is a later concern.
- DO NOT modify `coverage.ts` — the glob engine already supports `**/*.test.ts` and prunes vendored dirs.
- DO NOT address F1 / F4 / F6 — separate findings; full Phase 29.4 remediation covers them later.
