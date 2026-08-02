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
- ready: ready-for-cadence-spec
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, settle
- files: packages/core/src/parse/summary-writer.ts
- evidence: Reconstructed stub: original entry (rec-20260712-003, logged during the phase 170 session, 2026-07-12) was lost to an unrelated git reset --hard before being committed. Recreated from context earlier in this session.
- evidence: Joined to the finding-durability cluster. Verified at main@afcb90a: the post-gate-loop refusal families in services/settle.ts still return exitCode 1 with no SUMMARY write (map each ok:false exit site to its owning family before drafting — expected members: AC derivation, anomaly/skill-audit, evidence floor). Phase 247 sharpened the asymmetry: a gate-loop refusal now persists findings, a contentHash, and a tamper-evident sibling, while an evidence-floor refusal later in the same service persists nothing. Fix is now trivially specified: those families call the writer 247 hardened. Scoped as phase 249.
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

## rec-20260728-002 — Test files are never typechecked or linted

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, tooling
- files: packages/core/tsconfig.json, tsconfig.base.json, packages/core/package.json
- evidence: Phase 234 T1 adversarial review: mutated witness<IsAssignable<VerifierPorts['deep'], VerifierPort<number,string>>>(true) -- semantically false -- and vitest, typecheck, and eslint all exited 0. Independently confirmed the include/exclude and lint-script config.
- next: cadence milestone propose

packages/core/tsconfig.json has include: ["src/**/*"] and tsconfig.base.json excludes **/*.test.ts and tests/, while each package's lint script is 'eslint src'. No test file in the repo is typechecked or linted by any command CI runs, and vitest does not typecheck. Consequence: type-level assertions in tests (conformance witnesses, satisfies checks, expectTypeOf-style guards) are inert -- a provably false witness leaves vitest, typecheck and lint all green. Found during phase 234 T1 review, where a deliberately falsified assignability witness passed all three gates. Options: a tsconfig.test.json wired into the typecheck task, vitest --typecheck, or a convention that type-level guarantees must live in src/.

## rec-20260729-003 — Criteria-gap anchoring is file-granular, so a finding in a covered file never reads as a gap

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, gates
- files: packages/core/src/verify/criteria-gap.ts, packages/core/src/verify/code-review.ts
- evidence: Read the implementation: bestAnchorForFile() is keyed on the file path and its result is spread onto every finding in that file (verify/criteria-gap.ts). Found by the orchestrator during phase 235 T4 re-verification, not self-reported.
- next: cadence milestone propose

Phase 235's anchorFindings (verify/criteria-gap.ts) resolves ONE anchor per file and tags every finding in that file with it, because the code-review verifier returns findings keyed by file with no per-finding criterion attribution. Consequence: a genuinely uncovered defect sitting in a file that some task happens to cover inherits that file's anchor and is NOT counted as a criteria gap — the gap detector under-reports precisely where a phase's ACs are thinnest. Phase 235 extended CodeReviewInput so the verifier can now SEE the ACs/boundaries, which is the prerequisite for the verifier itself citing the criterion it believes a finding violates; the mock does not exercise that. Fix: have the verifier return a per-finding anchor candidate (criterion citation) and grade that, keeping the file-level resolution only as the fallback when the verifier cites nothing.

## rec-20260729-004 — test-coverage gate's repo-wide AC-N token scan collides across phases, so any AC can be satisfied by an unrelated phase's tests

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, gates
- files: packages/core/src/verify/coverage.ts, packages/core/src/gates/coverage.ts
- evidence: Reproduced live during phase 235: 'node packages/core/bin/cadence.cjs verify coverage --explain AC-2' lists packages/core/tests/activate/render.test.ts (phase 211) with 'satisfies: true' for AC-2, alongside phase 235's own anchor.test.ts.
- next: cadence milestone propose

scanTestCoverage (verify/coverage.ts) walks DEFAULT_GLOBS packages/**/*.test.ts across the WHOLE repo and links an AC purely by the presence of its bare AC-N token. AC ids are per-phase and restart at AC-1 every phase, so tokens collide globally: while building phase 235 I confirmed via 'cadence verify coverage --explain AC-2' that AC-2 was already satisfied by phase 211's tests/activate/render.test.ts, entirely unrelated to phase 235. Any AC-N from any past phase satisfies that same id for every future phase, so the coverage gate cannot actually attest that THIS phase's ACs are covered — it degrades to 'some test somewhere once mentioned this token inside an it() block'. assertion mode hardened WHERE the token sits but not WHICH phase it belongs to. Fix candidates: scope the scan to the phase's own test files (via task files:/git diff), or require a phase-qualified token, or have the gate report which files matched so a reviewer can see cross-phase satisfaction.

