---
description: Replay the freshest session handoff (brief by default; --full adds live context, read-only)
allowed-tools: Bash(cadence:*), Read
---

<!-- managed-by: cadence -->

!cadence resume

Read the replayed handoff and continue from the documented next action. Output is brief by default and auto-promotes to full on drift; run `cadence resume --full` for the whole doc + live context.
