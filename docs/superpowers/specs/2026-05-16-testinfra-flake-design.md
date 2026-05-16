# Design — Test-infra flake fix (shared vitest base + tempRepo cleanup retry)

**Date:** 2026-05-16
**Status:** Approved (brainstorming) — pending spec review + implementation plan
**Context:** CADENCE v1.1. Phase 31.1 (user-guide docs) is complete and committed
but its **6 commits are held unpushed** because the `main` pre-push hook
(`pnpm turbo run test`, full parallel) flakes on this Windows box. This is the
**3rd recurrence** (after Phase 29.5 dispatcher, Phase 30.2 build-per-task) of a
flake that per-test timeout bumps have failed to converge. This phase pulls the
ROADMAP "Deferred to v1.2+ → Test infra" item forward into v1.1 and fixes the
root cause, ending the whack-a-mole.

## Problem

The pre-push gate fails three test files under full turbo-parallel load —
`packages/core/tests/build/record.test.ts`,
`packages/core/tests/cli/loop-violation.test.ts`,
`packages/core/tests/integration/end-to-end.test.ts` — with
`Test timed out in 5000ms` and Windows `EBUSY` / `ENOTEMPTY rmdir` on
`%TEMP%\cadence-test-*`. The same suite passes 432/432 when `packages/core` runs
isolated. The failures are environmental contention, not regressions, and the
docs-only Phase 31.1 change cannot have caused them.

Two **distinct, coupled** failure modes — this is why single-file timeout bumps
never converge:

**Failure A — spurious timeouts.** No `testTimeout` is set in any of the five
vitest configs (`vitest.config.ts` root; `packages/{core,testkit,types,host-claude-code}/vitest.config.ts`).
All ride vitest's 5000ms default. The failing files each `spawn()` the *built*
CLI (`packages/core/dist/cli/index.js`) as a child process — multiple times per
test; `end-to-end.test.ts` spawns it ~6× in a single test. `turbo run test`
runs the four package test scripts in parallel, and within `@cadence/core`
`vitest run` parallelizes test files across its worker pool. At peak there are
many concurrent Node child processes starving each other for CPU/IO on Windows,
so a multi-spawn test exceeds 5000ms. The code is not slow; the budget is wrong
for spawn-heavy integration tests under contention.

**Failure B — Windows rmdir race.** `tempRepo().cleanup()`
(`packages/testkit/src/fixture.ts`, line ~34) is
`rm(root, { recursive: true, force: true })` with **no `maxRetries` /
`retryDelay`**. A spawned CLI child has just written into that temp dir;
Windows has not yet released the file handles when `afterEach` calls `rm`,
producing `EBUSY` / `ENOTEMPTY rmdir`. Node's `fs.rm` provides `maxRetries` +
`retryDelay` for exactly this Windows class (`EBUSY`, `EMFILE`, `ENFILE`,
`ENOTEMPTY`, `EPERM`) — currently unused.

The Phase 29.5 (`dispatcher.test.ts` per-test) and Phase 30.2
(`build-per-task` describe-level) `{ timeout: 20000 }` bumps only patch Failure
A, only for one file each, and never touch Failure B. New spawn-CLI files keep
tripping both. Memory and the ROADMAP both flag the structural fix as due.

## Goals

- Fix Failure A globally: a realistic shared `testTimeout` (and `hookTimeout`)
  for every package, set once.
- Fix Failure B at its source: `tempRepo().cleanup()` retries the Windows
  rmdir race — every tempRepo consumer benefits, not just the three files.
- Collapse the five near-duplicate vitest configs to one shared base so the
  timeout/pool knobs have a single source of truth (ends config drift, ends the
  whack-a-mole structurally).
- Damp the Windows thundering-herd with a bounded worker pool — the "serialized
  lane lite" the ROADMAP flagged — without paying full-serialization wall-clock
  cost.
- Empirically green `pnpm turbo run test` full-parallel **on this Windows box**
  (the exact gate that has been blocking), unblocking the 6 held Phase 31.1
  commits.

## Non-Goals (YAGNI)