## rec-20260729-005 — Boundary-string anchors are granted by filename substring match, so an irrelevant boundary can mask a criteria gap

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify
- files: packages/core/src/verify/criteria-gap.ts, packages/core/src/verify/anchor.ts
- evidence: Surfaced by independent adversarial review of phase 235 T4, which traced the candidate-construction and exact-match paths and confirmed the guard is tautological by construction. Behavior is pinned intentionally by a test at tests/gates/code-review-criteria-gap.test.ts.
- next: cadence milestone propose

candidatesForFile (verify/criteria-gap.ts) proposes a boundary candidate whenever a free-text boundaries[] entry contains the filename as a substring, and resolveAnchor then 'verifies' it with boundaries.find(b => b === candidate.ref) — which is guaranteed to succeed because the ref was sourced from that same array by construction. The exact-match step therefore confirms only 'this string exists', not that the boundary has anything to do with the finding. Consequence: a boundary like 'DO NOT add a runtime dependency to packages/core/src/gates/code-review.ts' grants declared tier to ANY finding in that file, converting a would-be criteria gap into a (weak) anchored finding and hiding it from the gap count. Matches section 7.1's literal spec, which imposes no relevance requirement on a boundary anchor, and declared is documented as the weakest non-gap tier — so this is working-as-specified, not a code defect. But it is a real false-anchor path that suppresses gap reporting. Distinct from rec-20260729-003 (which is about per-file rather than per-finding granularity). Fix candidates: require the boundary to cite the file more strongly than substring containment, or treat a boundary-only anchor as a gap-with-weak-mitigation rather than a non-gap.

## rec-20260729-006 — Retroactive audit: re-derive how many historical AC PASS records had genuine per-phase test coverage

- status: candidate
- ready: needs-evidence
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, gates
- files: packages/core/src/verify/coverage.ts, packages/core/src/verify/phase-replay.ts
- evidence: Demonstrated live during phase 235: all seven of the phase's ACs were satisfied by 34-189 unrelated test files each, and AC-5/AC-6 (belonging to a task not yet implemented at the time) were already fully satisfied by 91 and 49 unrelated files. Sample matches include 'it("Slice 23 AC-6: unknown rec id -> empty result, exit 0")' from unrelated recommendation-CLI slices.
- next: cadence milestone propose

Follow-on to rec-20260729-004 (repo-wide AC-N token collision). Because settle derives per-AC PASS from task terminal status PLUS coverage evidence, and the coverage leg is satisfiable by any past phase's identically-numbered AC token, per-AC PASS for a typical phase collapsed toward the agent's own DONE self-report — the exact signal the project exists to distrust. The settled SUMMARY corpus therefore carries an AC-coverage attestation stronger than the evidence behind it. This is a defect in the proof, not proof that the work was undone: build-test-must-pass, per-task verify commands, and the review gates were unaffected and provided real signal. Audit to run: for every settled phase, re-derive whether each AC's satisfying token actually sits in a test file belonging to THAT phase rather than an unrelated one, and report the count of AC PASS records with genuine per-phase coverage vs cross-phase-only satisfaction. cadence verify phase already re-derives settled coverage but needs the phase-scoping fix from rec-20260729-004 first to give a trustworthy answer. Operator decision 2026-07-29: run this in a fresh session after phase 235 lands, not inline.

## rec-20260731-007 — Finding id collision: two same-severity/message findings in one file share one id

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, types
- files: packages/core/src/verify/finding-identity.ts
- evidence: Opus gap review, phase 236, 2026-07-30: verified two findings differing only in line collapse to identical sha256 id via computeFindingId
- next: cadence milestone propose

