---
'@manehorizons/cadence-core': minor
---

Adds `cadence milestone reopen <id>`, a CLI transition that moves a `deferred` milestone back to `proposed` so its claimed recommendations become eligible for re-clustering again. Previously `applyTransition()` had no path out of `deferred` — `clusterMilestones()` treats any non-`proposed` milestone as a permanent survivor and permanently excludes its claimed `recommendationId`s, so a deferred milestone stayed stuck forever with no CLI recourse short of hand-editing `milestones.json`. `reopen` refuses loudly (exit 1, no state mutation) if the milestone isn't currently `deferred` (naming its current status), the id doesn't exist, or the milestone's claimed recommendation(s) collide with another still-live (non-`deferred`/non-`proposed`) milestone.
