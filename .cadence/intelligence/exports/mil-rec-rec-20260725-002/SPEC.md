---
phase: mil-rec-rec-20260725-002
id: 00-00
status: PENDING
---

# 00-00 — Deepen the Praxis ledger into one module

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260725-002`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

The 5 subject ledgers (recommendations/evidence/assumptions/decisions/milestones) each hand-roll their own read/write, id-minting, and status-transition logic instead of sharing one generic Ledger<T>. Id-minting collision-checking (Phase 219) was patched on recommendations only; the same collision class is still open on assumptions/decisions/evidence. Milestones is excluded from reconcile/audit/stats entirely. CLI list/filter pipelines are triplicated verbatim across recommendation.ts/decision.ts/assumption.ts.

## Acceptance Criteria

### AC-1: Deepen the Praxis ledger into one module
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- decayState derivation logic (fresh/aging/stale/superseded/contradicted/needs-revalidation) stays out -- flagged as a related but separate gap in the architecture review, not part of this deepening
- MCP/CLI service parity (rec-20260725-004) is a separate milestone/phase, not bundled into this one

## Open Questions

- [operator] Existing sidecar/ledger files on disk (this repo's own .cadence/intelligence/) must keep parsing byte-for-byte -- additive schema changes only, per repo convention
- [operator] Milestone ledger's known gitignored-but-tracked ephemeral-drift behavior (MILESTONES.md/milestones.json showing locally modified) must be preserved once milestones joins the shared io/reconcile/audit path
- [operator] docs/reference/config.md and CONTEXT.md's Intelligence ledger definition may need updates if the shared module changes any externally-visible shape (id format, CLI list/filter flags)
- [operator] Generic Ledger<T> hooks leak subject-specific rules back in (decision's supersession-graph cycle-walk, milestone's rec-reclaim guard) if the hook surface is too thin -- verify each subject's real logic survives as a hook, not a special case in the shared core
- [operator] A botched migration silently changes on-disk .cadence/intelligence/*.json layout, breaking other worktrees/checkouts or in-flight sessions reading the same ledger mid-refactor