computeFindingId hashes (file, anchor.kind, anchor.ref, severity, normalized message) per AC-3's exact spec, with no per-occurrence discriminant. Two distinct findings in the same file with identical anchor/severity/normalized-message (e.g. MockCodeReviewVerifier's 'console.log left in source' emitted twice in one file) collapse to the same id. Harmless today since findings are never keyed by id, but the follow-on ledger-routing phase (source doc section 7.3, phase 236's ROADMAP.md 'As built' amendment) must key on identity for ledger hygiene — it would currently mint one recommendation for N occurrences and a future disposition surface would waive them all together. Surfaced by an Opus gap review (2026-07-30) of phase 236, verified reachable via MockCodeReviewVerifier's literal duplicate-marker behavior. Undocumented anywhere; needs at minimum a doc note, and the ledger-routing phase's design should account for it explicitly (e.g. include occurrence count/ordinal in the hash, or accept it as a deliberate merge-by-identity semantic).

## rec-20260731-008 — docs/concepts.md phase-236 section has unpinned file:line citations that will rot

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- files: docs/concepts.md
- evidence: Opus gap review, phase 236, 2026-07-30: git show HEAD~1:docs/concepts.md had 0 file:line citations, phase 236 introduced 10 unpinned ones
- next: cadence milestone propose

The new 'Finding identity, disposition, and type convergence (phase 236)' subsection in docs/concepts.md cites ~10 hardcoded file.ts:NN-NN line ranges (e.g. summary.ts:70-114, finding-identity.ts:58-90, gates/code-review.ts:105, contracts/index.ts:167-186, intelligence.ts:3-15). All verified accurate as of the phase-236 commit, but no doc-content test pins them (unlike CLAUDE.md's 'The Hardcoded Count' precedent for command/slash-command counts) and docs/concepts.md had zero such citations before this commit. They will silently go stale on the next edit to any cited file. Surfaced by an Opus gap review (2026-07-30) of phase 236. Fix options: drop line numbers and cite file paths only, or add a lightweight doc-content test asserting the cited ranges still contain what they claim (matching this repo's existing docs test conventions in packages/core/tests/docs/).

## rec-20260731-010 — High-severity code-review findings never reach the finding-ledger (they refuse settle before finalizeAndCloseSettle runs)

- status: deferred
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/services/settle.ts, packages/core/src/gates/code-review.ts
- decisions: dec-20260802-003 (active)
- evidence: Surfaced by independent review of phase 242 T3 (2026-07-31), verified live: a forced high-severity settle exits 1 with lastGate.reason naming code-review, no codeReview key in the refused SUMMARY, no ledger entry
- evidence: Persistence half shipped via phase 247 (PR #357, main@afcb90a, re-verified unchanged at main@59a2116e): writeRefusedSettleSummary now threads acc.codeReview/acc.securityAudit with the success path's conditional-spread shape, attaches contentHash when findings are non-empty, and preserves findings-bearing refused attempts as immutable -SUMMARY-snapshot siblings. The summary's claim that a refused settle's findings are not even persisted is stale as of 247. Routing half is disposed by dec-20260802-003 (already recorded, superseding the decision text originally sketched for this rec) — ledger routing stays finalize-only, trigger amended to name rec-20260801-012's finding that real-provider gate throws are structurally unreachable under this repo's normal auto-profile, headless-agent operating mode.
- next: cadence milestone propose

Phase 242's finding-to-ledger routing (settle.ts, finalizeAndCloseSettle) only ever runs on a settle that reaches finalization. collectHighFindings (gates/code-review.ts) fails the code-review gate on any 'high' severity finding, so settle takes the writeRefusedSettleSummary path instead -- finalizeAndCloseSettle, and therefore the routing step, is never reached. Verified live: a settle with a high-severity finding exits 1, the refused SUMMARY has no codeReview key at all (the findings aren't even persisted), and no ledger entry is created. The findings only route if the operator bypasses via --force/--allow-code-review-failure. This is consistent with phase 242's DRAFT (AC-1 says 'when settle finalizes'), so it is not a phase-242 defect -- but it means the single most severe class of finding is the one class the routing feature never captures by default. Worth a decision: should a refused settle still route the findings from its failed attempt (there is real diagnostic value in a high-severity finding landing in the ledger even though the phase didn't settle), or is 'only route on a clean settle' the deliberately narrower, safer scope?

## rec-20260731-005 — Archived finding-routing recs permanently suppress recurrence of the same finding id

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/services/settle.ts, packages/core/src/verify/finding-identity.ts
- evidence: Surfaced by independent review of phase 242 T3 (2026-07-31): dedup-set construction from ledger.recommendations + ledger.archived is correct per AC-2, but archiveReason is not distinguished when building that set
- next: cadence milestone propose

