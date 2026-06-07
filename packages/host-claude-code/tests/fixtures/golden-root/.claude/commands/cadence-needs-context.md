---
description: Mark a task NEEDS_CONTEXT (shortcut for build task --status=NEEDS_CONTEXT)
argument-hint: <task-id> [--notes=<n>]
allowed-tools: Bash(cadence:*), Read
---

<!-- managed-by: cadence -->

!cadence needs-context $ARGUMENTS

Supply the missing context, then re-run the task.
