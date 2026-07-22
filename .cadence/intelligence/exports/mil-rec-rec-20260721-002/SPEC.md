---
phase: mil-rec-rec-20260721-002
id: 00-00
status: PENDING
---

# 00-00 — cadence next: state-derived legal next moves at any loop position, human + --json agent contract

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260721-002`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

A read-only command answering "what now?" deterministically from ground truth at any loop position — not milestone suggestion, literal next step. Computed from state the engine already holds: pending DRAFT -> the approve invocation; mid-BUILD -> remaining tasks (T-ids) + ACs still lacking coverage; all tasks DONE -> the settle invocation; settled -> next phase in milestone, else the promote->propose chain with real rec ids; empty ledgers -> draft-new/onboard paths. Output: current position + 1-3 ranked legal moves with exact commands (a map, not an autopilot — when multiple moves are legal, e.g. settle-now vs. add-discovered-task, it lists both). --json returns {position, remainingTasks, blockedOn, legalMoves[]} as a stable contract so agents consume loop position as ground truth instead of reconstructing it from conversation context — deterministic navigation for orchestrators; zero tokens, zero drift. Explicitly does NOT advise how to implement work (semantic, the agent's job); it names the door, the agent walks through it. Needs decisions: standalone command vs. also auto-appending its output as the footer of every empty state from the sibling actionable-empty-states rec (recommend: both — that rec's 'Try:' line is this command's logic scoped to one wall); relationship to quickstart (static map) — subsume, cross-link, or keep separate; --json schema versioning; whether host adapters surface it as a slash command (/cadence-next). Related but narrower: rec-20260605-002 (First-run 'what now?' nudge after cadence init) covers only the init-time case, not general loop-position navigation.

## Acceptance Criteria

### AC-1: cadence next: state-derived legal next moves at any loop position, human + --json agent contract
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
