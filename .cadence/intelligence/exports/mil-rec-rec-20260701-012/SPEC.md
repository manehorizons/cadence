---
phase: mil-rec-rec-20260701-012
id: 00-00
status: PENDING
---

# 00-00 — Boundary enforcement block mode, including subagent edits

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260701-012`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

DRAFT declares files: per task and Boundaries per phase, but pre-tool-edit checks only warn, the sole blocking edit hook is off by default, and subagent edits only tick a counter. Fix: boundaryEnforcement warn|block config (default warn); block mode refuses out-of-boundary writes at edit time where the host supports it, and a settle-time diff scan raises a blocking anomaly for out-of-boundary changes everywhere — honest scoping for hosts where edit-time hooks cannot see subagents.

## Acceptance Criteria

### AC-1: Boundary enforcement block mode, including subagent edits
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
