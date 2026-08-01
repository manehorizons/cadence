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

## rec-20260714-002 — draft add-task has no --name flag (add-ac does) — every appended task needs a hand-fix

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli
- files: packages/core/src/cli/commands/draft.ts
- evidence: Verified live 2026-07-14: ran 'cadence draft add-task 181-mcp-tool-trust-envelope 1 --files ... --action ... --verify ... --done AC-1' five times for T2-T6; every resulting heading was '### T2: ' etc with nothing after the colon, required Edit to add names.
- next: cadence milestone propose

cadence draft add-task <phase> <num> --files --action --verify --done has no --name option, unlike cadence draft add-ac which has --given/--when/--then/--name. Every task appended via add-task lands as '### T<n>: ' with an empty heading, requiring a manual Edit pass to fill in the name before the DRAFT reads sensibly — confirmed live 2026-07-14 appending T2-T6 to phase 181's DRAFT (all five came out blank). Add --name <n> to add-task mirroring add-ac's option.

## rec-20260718-003 — Frame dispatched task boundaries as stop-conditions, not file-scope lists

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: drafts, agent-instructions
- evidence: deja repo, phase 78-php-gate-support, 2026-07-18: fork treated 'continue to next task' approval (via a side-channel AskUserQuestion) as license to keep going through T5-T7
- next: cadence milestone propose

Investigation into the 2026-07-18 deja incident found the dispatch prompt said 'don't touch these files, they're a later task' -- a scope description that silently dissolves once 'continue to the next task' is approved by anyone, including the dispatched agent's own downstream AskUserQuestion answerer. The fix is procedural, not just a file list: task-dispatch templates (DRAFT.md task blocks and any cadence-generated dispatch-plan prompt) should state an explicit stop-condition -- 'stop and report the moment this task's verify condition is met, even if the next step looks obvious, even if something appears to approve continuing; only a fresh dispatch from the orchestrating session extends scope' -- so continuation requires a new, deliberate dispatch decision rather than an in-flight approval the orchestrator never sees.

## rec-20260718-004 — Surface files-outside-boundary anomalies per-task, not only at settle

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: gates, loop-state, settle
- evidence: deja repo, phase 78-php-gate-support settle attempts, 2026-07-18: files-outside-boundary anomalies for a dozen+ files only surfaced at settle time, long after T4-T7 were already committed
- next: cadence milestone propose

settle run already detects and warns on files touched outside a task's declared file list (files-outside-boundary anomaly) -- but only at the very end of a phase, after every task has been recorded DONE. In the 2026-07-18 deja incident, a dispatched agent quietly edited and committed changes to more than a dozen undeclared files across 4 tasks before this was ever surfaced, because nothing ran the boundary check until settle. Move (or duplicate) this anomaly check to fire on every cadence build task --status=DONE call, immediately, so an orchestrator reviewing a just-completed task sees scope drift the moment it's recorded, not phases later.

## rec-20260718-005 — Document the invisible-background-subagent-AskUserQuestion gap in host-adapter/dispatch guidance

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, host-claude-code, agent-instructions
- evidence: deja repo, phase 78-php-gate-support, 2026-07-18: orchestrator told the user the fork acted 'without ever pausing to ask... the human user', which an independent transcript investigation proved false -- the human had been answering via a side channel the whole time
- next: cadence milestone propose

