---
'@manehorizons/cadence-core': patch
---

Fixes a bug (#248) where `cadence recommendation add` could reuse an already-issued recommendation ID once every recommendation created on a given day had been archived (e.g. shipped). `nextRecommendationId` only scanned the active `recommendations` array for the highest existing same-day sequence number, never the `archived` bucket — once the active array had no same-day entries left, the counter reset to `001` and collided with the first ID issued that day, even though that ID remained in permanent use elsewhere (evidence, assumptions, decisions, milestone links, commit messages, DRAFT files). New recommendation IDs are now guaranteed unique across a project's full history, not just among currently-active entries.