Phase 242's AC-2 dedup correctly checks both the ledger's active recommendations array AND its archived array before routing a finding (a previously-routed rec can be soft-archived -- e.g. after being shipped/rejected, since recommendations.autoArchive defaults true -- before the phase is ever re-settled). But this has a real consequence worth a conscious decision: computeFindingId (phase 236, finding-identity.ts) deliberately excludes line number from its hash, so a finding that is fixed, whose rec is archived (possibly as 'rejected'), and which later regresses -- same file/anchor/severity/normalized-message reintroduced -- computes to the byte-identical id and will never be re-routed, silently, forever. This is correct per AC-2 exactly as specified (dedup across settles), but 'permanently' may not be the intended lifetime for a rejected-and-recurred finding. Options: exempt archiveReason: 'rejected' from the dedup set (only 'shipped'/'converted' archival suppresses recurrence), or accept this as the deliberate semantic and document it explicitly next to AC-2.

## rec-20260731-006 — Finding-ledger routing has no per-settle cap: O(N) sequential ledger rewrites, and it now dirties a git-tracked file every settle

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/services/settle.ts, packages/core/src/intelligence/store/recommendations.ts
- evidence: Surfaced by independent review of phase 242 T3 (2026-07-31): verified empirically that Promise.all races on id-minting (3 concurrent calls -> 1 written rec), confirming the sequential loop is necessary but leaves an unbounded-N cost profile; recommendations.json/evidence.json confirmed git-tracked in this repo
- next: cadence milestone propose

Phase 242's routing step (settle.ts, finalizeAndCloseSettle) writes each new routing candidate via a sequential for-of + await addRecommendation loop -- correct and necessary (Promise.all would race on id-minting, verified empirically: 3 concurrent calls collapsed to 1 written rec instead of 3), but each call re-reads and rewrites both ledger files in full, so N candidates cost O(N) full ledger read+writes with no upper bound on N per settle. A real (non-mock) reviewer producing many findings in one settle could mint many recommendations in one step. Separately: .cadence/intelligence/recommendations.json (and evidence.json) are git-tracked in this repo, so routing now dirties a tracked file on every settle that has code-review findings -- widening the existing rec-id-collision-on-rebase surface (two branches/worktrees independently minting new rec ids before either pushes) beyond what manual recommendation add usage already created. Worth a decision: cap candidates per settle (e.g. route only the top-N by severity, log the rest as dropped per this repo's no-silent-caps convention), or accept unbounded routing as intentional since findings are already bounded by the review verifier's own output size.

## rec-20260801-001 — docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8

- status: candidate
- ready: ready-for-cadence-spec
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, docs
- files: docs/reference/commands.md, packages/core/src/config-edit/fields.ts
- evidence: Surfaced during phase 242 T4 doc work (2026-07-31): confirmed docs/reference/commands.md:156 still says 'all five' while EDITABLE_FIELDS has 8 entries (profile, loopEnforcement, acDiscipline, commitCadence, verifier, autoArchive, coverageMode, autoRoute)
- next: cadence milestone propose

docs/reference/commands.md:156 ('Jump to one key -- profile, loopEnforcement, acDiscipline, commitCadence, or verifier. Omit to walk all five.') predates phase 102's autoArchive and phase 108's coverageMode additions to packages/core/src/config-edit/fields.ts's EDITABLE_FIELDS array, and now also predates phase 242's autoRoute addition -- three fields (autoArchive, coverageMode, autoRoute) are absent from this doc's field list and its 'walk all five' claim, though EDITABLE_FIELDS actually holds 8. Not caused by phase 242 -- the gap already existed for autoArchive/coverageMode before this phase; autoRoute is simply the third field to land in it. No doc-content test currently catches this (unlike the command-count/slash-command-count tests this repo already has for similar drift). Fix: update the field list and count, and consider adding a doc-content test deriving the list from EDITABLE_FIELDS.map(f => f.name) the same way docs-command-count.test.ts derives the registered command set, so this can't silently drift again.

## rec-20260801-004 — code-review/security-audit lose verifier identity entirely on a caught-and-bypassed throw

- status: candidate
- ready: ready-for-cadence-spec
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/code-review.ts, packages/core/src/gates/security-audit.ts, packages/core/src/gates/registry.ts
- evidence: Independent adversarial review of feat/kernel-assurance-v2 (2026-08-01), confirmed by direct source read
- evidence: Re-verified at main@afcb90a (confirmed unchanged at main@59a2116e): both catch blocks unchanged by phase 247 — a bypassed verifier throw still returns bare outcome pass with no flags, and registry persists status ran with empty verifier identity. Urgency shifted: codeReview.provider has been host-cli in this repo's live config since PR #351 (confirmed still host-cli), so a credential expiry or network failure plus --force is now a reachable daily-dogfooding event that records as a clean real-provider pass. Scoped as phase 248; land before real-provider reloop dogfooding accumulates any such records.
- next: cadence milestone propose

