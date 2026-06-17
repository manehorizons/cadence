# CADENCE Recommendations

> Generated from `.cadence/intelligence/recommendations.json`.

## rec-20260602-001 — Rename 'cadence init --profile' flag to '--preset'

- status: shipped
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

- status: shipped
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

- status: shipped
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

## rec-20260603-001 — Enable windows-latest CI leg (timeout + EBUSY harness fixes)

- status: shipped
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: ci, testkit, reliability
- files: packages/testkit/src/fixture.ts, packages/core/tests/cli/settle-security-audit.test.ts, packages/core/tests/hooks/dispatcher.test.ts, .github/workflows/ci.yml, vitest.shared.ts
- evidence: PR #19 CI run 26912393990: macos-latest 20/22 green, ubuntu green; windows-latest 20/22 failed with 20s/30s timeouts + EBUSY rmdir on temp cleanup.
- next: cadence milestone propose

Phase 49 unblocked macOS via realpath but deferred Windows. Enabling windows-latest surfaced Windows-only test-harness issues: (1) settle-security-audit.test.ts AC-4 and dispatcher.test.ts 'skill-invoke caps at 100 entries' exceed the vitest timeout on Windows runners (CLI-spawn + git + 100 atomic writes are slower there); (2) temp-dir cleanup hits EBUSY (rmdir, open handle) past the fixture's rm retry budget (maxRetries:5/retryDelay:100). Fix: raise fixture cleanup retry budget for EBUSY; address the slow Windows tests without per-test timeout band-aids (CLAUDE.md rule) — likely a Windows-aware global timeout or reducing per-test CLI-spawn count; consider an injectable renameWithRetry for testability. Then add windows-latest back to the ci.yml matrix + the ci-matrix.test.ts guard.

## rec-20260604-001 — Expose CADENCE as an MCP server surface

- status: shipped
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: packages/core, packages/host-claude-code
- evidence: Generated in /cadence-scout session on 'adoption & ecosystem', 2026-06-04. Highest ecosystem leverage of the session. Tension/sibling: 'Host-adapter authoring guide' (MCP may obsolete bespoke adapters — decide which path before building either).
- next: cadence milestone propose

Ship an MCP server that exposes the DRAFT→BUILD→SETTLE loop as MCP tools, so any MCP-capable agent (Claude Desktop/Code, Cursor, etc.) can drive CADENCE without a bespoke per-host adapter. Could reframe the whole multi-host question — one surface instead of N adapters.

## rec-20260604-002 — Host-adapter authoring guide + stable capabilities contract

- status: shipped
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, packages/host-claude-code
- evidence: Generated in /cadence-scout session on 'adoption & ecosystem', 2026-06-04. Sibling: rec-20260604-001 (MCP surface) — decide MCP-vs-adapters direction first; this guide only pays off if bespoke adapters remain the path.
- next: cadence milestone propose

Document the host-adapter contract (event-map, shim, capabilities) and publish an authoring guide so the community can write adapters (Codex, Cursor, Copilot CLI) instead of the maintainer building each. Force-multiplier: scales the ecosystem without solo effort. Codex host was started then archived (phases 02→11), so the contract exists implicitly — this makes it explicit and reusable.

## rec-20260604-003 — cadence doctor — diagnose project setup

- status: shipped
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: packages/core
- evidence: Generated in /cadence-scout session on 'adoption & ecosystem', 2026-06-04. Concrete + well-scoped. Motivated directly by the 2026-06-04 broken-slash-command-path bug (committed --local Windows path) — a doctor check would have caught it. Siblings: rec-20260604-001, rec-20260604-002.
- next: cadence milestone propose

A 'cadence doctor' subcommand that checks a project's setup health: hooks wired into settings.json, hooksPath configured, Node >=20, config schema valid, and slash-command run-lines portable (no machine-absolute paths). Surfaces silent misconfig that otherwise looks like CADENCE being broken.

## rec-20260604-004 — Recommendation promotion CLI — make milestone propose reachable

