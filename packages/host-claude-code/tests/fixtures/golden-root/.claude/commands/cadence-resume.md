---
description: Replay the freshest session handoff (brief by default; --full adds live context, read-only)
allowed-tools: Bash(cadence:*), Read
---

<!-- managed-by: cadence -->

!cadence resume

Read the replayed handoff and continue from the documented next action. Output is brief by default and auto-promotes to full on drift; run `cadence resume --full` for the whole doc + live context. If it notes other worktrees have resumable handoffs, ask which one to resume or pass `--pick <n>` directly. If an `⚠ origin/… ahead` banner appears, STOP — origin has commits this clone lacks and the handoff may be superseded; show the user `git log --oneline HEAD..@{u}` and ask continue/sync/abort before acting (never auto-pull/rebase/reset). If it warns of unfilled sections, treat them as absent. For env-check, stash restore, and execution-mode gating, prefer invoking the fuller /resume skill.