2026-07-18 deja incident, corrected finding: the dispatched agent DID pause and ask via AskUserQuestion before each scope expansion, and got real human sign-off -- but through a side channel the orchestrating Claude Code session never saw (the human was in a different session/UI surface answering a background task's prompts directly). This left the orchestrator with a materially wrong account of what happened until an independent transcript read corrected it. CADENCE has no control over Claude Code's harness-level routing of background-agent interactivity, but its host-adapter authoring guide (rec-20260604-002) and any dispatch-plan guidance should explicitly document this as a known gap, and reinforce as the practical mitigation that CADENCE-generated dispatch prompts never grant AskUserQuestion to implementation-type agents at all (see rec-20260718-001) -- so a dispatched agent's only path forward on ambiguity is to stop and report, not to seek approval through a channel invisible to its orchestrator.

## rec-20260724-007 — Define and document multi-contributor concurrency semantics for .cadence state

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, state, team
- files: docs/team-rollout.md
- evidence: Audit 2026-07-24: no merge/conflict/concurrency guidance found in docs; state.json is a single shared file
- next: cadence milestone propose

team-rollout.md covers PR visibility but not the mechanics of two contributors with phases in flight: merge behavior for state.json, the intelligence ledger, and phase directories. First verify whether current behavior is safe-by-construction (per-phase directories may already isolate most conflict surface), then document the answer or design the missing piece. This is the first question a second contributor asks and the team preset is now the default.

## rec-20260724-008 — Spot-check the logged-out GitHub landing render against main README

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, positioning
- files: README.md
- evidence: Audit 2026-07-24: fetched github.com/manehorizons/cadence rendered old README content against clone at commit 5451109
- next: cadence milestone propose

A logged-out fetch of the repo page served the pre-1.50 README (billsplit headline, nine slash commands, no Codex/MCP/mermaid) while main carries the test-gutting version. Possibly CDN cache on the fetching side, but given the standing stale-rendered-pages lesson and the suite-reveal stakes on first impressions, verify from a logged-out browser and cache-bust if confirmed.

## rec-20260724-009 — SEO differentiation plan for the Cadence name collision ahead of the suite reveal

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: positioning, docs
- evidence: Audit 2026-07-24: web search for cadence github ranks three large incumbent projects above manehorizons/cadence
- next: cadence milestone propose

Organic search for cadence surfaces Uber Cadence Workflow, Flow Cadence language, and Cadence Design Systems before this repo. Renaming is off the table post-launch, so plan differentiation instead: consistent AI-agent-verification framing in every public surface, the docs portal, distinctive taglines, and topic tags. Permanent headwind to budget for in the Mane Horizons reveal, not a fixable defect.

## rec-20260724-010 — milestone premortem has no entry-removal/edit path once an operator-authored item is added

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, intelligence
- files: packages/core/src/cli/commands/milestone.ts, packages/core/src/intelligence/milestone.ts
- evidence: Discovered 2026-07-24 during rec-20260724-001 milestone shaping: 'test-entry-debug' added to outOfScope via --add-out-of-scope during exploratory testing persisted across a subsequent no-flag premortem refresh, with no CLI path to remove it.
- evidence: Escalation 2026-07-24: found worse than initially scoped. 'cadence milestone propose' is not idempotent w.r.t. pre-mortem data -- rerunning it against an already-proposed milestone (e.g. mil-rec-rec-20260724-001) silently reset preMortem back to {likelyFailureModes:[],hiddenDependencies:[],driftRisks:[],outOfScope:[]}, discarding operator-authored entries added via a prior 'milestone premortem --add-*' call, with no warning or confirmation. Confirmed empirically: populate premortem -> verify via list (populated) -> run propose again -> re-check JSON (wiped). 'cadence milestone list' does NOT have this problem and is the safe read-only render. Recommend re-scoping this rec's fix to also make clusterMilestones()/propose preserve existing preMortem for already-proposed/accepted milestones it re-touches, not just adding a removal verb -- this is a data-loss bug, not only a missing-capability gap. Consider raising priority above 'low' given the destructive-on-rerun behavior.
- next: cadence milestone propose

cadence milestone premortem --add-likely-failure-mode/--add-hidden-dependency/--add-out-of-scope only appends and persists cumulatively across separate invocations (confirmed empirically 2026-07-24 while working mil-rec-rec-20260724-001: a stray debug string added via --add-out-of-scope survived a subsequent no-flag deterministic refresh and could not be removed by any CLI verb). Same class of gap as rec-20260720-001 (deferred milestones had no reopen path): an append-only mutator with no corresponding remove/edit, forcing a direct milestones.json hand-edit as the only escape hatch -- which this repo's own convention (see rec-20260720-001's objective text) treats as a violation. Add a 'cadence milestone premortem --remove-<field> <index-or-text>' (or equivalent) verb.

