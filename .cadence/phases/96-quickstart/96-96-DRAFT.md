---
phase: 96-quickstart
id: 96-96
tier: standard
status: PENDING
---

# 96-96 — cadence quickstart — state-aware front door (pure build/render + never-throws CLI + docs)

## Objective

Add `cadence quickstart`: a read-only, never-failing, state-aware front door that orients a
newcomer (pre- or post-init) and, post-init, shows the same next move as `cadence progress`
by reusing its pure `nextAction` core.

## Acceptance Criteria

### AC-1: pure builder — uninitialized
Given `buildQuickstart({ initialized: false })`
When called
Then it returns `status: 'uninitialized'`, `nextMoves` containing `cadence init` and
`cadence tutorial`, no `next`, and a non-empty `commandMap`.

### AC-2: pure builder — initialized reuses nextAction
Given `buildQuickstart` with an initialized state + optional phase hint
When called for IDLE (hint 7) and for BUILD
Then `next` equals `nextAction(state, hints)` (IDLE → `cadence draft new 7-<slug> 7 --title=…`;
BUILD → the build/settle action), `nextMoves` is empty, and the header names the loop position
(and active phase when present).

### AC-3: pure rendering
Given `renderText`/`renderJson`
When rendering an uninitialized and an initialized Quickstart
Then text shows the header, the moves/Next line, and the command map; `renderJson` returns the
structured `Quickstart`.

### AC-4: CLI front door — uninitialized
Given `cadence quickstart` in a directory with no `.cadence/`
When run
Then it prints the uninitialized orientation (mentions `cadence init`) and exits 0.

### AC-5: CLI — initialized shows the progress-equivalent next move
Given `cadence quickstart` in an initialized repo
When run
Then it prints `initialized` + a `Next:` line and exits 0.

### AC-6: --json structured output
Given `cadence quickstart --json`
When run in an initialized repo
Then stdout is JSON with `status` and a `commandMap` array, exit 0.

### AC-7: never-throws on corrupt state
Given a corrupt `.cadence/state.json`
When `cadence quickstart` runs
Then it degrades to the front-door orientation and exits 0 (no crash). The command is also
registered (drift guard green) and documented.

## Tasks

### T1: Pure buildQuickstart
- files: `packages/core/src/quickstart/build.ts`, `packages/core/tests/quickstart/build.test.ts`
- action: Per plan Task 1 — `QuickstartContext`/`Quickstart`/`QuickstartMove`/`QuickstartMapEntry` types, embedded `COMMAND_MAP`, `buildQuickstart(ctx)` reusing `nextAction` for the initialized `next`.
- verify: `pnpm --filter @manehorizons/cadence-core test -- quickstart/build.test.ts` green.
- done: AC-1, AC-2

### T2: Pure render
- files: `packages/core/src/quickstart/render.ts`, `packages/core/tests/quickstart/render.test.ts`
- action: Per plan Task 2 — `renderText(qs)`, `renderJson(qs)`.
- verify: `pnpm --filter @manehorizons/cadence-core test -- quickstart/render.test.ts` green.
- done: AC-3

### T3: CLI command + registration + drift-guard
- files: `packages/core/src/cli/commands/quickstart.ts`, `packages/core/src/cli/register.ts`, `docs/reference/commands.md`
- action: Per plan Task 3 — `runQuickstart` (never-throws gather, reuses `SimpleStateBackend.readState` + `resolveNextFreePhase`) + `registerQuickstartCommand`; wire into `register.ts`; add `quickstart` to the `cadence:commands` drift-guard block.
- verify: `pnpm --filter @manehorizons/cadence-core build && pnpm --filter @manehorizons/cadence-core test -- docs/cli-reference.test.ts && pnpm --filter @manehorizons/cadence-core typecheck` green.
- done: AC-7

### T4: CLI integration tests
- files: `packages/core/tests/cli/quickstart.test.ts`
- action: Per plan Task 4 — uninitialized front door (exit 0), initialized next move, `--json` shape, corrupt-state fallback (exit 0, no crash).
- verify: `pnpm --filter @manehorizons/cadence-core build && pnpm --filter @manehorizons/cadence-core test -- cli/quickstart.test.ts` green.
- done: AC-4, AC-5, AC-6

### T5: Docs + phase gate
- files: `docs/reference/commands.md`, `DESIGN.md`
- action: Per plan Task 5 — `### quickstart` section + ToC entry in commands.md; one-line slice-D DESIGN.md note.
- verify: `pnpm --filter @manehorizons/cadence-core lint && pnpm --filter @manehorizons/cadence-core typecheck && pnpm --filter @manehorizons/cadence-core test && pnpm --filter @manehorizons/cadence-core build` all green.
- done: AC-3

## Boundaries

- DO NOT duplicate next-action logic; reuse `nextAction` from `progress.ts` for the post-init Next.
- DO NOT make `quickstart` throw — any state-read failure degrades to the uninitialized orientation, exit 0. It must never raise `NotInitializedError` (pre-init is its primary path).
- DO NOT import the command-map/help text from `cli/` into the pure core; author it locally in `build.ts`.
- DO NOT mutate anything (read-only); no interactivity; no re-running init/tutorial.
- DO NOT change gate semantics, the config/state schema, or other commands' behavior.
