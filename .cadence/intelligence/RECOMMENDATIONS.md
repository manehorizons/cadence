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

## rec-20260619-008 — Team rollout kit

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: onboarding, team, ci, docs
- files: README.md, docs/README.md, .github
- evidence: 2026-06-19 adoption review: solo onboarding is now decent; team adoption needs a concrete rollout path.
- next: cadence milestone propose

Add a team adoption kit: CI/PR-template guidance or `cadence ci install` that normalizes SUMMARY artifacts in review and explains how teams should enforce or inspect CADENCE results without replacing CI or human review.

## rec-20260701-001 — Make the default install enforce what the tutorial demonstrates

- status: converted
- ready: needs-decision
- priority: critical
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: gates, init, verification
- files: packages/types/src/config.ts, packages/core/src/init/plan.ts, packages/core/src/gates/build-test-must-pass.ts
- evidence: 2026-07-01 audit R-01/F1: comment-only test file (// AC-1) settled green on fresh init, SUMMARY recorded AC-1: PASS, no test runner executed
- next: cadence milestone propose

Out-of-box enforcement chain is hollow: mention-mode coverage counts comments, init never derives verification.testCommand (build-test-must-pass passes silently), all verifier seams are mock. Fix: default coverageMode=assertion for new inits, derive testCommand from package.json scripts.test, print a loud settle notice when no testCommand exists.

## rec-20260703-001 — Milestone-scoped worktree fan-out for independent phases

- status: converted
- ready: ready-for-milestone
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: milestone, worktree, cli
- files: packages/core/src/worktree, packages/core/src/cli/commands/milestone.ts, DESIGN.md
- evidence: Builds on shipped primitives: phase-collision guard (v1.18, DESIGN.md §13), doctor worktree-phases check + next-free allocation (v1.19), agent-prompt (v1.33), and phase 142's gatherHandoffCandidates/liveLoopPosition (settled 07-03, PR #125, unwired core awaiting a consumer).
- next: cadence milestone propose

External proposal (lumen2 session, grounded against cadence@05f1162/v1.37.0): split into fan-out (provision N sibling worktrees + emit N agent-prompt-shaped hand-off prompts for a milestone's independent PENDING phases) and fan-in (a status/reconciliation command consuming phase 142's gatherHandoffCandidates/liveLoopPosition to show which parallel phases have settled). Recommends starting with fan-in only (Option C) as the more natural next consumer of the just-shipped, still-unwired phase 142 primitive; fan-out (Option A, a new cadence milestone worktrees subcommand) is a bigger, side-effecting surface worth a real cost/benefit pass first. Full writeup: ~/cadence-parallel-phase-worktree-agents-proposal.md

## rec-20260709-001 — cadence quickstart: single mega-command for full setup

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, init
- evidence: Generated in /cadence-scout session on near-zero-setup consumer adoption, 2026-07-09; see --scout-id scout-20260709-1813 for sibling recs in this cluster.
- next: cadence milestone propose

One idempotent command = init + auto-detect/wire whatever host is present (.claude/, Codex, .cursor/, .mcp.json) + auto-populate verification.testCommand from package.json/pyproject/etc + activate if a key is already in env + seed a demo phase + print a doctor-style summary of what it did/skipped. Collapses ~5 separate init flags into one call.

## rec-20260709-002 — cadence doctor --fix: auto-remediate mechanical health-check failures

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, doctor
- evidence: Generated in /cadence-scout session on near-zero-setup consumer adoption, 2026-07-09; see --scout-id scout-20260709-1813 for sibling recs in this cluster.
- next: cadence milestone propose

doctor's checks currently only print fix suggestions. Auto-remediate everything mechanical (rewire host hooks, regenerate host configs, prune stale handoffs past retention budget) so only genuine judgment calls (e.g. verification-readiness) are left as print-and-suggest.

## rec-20260709-003 — cadence init --ci: generate + enforce a CI gate workflow for consumer repos

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, ci
- evidence: Generated in /cadence-scout session on near-zero-setup consumer adoption, 2026-07-09; see --scout-id scout-20260709-1813 for sibling recs in this cluster.
- next: cadence milestone propose

Detect GitHub/GitLab/etc in a consumer repo and emit a ready-to-commit workflow that re-runs the gate suite on PRs, plus a one-shot recipe/script to make it a required branch-protection check. Closes the gap where gates exist locally but nothing enforces them in the team's actual PR flow.

## rec-20260709-005 — cadence onboard: one-command setup for the 2nd-Nth teammate

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, init, docs
- evidence: Generated in /cadence-scout session on near-zero-setup consumer adoption, 2026-07-09; see --scout-id scout-20260709-1813 for sibling recs in this cluster.
- next: cadence milestone propose

For a developer cloning a repo that already has .cadence/ committed: one command does only the per-machine bits (host hooks, local paths, key check) instead of re-running full init. Pair with an init-generated CONTRIBUTING.md snippet so this path is discoverable.

## rec-20260710-001 — Clarify Claude Code auth vs ANTHROPIC_API_KEY confusion in provider docs + fallback warning

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, verify
- evidence: User confusion in phenyx (external consumer project), 2026-07-10 session
- next: cadence milestone propose

Users running cadence inside a live Claude Code session assume that auth exempts them from ANTHROPIC_API_KEY for the anthropic verifier provider, since Claude Code itself doesn't require that env var to run. It doesn't: cadence's anthropic provider is a direct Anthropic SDK call authenticated with a separate API-billed key, with zero visibility into Claude Code's own OAuth/subscription credential store. Surfaced live by an external consumer (phenyx) hitting silent mock-fallback with no obvious cause. Add an explicit callout to docs/providers.md and the mock-fallback warning text (verifier-factory.ts MOCK_FALLBACK_BANNER) distinguishing 'logged into Claude Code' from 'ANTHROPIC_API_KEY set' so the fallback isn't mistaken for a bug.

## rec-20260710-003 — MCP-driven inversion: host CLI calls into cadence mcp serve's verify tool

- status: deferred
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, mcp, providers
- evidence: Surfaced in cadence-scout session on rec-20260710-002, 2026-07-10; alternative architecture to the direct-subprocess proposal
- next: cadence milestone propose

Alternative to shelling out to the host CLI: instead run the host CLI headlessly and have IT call into cadence's own MCP verify tool, using the host's native tool-calling to enforce the per-AC verdict schema rather than parsing freeform JSON from a subprocess. Worth prototyping against rec-20260710-002's direct-subprocess approach before committing -- tool-call-constrained output may be materially more reliable than prompt-and-parse, at the cost of a more unusual control-flow (host CLI as the driver, cadence as the callee).

## rec-20260710-004 — Headless-CLI verifier: batching, fallback-chain, and model-passthrough behavior

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, providers
- evidence: Surfaced in cadence-scout session on rec-20260710-002, 2026-07-10; implementation details for whichever headless-CLI provider direction is chosen
- next: cadence milestone propose

Implementation-detail decisions that apply once a headless host-CLI verifier provider (rec-20260710-002 or its MCP-inversion sibling) ships: (1) batch all ACs for a gate-run into one subprocess spawn rather than one spawn per AC, to offset process-spawn latency/cost; (2) treat the provider as a free upgrade over mock -- fall back to mock with the existing loud-fallback banner if the host CLI errors or isn't installed, never silently; (3) accept the host CLI's own model choice as the default (simplicity, 'whatever the user already pays for') but expose a --model passthrough where the host CLI supports it, to preserve today's per-gate model selection story.

## rec-20260710-005 — Positioning: out-of-band host-CLI verification as MORE independent than same-session self-report

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- evidence: Surfaced in cadence-scout session on rec-20260710-002, 2026-07-10; see cadence-competitive-landscape notes on mock-default risk
- next: cadence milestone propose

A headless host-CLI verifier subprocess has zero shared context with the calling session -- arguably a stronger independence claim than today's same-session self-report or even a direct API call under the same account. Worth a docs/positioning pass tying this framing to the existing 'trustworthy verifier' wedge and the mock-default competitive risk, independent of which engineering direction (rec-20260710-002 direct-subprocess vs MCP-inversion sibling) ships.

## rec-20260710-006 — Guardrails for headless-CLI verifier: quota transparency, self-invocation loops, CI fallback

- status: settle-pending
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, security, providers
- evidence: Surfaced in cadence-scout session on rec-20260710-002, 2026-07-10; risk considerations that apply to any headless-CLI provider direction
- next: cadence milestone propose

Three risks surfaced while widening rec-20260710-002 that need explicit handling, not just the happy path: (1) reusing the user's host-CLI subscription/quota for verification calls is invisible cost -- it should be surfaced loudly (e.g. in verify output or a doctor check), not silently drain a Pro/Max plan's usage budget; (2) if cadence itself is being driven by the same host CLI it would spawn headlessly for verification, there is a self-referential invocation risk (nested Claude Code/Codex processes, rate-limit or permission-prompt contention) that needs an explicit guard; (3) headless host-CLI providers assume an interactive login exists locally and will not work in CI -- needs a documented, loud fallback to anthropic/mock rather than a confusing hang or silent failure in automated environments.

## rec-20260711-004 — Cadence-native UI-spec gate between SPEC and DRAFT (when applicable)

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: gates, draft, spec
- evidence: External consumer project observation, 2026-07-11 (dumpfile): SPEC-stage UI gap noted mid-brainstorm for a BuilderShell/StructuredWizardShell modal component, where the design decided behavior+visual precedent but not concrete layout.
- next: cadence milestone propose

CADENCE has no equivalent of GSD's gsd-ui-phase: a UI-heavy phase's SPEC captures component list and behavioral shape only (e.g. 'reuse StructuredWizardShell's visual language' as a precedent reference), with no concrete layout -- field spacing/grouping, exact design-token usage, responsive behavior, or per-field-type visual treatment. Left as-is, DRAFT tasks inherit only a loose behavioral pointer and whoever executes BUILD makes the real layout calls in the moment, looser than this project's own deliberate token-driven UI work. Proposal: an opt-in gate/step between SPEC and DRAFT for phases touching UI surfaces that produces a concrete design contract (component-level layout, token usage, responsive/interaction detail) before DRAFT tasks are written -- conceptually parallel to gsd-ui-phase's UI-SPEC.md but native to CADENCE's loop and gate model, not a GSD borrow. 'When applicable' is key: most CADENCE phases are not UI work and must not pay this cost.

## rec-20260712-002 — Cross-phase retro rollup/trend view

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: retro, rollup
- evidence: Reconstructed stub: original entry (landed 2026-07-12 by a concurrent session's /cadence-scout retro, originally rec-20260712-005) was lost to an unrelated git reset --hard before being committed. Recreated from a handoff doc's prose summary.
- next: cadence milestone propose

A cross-phase rollup/trend view over the post-settle retro artifacts (depends on the retro-artifact recommendation existing first) — surfaces recurring workflow friction across multiple phases rather than one phase at a time. Landed via the same /cadence-scout session (scout-20260712-0328).

## rec-20260712-003 — Retro friction feeds back into Praxis recommendation scoring

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: retro, praxis-scoring
- evidence: Reconstructed stub: original entry (landed 2026-07-12 by a concurrent session's /cadence-scout retro, originally rec-20260712-006) was lost to an unrelated git reset --hard before being committed. Recreated from a handoff doc's prose summary.
- next: cadence milestone propose

Recurring friction identified by the post-settle retro feeds back into evidence.json to bump the scores of related recommendations (depends on the retro-artifact and rollup recommendations existing first). Landed via the same /cadence-scout session (scout-20260712-0328).

## rec-20260712-004 — cadence draft new: num arg accepts nonsense with no sanity check

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, cli
- files: packages/core/src/cli/commands
- evidence: Reconstructed stub: original entry (rec-20260712-001, logged during the phase 170 session, 2026-07-12) was lost to an unrelated git reset --hard before being committed. Recreated from context earlier in this session.
- next: cadence milestone propose

cadence draft new's optional [num] positional argument silently accepts any string with no validation against the phase's existing 01-numbering convention. Omitting num already correctly defaults to 01; passing a bad value produces a nonsensical draft filename with no refusal or warning.

## rec-20260712-005 — add-ac/add-task silently append after a placeholder AC-1/T1

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, cli
- files: packages/core/src/cli/commands
- evidence: Reconstructed stub: original entry (rec-20260712-002, logged during the phase 170 session, 2026-07-12) was lost to an unrelated git reset --hard before being committed. Recreated from context earlier in this session.
- next: cadence milestone propose

cadence draft add-ac and add-task never warn when appending a new AC/task after the scaffolded draft still has its placeholder AC-1/T1 stub in place (e.g. from draft new without --template or --from-rec). This can silently leave a stale generic placeholder alongside real, hand-authored ACs/tasks.

## rec-20260712-006 — Settle-internal refusal paths still write no SUMMARY

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, settle
- files: packages/core/src/parse/summary-writer.ts
- evidence: Reconstructed stub: original entry (rec-20260712-003, logged during the phase 170 session, 2026-07-12) was lost to an unrelated git reset --hard before being committed. Recreated from context earlier in this session.
- next: cadence milestone propose

Two settle-internal refusal paths — the --auto blocked-task refusal and the skill-audit refusal — still write no SUMMARY.{json,md} on refusal, the same gap phase 171 (settle 170) just fixed for the 9 gate-dispatched refusals. These two paths are internal to settle rather than gate-dispatched, so they were out of scope for that fix.

## rec-20260712-008 — Redact secrets/credentials from persisted evidence quotes and SUMMARY.securityAudit findings

- status: accepted
- ready: ready-for-milestone
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: intelligence, gates, security
- files: packages/core/src/intelligence/store/audit.ts, packages/core/src/gates/security-audit.ts, .cadence/intelligence/evidence.json
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (P0-2 sensitive audit content). Verified no existing redaction/scrub logic in cited files.
- next: cadence milestone propose

The evidence ledger (.cadence/intelligence/evidence.json) and SUMMARY.securityAudit persist source-derived quotes and diff findings to disk verbatim -- confirmed no redact/scrub/secret/token/credential handling exists anywhere in intelligence/store/audit.ts or gates/security-audit.ts. Those can carry tokens/credentials. Add a redaction pass (token/key/credential patterns) and a per-record policy before persistence, and restrict ledger file permissions to the current user.

## rec-20260712-009 — Record a gate lifecycle-state taxonomy (requested/started/passed/refused/failed/timed-out) in SUMMARY

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: settle, types, praxis
- files: packages/core/src/services/settle.ts, packages/types/src/summary.ts
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (P0-1 lifecycle states); sibling: rec-20260712-007. Verified GateProvenanceZ enum only has ran/skipped/refused today.
- next: cadence milestone propose

GateProvenanceZ (packages/types/src/summary.ts) currently enumerates only status: 'ran' | 'skipped' | 'refused' -- confirmed no 'failed' or 'timed-out' state distinct from 'refused', and no in-flight requested/started states. Extend SUMMARY to record a fuller gate lifecycle-state taxonomy so incident analysis and resume can reconstruct where a settle run stopped, including crash-mid-gate cases a synchronous refuse/pass pair can't distinguish. Pairs with the exit-code-taxonomy-as-public-contract work. Distinct from rec-20260611-001, which is about recommendation status lifecycle, not gate lifecycle.

## rec-20260712-010 — Thread AbortSignal + deadline + trace id through gates, verifiers, and the headless-CLI verifier

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: gates, verify, reliability
- files: packages/core/src/gates, packages/core/src/verify/security-audit.ts
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (arch: cancellation/deadlines); siblings: rec-20260710-004, rec-20260710-006. Verified neither sibling covers AbortSignal/deadline plumbing.
- next: cadence milestone propose

Give every gate and verifier call an AbortSignal, a deadline, and a trace id so long verifier runs, headless-CLI self-invocation, and shutdown can cancel cleanly. Scoped to plumbing; cross-links the existing headless-verifier guardrail recs (rec-20260710-004: batching/fallback-chain/model-passthrough, rec-20260710-006: quota transparency/self-invocation loops/CI fallback) without duplicating either -- neither currently covers signal/deadline propagation.

## rec-20260712-011 — Define an MCP tool-trust envelope for 'cadence mcp serve' (origin + def-hash + capability scope + expiry)

- status: accepted
- ready: ready-for-milestone
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: mcp, security
- files: packages/core/src/mcp/tools.ts, packages/core/src/mcp/server.ts, packages/core/src/cli/commands/mcp.ts
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (P1 MCP trust risk). Verified the bypass comment and confirmed no expiry/capability/origin/revoke logic exists in mcp/*.ts.
- next: cadence milestone propose

Confirmed: mcp/tools.ts explicitly bypasses the interactive draft/spec-approve prompt over MCP ('the tool call IS the approval', e.g. cadence_draft_approve, cadence_spec_approve) with no expiry/capability-scope/origin-binding/revoke logic anywhere in packages/core/src/mcp/*.ts. Document exactly what that grants and constrain it: bind approval to caller identity/transport origin and tool-definition hash, attach a capability class, and add expiry with revoke-on-version-change so a schema-stable but changed server can't retain silent trust.

## rec-20260712-012 — Generate the command/config/exit-code reference from source and fail CI on drift

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, ci, tooling
- files: docs/reference/commands.md, docs/reference/config.md, scripts
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (arch: docs from registries / doc drift). Verified no existing drift-check script or exit-code taxonomy doc.
- next: cadence milestone propose

RECOMMENDATIONS.md is already generated from JSON. docs/reference/commands.md and docs/reference/config.md exist but are hand-maintained -- confirmed no drift-check script and no exit-code taxonomy doc exist yet, and docs.yml only builds/deploys typedoc API docs, with no source-vs-checked-in-docs comparison. Extend the same generated-from-source + fail-on-drift discipline to those two docs and the exit-code taxonomy, with a CI check that fails when the checked-in docs diverge from the source of truth.

## rec-20260712-013 — Add the missing CI security automation: CodeQL, secret scanning, npm-audit policy, SBOM, scheduled run

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: ci, security, governance
- files: .github/workflows, .github/dependabot.yml
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (P1 security automation). Verified Dependabot+provenance already shipped; grepped .github/workflows for codeql/secret-scanning/sbom terms with zero hits.
- next: cadence milestone propose

Verified current .github state: Dependabot (.github/dependabot.yml) and npm provenance/OIDC (release.yml) are already in place -- do not duplicate. Confirmed genuinely missing: no CodeQL workflow, no secret-scanning/push-protection/gitleaks/trufflehog references, no SBOM/CycloneDX/SPDX generation anywhere in .github/workflows. Add the missing layers: CodeQL, secret scanning + push protection, an npm audit policy with documented exceptions, SBOM + license inventory, and a scheduled security CI run.

## rec-20260712-014 — Add test-coverage reporting with enforced minimum thresholds to CI

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: ci, testkit
- files: .github/workflows/ci.yml, vitest.config.ts
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (CI: coverage thresholds). Verified vitest.config.ts collects but does not gate coverage, and ci.yml has no coverage step.
- next: cadence milestone propose

vitest.config.ts already has a coverage block (reporter: text/html, include packages/*/src/**) but no thresholds field, and ci.yml's test job runs 'pnpm test' with no coverage flag or gate -- confirmed no enforcement anywhere. Add minimum thresholds wired into the gate, so coverage regressions surface in CI rather than silently.

## rec-20260712-015 — Smoke-test the packed npm tarball (clean install -> init -> settle), not just in-repo dist

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: ci, release, testkit
- files: scripts/publish-proof.mjs, scripts/release-integrity.mjs, .github/workflows/release.yml
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (P0-3/P1 packaged-app smoke). Verified release-integrity.mjs's tempDir usage is scoped to release notes only, not a pack+install+exercise flow.
- next: cadence milestone propose

Tests run against in-repo dist; verified scripts/release-integrity.mjs uses a tempDir only for the GitHub release notes file, not for packing/installing the CLI -- no 'npm pack'/'pnpm pack' usage anywhere in .github or scripts except release-integrity.mjs's unrelated tempDir. Add a smoke test that packs the public packages, installs them into a clean temp dir, and runs init -> draft -> settle against the installed CLI, so a broken published artifact (missing files, bad bin, ESM resolution) is caught before release. Complements publish-proof.mjs and release-integrity.mjs.

## rec-20260712-016 — Write a formal threat model covering MCP serve, hooks, host adapters, headless verifier, and ledger exposure

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: security, docs
- files: SECURITY.md, DESIGN.md
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (P1 threat model). Verified SECURITY.md's existing 'Scope and threat model' section omits MCP serve, hooks, host adapters, headless-verifier self-invocation, and ledger exposure.
- next: cadence milestone propose

SECURITY.md already has a 'Scope and threat model' section (shell execution, LLM gate providers, generated/installed files, notification webhooks) but does not mention MCP serve trust, hooks/dispatcher, host-adapter boundaries, headless-verifier self-invocation loops, or local intelligence-ledger exposure at all. Extend SECURITY.md with a structured threat model: prompt injection into gates, MCP serve trust, hooks/dispatcher, host-adapter boundaries, headless-verifier self-invocation loops, release/update integrity, and local intelligence-ledger exposure. Names the surfaces and their mitigations in one place.

## rec-20260712-017 — Add failure-injection tests: corrupt intelligence ledger, offline settle, mcp-serve crash recovery

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: reliability, testkit, intelligence
- files: packages/core/src/intelligence/store, packages/testkit/src
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (P1 failure-injection). Verified existing 'corrupt' test coverage is state.json-specific, not intelligence-ledger-specific.
- next: cadence milestone propose

Verified: existing 'corrupt' references in tests (state/simple.test.ts, render-context.test.ts, context.test.ts) cover state.json corruption specifically, not the intelligence ledger (evidence.json/recommendations.json). No tests found for intelligence-store ledger corruption, offline settle behavior, or mcp-serve crash recovery. Add static failure-injection coverage for the intelligence store and runtime: a corrupt/partial ledger recovers or fails closed with a clear error, settle behaves predictably with no network, and mcp serve recovers from a crashed session. Mirrors the corrupt-DB/offline-start layer flagged for Lumen.
