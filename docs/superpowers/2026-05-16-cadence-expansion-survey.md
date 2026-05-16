# CADENCE Expansion Survey — superpowers-inspired candidates

**Date:** 2026-05-16
**Status:** Landscape/decision-support (pre-spec). Not a design. Picks one to deep-dive; rest → ROADMAP backlog.

## The gap (why this survey exists)

CADENCE ships the **back half**: `DRAFT → BUILD → SETTLE` with 10 gates. The **front half** — vague idea → brainstorm → spec → spec-review → plan → plan-review → converge — and the **iteration loops** are done *manually outside the tool* (this session ran them via superpowers, 3×, to build cadence's own phases). Every candidate below pulls some of that into the dogfoodable tool.

Existing reusable primitives: verifier-provider abstraction (`mock|anthropic|local`, Phase 15 `--deep` shape), `Prompter` (Phase 16, `CADENCE_PROMPTER_SCRIPT` seam), `skillAudit` telemetry (Phase 23.4), gate engine (one-shot pass/refuse). Anchors that constrain: **host-agnostic engine** (cadence is driven *by* an agent; it is not itself an agent runtime), **single-host**, dogfood-on-main two-commit.

## Candidates

| # | Feature | Size | Depends on | Thesis-fit | Key risk |
|---|---------|------|-----------|-----------|----------|
| 1 | `cadence spec` (brainstorm→spec stage, pre-DRAFT) | **L** | verifier providers + Prompter | **High** | brainstorming is interactive/open-ended — hard to make deterministic + non-TTY-safe; scope creep |
| 2 | Review-convergence loop primitive (`review→fix→re-review→escalate`, bounded) | **M** | none for v1 (wrap existing `plan-review`); full value with #1 | **High** | the "fix" actor needs edit capability → overlaps #4; must bound + escalate or it masks defects |
| 3 | `cadence build --subagent` (per-task subagent + 2-stage review) | **L** | a subagent dispatch capability cadence does not have | **Med** | **architectural** — makes the engine an agent orchestrator; conflicts with host-agnostic anchor |
| 4 | Auto-remediation on gate fail (`refuse→auto-fix→re-gate`) | **S–M** | a fix actor (same as #2's fix step) | **Med-High** | unbounded/unreviewed auto-fix can re-pass a gate while masking the real problem |
| 5 | `cadence research` stage (feeds DRAFT) | **M** | network/docs access cadence-core lacks | **Low-Med** | same engine-vs-orchestrator blur as #3 |
| 6 | Required-skill enforcement gate (SETTLE refuses if declared skills not in `skillAudit.invoked`) | **S** | `skillAudit` (already exists, 23.4) | **Med** | low — additive bounded gate |

## Two non-obvious insights

1. **#2 and #4 are the same engine.** Both are a bounded "attempt remediation → re-verify → converge or escalate to human" loop — just attached at different points (#2 at spec/plan-review, #4 at any gate). Build the primitive **once** (#2, first wrapping the existing `plan-review` gate so it needs nothing new), and #4 is mostly a second attach-point. Don't spec them as two unrelated features.
2. **#3 and #5 fight an anchor.** Cadence is deliberately a host-agnostic *engine*, not an agent/research *orchestrator* (the agent driving cadence does that). #3/#5 would invert that. They belong in backlog with an explicit "revisit only if the host-agnostic anchor is reconsidered" note — not near-term.

## Recommended sequence

1. **#6 first** — smallest, fully independent, reuses existing `skillAudit`, and is *already half-specified* as the ROADMAP 23.4 deferred open question (`skillAudit.required[]`). A clean standalone win that also closes an existing open question.
2. **#2 next** — the convergence primitive, v1 wrapping the existing `plan-review` gate (zero dependency on #1). Highest reusable value; the core thing superpowers has that cadence doesn't (iteration vs one-shot).
3. **#1 then** — the spec stage, *using #2's convergence* for an automated spec-review. Heaviest; sequence it after the primitive exists so spec-review is free.
4. **#4** — second attach-point of #2's engine; small once #2 exists.
5. **#3, #5 → backlog** with the host-agnostic-anchor caveat.

**Single highest-leverage first deep-dive:** #6 (fast, independent, closes an open question) **or** #2 (biggest conceptual gap, foundational for #1/#4). #1 is the most valuable end state but should not be the first spec.
