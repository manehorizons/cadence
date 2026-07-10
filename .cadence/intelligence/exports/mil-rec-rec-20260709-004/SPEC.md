---
phase: mil-rec-rec-20260709-004
id: 00-00
status: PENDING
---

# 00-00 — Trustworthy verifier activation: broader key discovery + activation smoke test + committed provider config

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260709-004`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

Look for a verifier key anywhere it legitimately lives (not just env var), run one real verification call on 'cadence activate' so real verification is proven not assumed, and let the provider choice (not the key) live in committed config so every teammate inherits real verification instead of silently defaulting to mock. Targets the known competitive risk that mock-default undercuts the enforcement wedge.

## Acceptance Criteria

### AC-1: Trustworthy verifier activation: broader key discovery + activation smoke test + committed provider config
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
