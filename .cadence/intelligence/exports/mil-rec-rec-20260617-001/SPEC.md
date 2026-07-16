---
phase: mil-rec-rec-20260617-001
id: 00-00
status: PENDING
---

# 00-00 — Zero-prompt init that auto-wires the host

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260617-001`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

cadence init prompts for name (default 'unnamed') + profile, then tells the user to separately run the host install. Derive name from package.json/dir, profile from git (suggestGateProfile already exists), detect .claude/ and offer/auto-run host install in the same step. --name/--preset stay as overrides. One command, zero questions, fully wired.

## Acceptance Criteria

### AC-1: rec-20260617-001
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
