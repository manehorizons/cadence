---
phase: 62-first-run-nudge
id: 62-01
tier: quick-fix
status: PENDING
---

# 62-01 — Guided first-loop nudge in cadence init output

## Objective

Replace the thin single-line `Next:` hint at the end of `cadence init` with a
short numbered "Your first loop" block plus a `cadence progress` escape hatch,
so a newcomer sees the exact first commands instead of being pointed at
ROADMAP.md editing.

## Acceptance Criteria

### AC-1: init prints a numbered first-loop sequence
Given a fresh repo
When `cadence init` completes successfully
Then stdout shows a "Your first loop" block listing the loop's first commands in
order (`cadence draft new …`, edit DRAFT, `cadence draft approve …`,
`cadence done …`, `cadence settle run …`).

### AC-2: init points at `cadence progress` as the escape hatch
Given a fresh repo
When `cadence init` completes
Then stdout includes a line telling the user they can run `cadence progress` at
any time to see the next action, and still shows the Docs pointer.

## Tasks

### T1: Replace the Next line with the guided first-loop block
- files: `packages/core/src/cli/commands/init.ts`
- action: Replace the single `Next: edit .cadence/ROADMAP.md …` console line with
  a "Your first loop" numbered block (draft new → edit → approve → done →
  settle), a `Stuck? Run \`cadence progress\` …` line, and the existing Docs
  pointer. Keep the gate-profile interactive note that follows.
- verify: `pnpm --filter @manehorizons/cadence-core test -- init.test`
- done: AC-1, AC-2

### T2: Update the init output test to the new contract
- files: `packages/core/tests/cli/init.test.ts`
- action: Update the AC-3 post-init-summary test: drop the
  `Next: edit .cadence/ROADMAP.md` assertion; assert the "Your first loop" block,
  the `cadence draft new` first step, the `cadence progress` escape-hatch line,
  and the Docs pointer.
- verify: `pnpm --filter @manehorizons/cadence-core test -- init.test`
- done: AC-1, AC-2

## Boundaries

- DO NOT change what `init` scaffolds (files written) or any flag behavior — this
  is output-text only.
- DO NOT remove the post-init summary block (project/location/preset/gate
  profile/layout/test globs) or the gate-profile interactive note.
- DO NOT touch version numbers or CLAUDE.md (no release in this phase).
