---
phase: 29-tty-remediation
id: 29-08
tier: standard
status: PENDING
---

# 29-08 — 29.3 remediation: T2 + T3 + T4

## Objective

Fix the three actionable Phase 29.3 TTY findings (`.cadence/shakedown/29-03-TTY.md`): T2 approve-prompt bad-input feedback, T3 unvalidated `build task` id, T4 interactive `skip`/unverdicted AC bypassing structural completeness.

## Context

29.3 (human TTY) found: **T2** the `[y/n]` approve prompt gives no feedback on empty/garbage input and no attempt count; **T3** `cadence build task T1--status=DONE` (missing space) silently recorded a task literally named `T1--status=DONE` — `build task` never validates the id against the DRAFT's tasks; **T4** `settle run --interactive` (without `--auto`) skips structural derivation (`settle.ts:538 if (opts.auto)`), so a skipped/unverdicted AC whose task is incomplete does NOT block settle — contradicting the walker's own "Skip falls through to other gates" line. T1/T5/T6 were works-as-designed (no change).

## Acceptance Criteria

### AC-1: approve prompt gives bad-input feedback + attempt count
Given the manual-approve y/n prompt
When the user enters empty or unrecognized input
Then the re-prompt states the valid answers and the attempt number (e.g. `Please answer y or n (attempt 2/3):`); explicit `y`/`n` still resolve immediately; 3 unrecognized → refuse as before.

### AC-2: build task validates the task id
Given a `cadence build task <id>` with an active DRAFT
When `<id>` is not one of the DRAFT's declared task ids
Then the command errors (exit 2) naming the unknown id and listing the valid ids, and records nothing (no `T1--status=DONE`-style ghost task).

### AC-3: interactive skip falls through to structural derivation
Given `settle run --interactive` (with or without `--auto`)
When an AC is skipped or never verdicted and its linked task is not DONE
Then settle refuses (offender) unless `--force`/explicit verdict — i.e. the walker's "Skip falls through to other gates" is now true; explicit interactive pass/fail still override structural derivation as before.

## Tasks

### T1: T2 — approve prompt feedback
- files: `packages/core/src/cli/commands/draft.ts`, `packages/core/tests/cli/draft-approve.test.ts`
- action: in `askApproveVerdict`, re-prompt unrecognized/empty input with `Please answer y or n (attempt N/3): ` (1-indexed); accept y/yes/n/no case-insensitively as before; 3 unrecognized → return 'no'.
- verify: scripted-prompter test — garbage then `y` approves and the re-prompt text appears; `n` still immediate.
- done: AC-1

### T2: T3 — validate build task id
- files: `packages/core/src/cli/commands/build.ts`, `packages/core/tests/cli/build-task-validation.test.ts` (new) or extend an existing build test
- action: after status parse, when state has an active phase+draft, parse the DRAFT; if `taskId` ∉ `draft.tasks.map(t=>t.id)` → stderr `build task: unknown task id "<id>". Valid: T1, T2, … (from <id>-DRAFT.md)`, exit 2, record nothing. (No active draft → leave existing behavior / loop-violation path untouched.)
- verify: test — `build task BOGUS` and `build task T1--status=DONE` both error exit 2 + record nothing; valid `T1` still records.
- done: AC-2

### T3: T4 — skip falls through to structural derivation
- files: `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/cli/settle-interactive*.test.ts`
- action: change the derivation guard `if (opts.auto)` (~line 538) to `if (opts.auto || interactiveRequested)` so when the walker runs, ACs not user-verdicted (explicit `--ac` or interactive pass/fail) are structurally derived and offenders refuse unless `--force` — exactly as `--auto`. Interactive pass/fail still override (already excluded via `userVerdictedIds`); skip records no verdict so it falls through.
- verify: test — `settle run --interactive` (no `--auto`), AC-1 pass, AC-2 skip while T2 PENDING → refuses with the offender message; with `--force` settles; AC-2 explicitly verdicted pass → settles.
- done: AC-3

### T4: docs + full suite
- files: `.cadence/shakedown/29-03-TTY.md`, `CHANGELOG.md`, `DESIGN.md`
- action: append a "REMEDIATION VERIFIED (Phase 29.8)" note to 29-03-TTY.md (T2/T3/T4 fixed, T1/T5/T6 unchanged); CHANGELOG `### Fixed` ×3; DESIGN §10 punchlist entry. Full `pnpm turbo run test` green.
- verify: full turbo suite green; report/CHANGELOG/DESIGN updated.
- done: AC-1, AC-2, AC-3

## Boundaries

- DO NOT change explicit-verdict (`--ac`) or interactive pass/fail override semantics — only make skip/unverdicted fall through, and only when the walker ran.
- DO NOT alter plain non-interactive, non-auto `settle run` behavior (guard adds `|| interactiveRequested` only).
- DO NOT touch the per-task / coverage / deep / code-review / security-audit gates.
- DO NOT push without user approval.
