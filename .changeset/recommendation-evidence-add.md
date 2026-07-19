---
'@manehorizons/cadence-core': minor
---

Adds `cadence recommendation evidence add <recId> --note <text>`, a tied-record writer that appends a new evidence note to an *existing* recommendation and links it into the recommendation's `evidenceIds`. Previously the only way to attach evidence after a recommendation's creation was a manual hand-edit of `evidence.json` and `recommendations.json` in lockstep — `cadence intelligence reconcile` does not help here, since `deriveRecommendationLinks` only re-derives `assumptionIds`/`decisionIds` from the assumption/decision ledgers, never `evidenceIds` from the evidence ledger, so a hand-added evidence entry silently would not show up in `cadence recommendation show` until `evidenceIds` was also hand-edited. The new command writes both ledger files atomically in one call, redacts secret-shaped substrings in the note the same way `recommendation add --evidence` does, and refuses cleanly (no ledger mutation) on an unknown recommendation id.
