---
phase: mil-rec-rec-20260725-003
id: 00-00
status: PENDING
---

# 00-00 — Give the MCP surface real "one engine" parity with the CLI

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260725-003`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

Seven services (recommendation-add/promote/convert/archive, handoff, resume, doctor) exist only for MCP -- no CLI command imports them. CLI and MCP each independently reimplement the same Praxis operations and have already diverged: CLI's promote --ref records a shipped ref; the MCP-only service has no such field. milestone propose's duplicated eligibility predicate (with its own prior whole-branch-review-caught note) is the same hazard reintroduced. verify.ts/next.ts/explain.ts already have the (args, io: CommandIO) service shape but live in cli/commands/ where MCP can't reach them.

## Acceptance Criteria

### AC-1: Give the MCP surface real "one engine" parity with the CLI
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