Full per-file serialized lane / separate vitest project with
`fileParallelism:false` (heavier, slower, and only hides Failure B by removing
concurrency — revisit only if the chosen approach proves insufficient);
fake-clock lane; rewriting the spawn-CLI test idiom; changing any production
code; CI/server-side enforcement (still v1.2+); a backlog parking lot.

## Architecture

### Shared base — `vitest.shared.ts` (new, repo root)

Exports the common `test` block consumed by every package config:

- `globals: false`
- `environment: 'node'`
- `testTimeout: 20000`
- `hookTimeout: 20000` — `afterEach` runs `tempRepo().cleanup()`, whose rm now
  carries retry backoff. Node's `fs.rm` uses **linear** backoff: the nth retry
  waits `n × retryDelay` ms, so `maxRetries:5`, `retryDelay:100` adds at most
  `100+200+300+400+500 = 1500ms` of wait plus the actual rm work — comfortably
  inside a 20000ms hook budget.
- `pool: 'forks'` (vitest 2 default; declared explicitly for clarity)
- `poolOptions.forks.maxForks`: a bounded cap. **Starting literal: `12`**
  (~50% of this box's 24 logical cores). This is the contention damper — it
  stops spawn-CLI tests from oversubscribing the machine with grandchild Node
  processes while keeping the suite parallel. `12` is the starting point, not
  a guess-and-ship: AC-4 (the real repeated full-suite run) is the empirical
  arbiter and the plan may move it (down if still flaky, up if needlessly
  slow). The spec fixes the *mechanism*; execution tunes the *number*.

### Per-package configs extend the base

`vitest.config.ts` (root) and
`packages/{core,testkit,types,host-claude-code}/vitest.config.ts` each become:

```
import { mergeConfig } from 'vitest/config';
import shared from './vitest.shared'; // root: './vitest.shared'; packages: '../../vitest.shared'
export default mergeConfig(shared, defineConfig({
  test: { include: [/* unchanged per-config include globs */] },
}));
```

- Root keeps its `coverage` block (merged on top of shared).
- Every `include` glob stays exactly as today — only timeout/pool centralize.
- The per-package `test` script (`vitest run`) picks up the package-local
  config, which now inherits the shared base — so the cap/timeout apply under
  both `turbo run test` and isolated `pnpm -C packages/core test`.

### tempRepo cleanup retry — `packages/testkit/src/fixture.ts`

The cleanup closure changes from:

```
cleanup: async () => rm(root, { recursive: true, force: true }),
```

to:

```
cleanup: async () =>
  rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
```

Root-cause fix for Failure B. Every `tempRepo()` caller across the monorepo
inherits Windows-safe cleanup; no per-test change required. `testkit`'s `dist`
must be rebuilt before core tests consume it (existing rebuild-order rule).

### Revert prior per-test bumps

Remove the Phase 29.5 per-test `{ timeout: 20000 }` on the
`dispatcher.test.ts` FIFO-cap test and the Phase 30.2 describe-level
`{ timeout: 20000 }` in the `build-per-task` test (exact file paths/lines
resolved at plan time). The shared `testTimeout` now covers them; leaving the
local overrides would be dead, misleading artifacts and perpetuate the pattern
memory says to stop.

### Docs / ROADMAP

- `.cadence/ROADMAP.md` — remove the "Test infra" bullet from "Deferred to
  v1.2+", record it as delivered in v1.1 (note the deferral boundary was
  deliberately pulled forward).
- `DESIGN.md` §10 punchlist — tick this phase.
- `CHANGELOG.md` — `## [Unreleased] → ### Fixed` section exists (confirmed);
  add a one-line test-infra entry there (the flaky pre-push gate is a real
  fixed defect even though no public API changes).

## Error semantics / risk

- `maxRetries:5`, `retryDelay:100` is bounded — a genuinely undeletable dir
  still ultimately rejects (no infinite loop, no masked real bug); only the
  transient Windows handle-release race is absorbed.
- A too-tight `maxForks` would slow the suite; a too-loose one wouldn't damp
  contention. AC-4 (repeated real full-suite runs) is the empirical arbiter —
  the number is tuned, not guessed-and-shipped.