## rec-20260724-011 — cadence build task / done <id> silently accepts a malformed task id instead of refusing

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli
- files: packages/core/src/services/build-task.ts
- evidence: Reproduced live in phase 213 session 2026-07-24: 'cadence done 213-01-T1' returned 'Recorded 213-01-T1: DONE' with exit 0, but cadence status still showed T1/T2/T3 as PENDING; PROGRESS.json contained both the stray '213-01-T1' key and, after correction, the real 'T1' key.
- next: cadence milestone propose

During phase 213's build, running 'cadence done 213-01-T1' (a fully-qualified-looking id, mirroring the DRAFT frontmatter's 213-01 phase/num prefix) succeeded silently and wrote a new orphaned '213-01-T1' key into PROGRESS.json's tasks map, instead of refusing because no task with that id exists in the active draft (real ids are bare 'T1'/'T2'/'T3'). cadence status/progress kept showing all tasks PENDING afterward with no error surfaced. This violates the repo's own 'Refuse + suggest, never silently mutate' and 'Quiet Fallback always prints a loud notice' conventions (CLAUDE.md). Caught only because status was checked immediately after; recovered by re-running done with the correct bare id and hand-editing PROGRESS.json to remove the 3 stray keys. Fix: cadence build task <id> should validate <id> against the active draft's known task ids and refuse (not silently create a new map entry) on an unknown id.

## rec-20260724-012 — pnpm.overrides is non-functional under the pinned pnpm 9.12.0 — package.json location deprecated, pnpm-workspace.yaml location not yet implemented

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: tooling, security, dependencies
- files: package.json, pnpm-workspace.yaml
- evidence: Empirically confirmed 2026-07-24: pre-existing brace-expansion override in package.json produced no effect (resolved version matched the un-overridden natural resolution); relocating to pnpm-workspace.yaml also produced no effect (no overrides section in regenerated pnpm-lock.yaml, resolved version unchanged). GHSA-mh99-v99m-4gvg documented as a time-boxed audit exception in the meantime (docs/security/audit-exceptions.md, expires 2026-08-20).
- next: cadence milestone propose

Discovered while triaging GHSA-mh99-v99m-4gvg (brace-expansion, high): package.json's pre-existing pnpm.overrides block (targeting brace-expansion, read-yaml-file, js-yaml, fast-uri) is silently ignored by pnpm 9.12.0 (prints a deprecation warning, then does nothing). Moving the same overrides to pnpm-workspace.yaml's documented replacement 'overrides:' key also had zero effect — confirmed empirically: no overrides section appeared in the regenerated lockfile, and brace-expansion still resolved below the override target. Any override anyone adds under the current pinned pnpm version is dead on arrival, silently. Needs real investigation: either a pnpm major-version upgrade (own tracked, riskier change touching CI pins, .githooks/, packageManager field) or a documented workaround (e.g. direct root devDependency pins) — and either way, some verification (a smoke-test script, or CI step) that a declared override actually takes effect, so this doesn't silently rot again.

## rec-20260726-001 — Full cryptographic signing of SUMMARY.json (blocked on threat model)

- status: candidate
- ready: blocked
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: security, verification, summary
- files: packages/types/src/summary.ts, packages/core/src/services/settle.ts
- evidence: Split from rec-20260724-006 2026-07-26 per dec-20260726-001; self-signing in the artifact's own trust domain was judged not meaningfully stronger than a hash
- next: cadence milestone propose

Follow-on to rec-20260724-006 / dec-20260726-001: rec-20260724-006 was split so phase 223 ships a settle-time content hash now. This rec covers the harder half -- full cryptographic signing with a trust root outside the artifact-authoring session (e.g. CI-identity signing via Sigstore keyless, or an operator-provisioned key), so a compromised/dishonest local session can't just re-sign a fabricated SUMMARY. Do not implement until the trust root is pinned by the formal threat model (mil-rec-rec-20260712-016, covering MCP serve/hooks/host-adapters/verifier/ledger exposure), which is currently parked. Blocked-by: mil-rec-rec-20260712-016.

