---
'@manehorizons/cadence-core': patch
---

Adds a `task-verify-required` settle gate that refuses `cadence settle run` when a task is marked DONE but its DRAFT `- verify:` line was empty or omitted — previously `draft-parser.ts` silently defaulted a missing line to `''` and SUMMARY.md recorded a bare `TN: DONE` with zero evidence (#206). The gate fires in `standard`/`complex` tiers across `strict`/`standard`/`auto` profiles; `quick-fix` is deliberately exempt. The refusal names every offending task id and points at the missing verify line, following this repo's refuse-and-suggest house style — it never mutates the DRAFT or task status. `docs/concepts.md` and `cadence explain gates` are updated for the new 14-gate total.
