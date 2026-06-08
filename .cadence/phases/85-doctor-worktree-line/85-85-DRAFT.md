---
phase: 85-doctor-worktree-line
id: 85-85
tier: standard
status: PENDING
---

# 85-85 — cadence doctor cross-worktree phase-usage line

## Objective

Add a read-only `worktree-phases` check to `cadence doctor` that surfaces phase
numbers claimed by sibling git worktrees + the upstream integration ref — warning
when one collides with a local phase number (the silent-dual-merge precondition)
— reusing the v1.18 `gatherOccupancy` collector unchanged.

## Acceptance Criteria

### AC-1: No cross-worktree claims → ok
Given a repo with no sibling worktree and no phase dirs on `origin/<integrationRef>`
(or offline / not a git repo)
When `cadence doctor` runs
Then the `worktree-phases` check is `ok` with a detail saying no cross-worktree
phase claims were observed, and it never fails the report.

### AC-2: Non-colliding sibling/upstream claims → ok with inventory
Given a sibling worktree (or upstream) claims phase numbers that do NOT match any
local phase number
When `cadence doctor` runs
Then the `worktree-phases` check is `ok` and its detail lists the observed
cross-worktree numbers and their locations.

### AC-3: Colliding claim → warning naming the conflict + next free
Given a **sibling worktree** claims a phase number equal to a local phase number
When `cadence doctor` runs
Then the `worktree-phases` check is `warning`, its detail names the colliding
number and where it is claimed, and its remediation gives the next free number
(`max(observed)+1`, computed over local + sibling + upstream); a `warning` does
not make the overall report fail.

> **Refinement (deviation, found by smoke-test):** collisions are **sibling-vs-local
> only**. Upstream (`origin/<ref>`) is the *merged baseline* — every local phase is
> also on `origin/main` once merged, so an upstream-vs-local match is normal, not a
> collision (warning it would fire on every healthy single-worktree repo). Upstream
> remains the v1.18 *guard's* scaffold-time concern and still feeds the suggested
> `nextFree` here, but it is not a standing doctor warning.

### AC-4: Collector failure degrades to ok (best-effort)
Given the occupancy collector throws or a git/fs source fails
When `cadence doctor` runs
Then the `worktree-phases` check is `ok` (best-effort, never throws), consistent
with the v1.18 guard's best-effort contract.

## Tasks

### T1: Failing tests for the worktree-phases doctor check
- files: `packages/core/tests/doctor/worktree-phases.test.ts`
- action: TDD red. Cover AC-1..AC-4 by injecting a stub occupancy collector (test
  seam) into the check so siblings/upstream/collision/throw cases are deterministic
  and offline. Assert severity + detail + remediation per AC. Reference each AC by
  token (AC-1..AC-4) for the test↔AC gate.
- verify: `pnpm --filter @manehorizons/cadence-core test -- doctor/worktree-phases` fails (red)
- done: AC-1, AC-2, AC-3, AC-4

### T2: Implement checkWorktreePhases + wire into runDoctor
- files: `packages/core/src/doctor/run.ts`
- action: Add `checkWorktreePhases(root, gather?)` — best-effort `loadConfig` for
  `phaseGuard.integrationRef` (default `main`), call `gatherOccupancy`, drop the
  `local` source, `pass` when no sibling/upstream claims, `pass` w/ inventory when
  non-colliding, `fail(..., 'warning', ...)` naming the conflict + `detectPhaseCollision`
  `nextFree` remediation when a sibling/upstream number equals a local number. Wrap
  the whole thing so any throw → `pass` (best-effort). Add to the `runDoctor` checks
  list (so `--json` carries it too). Accept an optional injected collector for tests.
- verify: `pnpm --filter @manehorizons/cadence-core test -- doctor` green; `pnpm --filter @manehorizons/cadence-core typecheck`
- done: AC-1, AC-2, AC-3, AC-4

## Boundaries

- DO NOT change `gatherOccupancy` / `detectPhaseCollision` / `guard.ts` — reuse only.
- DO NOT change `nextFree` semantics (stays `max(observed)+1`; lowest-gap was dropped).
- DO NOT alter the existing doctor checks or their output (additive only).
- The check is read-only — no state writes, no new dependency.
