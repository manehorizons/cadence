# SETTLE Summary — 137-01

**Completed:** 2026-07-02T01:37:11.070Z

## Acceptance Criteria

- AC-1: PASS
- AC-2: PASS
- AC-3: PASS

## Tasks

- T1: DONE — BUILD-state progress now names the first-pending task id (or settle --auto once all recorded) via a best-effort NextActionHints.build computed in progressService; falls back to the pre-137 compound message if unreadable. TDD via 2 new tests in cli/progress.test.ts.
- T2: DONE — draft approve guards a missing DRAFT.md with existsSync before readFile, mirroring spec-approve's pattern: clean 'draft approve refused: <path> not found.' instead of raw ENOENT. TDD via 1 new test in draft-approve-gate.test.ts.
- T3: DONE — settle run's out-of-position refusal now also prints 'Next: <command>' computed via the same nextAction() cadence progress uses, while keeping the existing loop-violation message text + emitLoopViolation call unchanged. TDD via 2 new tests in loop-violation.test.ts.

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
