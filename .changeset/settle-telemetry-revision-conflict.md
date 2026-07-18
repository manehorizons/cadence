---
'@manehorizons/cadence-core': patch
---

Fixes `cadence settle run` deterministically failing with `StateConflictError` whenever a `host-cli` verifier gate (whose subprocess can run for minutes) overlapped another subagent's `SubagentStop` hook — the hook's telemetry-only `session.subagentSpawns += 1` was routed through the same revision-guarded `SimpleStateBackend.commit()` as structural writes, so every spawn bump invalidated any other command's in-flight snapshot and the failure never converged on retry (#234). `StateBackend` gains `bumpSessionCounter()`, a write path scoped to purely-informational `session` counters that never compares to or bumps the optimistic-concurrency `revision` field; `handleSubagentResult()`'s telemetry-only branch now uses it. Structural commits (loop position, tasks, drafts, decisions, subagent baselines) keep the exact same revision-guarded conflict behavior as before.
