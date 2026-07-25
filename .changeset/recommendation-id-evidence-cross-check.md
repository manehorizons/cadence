---
'@manehorizons/cadence-core': patch
'@manehorizons/cadence-types': patch
'@manehorizons/cadence-host-claude-code': patch
'@manehorizons/cadence-host-codex': patch
---

Fix `cadence recommendation add`'s id-minting to cross-check `evidence.json`
(phase 219, rec-20260724-013). `nextRecommendationId` previously derived the
next `rec-YYYYMMDD-NNN` id only from `recommendations.json`, so a dangling
`evidence.json` row left behind by a bad rebase-conflict resolution or an
interrupted `add` call — a `recommendationId` reference with no matching
`recommendations.json` entry — could silently collide with a freshly minted
id for an unrelated recommendation. The minted id is now guaranteed strictly
greater than both the `recommendations.json` max and the max
`recommendationId` referenced by `evidence.json` for the same date prefix.

Also adds a new `orphaned-evidence` `cadence doctor` check that surfaces any
`evidence.json` row whose `recommendationId` has no matching
`recommendations.json` entry, naming the evidence id and the missing
recommendation id — so this class of drift is caught immediately instead of
surviving unnoticed.

`cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
version-alignment bumps only; none of the three changed.
