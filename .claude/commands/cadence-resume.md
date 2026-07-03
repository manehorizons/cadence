---
description: Replay the freshest session handoff + live context (read-only)
allowed-tools: Bash(cadence:*), Read
---

<!-- managed-by: cadence -->

!cadence resume

Read the replayed handoff and continue from the documented next action. If it notes other worktrees have resumable handoffs, ask which one to resume or pass `--pick <n>` directly.