- status: shipped
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: packages/core, packages/types
- evidence: Discovered 2026-06-04 while starting phase 56 from rec-20260604-003: 'cadence milestone propose' returned None because no rec can reach accepted/ready-for-milestone. isEligible() in intelligence/milestone.ts gates on those; store/recommendations.ts only defines the 'convert' transition. spec new --from-rec is the current workaround. Sibling/context: rec-20260604-003 (cadence doctor) surfaced it.
- next: cadence milestone propose

Add CLI to advance a recommendation's status (candidate → accepted) and readiness (→ needs-decision/ready-for-milestone/ready-for-cadence-spec). Today the only rec status transition is 'convert' (→ converted), and readiness is write-once at 'add' time — so 'cadence milestone propose', which requires status=accepted AND readiness∈{ready-for-milestone,ready-for-cadence-spec}, can never be fed a manually-added rec. The whole milestone-clustering → accept → export-to-SPEC pipeline is unreachable from the CLI for manual recs.

## rec-20260605-001 — cadence tutorial — guided first-loop walkthrough

- status: shipped
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: host-claude-code
- files: packages/core/src/cli/commands
- evidence: Generated in /cadence-scout session on 'adoption & onboarding', 2026-06-05; grouped under scout-20260605-1702 (siblings: first-run nudge, cadence explain).
- next: cadence milestone propose

Interactive walkthrough that runs one toy DRAFT→BUILD→SETTLE loop end-to-end so a newcomer sees the loop in ~2 minutes. Reduces time-to-first-aha; largest build of the onboarding scout set.

## rec-20260605-002 — First-run 'what now?' nudge after cadence init

- status: shipped
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/cli/commands/init.ts
- evidence: Generated in /cadence-scout session on 'adoption & onboarding', 2026-06-05; grouped under scout-20260605-1702 (siblings: cadence tutorial, cadence explain).
- next: cadence milestone propose

After 'cadence init', print the exact next loop commands (draft new → approve → ...) so the user is not left at a 'now what?' cliff. Tiny, high-ROI removal of the first-5-minutes drop-off.

## rec-20260605-003 — cadence explain <concept> — in-CLI concept help

- status: shipped
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/cli/commands
- evidence: Generated in /cadence-scout session on 'adoption & onboarding', 2026-06-05; grouped under scout-20260605-1702 (siblings: cadence tutorial, first-run nudge).
- next: cadence milestone propose

In-CLI help for loop / gates / tiers / profiles so users do not have to leave the terminal for docs. Reuses existing docs content; makes the tool self-teaching.

## rec-20260607-001 — MCP Resources: expose .cadence/ artifacts under cadence:// (read-on-demand)

- status: shipped
- ready: ready-for-cadence-spec
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: mcp
- files: packages/core/src/mcp/resources.ts, packages/core/src/mcp/server.ts
- evidence: v1.16 MCP-deepening design 2026-06-07 (docs/superpowers/specs/2026-06-07-mcp-surface-deepening-design.md); deepens phase-58 MCP surface; siblings in scout-20260607-1019
- next: cadence milestone propose

resources/list+read+templates over a curated cadence:// table (state, roadmap, project, recommendations, phase draft/summary). Read-on-demand, no subscriptions. Phase 75.

## rec-20260607-002 — MCP tool parity: handoff, resume, recommendation add/promote, doctor

- status: shipped
- ready: ready-for-cadence-spec
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: mcp
- files: packages/core/src/mcp/tools.ts
- evidence: v1.16 MCP-deepening design 2026-06-07 (docs/superpowers/specs/2026-06-07-mcp-surface-deepening-design.md); deepens phase-58 MCP surface; siblings in scout-20260607-1019
- next: cadence milestone propose

Add the proven-out excluded commands as MCP tools (+ service extraction). Enables scout->rec->promote + session continuity over MCP. Phase 76.

## rec-20260607-003 — MCP Prompts + shared guidance extraction into core

