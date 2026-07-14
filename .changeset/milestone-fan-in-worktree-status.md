---
'@manehorizons/cadence-core': minor
---

Add `cadence milestone status <id>`, a read-only reconciliation command that maps a milestone's converted recommendations to their phases, resolves each phase's owning worktree (local or sibling) via `gatherHandoffCandidates`, and reports that worktree's live loop position — replacing N manual `cadence status` round-trips with one. Recommendations not yet converted to a phase, and converted phases with no matching worktree, are reported (as `not-yet-converted`/`no-worktree-found`) rather than dropped. Supports `--json`; refuses with exit 1 for an unknown milestone id, matching the existing `accept`/`defer`/`close` refusal shape. Never writes to any ledger, `state.json`, or worktree.
