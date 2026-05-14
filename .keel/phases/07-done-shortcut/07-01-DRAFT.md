---
phase: 07-done-shortcut
id: 07-01
tier: standard
status: PENDING
---

# 07-01 — keel done shortcut verb

## Objective

Ship `keel done <id>` as a typo-saving shortcut for `keel build task <id> --status=DONE`, the most-typed verb in daily KEEL dogfooding.

## Acceptance Criteria

### AC-1: happy path records DONE
Given loopPosition=BUILD with an active draft
When `keel done T1 --notes="finished"` runs
Then `<phase>/<draft>-PROGRESS.json` records T1 with status=DONE and the notes, and state.activeTask reflects T1=DONE.

### AC-2: guards loop position
Given loopPosition≠BUILD (e.g. IDLE or DRAFT)
When `keel done T1` runs
Then exit code is 1, stderr contains a clear LoopViolation message, and PROGRESS.json is unchanged.

### AC-3: shares the build-task code path
Given the build-task and done commands
When either records the same id
Then both produce byte-identical PROGRESS.json (same writer / same shape) — verified by a unit test on the shared helper.

## Tasks

### T1: extract recordTaskOutcome helper
- files: `packages/core/src/build/record.ts` (new), `packages/core/src/cli/commands/build.ts`
- action: Lift the PROGRESS.json read/merge/write + state.activeTask update out of build.ts into a pure-ish `recordTaskOutcome(cwd, taskId, status, notes)` that throws LoopViolationError when guard fails. build.ts becomes thin CLI wrapper.
- verify: existing build.test.ts still passes unchanged.
- done: AC-3

### T2: add `keel done <id>` command
- files: `packages/core/src/cli/commands/done.ts` (new), `packages/core/src/cli/index.ts`
- action: New command registering `done <id>` with `--notes <n>`, calls `recordTaskOutcome(cwd, id, 'DONE', notes)`.
- verify: CLI integration tests cover AC-1, AC-2.
- done: AC-1, AC-2

### T3: tests
- files: `packages/core/tests/cli/done.test.ts` (new), `packages/core/tests/build/record.test.ts` (new)
- action: Unit test for `recordTaskOutcome` happy + guard paths; CLI test for `keel done` matching AC-1/2 and parity with build task.
- verify: vitest green, suite count grows by 5–7.
- done: AC-1, AC-2, AC-3

## Boundaries

- DO NOT touch settle / status / progress commands.
- DO NOT change slash-command codegen or skill manifests — `done` is a CLI-only convenience verb.
- DO NOT add `keel block` / `keel concerns` / `keel context` in this phase — scope is the single most-typed verb.
