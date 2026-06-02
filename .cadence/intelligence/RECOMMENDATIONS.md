# CADENCE Recommendations

> Generated from `.cadence/intelligence/recommendations.json`.

## rec-20260602-001 — Rename 'cadence init --profile' flag to '--preset'

- status: candidate
- ready: ready-for-cadence-spec
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli
- files: packages/core/src/cli/commands/init.ts
- evidence: CONTEXT.md Flagged ambiguities: 'cadence init --profile sets a preset, not a profile'
- next: cadence milestone propose

The init --profile flag takes solo|team|production (a PRESET), while the domain profile is set via --gate-profile — actively misleading (flag named 'profile' does not set the profile). Rename the flag to --preset, keeping --profile as a deprecated alias. Design settled in the 2026-06-01 CONTEXT.md grilling session; needs a test (TDD), docs/reference/commands.md update, and the two-commit settle.

## rec-20260602-002 — Add /cadence-scout host slash command (ideation dialogue → recs)

- status: candidate
- ready: ready-for-milestone
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: host-claude-code, praxis
- files: packages/host-claude-code/src, docs/superpowers/specs/2026-06-02-cadence-scout-design.md
- evidence: Design agreed in /resume /cadence-scout design session 2026-06-02; full design in docs/superpowers/specs/2026-06-02-cadence-scout-design.md (Option A). Sibling: deferred Option-B grouping rec.
- next: cadence milestone propose

A tenth Claude Code slash command (prompt template, installed by cadence-host-claude-code) that runs a CADENCE-aware divergent→convergent ideation dialogue and lands survivors as Praxis recommendations via existing 'cadence recommendation add'. Named scout (not brainstorm) — it is the opposite end of the superpowers brainstorming skill: divergent candidate generation into the ranked ledger, never design→plan. Zero core-engine change, no new gate/loop position/record type. Fills the gap of an in-tool structured ideation dialogue that today forces leaving the tool and hand-entering results.

## rec-20260602-003 — [Deferred] First-class scout-session grouping on recommendations

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: praxis, types
- files: packages/types/src, packages/core/src
- evidence: Explicitly deferred in /cadence-scout design session 2026-06-02 (chose 'A now, B as follow-up rec'). Sibling of rec-20260602-002. See docs/superpowers/specs/2026-06-02-cadence-scout-design.md.
- next: cadence milestone propose

Option B from the /cadence-scout design: add an optional scoutId/sourceSessionId to the recommendation schema (cadence-types) + a --scout-id flag, surfaced as a cluster in 'cadence recommend', so the N recs from one /cadence-scout session are queryable as a set. Deferred: spends a permanent schema surface for unproven traceability need and overlaps the existing generic evidence mechanism. Clean additive follow-up if the need appears.

## rec-20260602-004 — Build cadence-demo-billsplit — GitHub demo showing a gate refusing a bug

- status: accepted
- ready: ready-for-milestone
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, marketing, demo
- files: docs/superpowers/specs/2026-06-02-cadence-demo-billsplit-design.md
- evidence: Design agreed in /resume session 2026-06-02 (pivoted from the /cadence-scout discussion: scout's markdown surface is too thin to show gates working, so a code-bearing demo project was chosen instead). Full storyboard in docs/superpowers/specs/2026-06-02-cadence-demo-billsplit-design.md.
- next: cadence milestone propose

A standalone, cloneable demo repo (cadence-demo-billsplit) whose job is the 3-minute money shot: CADENCE's always-fire build-test-must-pass gate REFUSES to settle a plausible bug the AI already marked DONE. Subject = a bill-splitter CLI (pure TS, relatable). The trap is lost remainder cents ($100/3 sums to $99.99 under naive total/people rounding); AC-2 requires sum(shares)===total. Hero gate is deterministic/offline (failing test under default mock provider) so anyone cloning reproduces the refusal; --deep AI verifier is an optional bonus beat. Separate repo (not examples/ inside the meta-repo) to avoid nested .cadence collisions. ✓ BUILT & PUBLISHED 2026-06-02: public repo manehorizons/cadence-demo-billsplit (GIF + asciinema + real DRAFT→BUILD→SETTLE loop history).
