---
phase: mil-rec-rec-20260724-003
id: 00-00
status: PENDING
---

# 00-00 — Generate CHANGELOG entries from settle artifacts and gate releases on changelog currency

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260724-003`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

CHANGELOG.md tops out at 1.6.0 (2026-06-04) while npm latest is 1.50.0 (published 2026-07-22) — roughly 44 published versions unrecorded, and the releases page carries 14 tags against ~50 versions. The internal record is immaculate, so the fix is mechanical: a phase-to-changelog generation step drawing on SUMMARY.json artifacts, plus a release-workflow gate that refuses publish when the changelog lags the version bump. Turns a record-integrity regression into a product feature.

## Acceptance Criteria

### AC-1: Generate CHANGELOG entries from settle artifacts and gate releases on changelog currency
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- Milestone touches documentation surfaces — spec/doc drift risk.

## Open Questions

- _(question)_
