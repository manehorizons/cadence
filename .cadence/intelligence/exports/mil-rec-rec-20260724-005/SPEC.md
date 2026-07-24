---
phase: mil-rec-rec-20260724-005
id: 00-00
status: PENDING
---

# 00-00 — Close the trust envelope: gate the SETTLE capability class in MCP serve

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260724-005`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

mcp-trust.ts classifies SETTLE as a capability class but the source comment states it is left ungated this phase. The envelope machinery (def-hash-bound grants, revoke-on-version-change, expiry) already exists and gates APPROVAL_BYPASS; extending it to SETTLE is the remaining step. Settle is the crown-jewel operation — an MCP caller reaching it without an operator grant undercuts the independence story the rest of the surface earns.

## Acceptance Criteria

### AC-1: Close the trust envelope: gate the SETTLE capability class in MCP serve
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
