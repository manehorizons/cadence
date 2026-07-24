---
phase: mil-rec-rec-20260724-001
id: 00-00
status: PENDING
---

# 00-00 — Minimum-evidence floor gate: refuse settle below a configured AC evidence level

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260724-001`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

The Phase 140 evidence ladder (ai-verified > executed > assertion > mention > unverified) is visibility-only: no gate acts on it, so a phase with every AC at mention or unverified settles exactly as green as an ai-verified one. Add a configurable floor (e.g. gates.evidenceFloor: executed) that refuses settle when any AC PASS rests on evidence below the floor, with per-preset defaults (solo: mention, team: assertion, production: executed) and a named bypass recorded in gateBypasses. This is the enforcement half of the assurance-levels P0 from the v1.47.0 audit; the visibility half shipped as Phase 140/70/73. Under the gate-vs-shape thesis, evidence levels are currently shape.

## Acceptance Criteria

### AC-1: Minimum-evidence floor gate: refuse settle below a configured AC evidence level
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- Not retroactively re-evaluating already-settled phases against the new floor -- applies going forward only.
- Not changing the Phase 140 evidence ladder's ranking or definitions themselves -- only adding a gate that acts on the existing ladder.

## Open Questions

- [operator] Requires deriveAcEvidence's existing buildTestRan signal to be trustworthy per preset -- the gate's 'executed' tier has no meaning if the suite never actually runs this settle.
- [operator] Production tier's proposed non-mock-provider guard (closing the Mock Mirage gap) needs the deep-verify provider identity visible at gate-evaluation time -- the same signal deriveAcEvidence already reads to exclude mock from ai-verified.
- [operator] Bypass normalization: if the per-AC evidenceFloor bypass is easy to reach, agents/operators may invoke it every settle rather than exceptionally, quietly becoming the real floor instead of the configured one (per Fable review 2026-07-24, see ev-20260724-010).
- [operator] Team preset's 'executed' floor is only meaningful if build-test-must-pass reliably runs under the team preset; a team repo with no configured verification.testCommand can never reach 'executed' evidence, turning the gate into a permanent refusal rather than a real floor.