code-review.ts and security-audit.ts's catch(err) blocks return {outcome:'pass'} with no flags at all when --allow-code-review-failure/--allow-security-audit-failure/--force bypasses a real-provider throw (revoked key, rate limit, network blip). Unlike build-test-must-pass/boundary-scan/test-coverage (which set a dedicated bypass flag registry.ts turns into an explicit skipReason provenance entry) or deep-verify.ts (which sets flags.verifierFailure={message,provider} on its own throw path), these two gates set nothing. verifierIdentityProvenance(res) then returns {} since res.flags?.verifierIdentity is undefined. Verified directly against source 2026-08-01: the persisted SUMMARY.gates[] entry reads as {gate:'code-review',status:'ran'} -- indistinguishable from a clean real-provider pass, with no skipReason explaining a failure was bypassed. This lands on exactly the two gates phase 232 exists to make trustworthy. deriveAssuranceRecord under-reports (drops the gate from verifierRollup) rather than over-reports, so it is not a spoofing risk, but the raw gates[] provenance record is actively misleading about what 'ran' means here.

## rec-20260801-006 — deriveAssuranceRecord docstring/code mismatch on the 'weak' classification, with an untested edge case

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/assurance-record.ts, packages/core/tests/gates/assurance-record.test.ts
- evidence: Independent adversarial review of feat/kernel-assurance-v2 (2026-08-01)
- next: cadence milestone propose

assurance-record.ts documents 'weak' as covering '...or simply no ACs at all with no verifier signal either,' but zero ACs with zero verifier identity actually trips the first branch (vacuously true when acResults is empty) and returns 'unverified', not 'weak' -- doc and code disagree with no test pinning either. Also untested: deriveAssuranceRecord(realProviderGates, []) (zero ACs, real verifier) traces by hand to 'mixed', but the one test exercising this shape only asserts verifierRollup, never .overall. Agent-reported 2026-08-01.

## rec-20260801-007 — Three small hygiene gaps from the kernel-arc independent review (2026-08-01)

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/assurance-record.ts, packages/core/src/verify/phase-replay.ts, packages/core/src/cli/commands/summary.ts, eslint.config.js
- evidence: Independent adversarial review of feat/kernel-assurance-v2 (2026-08-01)
- next: cadence milestone propose

