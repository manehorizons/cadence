---
phase: 86-proactive-next-free
id: 86-86
tier: standard
status: PENDING
---

# 86-86 — Proactive next-free phase allocation in progress/recommend

## Objective

Make the IDLE "next: `cadence draft new …`" suggestion **worktree-aware** — substitute a
concrete phase number computed as `max(observed)+1` over local + sibling-worktree + upstream
claims — so the operator's first pick already clears claims the v1.18 guard would otherwise
refuse, reusing `gatherOccupancy` + `detectPhaseCollision` unchanged. Best-effort: never block
`progress`.

## Context (verified 2026-06-08)

- `nextAction(state)` (`src/progress.ts`) is **pure-over-state**. Its IDLE branch returns the
  literal placeholder `cadence draft new <phase> <num> --title=…`; every other loop position
  already carries a concrete number from state, so **only IDLE needs filling**.
- **Both** surfaces funnel through `nextAction`: `progressService` (`services/progress.ts`)
  prints it, and the intelligence backend (`intelligence/backend/cadence.ts:66`) reuses it as
  `legalActions: [nextAction(state).command]`. Fixing `nextAction` + both call sites covers
  `progress` **and** `recommend` from one pure change. *(Design-doc reuse map named
  `recommend.ts`; the actual suggestion site is `backend/cadence.ts` — recorded as a refinement.)*
- The I/O recipe already exists verbatim in `doctor/run.ts checkWorktreePhases`: best-effort
  `loadConfig` → `phaseGuard.integrationRef` (default `main`), `gatherOccupancy`, then
  `detectPhaseCollision(0, occ).nextFree` (= `max(observed)+1`). Phase 86 extracts this into a
  shared best-effort resolver rather than re-inlining it.

## Acceptance Criteria

### AC-1: IDLE suggestion carries the worktree-aware next-free number
Given the repo has local phases plus a sibling worktree / upstream claiming higher phase
numbers, and the loop is at IDLE
When `cadence progress` runs
Then the suggested `cadence draft new …` command contains `max(observed)+1` computed over
local + sibling + upstream (not merely local `max+1`), in **both** the `<phase>` slug prefix
and the `<num>` argument.

### AC-2: Best-effort fallback never blocks progress
Given the occupancy collector throws, or the repo is offline / not a git repo
When `cadence progress` runs at IDLE
Then it falls back to today's literal `<num>` placeholder, exits 0, and never errors — matching
the v1.18 best-effort contract.

### AC-3: recommend's legalActions IDLE suggestion is occupancy-aware too
Given the same IDLE + sibling/upstream-claim conditions
When the intelligence backend builds its snapshot (`legalActions`)
Then the IDLE `draft new` action it lists carries the same worktree-aware next-free number,
via the same hint — one pure change, both surfaces.

## Tasks

### T1: Failing tests — occupancy-aware nextAction + resolver + both surfaces
- files: `packages/core/tests/progress/next-free.test.ts` (new),
  `packages/core/tests/intelligence/legal-actions-next-free.test.ts` (new)
- action: TDD red. (a) Pure: `nextAction(state, { nextPhaseNumber })` at IDLE renders the
  number into both the slug prefix and the num arg; without the hint it returns today's
  placeholder. (b) Resolver: inject a stub collector → returns `max(observed)+1`; stub throws →
  returns `null` (best-effort). (c) `progressService` with a seeded sibling/upstream occupancy
  prints the concrete number; collector-throw path still prints the placeholder + exits 0.
  (d) Intelligence backend `legalActions` carries the number. Reference AC-1..AC-3 by token.
- verify: `pnpm --filter @manehorizons/cadence-core test -- next-free` fails (red)
- done: AC-1, AC-2, AC-3

### T2: Implement the hint param + best-effort resolver, wire both surfaces
- files: `packages/core/src/progress.ts`, `packages/core/src/services/progress.ts`,
  `packages/core/src/intelligence/backend/cadence.ts`, plus a shared resolver
  (`packages/core/src/phases/next-free.ts` — `resolveNextFreePhase(root, gather?) → Promise<number|null>`)
- action: Add optional `hints?: { nextPhaseNumber?: number }` to `nextAction`; IDLE branch
  substitutes the number into both `<num>-<slug>` and the `<num>` arg when present (pure — the
  number is passed in, no I/O). Add `resolveNextFreePhase` mirroring `checkWorktreePhases`'
  best-effort recipe (loadConfig→integrationRef→gatherOccupancy→`detectPhaseCollision(0,occ).nextFree`),
  returning `null` on any failure. Call it in `progressService` and `backend/cadence.ts`,
  passing the result as the hint; `null` → today's behavior. Optionally refactor
  `checkWorktreePhases` to reuse the resolver (no behavior change).
- verify: `pnpm --filter @manehorizons/cadence-core test -- next-free` green; full
  `pnpm --filter @manehorizons/cadence-core test`, `typecheck`, `lint` green; live
  `node packages/core/bin/cadence.cjs progress` at IDLE shows a concrete number.
- done: AC-1, AC-2, AC-3

## Boundaries

- DO NOT change `gatherOccupancy` / `detectPhaseCollision` / `guard.ts` — reuse only.
- DO NOT change `nextFree` semantics (stays `max(observed)+1`; lowest-gap was dropped per §13).
- `nextAction` MUST stay pure — the resolver does the I/O and passes the number in; no
  filesystem/git access leaks into the pure core.
- Best-effort everywhere — a failed occupancy read MUST fall back to today's placeholder and
  never change `progress`'s exit code.
- Additive only — no change to non-IDLE suggestions or to the doctor check's output.
