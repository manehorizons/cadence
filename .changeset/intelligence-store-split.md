---
"@manehorizons/cadence-core": patch
"@manehorizons/cadence-types": patch
"@manehorizons/cadence-host-claude-code": patch
---

Internal refactor (phase 54): split the `intelligence/store` module.

No user-facing or API change — the published packages' public surface is
unchanged and all behavior is identical (the full test suite passes unmodified).
This is a maintainability deepening: the 985-LOC `intelligence/store.ts`
god-module was decomposed into ten single-responsibility modules under
`intelligence/store/` (paths, ids, io, recommendations, assumptions, decisions,
stats, audit, reconcile, milestones), with `store.ts` kept as a thin re-export
barrel so every existing import site resolves unchanged. `cadence-types` and
`cadence-host-claude-code` are bumped only to keep the three public packages in
lockstep; neither changed.