(1) eslint.config.js's own comment candidly documents that dynamic import() of verifier family modules is invisible to the new kernel/verifier/consumer boundary rule -- a disclosed, real gap with no tracking recommendation until now. (2) deriveAssuranceRecord's verifierRollup key is an unseparated string join (${provider} ${model ?? ''}) -- theoretically collision-prone if a provider/model string ever contains a space (today's real values never do). (3) readRawSchemaVersion/MAX_RECOGNIZED_SCHEMA_VERSION is duplicated between verify/phase-replay.ts and cli/commands/summary.ts, hand-synced -- a third SummaryZ.safeParse call site would misreport a future schemaVersion-3 record as a generic parse failure instead of 'written by a newer Cadence.' None urgent; bundled as one low-priority rec per the independent review's own framing.

## rec-20260801-012 — Real-provider code-review findings are structurally unreachable under default profile + agent-driven settles

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/verify/host-cli-client.ts
- evidence: Verified 2026-08-01: config.json profile=auto; engine.ts DELTAS.auto.{quick-fix,standard,complex} all omit 'code-review' (only DELTAS.standard.complex and DELTAS.strict.{standard,complex} include it); host-cli-client.ts:333 isSelfInvocation() checked inside spawnCapture(), the shared spawn path for every host-cli call, not scoped to spec-review.
- next: cadence milestone propose

Two independent, verified blockers mean phase 237's entry gate and dec-20260801-003's revisit trigger (>=3 non-mock settles each persisting >=1 code-review finding) may never be satisfied under this repo's actual default operation: (1) config.json's profile is 'auto', and gates/engine.ts's DELTAS matrix shows 'code-review' is absent from ALL THREE auto-profile tiers (quick-fix/standard/complex) -- only 'standard' profile (complex tier) or 'strict' profile (standard+complex tiers) include it, so a phase needs an explicit DRAFT-level profile override just to run code-review at all. (2) Even when code-review does run under host-cli (activated PR #351), host-cli-client.ts's spawnCapture (the shared low-level spawn function used by every host-cli call, not just spec-review) contains a self-invocation guard (isSelfInvocation, checked via CLAUDECODE=1) that falls back to mock whenever cadence itself is invoked from inside a headless Claude Code session -- which describes essentially every agent-driven settle in this repo's normal workflow. So even a profile-overridden phase settled by an agent still produces mock findings, not real ones. Net effect: the evidence dec-20260801-003 is waiting for can only be generated by a human operator running 'cadence settle run' on a standard/strict-profile phase from a real interactive terminal, never from an agent session under default config -- and nothing currently surfaces this as a blocker (cadence doctor doesn't check it, and dec-20260801-003 doesn't mention it).

## rec-20260802-001 — Finding-durability arc: complete, attempt-addressable settle records on every exit path

- status: candidate
- ready: ready-for-cadence-spec
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, types
- files: packages/core/src/services/settle.ts, packages/core/src/gates/registry.ts, packages/core/src/gates/code-review.ts, packages/core/src/gates/security-audit.ts
- evidence: Five-rec cluster verified line-by-line at main@361f6490 (re-verified from the original 98b6a15 pin, zero source drift): acc payloads discarded at writeRefusedSettleSummary until phase 247's T1 fix, three silent post-gate refusal families still unaddressed (rec-20260712-006, follow-on), same-path SUMMARY overwrite on reloop now fixed by phase 247's T2/T3 (T3 in progress), and bare {outcome:'pass'} bypass catches in both review gates (rec-20260801-004, not yet started). Data loss was anti-correlated with severity: the cleanest settles kept the most complete records.
- next: cadence milestone propose

One arc, decided (dec-20260802-001/002/003) and partially landed as phase 247 (worktree phase247-refused-settle-summary, DRAFT 247-01, in BUILD as of 2026-08-02): (S1) bypassed verifier throws still need an honest skipped-with-reason provenance entry instead of a clean 'ran' (rec-20260801-004, independent, unblocked, not yet started); (S2) the gate-loop refusal family now threads acc's codeReview/securityAudit findings into a conditionally-hashed refused SUMMARY (rec-20260801-005, rec-20260731-010 persistence half -- dec-20260802-001, phase 247 T1, DONE and independently test-verified); the three post-gate refusal families (rec-20260712-006) remain silent and are scoped as a dedicated follow-on phase, deliberately excluded from 247 to keep its single-commit-settle convention intact; (S3) refused-attempt SUMMARYs are preserved as timestamp-slugged sibling artifacts, invisible to every current SUMMARY consumer by construction (rec-20260801-011 -- dec-20260802-002, phase 247 T1/T2 DONE, T3/T4 in progress under a concurrent session). Routing-on-refusal deliberately excluded per dec-20260802-003 (finalize-only routing; revisit trigger amended to name its rec-20260801-012 precondition -- real-provider findings are structurally unreachable under this repo's normal agent-driven, auto-profile operation).

## rec-20260802-002 — SUMMARY.md never renders codeReview/securityAudit findings — a refused-attempt sibling shows nothing an operator opens it to see

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/services/summary-render.ts
- evidence: Empirically verified 2026-08-02 during phase 247's independent whole-branch review: grep for codeReview/securityAudit in summary-render.ts returns zero hits; a hand-built refused SUMMARY with a HIGH finding, rendered via the real CLI, omits the finding entirely from SUMMARY.md while the JSON carries it correctly.
- next: cadence milestone propose

Surfaced by the phase-247 whole-branch review (2026-08-02): packages/core/src/services/summary-render.ts renders AC / Tasks / Gates / Gate bypasses / Assurance / Decisions / Deferred sections but has zero handling for the codeReview or securityAudit fields, for ANY SUMMARY (success or refused) -- this predates phase 247 and is not scoped to it. Phase 247 makes the gap newly consequential: it now writes an immutable per-attempt sibling .md specifically so a human can inspect what a refused/abandoned attempt found, but the .md half of that record is byte-identical to the canonical refused SUMMARY.md and renders none of the findings that caused the refusal -- verified empirically: a hand-built refused-shaped SUMMARY with one HIGH code-review finding, rendered via the real cadence summary render, shows the content hash and the refused gate but not one word of the finding. The data is JSON-only. Fix is out of phase 247's DRAFT scope (Boundaries did not ask for a render change) and was not built. Worth a dedicated phase: add a codeReview/securityAudit findings section to summary-render.ts, following the same JSON-only-so-far -> now-rendered precedent as the phase-170 gates[].reason field (docs/concepts.md notes this exact pattern already).