- status: shipped
- ready: ready-for-cadence-spec
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: mcp
- files: packages/core/src/mcp/prompts.ts, packages/core/src/guidance, packages/host-claude-code/src/install-commands.ts
- evidence: v1.16 MCP-deepening design 2026-06-07 (docs/superpowers/specs/2026-06-07-mcp-surface-deepening-design.md); deepens phase-58 MCP surface; siblings in scout-20260607-1019
- next: cadence milestone propose

Extract canonical guidance/scout-dialogue text from host-claude-code into core/guidance; expose prompts/list+get (scout, next, draft, settle). Single source of truth. Phase 77.

## rec-20260607-004 — Zero-config: cadence mcp install (writes/merges .mcp.json)

- status: shipped
- ready: ready-for-cadence-spec
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: mcp
- files: packages/core/src/cli/commands/mcp.ts
- evidence: v1.16 MCP-deepening design 2026-06-07 (docs/superpowers/specs/2026-06-07-mcp-surface-deepening-design.md); deepens phase-58 MCP surface; siblings in scout-20260607-1019
- next: cadence milestone propose

New 'cadence mcp install [--print] [--client]' subcommand: non-destructive idempotent merge of project .mcp.json; --print snippet for Claude Desktop/Cursor. Phase 78.

## rec-20260607-005 — Phase 80 — structured logger foundation

- status: shipped
- ready: ready-for-cadence-spec
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: logging, observability, cadence-core, cadence-types
- evidence: Approved design 2026-06-07-observability-structured-logging-design.md; Post-v1.0 observability vector (MILESTONES.md)
- next: cadence milestone propose

Zero-dependency operator-debugging logger: LogLevel/LogRecord types in cadence-types, logger.ts + pure formatters in core, CADENCE_LOG_LEVEL/FORMAT env + config.logging block, stderr-only, default-off. Foundation only (no seam wiring or one trivial seam).

## rec-20260607-006 — Phase 81 — instrument three seams + scoped console.* migration

- status: shipped
- ready: ready-for-cadence-spec
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: logging, observability, gates, hooks, verify
- evidence: Approved design 2026-06-07 §Instrumented seams
- next: cadence milestone propose

Wire gate decisions, hook/event dispatch, and verifier provider calls through the logger via bound child loggers; migrate only diagnostic/error console.* calls at those seams. Per-seam tests + stdout-purity test.

## rec-20260607-007 — Phase 82 — observability docs + release v1.17.0

- status: rejected
- ready: ready-for-cadence-spec
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, release, observability
- evidence: Approved design 2026-06-07 §Phasing + §DESIGN.md & docs
- next: cadence milestone propose

Docs (config.md logging block + env vars, logging.md/concepts note, DESIGN.md section), changeset, lockstep 1.16.0→1.17.0 bump across all four published packages, tag + provenance.

## rec-20260608-001 — Handoff retention policy — auto-prune stale SESSION docs

- status: shipped
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cadence-core, handoff, config
- files: packages/core/src/services/handoff.ts, packages/types/src/config.ts
- evidence: 30 SESSION docs accumulated by v1.19; manually pruned to 1 on 2026-06-08
- next: cadence milestone propose

cadence handoff accumulates dated .cadence/handoff/SESSION-*.md docs indefinitely (30 had piled up by v1.19, manually pruned to 1). Add an opt-in retention policy that supersedes stale handoffs automatically. Design notes from 2026-06-08: (1) trigger at handoff-WRITE time, not settle — settle fires per-phase and would race the lastHandoff pointer mid-session; handoff is when a new doc obsoletes the prior. (2) Prefer retention-by-count (keep lastHandoff + most recent N) over merged-to-main detection — deterministic, offline, no git introspection. (3) Make it opt-in/configurable (handoff.retain knob, default off or generous), same posture as phaseGuard — the resume skill leans on the dated archive existing, so never silently destructive.

## rec-20260610-001 — Phase-id schema caps phases at 99 (two digits)

- status: shipped
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cadence-types, phase-id, loop-state
- files: packages/types/src/plan.ts, packages/types/src/spec.ts
- evidence: Hit live on 2026-06-10 cutting v1.22: 'Invalid string: must match pattern /^\d{2}-\d{2}$/' on phase 100.
- next: cadence milestone propose