- No production code path changes; blast radius is the test harness only.
- `mergeConfig` deep-merges; `include` arrays are replaced per package (intended
  — each package keeps its own globs), shared `test` keys apply unless a package
  overrides them (none do).

## Testing / verification

The verification **is the blocked gate itself**, not a new unit test:

- `pnpm install && pnpm -C packages/types build && pnpm -C packages/testkit build
  && pnpm -C packages/core build`, then `pnpm turbo run test` **full-parallel on
  this Windows box**, green, across **≥3 consecutive** runs (the flake is
  probabilistic — one green run is not sufficient evidence).
- Sanity: `pnpm -C packages/core test` still green isolated (no regression from
  the pool cap).
- No new assertion-style tests are warranted — the change is harness config +
  a one-line fixture hardening; inventing unit tests for vitest config or for
  Node's `fs.rm` retry would be test-theater. The exit criterion is the real
  gate passing repeatedly. (The CADENCE `test-coverage` gate may need
  `--allow-missing-coverage` at settle since this phase intentionally adds no
  `packages/**` test files — note for the DRAFT.)

## Acceptance criteria (for the DRAFT)

1. `vitest.shared.ts` exists at repo root; all five vitest configs extend it via
   `mergeConfig`; `testTimeout` + `hookTimeout` + pool cap are defined **only**
   in the shared base (no per-config timeout duplication remains).
2. `tempRepo().cleanup()` passes `maxRetries` + `retryDelay` to `rm`; `testkit`
   rebuilt so consumers get it.
3. The Phase 29.5 and Phase 30.2 per-test/describe `{ timeout: 20000 }`
   overrides are removed.
4. `pnpm turbo run test` passes full-parallel on this Windows box across **≥3
   consecutive** runs (the flake is probabilistic — one or two greens is not
   sufficient evidence); `pnpm -C packages/core test` still green isolated.
5. `.cadence/ROADMAP.md` "Test infra" moved out of Deferred-v1.2+ and recorded
   delivered; `DESIGN.md` §10 ticked.
6. With the gate green, the 6 held Phase 31.1 commits are unblocked for push.
   (The `git push` itself remains an explicit user-confirmed step — AC-6 is
   "gate no longer blocks," not "auto-pushed.")

## Affected files

- `vitest.shared.ts` — **new**, repo root.
- `vitest.config.ts` (root) — extend shared, keep coverage.
- `packages/core/vitest.config.ts` — extend shared.
- `packages/testkit/vitest.config.ts` — extend shared.
- `packages/types/vitest.config.ts` — extend shared.
- `packages/host-claude-code/vitest.config.ts` — extend shared.
- `packages/testkit/src/fixture.ts` — `rm` retry options.
- `packages/core/tests/hooks/dispatcher.test.ts` — drop Phase 29.5 per-test
  timeout (path/line confirmed at plan time).
- The Phase 30.2 build-per-task test file — drop describe-level timeout (path
  confirmed at plan time).
- `.cadence/ROADMAP.md`, `DESIGN.md` (§10), `CHANGELOG.md`
  (`## [Unreleased] → ### Fixed`).

## Build sequence (for the plan)

1. `vitest.shared.ts` with timeout/hook/pool.
2. Rewrite the five package vitest configs to `mergeConfig` the base
   (includes/coverage preserved verbatim).
3. `fixture.ts` rm retry; `pnpm -C packages/testkit build`.
4. Remove the Phase 29.5 + 30.2 per-test overrides.
5. Tune `maxForks`: run `pnpm turbo run test` full-parallel repeatedly; adjust
   the cap until consistently green; confirm isolated core still green.
6. ROADMAP / DESIGN / CHANGELOG updates.
7. Dogfood as CADENCE phase `32-testinfra-flake` / draft `32-01`, tier
   `standard`, two-commit convention (substantive `fix`/`test` commit =
   configs + fixture + reverts + docs; `chore: settle Phase 32.1` commit =
   phase artifacts + state). Settle likely needs `--allow-missing-coverage`
   (no new `packages/**` tests by design).
8. After settle: surface to the user that the gate is green and the 6 Phase
   31.1 commits + this phase's commits are ready to push (user confirms the
   push).
