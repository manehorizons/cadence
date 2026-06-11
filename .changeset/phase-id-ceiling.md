---
'@manehorizons/cadence-core': patch
'@manehorizons/cadence-types': patch
'@manehorizons/cadence-host-claude-code': patch
'@manehorizons/cadence-host-codex': patch
---

Fix the phase-id ceiling (rec-20260610-001): widen the id schema from
`^\d{2}-\d{2}$` to `^\d{2,}-\d{2,}$` and derive ids through a single
`derivePhaseTaskId` helper, so phases >= 100 are representable end-to-end
instead of being mangled into `10-100`. Existing 01-99 ids are unchanged.
