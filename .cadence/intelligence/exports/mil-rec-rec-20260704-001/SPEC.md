---
phase: mil-rec-rec-20260704-001
id: 00-00
status: PENDING
---

# 00-00 — Settle-time boundary diff scan (blocking) for subagent edits

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260704-001`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

Follow-on to phase 155 (edit-time boundaryEnforcement block mode). Edit-time interception can't see subagent edits (handleSubagentResult only bumps a counter). Needs: (1) a genuine settle-refusal path, since CADENCE anomalies are informational-only and never block settle today (packages/types/src/anomaly.ts:8-11) -- collectAnomalies alone cannot refuse; (2) an unscoped git diff enumeration with a defined base ref, since the existing helpers (git/diff.ts collectGitDiff, services/settle.ts collectDiffForCodeReview) are file-scoped and can never surface an out-of-boundary file; (3) a .cadence/** ignore-list, since settle's own DRAFT/PROGRESS/SUMMARY/state.json writes would otherwise self-trip the scan on every settle. Split out of rec-20260701-012 / phase 155 after an Opus SPEC review found the settle-time AC rested on a false premise.

## Acceptance Criteria

### AC-1: Settle-time boundary diff scan (blocking) for subagent edits
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
