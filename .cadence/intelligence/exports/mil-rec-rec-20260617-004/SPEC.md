---
phase: mil-rec-rec-20260617-004
id: 00-00
status: PENDING
---

# 00-00 — Fold activation into init when API key present

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260617-004`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

Out-of-box mock verifier is plastered as 'NOT real verification' across init/doctor/config-explain, but turning it on is a separate cadence activate + export ANTHROPIC_API_KEY dance. At init, if ANTHROPIC_API_KEY is already in env, offer (or --activate auto-select) anthropic right there. User with key gets real verification with zero extra hops and no scolding.

## Acceptance Criteria

### AC-1: rec-20260617-004
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
