---
phase: mil-rec-rec-20260611-003
id: 00-00
status: PENDING
---

# 00-00 — Make real verification the felt default — close the gap between the enforcement wedge and the mock default

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260611-003`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

CADENCE's sharpest, most-defensible differentiator (a deterministic in-loop AC-linked gate that refuses to settle) currently ships with its WEAKEST implementation on by default: the mock verifier only checks that a linked test exists and references the AC. The public pitch is 'real verification gate'; the out-of-box experience is 'structural test-linkage'. Decide how to converge them — e.g. make 'cadence activate' (v1.22) a near-mandatory first-run step, surface a louder 'you are running mock = NOT real verification' state in settle/doctor/quickstart, and/or reframe docs so mock is explicitly named as a placeholder, not a verifier. This is the #1 strategic finding from the 2026-06-11 competitive assessment: the wedge and the default experience must stop diverging.

## Acceptance Criteria

### AC-1: Make real verification the felt default — close the gap between the enforcement wedge and the mock default
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
