---
"@thomas-powers-jr/cadence-core": minor
---

`cadence done <id>` is now a true alias for `cadence build task <id> --status=DONE`: it delegates entirely to `buildTaskService` instead of calling `recordTaskOutcome` directly, inheriting three gates it previously bypassed entirely — the per-task-verify gate, the record-time boundary/redundancy check (phase 280's dispatch contract), and a pre-existing unknown-task-id guard. `done` gains no new flags of its own.

This is a real behavior change: `done` could previously never fail. It can now refuse with no bypass flag on `done` itself — exit 1 for a per-task-verify or boundary-check refusal, exit 2 (a distinct code) for an undeclared task id. A caller needing to bypass a gate-1/gate-2 refusal must use `build task <id> --status=DONE --allow-per-task-failure` / `--allow-boundary-breach` directly; the unknown-task-id guard has no bypass on either command — the id must be declared in the active DRAFT.

Error and diagnostic output on the `done` path now comes from `build task` (messages are prefixed `build task:` / `build task failed:` rather than `done failed:`), a consequence of full delegation.
