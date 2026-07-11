---
phase: mil-rec-rec-20260711-001
id: 00-00
status: PENDING
---

# 00-00 — assertion coverageMode is JS/TS-only; silently breaks by default for Python (and other non-JS) test suites

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260711-001`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

findTestSpans (packages/core/src/verify/test-spans.ts) only recognizes JS/TS it()/test() call syntax with expect/assert/.should inside. Since Phase 139, a fresh 'cadence init' defaults verification.coverageMode to 'assertion' for every preset (solo/team/production), so any pytest-style project (def test_...(): with plain assert) gets 0 spans found and the test-coverage gate refuses permanently -- there is no way to place the AC-N token to satisfy it. 'Annotate tests first' is a dead end, not a fixable mistake. Confirmed empirically against a real pytest file across two separate repos: 0 spans found even after adding an AC-N comment.

## Acceptance Criteria

### AC-1: assertion coverageMode is JS/TS-only; silently breaks by default for Python (and other non-JS) test suites
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
