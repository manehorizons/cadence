---
phase: mil-rec-rec-20260723-002
id: 00-00
status: PENDING
---

# 00-00 — Docs callout: anthropic provider auth is separate from Claude Code's own login

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260723-002`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

docs/providers.md's anthropic section (~line 102-135) has no callout distinguishing 'logged into Claude Code' (OAuth/subscription) from 'ANTHROPIC_API_KEY set' (the anthropic provider's actual requirement, a direct Anthropic SDK call with zero visibility into Claude Code's credential store). The host-cli section already has an analogous, well-written distinction (quota-transparency notice, ~line 352-374) that can serve as the model for tone and placement.

## Acceptance Criteria

### AC-1: Docs callout: anthropic provider auth is separate from Claude Code's own login
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- Milestone touches documentation surfaces — spec/doc drift risk.

## Open Questions

- _(question)_
