---
'@manehorizons/cadence-core': minor
---

`cadence doctor` gains a `ledger-remote-collision` check (rec-20260726-003):
`mintId` computes the next recommendation/evidence/decision/assumption id
purely from the local ledger on disk, so two unpushed branches/worktrees/
sessions can independently mint the same id for different content — this
happened for real on 2026-07-26 and required a manual git-merge + JSON-union
fix (PR #308).

The new check fetches the tracked upstream branch (reusing the existing
`checkRemoteFreshness` fetch plumbing), resolves `git merge-base HEAD @{u}`,
and diffs local's new-since-merge-base ledger ids against the upstream's
new-since-merge-base ids across all four ledgers, warning (never `error`) on
any overlap and naming the colliding id(s). It degrades safely to `ok` — no
git repository, no upstream, a failed fetch, a detached HEAD, or no
discoverable merge-base all skip the check rather than failing it. No
`--fix` auto-repair exists for this finding — resolving a real collision
needs a human to pick which side re-mints, matching `worktree-phases`.
