---
phase: mil-rec-rec-20260723-003
id: 00-00
status: PENDING
---

# 00-00 — CLAUDECODE-aware messaging for anthropic provider + host-cli suggestion in doctor/activate

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260723-003`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

When provider:anthropic is configured, ANTHROPIC_API_KEY is missing, AND CLAUDECODE=1 is detected (i.e. cadence is running inside a live Claude Code session), cadence doctor's verification-readiness check and cadence activate's failure path currently print the same generic 'key missing, here's the export line' message as any other missing-key case. In this specific, detectable situation the message could instead name the actual confusion directly and proactively suggest host-cli as the provider that piggybacks off the session's own Claude Code auth with zero separate key. Higher scope/risk than the other two (new CLAUDECODE detection at doctor/activate time, not just at verifier-factory fallback time) -- evaluate whether the win justifies the added surface.

## Acceptance Criteria

### AC-1: CLAUDECODE-aware messaging for anthropic provider + host-cli suggestion in doctor/activate
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
