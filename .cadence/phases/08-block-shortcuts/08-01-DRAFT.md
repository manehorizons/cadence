---
phase: 08-block-shortcuts
id: 08-01
tier: standard
status: PENDING
---

# 08-01 — block + needs-context shortcut verbs

## Objective

Ship `keel block <id>` and `keel needs-context <id>` as typo-saving shortcuts that mirror `keel done`, completing the trio of dogfood-friendly outcome verbs over the shared `recordTaskOutcome` helper.

## Acceptance Criteria

### AC-1: `keel block` records BLOCKED
Given loopPosition=BUILD with an active draft
When `keel block T1 --notes="stuck on X"` runs
Then `<phase>/<draft>-PROGRESS.json` records T1 with status=BLOCKED and the notes, and state.activeTask reflects T1=BLOCKED.

### AC-2: `keel needs-context` records NEEDS_CONTEXT
Given loopPosition=BUILD with an active draft
When `keel needs-context T2 --notes="need spec on Y"` runs
Then `<phase>/<draft>-PROGRESS.json` records T2 with status=NEEDS_CONTEXT and the notes, and state.activeTask reflects T2=NEEDS_CONTEXT.

### AC-3: both guard loop position
Given loopPosition≠BUILD
When either command runs
Then exit code is 1, stderr contains a clear LoopViolation message, and PROGRESS.json is unchanged.

### AC-4: share the build-task code path
Given `keel block`, `keel needs-context`, `keel done`, and `keel build task`
When any of them records the same id/status
Then all four produce byte-identical PROGRESS.json entries (same writer / same shape) — already enforced by `recordTaskOutcome`; verified by a parity test.

## Tasks

### T1: add `keel block <id>` command
- files: `packages/core/src/cli/commands/block.ts` (new), `packages/core/src/cli/index.ts`
- action: New command registering `block <id>` with `--notes <n>`, calls `recordTaskOutcome(cwd, id, 'BLOCKED', notes)`. Mirror `done.ts` exactly.
- verify: CLI integration tests cover AC-1, AC-3.
- done: AC-1, AC-3

### T2: add `keel needs-context <id>` command
- files: `packages/core/src/cli/commands/needs-context.ts` (new), `packages/core/src/cli/index.ts`
- action: New command registering `needs-context <id>` with `--notes <n>`, calls `recordTaskOutcome(cwd, id, 'NEEDS_CONTEXT', notes)`. Mirror `done.ts` exactly.
- verify: CLI integration tests cover AC-2, AC-3.
- done: AC-2, AC-3

### T3: tests
- files: `packages/core/tests/cli/block.test.ts` (new), `packages/core/tests/cli/needs-context.test.ts` (new)
- action: Mirror `done.test.ts` for each new verb: happy path with/without notes, LoopViolation guard, state.activeTask update. Add one parity test asserting `block T1` and `build task T1 --status=BLOCKED` produce identical PROGRESS.json task entries (ignoring `updatedAt`).
- verify: vitest green, suite count grows by ~9.
- done: AC-1, AC-2, AC-3, AC-4

## Boundaries

- DO NOT touch settle / status / progress / done commands.
- DO NOT change `recordTaskOutcome` — it already accepts BLOCKED and NEEDS_CONTEXT.
- DO NOT change slash-command codegen or skill manifests — these are CLI-only convenience verbs.
- DO NOT add aliases (`keel bl`, `keel nc`) in this phase — keep names explicit.
