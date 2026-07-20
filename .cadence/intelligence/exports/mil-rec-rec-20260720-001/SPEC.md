---
phase: mil-rec-rec-20260720-001
id: 00-00
status: PENDING
---

# 00-00 — milestone lifecycle has no un-defer/re-propose path once a milestone candidate is deferred

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260720-001`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

clusterMilestones() (packages/core/src/intelligence/milestone.ts) treats any non-'proposed' milestone as a permanent survivor and permanently excludes its claimed recommendationIds from re-clustering. applyTransition()'s allowed-transitions table has no path out of 'deferred' (accept only works from 'proposed', defer only from 'proposed'/'accepted', close only from 'exported'). Once a milestone is deferred, bumping the underlying recommendation's readiness/status has no effect — the rec is permanently claimed by the dead milestone entry. Discovered 2026-07-20: rec-20260619-008 (Team rollout kit) had been deferred as mil-rec-rec-20260619-008 and stayed stuck at needs-decision across 2+ sessions because there was no CLI path to reopen it; the only workaround found was a direct edit of milestones.json, which violates this repo's refuse+suggest/never-hand-edit-derived-state convention. Consider adding a 'milestone reopen <id>' transition (deferred -> proposed) or making clusterMilestones() re-pool recs whose readiness has been promoted since the deferral.

## Acceptance Criteria

### AC-1: milestone lifecycle has no un-defer/re-propose path once a milestone candidate is deferred
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- Not unwinding the recommendation-restart workaround (archiving a stuck rec and recreating a fresh one) -- that stays a valid escape hatch even after this fix.
- Not touching accepted/exported/closed milestone transitions -- scope is limited to the deferred state's dead end.

## Open Questions

- [operator] Requires understanding applyTransition()'s allowed-transitions table and clusterMilestones()'s claimed-recommendationIds exclusion logic in packages/core/src/intelligence/milestone.ts.
- [operator] Any new deferred->proposed transition must still respect the refuse+suggest / never-hand-edit-derived-state convention -- no direct milestones.json mutation as a fallback.
- [operator] Reopening a deferred milestone whose claimed recommendationId has since been re-claimed by a newer restart milestone (e.g. rec-20260619-008 -> rec-20260720-002) could let two milestone entries claim the same recommendation, breaking the dedup invariant clusterMilestones() relies on.
- [operator] A naive 'always re-pool on readiness bump' rule could thrash accepted/exported milestones back into proposed if a recommendation's readiness is edited after work has already started.