PlanZ/SpecZ id regex /^\d{2}-\d{2}$/ in cadence-types (plan.ts:28, spec.ts:12) rejects 3-digit phase numbers, so 'cadence draft new … 100' generates an invalid id (10-100) and draft approve/coherence fail. CADENCE could not represent its own phase 100; the v1.22 release was cut outside the loop. Fix: widen the regex (e.g. /^\d{2,}-\d{2,}$/) + the id-derivation/padding, with tests at the 99→100 boundary.

## rec-20260611-001 — Recommendation lifecycle needs a terminal shipped/resolved state

- status: shipped
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: recommendation-lifecycle, intelligence
- evidence: rec-20260610-001 shipped via PR #70 (merge b350630) but remains candidate/needs-decision; surfaced as a dogfooding nugget in SESSION-2026-06-11 handoff.
- next: cadence milestone propose

The rec lifecycle has no terminal status for work that has actually shipped. promote only offers candidate|accepted|deferred|rejected, and convert requires a real .cadence/phases/ dir. So a rec like rec-20260610-001 (phase-id ceiling fix) stays 'candidate/needs-decision' in the ledger even after it merged to main (PR #70) and shipped — forcing any existing status would be dishonest. Propose adding a terminal 'shipped'/'resolved' status (and a way to set it without a phases dir) so the ledger can honestly reflect delivered work.

## rec-20260611-005 — Loud audit trail when settle gates are bypassed (--force / --allow-verifier-failure)

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: gates, settle, observability
- files: packages/core/src/gates/deep-verify.ts, packages/core/src/gates/coverage.ts
- evidence: Inventory weakness #6: verifier-failure handling is permissive; --force bypasses coverage + deep-verify with no audit trail or warning that gates were forced. The v1.17 stderr logger gives a seam to emit bypass events.
- next: cadence milestone propose

Settle can bypass gates via --force and --allow-verifier-failure with no loud, durable record that verification was skipped. For a tool whose whole positioning is 'refuses to settle unverified work', a silent bypass is the worst-case credibility hole: a phase can read as settled-and-verified when a gate was forced. Add legibility — record bypass events in the SUMMARY (which gate, why, flag used), emit a visible banner at settle time, and optionally surface a doctor/recommend warning when recent settles were forced. Directly reinforces the honest-claims positioning Thomas requires.

## rec-20260611-006 — Close the Codex host-adapter test-parity gap to prevent silent bit-rot

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: host-codex, testing
- files: packages/host-codex/src, packages/host-claude-code/tests
- evidence: Inventory weakness #1: codex adapter structure complete but under-exercised vs claude-code (11 test files); flagged as the clearest bit-rot risk by a skeptical-engineer read. Confirm the actual codex test-file delta before scoping.
- next: cadence milestone propose

The cadence-host-codex adapter mirrors cadence-host-claude-code structurally (same 8 files) but has materially thinner test coverage (claude-code has ~11 test files incl. install/shim/roundtrip/adapter-conformance/integration; codex is newer with far less). Since v1.13 markets CADENCE as genuinely multi-host, an under-tested second adapter risks silently breaking if Codex's hook/apply_patch envelope shifts. Bring codex up to conformance + install + shim + integration parity (reuse the testkit mock host + the adapter-conformance suite already proving the phase-60 contract).

## rec-20260611-007 — Author a sourced COMPETITIVE.md / objection-FAQ capturing the in-loop-enforcement wedge

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, positioning, launch
- files: docs, README.md
- evidence: Competitive research (primary-source GitHub/npm API, 2026-06-11): no enforcing in-loop AC-linked competitor; scaffolders soft-enforce, review bots gate late on PRs. Category forming (ThoughtWorks Radar v34, Cursor acq. of Graphite Dec 2025). Aligns with [[cadence-launch-positioning]] honesty constraints.
- next: cadence milestone propose

Turn the 2026-06-11 competitive assessment into a durable, verifiable positioning asset so it is not re-researched and so launch copy stays honest. Lead with the defensible, narrow claim that survives scrutiny: 'the only npm-distributed, host-agnostic tool that gates phase completion on acceptance-criteria coverage IN-LOOP' — distinct from scaffolders (Spec Kit 111k*, OpenSpec 54k*, BMAD 49k*, Kiro/AWS) that do not enforce, and from review bots (CodeRabbit, Graphite->Cursor, Greptile, Qodo) that enforce post-hoc on PRs via branch-protection. Cite the tailwind (ThoughtWorks Radar v34 endorsing deterministic quality gates wired into agent loops). Explicitly bank the overclaim to AVOID ('only tool that gates AI code'). Keep it local-only/gitignored like the other launch-prep artifacts until intentionally published.

## rec-20260617-003 — Auto-derive phase id and collapse --ac syntax

- status: accepted
- ready: ready-for-milestone
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, onboarding
- files: packages/core/src/cli/commands/draft-new.ts, packages/core/src/cli/commands/settle.ts, packages/core/src/cli/commands/progress.ts
- evidence: Onboarding map: verbose error-prone arg shapes (kebab+zero-pad positionals, --ac colon notes).
- next: cadence milestone propose

cadence draft new 01-foundation 01 --title needs kebab-case + zero-padded positionals (error-prone); resolveNextFreePhase already computes next-free. Make positionals optional: draft new --title auto-fills phase/num. settle run --ac AC-1=pass AC-2=fail:reason colon syntax is cryptic - add --pass-all / --ac-pass shorthands. Make cadence progress print one clean copy-pasteable next command.

## rec-20260617-005 — Agent/non-TTY mode to kill the StdinPrompter minefield

- status: accepted
- ready: ready-for-milestone
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: onboarding, cli, gates
- files: packages/core/src/cli/commands/init.ts, packages/core/src/gates/approve.ts, packages/core/src/cli/commands/settle.ts
- evidence: Onboarding map: multiple commands hard-fail in non-TTY (CI/agents) with cryptic StdinPrompter errors; fix flags buried.
- next: cadence milestone propose

Approve gate, activate, and the settle interactive gate all block in non-TTY with cryptic 'StdinPrompter: stdin is not a TTY' errors; the fix flags (--no-approve, --no-interactive) are buried in small init-output text. Primary driver is AI agents = always non-TTY. Detect non-TTY at init (or --preset agent): set auto gate profile + non-blocking loop defaults, emit agent-ready command snippets. Removes the whole error class on first run.

## rec-20260617-007 — One unambiguous onboarding front door + a guided next-step rail

- status: candidate
- ready: ready-for-cadence-spec
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, docs, start, quickstart, onboarding
- files: README.md, docs/quickstart.md, docs/README.md, packages/core/src/cli/commands/doctor.ts, packages/core/src/start/menu.ts
- evidence: 2026-06-17 onboarding assessment.
- next: cadence milestone propose

Collapse competing entry points (start/quickstart/tutorial/docs-quickstart) into one golden path: make 'cadence start' the only README 'new here?' command; guarantee every onboarding command ends with one 'Next:' line (doctor lacks it); open docs/quickstart with a 3-way driver fork (terminal/Claude Code/MCP); feature 'cadence tutorial' right after the install line. NOTE: re-check against v1.27 'onboarding breeze'. Source: 2026-06-17 assessment (#2, #6, #7, #10).

## rec-20260617-009 — Remove onboarding terminology collision + the silent gate-profile flip

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, init, docs, onboarding
- files: packages/core/src/cli/commands/init.ts, docs/concepts.md
- evidence: 2026-06-17 onboarding assessment.
- next: cadence milestone propose

(1) 'cadence init' prints both 'preset' (solo/team/production) and 'gate profile' (strict/standard/auto) with no explanation — rename gate profile to 'strictness' or add a one-line distinction. (2) A repo crossing ~20 commits silently flips 'draft approve' to interactive — warn at init time. NOTE: re-check against v1.27 'onboarding breeze'. Source: 2026-06-17 assessment (#8, #9).