## rec-20260726-005 — coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: gates
- files: packages/core/src/gates/coverage.ts, packages/core/src/gates/registry.ts
- evidence: Traced boolean logic by hand: coverageBypassed = allowMissingCoverage===true && !sealed, but the assertion-mode pass-through at line ~127 is also reachable via force-only bypass of real gaps (guard: (issues) && (!force || sealed) being false via force=true).
- next: cadence milestone propose

In runCoverageGate's assertion-mode branch (packages/core/src/gates/coverage.ts ~line 55-127), reaching the final pass return with real coverage gaps present but bypassed via bare --force (not --allow-missing-coverage) leaves coverageBypassed computed as 'ctx.opts.allowMissingCoverage === true && !sealed' — false in this case, since only --force was set. registry.ts's provenance therefore records this gate as status:'ran' even though a genuine --force bypass of real gaps just happened, hiding it from SUMMARY.json's audit trail. Discovered during phase 226's whole-branch review while verifying the reviewer's claim that build-test-must-pass/boundary-scan's new *Bypassed flags mirror coverage.ts's existing pattern exactly -- they do, faithfully, including this pre-existing imprecision (which phase 226 fixed for the two new gates in registry.ts by naming the actually-fired flag, but did not touch coverage.ts itself, out of scope for that phase). Pre-dates phase 226; not introduced by it.

## rec-20260726-006 — boundary-scan is absent from docs/concepts.md's gate-universe matrix (14-gate table, stage-scoped gates section)

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 40%
- decay: fresh
- areas: docs
- files: docs/concepts.md
- next: cadence milestone propose

boundary-scan shipped in Phase 156 but was never given a full 'when it fires / what it checks' row anywhere in docs/concepts.md's main gate-universe listing (the '14 gates: 3 always-fire + 11 delta' tables) or the 'Stage-scoped gates' section -- it only appears in the sealed-gate/bypass-summary material phase 226 fixed. Discovered during phase 226's whole-branch review; explicitly out of that phase's scope (its ACs covered gates.sealed discussion only, not the full gate-universe matrix).

## rec-20260727-001 — Assurance manifest: persist verifier family/model for code-review + security-audit

