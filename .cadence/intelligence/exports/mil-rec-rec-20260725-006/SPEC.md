---
phase: mil-rec-rec-20260725-006
id: 00-00
status: PENDING
---

# 00-00 — Centralize gate bypass and seal policy in the settle driver

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260725-006`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

gates.sealed reads as a universal config knob but only 3 of ~10 bypassable gates (build-test-must-pass, coverage, boundary-scan) consult isGateSealed; docs/reference/config.md still names only 2 of them -- stale since boundary-scan shipped (Phase 156), the exact Doc Drift class this repo's own doc tests exist to catch. Bypass-flag semantics (--force vs --allow-X) are decided independently per gate file with no declared policy, and registry.ts records bypass provenance for test-coverage only.

## Acceptance Criteria

### AC-1: Centralize gate bypass and seal policy in the settle driver
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- Milestone touches documentation surfaces — spec/doc drift risk.

## Open Questions

- _(question)_
