---
phase: mil-rec-rec-20260724-002
id: 00-00
status: PENDING
---

# 00-00 — P0 escape retro: externally-identified critical findings must land in the ledger at identification time

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260724-002`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

The assurance-levels P0 from the v1.47.0 audit appears nowhere in the ledger, roadmap, or source (the string assurance has zero hits repo-wide), yet half of it shipped under other names. A critical item was partially executed from memory rather than from the ledger, which is the exact failure mode the Praxis layer exists to prevent. Decide the mechanism: a standing rule that audit sessions end with same-session ingestion, a required scout-id per audit, or a ledger-diff step in the audit protocol itself.

## Acceptance Criteria

### AC-1: P0 escape retro: externally-identified critical findings must land in the ledger at identification time
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- Retroactively auditing the existing 34+ tracked recommendations for other unlogged P0s from past audits -- this phase only prevents future escapes, it does not backfill.
- Building automated tooling that runs the diff itself (e.g. a CLI subcommand) -- this phase documents/enforces a protocol step for the (usually AI) operator running an audit, not new cadence CLI surface.

## Open Questions

- [operator] Assumes there is a concrete, edited artifact (an audit skill, a checklist in docs/agents/, or a CLAUDE.md section) that future audit sessions actually read -- if no such artifact exists yet, this phase must create one, not just describe the mechanism in the rec.
- [operator] Assumes 'critical/P0 finding' is identifiable at audit time without another human-judgment gate -- the mechanism needs a concrete definition of what counts as critical enough to require the diff check.
- [operator] The ledger-diff step is documented but not gated by anything mechanical -- an agent under time pressure could still skip it, same as the original P0 escape, unless it's wired into a checklist a session structurally can't skip (e.g. the audit skill's own closing step).
- [operator] The keyword-match step (grep recommendations.json by title/area/evidence) is fuzzy -- a real finding could get a false-positive match against an unrelated existing rec and be waved through as 'already ledgered' when it isn't.
