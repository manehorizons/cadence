---
phase: 10-smoke-test-fixes
id: 10-01
tier: standard
status: PENDING
---

# 10-01 — DRAFT loopPosition + NEEDS_CONTEXT verdict

## Objective

Close two UX gaps surfaced by the pre-publish smoke test: (a) `draft new` doesn't transition loopPosition → DRAFT, so `keel progress` after scaffold is unhelpful; (b) `status` and `settle --auto` conflate NEEDS_CONTEXT tasks with BLOCKED, producing misleading AC verdicts and SUMMARY auto-notes.

## Acceptance Criteria

### AC-1: `draft new` enters DRAFT loopPosition
Given an IDLE repo
When `keel draft new <phase> <num>` runs
Then state.json shows `loopPosition=DRAFT`, `activePhase=<phase>`, `activeDraft=<id>`, the openDrafts array contains the new draft id, and STATE.md is regenerated. Running `keel draft new` again while loopPosition≠IDLE exits non-zero with a LoopViolation-style message.

### AC-2: progress in DRAFT suggests approve
Given loopPosition=DRAFT after a fresh scaffold
When `keel progress` runs
Then the suggested command is `keel draft approve <phase> <num>` using the actual active phase + num (no `<phase>`/`<num>` placeholders).

### AC-3: NEEDS_CONTEXT yields a distinct AC verdict
Given a task with status=NEEDS_CONTEXT linked to AC-X
When AC verdicts are derived (via `keel status` and `keel settle run --auto`)
Then AC-X is reported as `needs-context` (not `blocked`), the status display uses a distinct glyph (`[?]`), settle's stderr says `auto: AC-X needs-context (tasks: …)`, and a forced settle records the SUMMARY note as `auto: <tasks> needs context` (not "blocked").

### AC-4: BLOCKED wins when mixed
Given an AC linked to one BLOCKED task and one NEEDS_CONTEXT task
When AC verdicts are derived
Then the verdict is `blocked` (BLOCKED has priority); blockers list still includes both task ids.

## Tasks

### T1: `draft new` transitions to DRAFT state
- files: `packages/core/src/cli/commands/draft.ts`, `packages/core/tests/cli/draft-new.test.ts`
- action: After writing the DRAFT.md, load state via `SimpleStateBackend`; refuse with stderr message + exit 1 if `state.loopPosition !== 'IDLE'`. Otherwise set `activePhase`, `activeDraft=<id>`, `loopPosition='DRAFT'`, push to `openDrafts`, write state, regenerate STATE.md. Add tests for: state transition, openDrafts push, refusal when not IDLE, STATE.md updated.
- verify: vitest, existing draft-new tests + new ones green.
- done: AC-1

### T2: progress nextAction uses real ids in DRAFT
- files: `packages/core/src/progress.ts`, `packages/core/tests/cli/progress.test.ts`
- action: In the DRAFT case, when `state.activePhase` and `state.activeDraft` are set, render `keel draft approve <phase> <num>` with the actual values. Add a progress test asserting the command after `draft new` (no approve) contains the real phase + num.
- verify: vitest green.
- done: AC-2

### T3: distinguish NEEDS_CONTEXT in AC derivation + render + settle note
- files: `packages/core/src/status.ts`, `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/status.test.ts`, `packages/core/tests/cli/settle-auto.test.ts`, `packages/core/tests/cli/needs-context.test.ts`
- action: Extend `AcStatus.state` and `DerivedAcResult.verdict` unions with `'needs-context'`. In derivation, when all blocking tasks are NEEDS_CONTEXT, return `verdict='needs-context'`; if any is BLOCKED, return `'blocked'` (mixed → blocked, AC-4). Render glyph `[?]` for needs-context in `renderAcTable`. In settle: emit `auto: <id> needs-context (tasks: …)` on stderr, note `auto: <tasks> needs context` when force-settling. Update existing settle-auto BLOCKED test to keep passing; add new tests for AC-3 (pure NEEDS_CONTEXT) and AC-4 (mixed) covering both `status` JSON + settle stderr + SUMMARY note.
- verify: vitest green; total suite count grows by ~4.
- done: AC-3, AC-4

## Boundaries

- DO NOT change `recordTaskOutcome` or the `done`/`block`/`needs-context` CLI verbs — they already write the right status, the bug is in derivation/display.
- DO NOT bump StatusReport.schemaVersion — adding a literal to a union is non-breaking; consumers should accept new states gracefully.
- DO NOT touch host packages — slash command/skill copy is independent.
- DO NOT rename `BLOCKING_STATUSES` constant — it still covers both blocking shapes, just split for verdict reporting.
