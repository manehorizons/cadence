---
'@manehorizons/cadence-core': minor
---

`cadence dispatch plan` gave no per-task signal about whether a dispatched task should run in its own isolated worktree — isolation was decided purely by human/skill-level convention, with no backing in the dispatch plan itself. Per rec-20260718-002 (from the same 2026-07-18 incident that motivated the dispatch-packet action-class prohibitions), every task in a dispatch plan now carries a `recommendedIsolation` value of `'worktree'` or `'none'`: `'worktree'` when the task declares one or more `files:` (it will mutate the working tree), `'none'` when it declares none (read-only/no mutation expected). This is surfaced both as a new `recommendedIsolation` field in `cadence dispatch plan --json`'s per-task output and as an advisory line in the rendered packet text itself — purely additive, no `Task`/`Draft` schema change, and no enforcement mechanism.