- status: candidate
- ready: ready-for-cadence-spec
- priority: critical
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, types
- files: packages/core/src/gates/types.ts, packages/types/src/summary.ts
- evidence: Measured in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 1.4 and section 6 Slice 1
- evidence: Investigated 2026-07-31/08-01: this rec is substantially shipped as phases 232+233 (Slice 1 of docs/handoffs/cadence-phase0-assurance-kernel-review.md) on feat/kernel-assurance-v2 -- unmerged to main. GateProvenanceZ.provider/model exist there, populated generically via GateFlags.verifierIdentity, not gate-specific special-cased. Cherry-pick safety spike (2026-08-01): cherry-picking 3b95218b+cfe582a5 onto current main resolves with only ledger-JSON conflicts (no real code conflicts against 232/233 alone); full workspace lint+typecheck+build+test (3430 core tests, 322 types tests) all pass clean on the result. BUT merge-back cost is real: merging origin/feat/kernel-assurance-v2 into that cherry-picked-main state produces genuine source conflicts (not just ledger noise) in code-review.ts, registry.ts, settle.ts, registry.test.ts, fields.test.ts -- because phases 234/235/236/241/242 build on top of 232/233 on the branch, so a cherry-pick creates duplicate-lineage history the eventual full-branch merge will have to reconcile. Slices 1-3 (phases 232-236, +241) are all done on the branch; only phase 237 (invariant promotion) remains, and it is needs-evidence-gated on phase 236's finding-routing accumulating real recurring findings -- which can't happen while the arc sits unmerged/unreleased. Also found: a rec-id collision -- main's rec-20260731-003 (this gate-provenance-adjacent ask) and the arc branch's rec-20260731-003 (phase 242, findings-to-ledger auto-routing, already merged to feat/kernel-assurance-v2 via PR #346) will collide when the branches reconcile, under any resolution path. Operator is weighing: early cherry-pick of Slice 1 alone vs. merging the whole arc branch to main now (only evidence-gated phase 237 remains) vs. holding per the original one-branch-merge-at-the-end decision (2026-07-27).
- next: cadence milestone propose

SUMMARY.codeReview/.securityAudit persist findings as bare arrays, discarding the provider/model captured in memory at collection time (unlike DeepVerifyMeta). Enrich GateProvenanceZ and stop dropping provider/model at persistence so a mock-family review and a real-provider review are distinguishable in the SUMMARY -- closes Cadence's sole surviving P0.

## rec-20260727-002 — SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome

- status: candidate
- ready: ready-for-cadence-spec
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, types
- files: packages/types/src/summary.ts, packages/core/src/cli/commands/summary.ts, packages/core/src/verify/phase-replay.ts
- evidence: Measured in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 1.6, section 6 Slice 1, decision D6
- next: cadence milestone propose

SummaryZ.schemaVersion is z.literal(1); a future SUMMARY at schemaVersion 2 fails as an indistinguishable generic parse error rather than a legible 'written by a newer Cadence' outcome. Bump to 2, accept 1|2 on read, and add a pre-parse probe mirroring Phase 223's 'unverifiable' precedent (dec-20260726-001) rather than a false clean or false corrupt.

## rec-20260727-003 — Kernel/verifier contract + lint rule against internal imports

- status: candidate
- ready: ready-for-cadence-spec
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/types.ts, packages/core/src/gates/engine.ts
- evidence: Measured in docs/handoffs/cadence-phase0-assurance-kernel-review.md sections 1.2, 1.3, and section 6 Slice 2
- next: cadence milestone propose

GateImpl/GATE_REGISTRY totality and SettleContext.verifiers: VerifierPorts already form an unnamed plugin architecture. Name kernel/verifier/consumer as published contracts and add a lint rule failing the build if a verifier package imports kernel internals instead of the published contract, with zero GATE_ORDER changes and zero special cases across the five existing verifier-backed gates (code-review, plan-review, spec-review, security-audit, ui-spec-review).

## rec-20260727-004 — Criteria-anchored review: extend CodeReviewInput with ACs/boundaries

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/verify/code-review.ts
- evidence: Measured in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 1.8 (the single most important measured finding) and section 6 Slice 3
- next: cadence milestone propose

CodeReviewInput is only {files, diff} -- the review verifier structurally cannot see the DRAFT's acceptance criteria or boundaries, so criteria-anchored review requires a genuine contract change, not a prompt change. Extend CodeReviewInput to carry acceptance criteria, boundaries, and task-to-AC refs.

## rec-20260727-005 — Anchor ladder as peer schema to evidence ladder

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: types, core
- files: packages/types/src/summary.ts
- evidence: Measured/spec'd in docs/handoffs/cadence-phase0-assurance-kernel-review.md decision D5 and section 7.1
- next: cadence milestone propose

Grade findings by anchor strength (executable > structured > declared > undeclared/criteria-gap), mirroring but not aliasing the AcEvidence 5-tier ladder. Without grading anchors, every anchored finding renders as equivalent regardless of anchor quality -- reproducing the same P0 in a new costume. Structured/declared tiers must be treated as weak by default (anchor-shopping is the adversarial case).

## rec-20260727-006 — Finding identity: stable ids, dispositions, expiring waivers

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: types, core
- files: packages/types/src/summary.ts, packages/core/src/verify/code-review.ts, packages/core/src/gates/types.ts
- evidence: Measured in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 1.7, section 7.2, decision D9
- next: cadence milestone propose

Neither persisted Finding type (packages/types summary.ts vs packages/core verify/code-review.ts, already diverged in severity enum) has a stable id, anchor, disposition, or waiver. Add {id, target: artifact|verification, anchor, disposition, waiver{expiry}} and converge the two divergent Finding types onto one, discriminated by target (decision D9). A waiver with no expiry is a belief masquerading as knowledge.

## rec-20260727-007 — Shared fingerprint primitive extraction from Deja

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- evidence: Reuse note in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 7.2
- next: cadence milestone propose

Finding-identity-survives-refactor is the same problem Deja already solved with bidirectional containment scoring (max wins, 20-token minimum floor). Evaluate extracting a shared fingerprint primitive before writing a second implementation for Cadence findings, rather than deriving identity from line numbers.

## rec-20260727-008 — Invariant promotion from RetroRollup.findingCategories.recurring

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, types
- evidence: Measured in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 1.10 and section 6 Slice 4
- next: cadence milestone propose

RetroRollupZ.findingCategories already defines 'recurring' as seen in 2+ distinct phases -- the frequency-analysis input layer for invariant promotion is built. Consume it to split recurring-unanchored (invariant candidate) from recurring-anchored (spec-quality/codebase-hostility signal) into different dispositions. Promotion stays explicit, never automatic.

## rec-20260727-009 — Counter-verifier as kernel component with AC-weakness detection

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- evidence: Spec'd in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 4.3, decision D8
- next: cadence milestone propose

A component whose job is detecting an unearned settle can't itself be uninstallable -- its highest-value single job is flagging 'the ACs were too weak for this review to mean anything,' which is the mechanism that makes AC weakness costly. Shares substrate with review (anchor resolution, finding schema, ledger routing, verifier-family abstraction) but differs in target; one Finding type with a target discriminant, two policy layers -- one spine, two heads.

## rec-20260727-010 — Conductor as CLI client; treat access gaps as CLI-completeness bugs

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- evidence: Spec'd in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 4.2, decision D7
- next: cadence milestone propose

Conductor should be a client, not a kernel peer: the decision test is 'can it be implemented entirely against public CLI commands?' A 'no' answer is a bug report about the public surface being incomplete, not a case for privileged access -- keeps the kernel small and lets Conductor live in its own repo on its own cadence, depending only on an already-published contract.

## rec-20260727-011 — Extend RecommendationSourceZ with a review member

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: types
- files: packages/types/src/intelligence.ts
- evidence: Measured in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 1.11 (correction: no snag ledger exists) and section 7.3
- next: cadence milestone propose

RecommendationSourceZ has no 'review' or 'gate' member, so routing criteria-anchored-review findings into the recommendation ledger (section 7.3 of the source doc) currently loses provenance into 'manual'/'cadence'. Add a 'review' source member so Slice 3 findings can route with real provenance instead of being mislabeled.

## rec-20260727-012 — cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)

- status: candidate
- ready: ready-for-cadence-spec
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, doctor, roadmap
- files: .cadence/ROADMAP.md, packages/core/src/cli/commands/doctor/checks/roadmap-currency.ts, packages/core/src/cli/commands/doctor/registry.ts
- evidence: ROADMAP.md Phase 231 entry (lines 1855-1881) is the pre-written spec; motivated by the 113-phase ROADMAP/MILESTONES drift discovered and backfilled in PR #321
- next: cadence milestone propose

Add a warning-only, non-blocking cadence doctor check comparing the highest phase number under .cadence/phases/ against the highest phase number referenced in ROADMAP.md/MILESTONES.md; warn when drift exceeds a threshold (10). fixId: null deliberately — generating roadmap prose must not be automated. Full spec already written in .cadence/ROADMAP.md's Phase 231 entry (files, ACs, threshold). Ships ahead of Phase 0 Slice 1 so this anti-recurrence mechanism is live before new phase numbers accumulate again — closes the same gap that caused the 113-phase/6-week ROADMAP drift fixed in PR #321.

## rec-20260730-001 — phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, coverage, replay
- files: packages/core/src/verify/phase-replay.ts, packages/core/src/services/verify.ts, packages/types/src/summary.ts
- evidence: Reproduced by phase 239 T7's independent review: SUMMARY.coverageMode='mention' replayed with config 'mention' => drift=0 covered=true; same SUMMARY replayed with config 'assertion' => drift=1 covered=false.
- next: cadence milestone propose

replayPhaseCoverage takes mode from config.coverageMode ?? 'mention' while phase 239 T6 writes summary.coverageMode into every new SUMMARY as provenance. A phase that settled under 'mention' (token legally in a comment) is reported as DRIFTED after the operator later switches the repo to 'assertion' — the phase did not change, the standard did, and verify phase reds CI claiming 'recorded PASS (executed), no longer covered by its linked test'. Fix is summary.coverageMode ?? config.coverageMode, but it changes the BARE path's behavior for any post-239 SUMMARY, so it was deliberately excluded from T7 (whose boundary requires the bare path stay byte-for-byte unchanged). Fixing it only under the qualified branch would leave two schemes resolving the same question differently — the hazard services/settle.ts:432-434 already warns about. Needs its own slice.

## rec-20260730-002 — Coverage dedup: a qualified AC token outside an asserting block silently zeroes that AC's coverage

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, coverage, gates
- files: packages/core/src/verify/coverage.ts, packages/core/src/gates/coverage.ts
- evidence: Hit live during phase 239 T7 (2026-07-30). The new test file's own fixture-hygiene COMMENT contained a contiguous 239-01/AC-8 literal; it took the dedup slot and AC-8 measured refs=1 qualifying=0 while five asserting it() titles below carried the same qualified token. Full pipeline was 24/24 green throughout — only a direct scanTestCoverage probe surfaced it. Cost one full implement/review round-trip.
- next: cadence milestone propose

scanTestCoverage dedups per AC-N@file on a first-occurrence-wins basis (verify/coverage.ts, the 'seen' set). Phase 239 T2 deliberately filters UNQUALIFIED occurrences before the dedup add so a bare token cannot consume the slot — but a correctly-qualified occurrence sitting outside an asserting block (a comment, a doc block, a describe() title) passes that filter, takes the slot, and is recorded qualifying:false. Every genuinely-qualifying occurrence later in the same file is then unreachable, and the AC reads as having zero coverage. Failure is silent: the suite stays green, the gate refuses at settle, and the refusal names a token the file demonstrably contains. Candidate fixes: prefer a qualifying occurrence over a non-qualifying one when filling the dedup slot, or keep all occurrences and let the consumer reduce.

## rec-20260731-001 — cadence doctor: release-currency check (local package.json vs published npm)

- status: candidate
- ready: ready-for-milestone
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: doctor, release-process
- files: packages/core/src/doctor/run.ts, .githooks/pre-push
- evidence: npm view showed 1.51.1 engines:>=20 while local main package.json (same 1.51.1 tag) already had engines:>=22 -- confirmed via manual npm view + git log during the v1.52.0 release-cut session on 2026-07-31
- next: cadence milestone propose

Node>=22 engine floor (phase 238, PR #324, 2026-07-27) merged to main and sat unreleased for 4 days / 3 more phases while npm still published engines:>=20 under the same 1.51.1 version string -- no mechanical gate caught main drifting from what npm actually ships. Add a doctor check that runs npm view @manehorizons/cadence-core version (best-effort, degrades safely offline) and compares it to local package.json; if local is ahead and .changeset/*.md files are pending, warn and list them, escalating when any pending changeset bumps engines or is a major/minor bump. Same best-effort degrade-safe pattern as checkLedgerRemoteCollision.

## rec-20260731-003 — Gate provenance doesn't distinguish a mock-downgraded AI review from a genuinely-ran one

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, types
- files: packages/types/src/summary.ts, packages/core/src/gates/registry.ts
- evidence: Follow-up from issue #331 (closed via phase 240 / PR #332, 2026-07-30) -- its 'Related, lower priority' item 2. Not filed as a recommendation when the core doctor bug shipped.
- evidence: Investigated 2026-07-31: the provider-carrying field this rec asks for already exists on feat/kernel-assurance-v2 (phase 232, PR #327) as GateProvenanceZ.provider/model, populated generically via GateFlags.verifierIdentity from verifyResult.provider -- not gate-specific special-cased, so a credential-missing mock-downgrade naturally records provider:'mock' same as an explicitly-configured mock run. Phase 243 (the loud-banner fix, PR #344, main-only, unreleased) has NOT yet been synced into feat/kernel-assurance-v2, so the exact downgrade path this rec names is not yet confirmed end-to-end on that branch, but the mechanism strongly implies it resolves automatically once synced. Substantially overlaps/subsumed by rec-20260727-001 (top-level GateProvenance ask vs that rec's per-finding-array ask -- both satisfied by the same phase-232 change). Do not spec a standalone phase against main's GateProvenanceZ -- it would conflict with this unmerged branch work. Currently being evaluated for an early cherry-pick to main ahead of the rest of the kernel-assurance-v2 arc (see rec-20260727-001 for the merge-safety verdict).
- next: cadence milestone propose

GateProvenanceZ (packages/types/src/summary.ts:63-71) has only {gate, status: ran|skipped|refused, skipReason, reason} -- no field records which provider actually served a status:'ran' gate. registry.ts's fallback branch (line 187, gates.push({gate, status:'ran'})) records code-review/security-audit/deep-verify identically whether a real provider or a silently mock-downgraded one served them, unlike the skipReason pattern already used for buildTestBypassed/boundaryScanBypassed/coverageBypassed a few lines above. Verified on main 2026-07-31: no verifierIdentity or equivalent provider-carrying field exists yet in GateProvenanceZ -- issue #331 referenced 'phase 232' adding this, but that phase's artifacts live on the feat/kernel-assurance-v2 branch, not main. Overlaps rec-20260727-001 (SUMMARY.codeReview/.securityAudit persisting findings as bare arrays, discarding provider/model) -- that rec is about per-finding provenance inside the review result payload; this one is about the top-level GateProvenance ran/skipped record. Reconcile scope between the two before spec'ing either.

## rec-20260731-004 — docs/providers.md's host-cli 'per-task-verify only' scope claim is stale — all 7 factories now have host-cli wired

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- files: docs/providers.md, packages/core/src/verify/code-review-factory.ts, packages/core/src/verify/per-task-factory.ts, packages/core/src/verify/plan-review-factory.ts, packages/core/src/verify/security-audit-factory.ts, packages/core/src/verify/spec-review-factory.ts, packages/core/src/verify/ui-spec-review-factory.ts, packages/core/src/verify/factory.ts
- evidence: Surfaced by the independent whole-branch reviewer during phase 243's pre-settle review (2026-07-31): flagged that phase 243's docs/providers.md edit was about to stamp a fresh 'Phase 243' attribution onto this false premise inside the same doc section; the phase 243 diff was reverted to leave the section exactly as stale as it was on main, and this rec files the underlying drift as its own follow-up instead of fixing it inline (scope discipline).
- next: cadence milestone propose

docs/providers.md ~L307-328 ('Current scope: per-task-verify only') claims 5 of 7 verifier seams (verifier/deep-verify, codeReview, planReview, securityAudit, specReview) 'have no host-cli builder yet' and that wiring them is a future follow-up. Verified false while working phase 243 (2026-07-31): every packages/core/src/verify/*-factory.ts (code-review-factory.ts, per-task-factory.ts, plan-review-factory.ts, security-audit-factory.ts, spec-review-factory.ts, ui-spec-review-factory.ts, factory.ts) already passes a hostCli builder to createVerifierFactory. This means createVerifierFactory's 'host-cli builder not wired for this family' degrade branch is now unreachable in production for any of the 7 seams (only exercisable via a deliberately-incomplete test spec) -- the doc section describes a limitation that no longer exists, without saying when it closed. Needs an audit of when each family's HostCli*Verifier class was added (git blame/log per file) and a doc rewrite -- possibly deleting the 'Current scope' section entirely if host-cli is now fully wired everywhere, or documenting the real remaining gap if any exists.
