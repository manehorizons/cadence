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
- evidence: Empirically confirmed hitting this during phase 261 settle (2026-08-07): a literal, qualified 261-01/AC-5 token in a JSDoc comment (non-asserting) at the top of packages/core/tests/cli/verify-historical-coverage-audit.test.ts caused 'cadence settle run --auto' to refuse AC-5 with 'mentioned but not inside a recognized asserting test block', even though 4 real asserting it() blocks later in the same file genuinely reference 261-01/AC-5. Fix was removing the literal qualified token from the comment entirely (paraphrasing without the exact string) -- confirming the bug is real and not just theoretical. Additionally found a related, arguably separate defect: 'cadence verify coverage --explain AC-5' reported 'Overall: SATISFIED' for this exact file/AC combination while the real settle gate still refused it -- the diagnostic tool the gate's own refusal message tells operators to run to debug this class of failure gives a false-positive answer, which cost real debugging time. Worth scoping into this rec or filing as a follow-on.
- next: cadence milestone propose

scanTestCoverage dedups per AC-N@file on a first-occurrence-wins basis (verify/coverage.ts, the 'seen' set). Phase 239 T2 deliberately filters UNQUALIFIED occurrences before the dedup add so a bare token cannot consume the slot — but a correctly-qualified occurrence sitting outside an asserting block (a comment, a doc block, a describe() title) passes that filter, takes the slot, and is recorded qualifying:false. Every genuinely-qualifying occurrence later in the same file is then unreachable, and the AC reads as having zero coverage. Failure is silent: the suite stays green, the gate refuses at settle, and the refusal names a token the file demonstrably contains. Candidate fixes: prefer a qualifying occurrence over a non-qualifying one when filling the dedup slot, or keep all occurrences and let the consumer reduce.

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
- evidence: Phase 249 T1 verified this disposition durable as of housekeeping PR #359 (main@9d561fbd): dec-20260802-003 active, status deferred, 2 prior evidence entries confirmed unchanged. No additional mutation applied.
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

## rec-20260802-003 — Intelligence ledger has 145 orphan decision/evidence links to recs absent from both active and archived arrays

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, intelligence
- files: .cadence/intelligence/recommendations.json
- evidence: cadence intelligence audit at main@59a2116e (2026-08-02): 20 orphan decisions + 125 orphan evidence entries, oldest dated 2026-06-11; sample checked (rec-20260711-001) confirmed absent from both recommendations[] (69 entries) and archived[] (115 entries).
- evidence: Root cause identified while authoring phase 249's SPEC: computeIntelligenceAudit (packages/core/src/intelligence/store/audit.ts) builds its valid-rec-id set from recommendations[] only and never consults archived[] — so a decision/evidence entry whose rec is legitimately archived (not lost, not deleted) is flagged as an orphan indistinguishable from a genuinely-vanished rec like rec-20260711-001. This reframes the finding: it is not only a fixed 145-item historical backlog, it is an ongoing generator of new orphans. recommendation-promote.ts's autoArchive:true default means every phase that closes by promoting its source rec to 'shipped' (the single-commit settle convention's normal path) immediately orphans that rec's own evidence entries. Verified live: rec-20260801-004 (status shipped, in archived[]) has 3 evidence entries (ev-20260801-004, ev-20260802-005, ev-20260802-011) now flagged as orphans by this mechanism, confirmed absent from the original 145-count baseline. Scoping fix, not resolved here: computeIntelligenceAudit's valid-rec-id set should include archived[] alongside recommendations[] before orphan counts are used as any kind of gate.
- evidence: Post-npm-scope-migration re-measure at v1.54.0 (2026-08-03), phase 251 T1c: cadence intelligence audit now reports 20 orphan decisions and 134 orphan evidence entries (154 total), compared against the pre-migration baseline of 20 orphan decisions + 125 orphan evidence entries recorded at filing time. Decisions count unchanged; evidence count grew by 9, consistent with this being a known-drifting metric (computeIntelligenceAudit's archived[]-blind-spot, not yet fixed) that new autoArchive'd promotions (including this same phase's rec-20260802-001 T1a promotion) continue to inflate — not asserted as a threshold, gate, or expected decrease.
- next: cadence milestone propose

cadence intelligence audit reports 20 orphan decisions and 125 orphan evidence entries whose referenced rec ids exist in neither the 69-entry active recommendations array nor the 115-entry archived array in .cadence/intelligence/recommendations.json — e.g. rec-20260711-001, referenced by dec-20260711-001 and ev-20260711-*, is genuinely absent from both, not merely archived. Orphans date back to 2026-06-11, so this predates any known reconciliation pass. Verified at main@59a2116e (this session's own Part 1 evidence/decision additions — ev-20260802-009/010/011, dec-20260802-003 — were checked and are NOT part of this orphan set, so the finding is pre-existing and unrelated to that work). The audit tool's own remediation text calls restore-or-remove an operator decision; 'cadence intelligence reconcile' only re-derives rec-side link arrays and does not resolve orphan subjects. Needs scoping: how far back the gap goes, whether it's from lost commits (git reset --hard has bitten this ledger before per rec-20260712-006's own evidence) or a reconcile bug, and whether restoring vs. pruning is right per orphan.

## rec-20260802-004 — deep-verify.ts's own bypassed-throw case has the identical registry-side provenance gap phase 248 just fixed for code-review/security-audit

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/deep-verify.ts, packages/core/src/gates/registry.ts
- evidence: Surfaced during phase 248's SPEC authoring (2026-08-02): registry.ts's dispatch loop has no branch reading res.flags?.verifierFailure at all — confirmed by reading the full bypass-ladder chain (self-guard predicate, build-test-must-pass x2, boundary-scan, test-coverage, code-review/security-audit's new reviewVerifierFailure branch) and finding none match deep-verify's own verifierFailure flag.
- next: cadence milestone propose

Phase 248 fixed code-review/security-audit: a bypassed verifier throw (--allow-verifier-failure equivalents) now records an honest SUMMARY.gates[] status:'skipped' entry instead of a bare status:'ran' with empty identity. deep-verify.ts (packages/core/src/gates/deep-verify.ts) has the structurally identical bug: on a bypassed throw it already sets flags.verifierFailure = { message, provider }, but registry.ts's runSettleGates dispatch loop has no branch that reads verifierFailure — so it falls through to the same generic status:'ran' with empty identity that phase 248 fixed for the other two gates. Deliberately NOT folded into phase 248 (rec-20260801-004 scoped to code-review/security-audit only per its own files: list) and NOT a copy-paste fix: verifierFailure is load-bearing for notify/collect.ts's anomaly emission and SUMMARY.gateBypasses (hardcoded to attribute failures to 'deep-verify' — which is actually correct for this gate, unlike the false-attribution risk that made phase 248 use a distinct reviewVerifierFailure field instead of reusing verifierFailure). So the registry.ts fix here can consume the existing verifierFailure flag directly, but the new branch's interaction with the anomaly-emission pipeline (does printing a loud stderr notice AND recording gates[] status:'skipped' double-count with the existing anomaly/gateBypasses record for the same event?) needs its own scoping pass before drafting, not an assumption that phase 248's exact pattern transfers unchanged.

## rec-20260802-005 — release-integrity's 10-attempt (~45s) verify budget insufficient for first-ever publish under a new npm scope

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: release, ci
- evidence: Release workflow run 30771173624 (2026-08-02): 'Create GitHub Release and verify registry' step failed with E404 after 10 attempts; publish/tag/GH-release steps all green; manual npm view polling confirmed all 5 @thomas-powers-jr packages resolved a few minutes later
- next: cadence milestone propose

v1.54.0's release (npm scope rename, phase 250) published all 5 packages successfully with provenance, and the git tag + GitHub Release were both created correctly, but the Release workflow's post-publish 'verify registry' step failed -- release-integrity.mjs's POST_PUBLISH_VERIFY_ATTEMPTS=10 (~45s linear backoff, added in phase 218 for routine version-bump propagation lag) wasn't enough for a brand-new scope's CDN entries, which took several more minutes to resolve. Nothing was actually broken (independently verified via npm view/git ls-remote/gh release view once propagation completed) -- same 'red run, real publish' pattern phase 218 fixed, just at a longer timescale than that fix's budget covers. Consider either an adaptive/longer retry budget specifically for a package's first-ever publish (detectable via the pre-publish 404 the script already observes), or documenting this as an expected-slower case in release-cut's known-flake protocol. Don't blanket-extend the budget for routine releases -- 45s was fine per phase 218.

## rec-20260802-006 — Extend security audit CI coverage to website/ workspace

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: security, ci, website
- files: docs/security/audit-exceptions.md, .github/workflows/security.yml, scripts/check-audit-exceptions.mjs, website/pnpm-lock.yaml
- evidence: Dependabot alert sweep 2026-08-02: 38 open alerts total, 30 of which (all high/moderate/low in website/) have zero CI enforcement per the exceptions doc's documented scope; PR #364 fixed 2 of the 7 website high-severity alerts
- next: cadence milestone propose

docs/security/audit-exceptions.md's own text documents that the audit CI job (scripts/check-audit-exceptions.mjs, .github/workflows/security.yml) only scans the packages/* workspace's root pnpm-lock.yaml -- website/ has a fully separate pnpm-workspace.yaml + pnpm-lock.yaml that is never audited at all. Confirmed via live GitHub Dependabot alerts on 2026-08-02: 7 high-severity alerts (astro SSRF #19, brace-expansion #26, js-yaml #27, linkify-it #34, postcss #39, sharp #36, svgo #35) plus 23 moderate/low alerts exist ONLY in website's lockfile and would never fail CI even if left unpatched indefinitely, unlike the same-severity packages/* advisories which are forced into a time-boxed exception table or a real fix. Two of the seven (brace-expansion, js-yaml) were fixed in PR #364 by re-resolving already-permitted transitive versions; the other five need their own patched-version research.

## rec-20260803-001 — No CLI path corrects a shippedRef on an already-shipped recommendation

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, intelligence
- evidence: Verified at v1.54.0: docs/reference/commands.md's recommendation promote section states refusal for terminal statuses and lists the two sanctioned exceptions; rec-20260801-004 and rec-20260712-006 both carry a ref containing 'PR pending' post-merge.
- next: cadence milestone propose

recommendation promote is refused for terminal-status recs, so a --ref recorded at settle time as a placeholder (e.g. 'PR pending') can never be corrected once the PR merges. Observed on rec-20260801-004 (phase 248, PR #358 merged) and rec-20260712-006 (phase 249 merged), both still reading 'PR pending' at v1.54.0. The doctor recommendation-shipped-drift check covers the settle-pending waypoint but not a stale ref on an already-shipped rec. Options to weigh: a narrow 'recommendation ref set <id> --ref' command; allowing --ref on promote for a shipped→shipped no-op transition; or having settle record the branch/PR automatically at the settle-pending → shipped step so a placeholder is never minted. Cosmetic per-instance, but it accumulates once per shipped phase and silently degrades the ledger's own provenance.

## rec-20260804-002 — audit-exceptions parser silently drops any exception row appended below the HTML template comment

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: security, docs
- files: scripts/check-audit-exceptions.mjs, docs/security/audit-exceptions.md, packages/core/tests/docs/security-ci.test.ts
- evidence: parseExceptionsTable(readFileSync('docs/security/audit-exceptions.md')) returns 5 rows today. Appending an identical row BELOW the existing HTML comment (after line 38) still returns 5; appending the same row ABOVE the comment (before line 34) returns 6. Measured via a Node one-liner importing parseExceptionsTable from scripts/check-audit-exceptions.mjs.
- next: cadence milestone propose

parseExceptionsTable stops at the first non-table-row line. docs/security/audit-exceptions.md places an HTML-comment 'how to add a row' template immediately after the last real row. The comment's own text says to append above it, so following the instruction works -- but appending below it produces an exception that parses to nothing and fails CI with 'not listed', with no diagnostic pointing at the placement. Correct and incorrect placement look identical in the rendered Markdown. The inverse case (a template row INSIDE the comment being ignored) is already proven safe and tested at security-ci.test.ts:207 -- this covers only the untested directional case.

## rec-20260804-003 — A rec archived as shipped by a ship-no-code decision is invisible to the documented dedup procedure

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: intelligence, process
- files: packages/core/src/cli/commands/recommendation.ts, .cadence/intelligence/recommendations.json
- evidence: cadence recommendation list does not contain rec-20260801-010; cadence recommendation list --archived does. cadence decision show dec-20260801-003 reports 'Decision: ship no code this phase' plus an unmet revisit trigger (3 non-mock settles each persisting >=1 code-review finding). Discovered 2026-08-04 while dedupping for scout-20260804-integrity-release against a handoff that itself listed rec-20260801-010 in its 'existing, do not duplicate' table.
- evidence: Same defect class also reproduces for status=rejected, not just shipped: promoting rec-20260724-012 to rejected (phase 253 whole-branch review fix, 2026-08-05) hid it from the default 'cadence recommendation list' as expected, but also broke 'cadence recommendation evidence add rec-20260724-012' entirely ('recommendation not found', despite 'recommendation show rec-20260724-012' resolving it fine) -- worse than rec-20260801-010's case, where the rec is merely hidden from listing but presumably still evidence-addressable. The lookup used by evidence add appears to filter against the same active-only set as the default list, not against the full ledger the way show/promote do.
- next: cadence milestone propose

rec-20260801-010 (finding message-drift dedup) is archived with status shipped, shippedRef phase 246 / PR #356. Its linked decision dec-20260801-003 states 'Decision: ship no code this phase' with a revisit trigger -- i.e. the underlying defect was deferred, not fixed. Because 'cadence recommendation list' shows only the active set by default, an agent following the standing dedup-first rule cannot see it and could refile the same defect. Needs either a distinct terminal state for deferred-by-decision, a list surface that includes archived recs carrying an unmet decision trigger, or a doc change making --archived mandatory in the dedup step.

## rec-20260804-004 — Two sibling worktrees each re-claim nearly every phase number 2-249, making worktree-phases a permanently-warning check

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: process, worktrees
- files: .claude/worktrees/
- evidence: git worktree list shows 3 entries (main + the two above). cadence doctor reports 'warning worktree-phases: phase number collision across worktrees' enumerating roughly 2..249, as 1 of 3 problems across 20 checks (exit 0). git log shows phases 246/247/248/249/250/251 all merged directly to main (PRs #365-#369), not via feat/kernel-assurance-v2. Phases 252+ (this release) are outside the collision footprint, so this release's own phases are unaffected.
- next: cadence milestone propose

cadence doctor's worktree-phases check reports a collision footprint spanning essentially the whole phase history, sourced from two worktrees: .claude/worktrees/kernel-arc-docs-review (feat/kernel-assurance-v2 @ 5d5ec8b6) and .claude/worktrees/phase249-refused-settle-post-gate (feat/post-gate-refusal-summaries-phase-249 @ e1aba70b). Both carry a full .cadence/phases tree, so every historical phase reads as contested. kernel-arc-docs-review in particular sits on a branch-naming convention (a long-lived feat/kernel-assurance-v2 feature branch) that phases 246-251 show has since been superseded -- work now lands directly on main -- suggesting this worktree may be an abandoned holdover. OPERATOR DECISION ONLY: per CLAUDE.md's Zombie Session rule, neither worktree may be removed until confirmed dead. Filing this to move the warning from untriaged to tracked, satisfying the v1.55 Definition of Done's 'no untriaged release-blocking warning' bar without touching either tree.

## rec-20260805-001 — docs.yml pins pnpm/action-setup@v4 while other workflows use @v6

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: ci
- files: .github/workflows/docs.yml
- evidence: grep -n action-setup .github/workflows/*.yml shows docs.yml:44 = @v4 vs ci.yml:32, release.yml:30, security.yml:61,94 = @v6 (found while filing phase 253 T7 doc note, 2026-08-04)
- next: cadence milestone propose

The docs workflow (.github/workflows/docs.yml:44) pins pnpm/action-setup@v4; ci.yml, release.yml, and both jobs in security.yml pin @v6. Minor version-pin drift, no known CVE — align docs.yml to @v6 for consistency.

## rec-20260805-002 — check-lockfile-overrides.mjs cannot detect an override floor that is stale relative to the real upstream patched version

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: security
- files: scripts/check-lockfile-overrides.mjs
- evidence: phase 253 (253-dependency-override-remediation) T5 independent review, 2026-08-05: reviewer identified this as a genuine scope boundary while verifying the detector's fail-then-pass evidence
- next: cadence milestone propose

The phase-253 detector (scripts/check-lockfile-overrides.mjs) only checks internal lockfile consistency: that a resolved instance satisfies its own declared pnpm.overrides target. It cannot catch a target whose floor is self-consistent with the lockfile but sits below the real current upstream patched version (the exact original failure shape phase 253 corrected for fast-uri/brace-expansion, where a stale-but-internally-satisfied override masked a still-vulnerable resolved version). Catching that class needs a live-vulnerability cross-check (pnpm audit's job, via scripts/check-audit-exceptions.mjs), not a lockfile-internal consistency check. Flagged by phase 253's T5 independent reviewer; recorded per the repo's Unlogged Audit Finding convention rather than left implicit.

## rec-20260805-003 — DRAFT parser's task action field silently truncates multi-line content to its first line

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 40%
- decay: fresh
- areas: core-parsing
- next: cadence milestone propose

packages/core/src/parse/draft-parser.ts's parseTasks extracts a task's action via a regex with no 's' flag (/-\s*action:\s*(.+)/), capturing only the first line. Any multi-line action body (e.g. a RUNBOOK-style block added after the first sentence) is silently dropped for every machine consumer that reconstructs task text from the parsed action field -- packages/core/src/dispatch/packet.ts and packages/core/src/verify/plan-review.ts both do this. Humans reading the raw DRAFT.md (and cadence draft check, which reads full section text) see the complete content; only field-level machine consumers lose it. Found during phase 255's T5 (255-01-DRAFT.md), which relies on a multi-line RUNBOOK for an unambiguous operator instruction -- confirmed via direct parseDraftMd test that task.action for T5 contains only the first line, dropping the RUNBOOK's ordering constraint and DONE-does-not-mean-executed disambiguation.

## rec-20260805-004 — js-ts coverage profile mismasks regex literals containing quote characters, silently corrupting downstream span detection

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 40%
- decay: fresh
- areas: core-verify
- evidence: Second independent occurrence, this time a backtick rather than a quote character (2026-08-05, phase 256-02 redo). packages/core/tests/docs/phase256-conduction-prep.test.ts line 63 originally read: expect(runbook).not.toMatch(/git commit[^`]*seeded-defect/) -- a bare backtick inside the regex's character class. Since mask.ts's classify() tracks backtick as a string/template delimiter identically to ' and ", this backtick opens a spurious template-literal mode that is never legitimately closed (no matching backtick appears later in the file), corrupting span detection for the rest of the file from that point on. Distinct from the quote-character case in one way worth recording: here the corrupting backtick sat INSIDE the very it() block it broke (256-02/AC-2, opening at line 46), not in an earlier block -- cadence verify coverage --explain AC-2 reported the block's own opening line as 'no containing span' (spans found: 1 for the whole file, should have been 2), because the corrupted mask meant the parser never found a valid closing brace for that block at all, not just that a later block absorbed extra content. This caused a real settle attempt (cadence settle run --allow-failing-build, 2026-08-05T04:00:28Z) to refuse at test-coverage before code-review/security-audit ever ran -- the exact real-provider certification this phase exists to produce was never reached because of this bug, not because of anything about the fixture. Fixed locally by replacing the regex with a plain string/line-based check (avoiding regex entirely for that assertion, not just avoiding the specific bad character) -- verified via cadence verify coverage --explain AC-1/AC-2 (both now satisfies: true, spans found: 2) and the test itself (2/2 passing) before resubmitting the settle.
- next: cadence milestone propose

packages/core/src/verify/coverage-profiles/mask.ts's classify() only knows string delimiters ', ", and ` (js-ts.ts's syntax.strings table) -- it has no concept of a /regex/ literal as a distinct construct. A regex literal containing an odd-parity sequence of unescaped ' or " characters (e.g. /needs\.audit\.result.*!=\s*["']success["']/ ) causes classify() to open a spurious string mode partway through the regex that is never legitimately closed, silently misclassifying all subsequent real code (including ) and } characters needed for paren/brace depth tracking) as string content until an unrelated later quote happens to resync it by coincidence. This corrupts findMatchingParenIndex/callExpressionBlock's span resolution for every it()/test() block between the triggering regex and the accidental resync point -- observed directly in phase 255's packages/core/tests/docs/security-ci.test.ts, where one such regex caused 3 of 5 new AC-tagged describe blocks to report 'token found but not inside any test block recognized by profile js-ts' despite syntactically correct, passing test code. Confirmed via cadence verify coverage --explain and fixed locally in that file by replacing embedded quote characters with hex escapes (\x27/\x22), but the underlying mask.ts/js-ts.ts gap is unfixed and would silently affect any other test file in the repo (or written in the future) whose regex-literal assertions embed a ' or " character with odd parity -- coverage could report false negatives (a real AC test wrongly refused) or, worse, false positives if the resync boundary happens to land such that an unrelated it() block's span absorbs content it shouldn't.

## rec-20260806-001 — conduction-reachability's session axis is a false positive when CADENCE_HOST_CLI_BIN=codex bypasses the claude-only self-invocation guard

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/activate/assess.ts, packages/core/src/verify/host-cli-client.ts, packages/core/src/doctor/run.ts
- evidence: cadence doctor's conduction-reachability check reported 'code-review: blocked by profile, session' on 2026-08-06 while this repo's CADENCE_HOST_CLI_BIN=codex (~/.bashrc:167) meant the session axis was not actually blocking -- confirmed by two real (non-mock) codex-backed per-task-verify calls succeeding in the same headless session, recorded in .cadence/phases/256-real-provider-certification-prep/256-01-PROGRESS.json
- next: cadence milestone propose

isClaudeCodeSession(env) (packages/core/src/activate/assess.ts:86-88) checks only CLAUDECODE==='1' and has no awareness of CADENCE_HOST_CLI_BIN. The actual self-invocation guard (isSelfInvocation, host-cli-client.ts:118-129) is keyed by SELF_INVOCATION_ENV_VAR, which only has an entry for the 'claude' family -- 'codex' is deliberately unguarded (no reliable session-indicator env var exists for it, per that file's own doc comment). When an operator sets CADENCE_HOST_CLI_BIN=codex (a sanctioned mechanism CLAUDE.md itself documents for getting independent review from inside a Claude Code session), any host-cli-configured gate's REAL spawn target is codex, not claude -- so the guard never fires regardless of CLAUDECODE, even inside a headless Claude Code session. conduction-reachability (phase 251) reports code-review as session-blocked purely from CLAUDECODE=1, which is wrong in this configuration: the profile axis is a genuine blocker but the session axis is not. Empirically confirmed 2026-08-06 during phase 256 prep: two per-task-verify calls (host-cli, family resolves to codex per this repo's own ~/.bashrc:167 CADENCE_HOST_CLI_BIN=codex) made real, non-mock calls from inside this Claude Code session, producing genuine LLM-judged verdicts (not MockPerTaskVerifier's deterministic output) -- see .cadence/phases/256-real-provider-certification-prep/256-01-PROGRESS.json's perTaskVerify.provider:host-cli entries with substantive, non-canned reason text. The check's overall 'warning' verdict for this repo is still correct today (security-audit is genuinely blocked on the provider axis, mock), so this hasn't caused a wrong overall status yet -- but the per-axis detail is misleading, and a future repo/config where code-review's provider axis is also already clear would get a false 'blocked' report for a gate that actually isn't.

## rec-20260806-002 — Code-review finding (medium): The instructed “stop and report” path skips Step 5b, leaving securityAudit.prov…

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: .cadence
- files: .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md
- evidence: phase 256-real-provider-certification-prep, draft 256-01, SUMMARY contentHash 51b2f95ce6ec4030acca94c1b1117abb7cd2555cb4cd23aaf0c627fa6a4c2fc8 — medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:106: The instructed “stop and report” path skips Step 5b, leaving securityAudit.provider as host-cli and the repo failing its baseline invariant. Require rollback before stopping.
- next: cadence milestone propose

medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:106: The instructed “stop and report” path skips Step 5b, leaving securityAudit.provider as host-cli and the repo failing its baseline invariant. Require rollback before stopping.

## rec-20260806-003 — Code-review finding (medium): The “stop and report” path skips Step 5b, leaving securityAudit.provider as hos…

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: .cadence
- files: .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md
- evidence: phase 256-real-provider-certification-prep, draft 256-01, SUMMARY contentHash 0e2b9d2da3c2d5076cd4afb28ce1bd27c9939f6d81b7d93fd6fa3a9d9c9d782d — medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:106: The “stop and report” path skips Step 5b, leaving securityAudit.provider as host-cli and the committed baseline failing its invariant.
- next: cadence milestone propose

medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:106: The “stop and report” path skips Step 5b, leaving securityAudit.provider as host-cli and the committed baseline failing its invariant.

## rec-20260806-004 — Real-provider verification gates (code-review, security-audit) silently produce empty findings when their touched files are already committed before settle runs

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/code-review.ts, packages/core/src/gates/security-audit.ts, packages/core/src/verify/security-audit.ts, packages/core/src/verify/code-review.ts
- decisions: dec-20260806-001 (active)
- evidence: 256-01-SUMMARY.json (2026-08-06T02:14:04.111Z): security-audit ran with provider host-cli and returned securityAudit: [] against a fixture with a hardcoded credential still in place, uncommitted-vs-HEAD diff confirmed empty via git diff HEAD -- fixture/seeded-defect.ts; code-review's sole finding that same settle was against CONDUCTION-RUNBOOK.md, the only touched file with real dirt vs HEAD
- evidence: Correction (verified 2026-08-05 via code read of packages/core/src/gates/security-audit.ts:296 and code-review.ts:336): the summary's claim that the verifiers 'early-return {findings: []} without ever spawning a real provider call' is inaccurate. The empty-diff guard is an AND, not an OR (if (input.files.length === 0 && input.diff.trim().length === 0)) -- non-empty touchedFiles skips the early return, so the real host-cli subprocess DOES spawn and receives '(no diff supplied)' as its diff, burning a live provider call before returning empty findings. Cost accounting for 256-01's void run: one real codex request was consumed, not zero. This also shifts the fix direction named in this rec's Summary -- 'a loud warning when diff is empty' is insufficient since the call has already fired by the time that's known; the fix needs to refuse (or skip) BEFORE spawning the provider call, not just warn after.
- evidence: Widened scope, discovered while authoring 256-02 (2026-08-05): MockSecurityAuditVerifier and MockCodeReviewVerifier (packages/core/src/verify/security-audit.ts:67, code-review.ts:113) ALSO early-return on input.diff.trim().length === 0 -- the mock path is diff-based too, not content-based. This means the empty-diff gap defeats the mock-provider safety net as well: docs/providers.md's documented 'run a mock dry run first to confirm the fixture is wired correctly before spending a real call' step gives no warning if the touched files are already committed at settle time -- it silently returns a clean pass instead of refusing, for the identical reason the real provider silently returned empty findings. If 256-01's WIP commit (9fb2eef6, 19:44) landed before the operator's own Step 0 mock dry run (timestamps suggest but do not prove this), that step was also a silent no-op that never surfaced as anomalous. This raises the fix's importance: an operator following the documented procedure gets no early signal at any stage, mock or real.
- next: cadence milestone propose

Every diff-scoped verifier gate builds its input from ctx.diff() = git diff HEAD -- <touchedFiles> (see packages/core/src/gates/code-review.ts, security-audit.ts). If those files are already committed (no working-tree delta vs HEAD), the diff is empty, and both HostCliSecurityAuditVerifier.verify and the equivalent code-review path early-return {findings: []} without ever spawning a real provider call to judge anything -- no error, no warning, a normal-looking 'ran' gate status with provider: host-cli in the persisted SUMMARY, and assurance.overall can still reach 'strong'. This is silent: nothing distinguishes 'gate ran and found nothing' from 'gate never actually reviewed anything because the diff was empty by construction'. Concretely hit during phase 256's real-provider certification (2026-08-06): the seeded-defect fixture was committed in a WIP prep commit before the real settle ran, so security-audit's real codex call saw an empty diff and returned no findings on an objectively hardcoded credential its own system prompt calls CRITICAL (bullet 1) -- producing a false 'strong' assurance record (256-01-SUMMARY.json) that looked like a valid real-provider pass. code-review's one finding in that same settle was real, but only because CONDUCTION-RUNBOOK.md had uncommitted edits -- it was the only file with an actual diff. This is a general trap for ANY future real-provider conduction attempt, not specific to phase 256: an operator following docs/providers.md's documented procedure would hit this whenever the phase's own artifacts happen to already be committed at settle time. Consider: a loud warning (or refuse) when a code-review/security-audit gate's provider is non-mock but its diff is empty and touchedFiles is non-empty (as distinct from the already-handled empty-touchedFiles case), so an empty-diff false pass can never look identical to a genuine clean pass.

## rec-20260806-005 — Code-review finding (medium): The Step 3 "stop and report" path bypasses Step 6, leaving securityAudit.provid…

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: .cadence
- files: .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md
- evidence: phase 256-real-provider-certification-prep, draft 256-02, SUMMARY contentHash b8cecf07e5576324289d22a5c1911f760c7a5c938abdce54fa100889754f27f3 — medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:180: The Step 3 "stop and report" path bypasses Step 6, leaving securityAudit.provider set to host-cli and the baseline config invalid.
- next: cadence milestone propose

medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:180: The Step 3 "stop and report" path bypasses Step 6, leaving securityAudit.provider set to host-cli and the baseline config invalid.

## rec-20260806-006 — build-test-must-pass silently swallows which test failed when bypassed via --allow-failing-build

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/build-test-must-pass.ts, packages/core/src/verify/test-runner.ts
- evidence: Reproduced directly: pnpm --filter cadence-core test -- tests/docs/self-application-config.test.ts with securityAudit.provider=host-cli shows the real AssertionError only when run standalone outside cadence settle; cadence settle run --allow-failing-build gave zero console output about which test failed, on the exact same repo state (2026-08-06).
- next: cadence milestone propose

packages/core/src/gates/build-test-must-pass.ts only writes a stderr notice on the refusal branch (line 37: '${res.command} exited ${res.exitCode}'); when a failing run is bypassed via --allow-failing-build or --force (line 47-51), the gate returns { outcome: 'pass', flags: { buildTestBypassed: true } } with NO stderr output at all. The subprocess itself is spawned via packages/core/src/verify/test-runner.ts's runTestCommand with stdio: 'ignore' -- the actual test output (which test failed, why) is never captured anywhere, not to the console, not to a log file, not into the SUMMARY. This means an operator who bypasses a failing build genuinely cannot find out which test failed without independently re-running the test command themselves outside cadence. This violates this repo's own documented convention (CLAUDE.md's 'Quiet Fallback' failure mode: 'every fallback and auto-bypass in this codebase prints a loud stderr notice and/or records provenance in the SUMMARY'). Discovered during phase 256-02's real-provider conduction (2026-08-06): the operator was asked to confirm a known, expected build-test-must-pass bypass was ONLY the anticipated self-application-config.test.ts failure and not something else -- and had to be walked through running pnpm test directly, outside cadence, to find out, since cadence itself gave zero signal. Fix direction: capture stdout/stderr from the test command (or at minimum a pass/fail-per-file summary) and print/record it on the bypass path too, not just the refusal path.

## rec-20260806-007 — code-review convergence budget persists across separate settle invocations, undocumented, counts bypassed attempts

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/verify/converge.ts, packages/core/src/gates/code-review.ts
- evidence: 256-02-CODE-REVIEW.json sidecar history (2026-08-06): 3 entries across 3 separate settle invocations (04:21:23 reloop, 04:33:28 reloop+bypassed:true, 04:43:22 escalate) against unchanged vulnerable content, then a 4th real invocation (05:08:23, different content -- the fixed counterpart plus a since-fixed test-file issue) still produced 1 finding and needed to be judged fresh, unaffected by the exhausted counter only because it happened to genuinely pass on the 6th attempt (05:20:09) -- confirmed via packages/core/src/gates/code-review.ts:126 that a genuine pass (highs.length===0) skips the attempt-budget check entirely, so escalate only bites on continued failures, but nothing surfaces the remaining budget before that point.
- next: cadence milestone propose

packages/core/src/verify/converge.ts's maxAttempts logic (nextConvergence: 'if (attempt >= maxAttempts) return escalate') reads attemptsSoFar from a persisted per-draft sidecar (<draftId>-CODE-REVIEW.json), not a per-invocation counter -- so the 3-attempt convergence budget (config.convergence.maxAttempts, default 3) is consumed across ALL separate 'cadence settle run' invocations for a draft, including ones where the operator passed --allow-code-review-failure to deliberately bypass a KNOWN, expected finding (the sidecar still records that as an attempt with bypassed: true and increments the counter). This is undocumented operator-facing behavior: docs/providers.md's conduction procedure and this repo's own runbooks give no indication that re-running settle (e.g. to reproduce output for review, or simply retrying after an unrelated fix) burns down a shared, finite budget that has nothing to do with whether the underlying code actually changed. Concretely hit during phase 256-02's real-provider conduction (2026-08-06): three real settle invocations against the SAME unchanged vulnerable fixture (expected, deliberate, per the runbook's own design) consumed all 3 attempts; a fourth invocation -- triggered only because the operator ran 'clear' in their terminal and had to re-run settle to reproduce output for the assisting session -- hit 'code-review did NOT converge after 3 attempts' before security-audit could run again, even though --allow-code-review-failure would have worked fine on that invocation too had it been included. No engine bug here (the escalate-after-3 mechanism is presumably intentional, forcing a human decision rather than infinite silent bypass-and-retry), but the SILENCE about it being cross-invocation and bypass-inclusive is the gap: an operator has no way to know 'you have N attempts left' before hitting the wall, and no visible signal distinguishes 'this attempt was consumed by a genuine failed fix attempt' from 'this attempt was burned by an incidental re-run.' Fix direction: either surface remaining-attempts count in the reloop/bypass stderr notices (e.g. 'code-review: --allow-code-review-failure set; proceeding past 2 HIGH finding(s). 1 attempt remaining before this draft requires --force.'), or reset/exclude the counter increment specifically when the SAME finding set repeats bypassed (distinguishing genuine iteration from incidental re-invocation).

## rec-20260806-008 — dec-20260801-003's 3-settle revisit trigger has been met -- worth a decision on whether to act

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/intelligence/finding-routing.ts, packages/core/src/verify/finding-identity.ts
- evidence: Counted directly from .cadence/phases/256-real-provider-certification-prep/*.json (2026-08-06): six settles, provider host-cli throughout, codeReview finding counts 2/2/3/1/2/1 respectively; dec-20260801-003's trigger text confirmed via cadence decision show / decisions.json read.
- next: cadence milestone propose

dec-20260801-003 (linked under the now-shipped/closed rec-20260801-010) deferred finding-identity message-drift dedup, with an explicit trigger to revisit: 'at least 3 settles under a non-mock review provider (anthropic/local/host-cli) have each persisted at least 1 code-review finding.' Phase 256-02's real-provider conduction (2026-08-06) produced SIX such settles under provider: host-cli, each persisting >=1 code-review finding: .cadence/phases/256-real-provider-certification-prep/256-02-refused-2026-08-06T04-21-23-042Z-SUMMARY-snapshot.json (2 findings), ...T04-33-37-866Z (2), ...T04-43-22-653Z (3), ...T05-08-23-709Z (1), ...T05-13-30-388Z (2), and the final 256-02-SUMMARY.json (1) -- double the trigger's threshold. This does NOT mean the deferred work should now be built reflexively: several of the six are repeat invocations against unchanged fixture content (deliberate, per the redo's own runbook design, not independent drift signal), and dec-20260801-003's own planned next step was specifically an offline analyzer over the accumulated SUMMARY.json corpus, which has not been built or run. This rec exists only to make the met trigger visible for a future decision -- act on it, defer again with updated reasoning, or determine the corpus still isn't representative enough (six settles from one seeded, single-defect-type fixture may not be what the original decision meant by 'real data'). Could not attach this as evidence directly to rec-20260801-010 -- recommendation evidence add refuses on shipped/closed recs by design.

## rec-20260807-001 — test-coverage gate (assertion mode) dedupes AC-token occurrences per-file by first-encountered, silently discarding a later genuinely-qualifying occurrence

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, verify
- files: packages/core/src/verify/coverage.ts
- evidence: Reproduced live during phase 258 settle (2026-08-07): cadence settle run --auto refused citing '258-01/AC-5 is mentioned but not inside a recognized asserting test block', while cadence verify coverage --explain AC-5 showed 'Overall: SATISFIED' for the same file/token at the same commit. Root-caused to packages/core/src/verify/coverage.ts's assertion-mode scan loop's per-file dedup (const key = [REDACTED] if (seen.has(key)) continue;) keeping only the first-encountered occurrence (a non-qualifying describe() title at line 568) over a later genuinely-qualifying it() block occurrence (line 821) in the same file. Confirmed by removing the earlier, redundant occurrence, which made settle pass immediately with no other change.
- next: cadence milestone propose

packages/core/src/verify/coverage.ts's assertion-mode scan (~line 140-142, the per-file token loop inside the mode==='assertion' branch) dedupes AC-token occurrences with 'const key = id@relPath; if (seen.has(key)) continue; seen.add(key);' -- keeping only the FIRST occurrence of a given AC token encountered per file, in file-scan (top-to-bottom) order, and silently discarding every later occurrence in that same file, including one that genuinely qualifies (is inside a real asserting it()/test() block). Hit for real during phase 258's settle (2026-08-07): the AC-5 regression test's file had the token 258-01/AC-5 in BOTH a describe() block title (line 568, earlier in the file, non-qualifying since describe wrappers are not spans) and the real asserting it() block title that actually carries the evidence (line 821, later in the file, genuinely qualifying). The dedup kept only the first (describe-title) occurrence, so weaklyLinkedAcs()'s isFullyNonQualifying(refs) check saw a single non-qualifying ref and refused settle with 'is mentioned but not inside a recognized asserting test block', even though a real qualifying test existed in the same file. cadence verify coverage --explain AC-5 did NOT reproduce this refusal -- explainAcCoverage (used by --explain) collects every occurrence separately with no per-file dedup, and its overall satisfied field is true iff ANY occurrence in ANY file satisfies -- so it correctly showed 'Overall: SATISFIED', creating a genuine, confusing divergence between what --explain reports and what settle's gate actually enforces for the exact same file/token. Worked around in phase 258 by removing the redundant token from the describe title (only the real it() block needs to carry it), but the underlying dedup-keeps-first-occurrence behavior is a real defect independent of that workaround: any test file where an AC token happens to appear first in a non-qualifying location (a describe title, a comment, a variable name) and later in a real qualifying it()/test() block will incorrectly refuse settle, with a --explain result that actively misleads an operator into thinking coverage is fine. Options to weigh: change the dedup to keep the qualifying occurrence if ANY occurrence for that (id, file) pair qualifies, rather than keeping strictly the first found; or align --explain's semantics with the gate's per-file-first-occurrence semantics (worse, since it would make --explain lie in the other direction); or drop the per-file dedup granularity entirely and just check 'does at least one occurrence across the whole repo qualify', matching --explain.

## rec-20260807-006 — tests/hooks/dispatcher.test.ts Windows CI timeout, recurred 3x during v1.55.0 release-cut

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, ci, testing
- files: packages/core/tests/hooks/dispatcher.test.ts
- evidence: gh run view 31211368719 (main push, commit c23e1092/fb84baab) -- test (windows-latest, 22) failed 3 consecutive reruns, all with identical FAIL tests/hooks/dispatcher.test.ts > HookDispatcher > skill-invoke caps at 100 entries with FIFO drop / Error: Test timed out in 90000ms at dispatcher.test.ts:96:3. Local isolated run (npx vitest run tests/hooks/dispatcher.test.ts on this Windows dev machine): 9/9 passed in 2.35s. Contrast: gh run view 31213678405 (PR #384's own CI) -- test (windows-latest, 22) passed in 12m18s on the same underlying content.
- next: cadence milestone propose

Under the full turbo test suite (401 files, maxWorkers:12) on windows-latest CI, tests/hooks/dispatcher.test.ts > HookDispatcher > skill-invoke caps at 100 entries with FIFO drop (105 sequential dispatch() calls, each a SimpleStateBackend atomic write) timed out at 90000ms 3 times in a row on the identical commit (main push runs for c23e1092/fb84baab), 2026-08-07. Ran the same test file in isolation locally on Windows: passed in 2.35s (9/9), ruling out a logic defect -- points at CI-runner resource contention under full parallel load, consistent with this repo's documented tempRepo/spawn Windows-CI-flake class (CLAUDE.md 'The Windows Panic'). Notably PR #384's own fresh CI run (same full suite, same content) passed windows-latest clean on the first attempt (12m18s), so it is not fully deterministic -- intermittent under load, not a hard regression. Landed right after phase 260's vitest 2->4 upgrade; worth watching whether frequency is elevated vs pre-260 baseline, and whether CLAUDE.md's Flake Reflex known-reference list should add this alongside the existing macOS settle-codereview-convergence.test.ts entry if it keeps recurring.

## rec-20260807-005 — Make phase-qualified the default AC coverage scheme (bare still ships collision bug)

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: gates, verify, init, config
- files: packages/types/src/config.ts, packages/core/src/gates/coverage.ts, packages/core/src/verify/coverage.ts
- evidence: Confirmed live 2026-08-07 during phase 261 prep: config.ts:227,252,577 all default coverageScheme to 'bare'; only this repo's own .cadence/config.json overrides to phase-qualified.
- next: cadence milestone propose

Phase 239 (PR #338) shipped an opt-in coverageScheme='phase-qualified' token scheme that closes the cross-phase AC-N token collision (originally rec-20260729-004). But 'bare' remains the DEFAULT for every fresh cadence init and every other cadence-managed project (packages/types/src/config.ts:227,252,577) -- this repo dogfoods the fix for itself only, via its own .cadence/config.json. Decide whether phase-qualified should become the default: weigh against the AC-N token convention documented in CLAUDE.md and asserted by packages/core/tests/verify/, backward compat for pre-239 test files written against bare tokens, and the v2.0.0-reserved semver policy (breaking changes ship as minor until full coupling).

## rec-20260808-001 — cadence doctor: content-agnostic release-drift check via git-tag-distance

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: doctor, release-process
- files: packages/core/src/doctor/run.ts
- evidence: Independent fresh-context review of 262-01-DRAFT.md (2026-08-08) verified the 2026-07-27 incident (commit 127a06b0, v1.51.1 tag) via git log/tag inspection and confirmed a tag-distance check would catch the whole class, not just engines drift.
- next: cadence milestone propose

release-currency (phase 262) is scoped to comparing published vs local 'engines' content only, since that was the exact field behind the 2026-07-27 incident. A strictly stronger, content-agnostic, offline detector exists: local version == published version AND 'git log v<version>..HEAD' is non-empty means main has unreleased commits sitting under an already-published version tag, regardless of which field changed (deps, bin, exports, plain source). Surfaced by independent review during phase 262 DRAFT authoring; deliberately out of scope for 262 to avoid scope creep -- filed as a follow-on.

## rec-20260808-007 — deep-verify and per-task-verify persist no provider/model identity into gates[] at all

- status: deferred
- ready: blocked
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/deep-verify.ts, packages/core/src/gates/per-task-verify.ts, packages/core/src/gates/assurance-record.ts
- decisions: dec-20260808-008 (active), dec-20260811-002 (active)
- evidence: grep -n 'verifierIdentity|result.provider|result.model' packages/core/src/gates/deep-verify.ts packages/core/src/gates/per-task-verify.ts (2026-08-08): deep-verify hits are deepVerify[]/deepVerifyMeta only, never flags.verifierIdentity; per-task-verify has zero hits
- next: cadence milestone propose

Discovered during phase 263 (v1.56 Phase L) T3 dispatch prep: GateProvenanceZ.provider/.model are documented as 'currently populated only for code-review and security-audit' (packages/types/src/summary.ts), confirmed by direct read -- deep-verify.ts writes provider/model only into its separate deepVerify[]/deepVerifyMeta records, never into a gates[] entry's flags.verifierIdentity; per-task-verify.ts persists no provider identity anywhere (zero matches for verifierIdentity/result.provider in the file). This is a materially larger gap than phase 263's providerSelection distinction: these two gates have no baseline provider identity to extend in the first place. It also interacts with deriveAssuranceRecord's hasRealVerifier (verifierRollup.some(v => v.provider !== 'mock')): since this repo's perTaskVerifier.provider and verifier.provider are both already host-cli, naively adding baseline persistence to either gate would grow verifierRollup with real host-cli entries on ordinary auto-profile settles, silently moving assurance.overall toward strong with no review gate having actually run -- a live instance of the exact false-confidence failure mode v1.56 exists to close. Phase 263 deliberately excludes both gates from its providerSelection persistence scope (see dec-<this-decision-id> and the DRAFT's Boundaries) rather than papering over this pre-existing gap.

## rec-20260809-001 — scanTestCoverage dedups AC-token occurrences per-file by first match only, dropping later qualifying refs

- status: candidate
- ready: ready-for-cadence-spec
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/verify/coverage.ts
- evidence: Reproduced via a direct scanTestCoverage() call against phase 264's own worktree: AC-4 returned only the describe()-level non-qualifying ref (line 25) while cadence verify coverage --explain AC-4 independently found and reported satisfies:true for the it()-level refs at lines 26/30 in the same file, overall verdict SATISFIED -- yet settle run --auto refused, confirming the two code paths disagree because of the per-file first-match dedup in scanTestCoverage.
- next: cadence milestone propose

packages/core/src/verify/coverage.ts's scanTestCoverage (assertion mode, ~line 140-142; mirrored in mention mode ~line 177-179) dedups by a (bare AC id, file path) key, keeping only the FIRST textual occurrence of a token in a file regardless of whether it qualifies (sits inside an asserting it()/test() block). When a describe() block's title repeats its own child it()'s AC token and appears earlier in the file, the non-qualifying describe-level occurrence consumes the dedup slot and the real qualifying it()-level occurrence(s) are silently never recorded -- producing a false weakly-linked-AC refusal from settle's real coverage gate even though cadence verify coverage --explain (a separate, non-deduping walker) correctly reports the AC as satisfied. Confirmed empirically during phase 264's own settle: two describe() blocks (mock-banner-source.test.ts, verifier-label.test.ts, assurance-record.test.ts) that opened with the same AC token as their child it()'s title caused settle run --auto to refuse with 'no assertion-shaped span found' for AC-4/AC-5 despite real, correct, asserting tests existing. Worked around by removing the token from the describe() titles (not touching the scanner). Fix belongs in scanTestCoverage: either record every occurrence per file (not just the first), or prefer a qualifying occurrence over a non-qualifying one when only one dedup slot is kept.

## rec-20260809-003 — vitest.shared.ts's Windows-timeout comment cites the now-fixed dispatcher cap test

- status: candidate
- ready: ready-for-cadence-spec
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: test-infra
- files: vitest.shared.ts
- evidence: Flagged by phase 266's T2 independent reviewer while confirming the full suite was green; out of phase 266's declared task file scope (no task's files: list includes vitest.shared.ts), so not fixed inline.
- next: cadence milestone propose

vitest.shared.ts:16-19 justifies TIMEOUT_MS=90000 on win32 partly by citing 'the dispatcher cap test (105 sequential dispatch() calls, each doing multiple disk read/writes)' as historical evidence. Phase 266 rewrote that exact test (packages/core/tests/hooks/dispatcher.test.ts, the skill-invoke FIFO-cap test) to call a pure in-memory function instead, with zero disk I/O -- the comment's specific example is now stale, though the general 90000ms value likely still has other justification (CLI-spawning settle tests, general Windows CI slowness) and should not be casually lowered without separately re-measuring those.

## rec-20260809-004 — README.md / packages/core/README.md still claim cadence init --demo is zero-prompt

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- files: packages/core/README.md
- evidence: grep -n 'zero prompt' README.md packages/core/README.md both show the same stale comment at README.md:123 and packages/core/README.md:45
- next: cadence milestone propose

Phase 265 made cadence init present the verifier-provider choice explicitly (a real prompt) whenever a prompter is available (TTY or CADENCE_PROMPTER_SCRIPT) and no --verifier-provider/--activate/--full flag settles it. docs/reference/commands.md was corrected in phase 265 T5, but README.md:123 and packages/core/README.md:45 both still show 'cadence init --demo # zero prompts: name + gate profile are derived' as an example comment -- true for name/gate-profile specifically but now potentially misleading for the whole invocation under a TTY. Low priority, cosmetic; found while reviewing phase 265's T5 (docs task) which correctly scoped its own fix to commands.md but flagged these two files as out of its declared boundary.

## rec-20260809-005 — Prompter-desync foot-gun has now bitten twice (settle phase 174, init phase 265) -- systemic fix overdue

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli
- files: packages/core/src/cli/commands/init.ts
- evidence: prompter.ts:84-103's own docstring documents the settle-side instance and defers the fix (Phase 174); init.ts's whole-branch review (phase 265) independently found and locally fixed a second instance in cadence init
- next: cadence milestone propose

packages/core/src/verify/prompter.ts's createDefaultPrompter/init.ts's makePrompter both build a brand-new ScriptedPrompter (cursor reset to 0) on every call, with no memoization. Phase 174's whole-branch review first found this for cadence settle (gates/interactive.ts's interactive-verdict gate + services/retro.ts's post-commit retro offer can both prompt in one settle run) and explicitly deferred a real fix as out-of-phase-scope, noting it needs matching close()-lifecycle changes across every existing caller. Phase 265's whole-branch review independently hit a NEW instance of the exact same bug class in cadence init (the new verifier-provider prompt + the pre-existing host-wire prompt could both fire in one init run) and fixed it locally with a per-command memoized getPrompter() closure -- a real but narrow patch, not the systemic fix Phase 174 already flagged as needed. Two independent commands have now each grown their own scripted-prompter-lifecycle workaround. Worth a real fix: one process-run-scoped Prompter singleton (or equivalent shared factory with proper close() ownership) that every prompt call site in a given cadence invocation reuses, closing it once at the very end -- eliminating this whole class of CADENCE_PROMPTER_SCRIPT desync risk rather than patching it per-command as it's rediscovered.

## rec-20260809-006 — cadence onboard reports live config readiness, not the recorded provider-selection decision

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/cli/commands/onboard.ts
- evidence: phase 265's DRAFT AC-5 deliberately scoped only the no-reprompt half after advisor review; rec-20260808-006's shipped promotion notes this remainder explicitly rather than overclaiming full delivery
- next: cadence milestone propose

rec-20260808-006's original text asked that cadence onboard 'report the existing selection rather than re-prompt' -- phase 265 (which closes the rest of that rec) delivered only the negative half: onboard is regression-tested to never gain a provider-selection prompt. It still reports assessReadiness's live config-derived state (provider/keyPresent/ready/reason), not the specific recorded decision from .cadence/intelligence/decisions.json (title/rationale/timestamp of how the choice was made -- prompted, flagged, or defaulted). These usually agree in practice (config reflects the recorded choice), but onboard cannot currently answer 'when/how was this chosen' the way cadence decision list can -- a teammate onboarding onto an existing repo sees the readiness state but not the provenance. Low/medium priority: consider onboard surfacing the most recent matching decision's rationale alongside assessReadiness's report, or a documented pointer to cadence decision list.

## rec-20260811-003 — conduction-drift-streak will chronically warn: ~90% of phases cannot reset it by construction

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/doctor
- files: packages/core/src/doctor/run.ts
- evidence: tier distribution across 282 drafts: standard 233 (82.6%), complex 29 (10.3%), quick-fix 20 (7.1%); under profile=standard only complex tier includes code-review (deltas: standard x complex has code-review, deep-verify), so only ~10% of phases can reset the streak; threshold is 3; current streak is 2 as of 2026-08-11 (re-verify before acting -- this figure moves every settle); dec-20260803-001 designates conduction as deliberately operator-initiated
- next: cadence milestone propose

Under profile=standard only complex-tier drafts include code-review, and complex is only ~10% of drafts historically, so ~90% of settles can never reset the conduction-drift-streak counter. dec-20260803-001 designates conduction as deliberately operator-initiated, so the check flags as drift what a standing decision designates as policy. Worth a decision on whether the streak/threshold model still fits that policy.

## rec-20260811-004 — milestone close/status has no CLI path when its recommendation ships out-of-band of accept/export/build

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/intelligence
- files: packages/core/src/cli/commands/milestone.ts
- evidence: cadence milestone close mil-rec-rec-20260808-003 -> 'milestone close refused: cannot close milestone in status proposed'; CMD-5 (docs/handoffs/HANDOFF-v1.56-release-closeout.md) reports this as the sole desynced milestone as of 2026-08-11; recorded rather than hand-edited per that handoff's Q.3 and the project's no-hand-edit-intelligence-ledger rule
- next: cadence milestone propose

mil-rec-rec-20260808-003 stays status=proposed even though its sole recommendation (rec-20260808-003) is already shipped, because the work landed directly as a phase (268) rather than through the normal milestone accept->export->build flow. cadence milestone close refuses with 'cannot close milestone in status proposed' since it only accepts an exported milestone -- there is no transition for a proposed/accepted milestone whose recommendation(s) shipped by a different path. Same class of gap as rec-20260803-001 (no CLI path corrects a shippedRef on an already-shipped rec) but on the milestone state machine instead of the recommendation ledger.

## rec-20260811-005 — ROADMAP.md missing ### Phase N entries for phases 239-241 (exist on disk, never landed under those headings)

- status: candidate
- ready: ready-for-cadence-spec
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- files: .cadence/ROADMAP.md
- evidence: grep -n 'Phase 239\|Phase 240\|Phase 241' .cadence/ROADMAP.md returns only one incidental hit inside phase 236's prose, no heading for any of the three; all three have completedAt dates and merged PRs (#338, #332, #334) confirming real, shipped work
- next: cadence milestone propose

Phases 239 (coverage-phase-scoping, #338), 240 (doctor-multi-seam-readiness, #332), and 241 (anchor-ladder-reachability, #334) all exist on disk with completed SUMMARY.json records and shipped PRs, but ROADMAP.md has no ### Phase N heading for any of the three -- only an incidental mention of 241 inside phase 236's prose. Discovered while researching phase 271's roadmap-currency backfill; left unfixed there since the AC only required drift <= 10 (already satisfied without touching 239-241) and the handoff's own scope discipline (do not add scope) applied. MILESTONES.md now documents all three under a date-derived v1.52.0 section (phase 271 backfill).

## rec-20260811-006 — macOS CI: demo-gutting-coverage-scheme.test.ts hits 20s timeout under load

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: testing, ci
- files: packages/core/tests/integration/demo-gutting-coverage-scheme.test.ts, vitest.shared.ts
- evidence: PR #397 macos-latest leg: run 31447771306, failed job 93645562270 (20s timeout), rerun job 93655957205 passed 6m54s with no code change; local Node22 run 1.75s clean; main's last 6 CI runs green
- next: cadence milestone propose

tests/integration/demo-gutting-coverage-scheme.test.ts (phase 270's run-demo.sh e2e test, spawns npm test x2 + cadence settle run --auto x2) timed out at vitest's 20s default on macos-latest in PR #397's run 31447771306 (job 93645562270), while ubuntu-latest and windows-latest passed the same run and it runs in ~1.75-2.3s locally on Node 22. A same-run rerun (job 93655957205) passed clean in 6m54s with zero code changes -- confirms load-dependent flake, not a logic bug. main's prior 6 CI runs were all green on this test. vitest.shared.ts already scales TIMEOUT_MS to 90000 on win32 for the same class of slow child-process-spawn issue via a documented single-source-of-truth pattern (explicitly rejecting per-test overrides); if this recurs, the same darwin-scoped bump is the precedented fix -- but it trades off loosening the timeout for ~4000 other macOS tests to accommodate one outlier, so needs an explicit operator call, not a reflexive bump.

## rec-20260811-007 — Code-review finding (high): CI runs on Windows, where `grep` is not guaranteed on PATH; this test throws EN…

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: packages/core
- files: packages/core/tests/docs/phase272-assurance-correctness.test.ts
- evidence: phase 272-assurance-record-correctness, draft 272-01, SUMMARY contentHash 36b06bb1804268e27aaf3dbbaf581dfbb7859c34f610409f571069e6765bfecf — high finding at packages/core/tests/docs/phase272-assurance-correctness.test.ts:60: CI runs on Windows, where `grep` is not guaranteed on PATH; this test throws ENOENT. Use a Node-only line count or skip it on win32.
- next: cadence milestone propose

high finding at packages/core/tests/docs/phase272-assurance-correctness.test.ts:60: CI runs on Windows, where `grep` is not guaranteed on PATH; this test throws ENOENT. Use a Node-only line count or skip it on win32.

## rec-20260812-001 — resume drops the dangling-lastHandoff-pointer signal when no fallback doc exists at all

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: resume, handoff, state-tracking
- files: packages/core/src/handoff/locate.ts, packages/core/src/handoff/run-resume.ts
- evidence: Found during phase 273's independent T2 review (2026-08-11): confirmed by reading locate.ts's null-return path and run-resume.ts's found:false branch.
- next: cadence milestone propose

locateFreshestHandoff's new danglingPointer signal (phase 273) is only surfaced when the fallback glob finds at least one other SESSION-*.md to serve. When lastHandoff is dangling AND no SESSION-*.md exists anywhere in .cadence/handoff/, locateFreshestHandoff returns null, localResolve returns { found: false }, and the operator just sees 'resume: no handoff found' with zero indication that state.json actually pointed somewhere real. Deliberately out of scope for phase 273 (AC-1's Given required at least one fallback doc to exist); worth a small follow-up to thread the dangling filename into the not-found path too.

## rec-20260812-002 — classifyAcObservability's negation-clause-boundary heuristic is fragile to punctuation adjacent to the trigger phrase

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/verify, core/gates
- files: packages/core/src/verify/criteria-observability.ts
- evidence: Phase 274 T1 independent review round 2 (negation ;/em-dash gap on real 261-01 AC-7 text) and T2 independent review (synthetic deploy-log.txt clause-boundary construction) -- both 2026-08-12
- next: cadence milestone propose

Two independent reviewers of phase 274's criteria-observability.ts found real gaps in hasNegationInClause's naive period/newline clause-boundary scan: (1) a semicolon or em-dash between a negation word and the trigger token is not treated as a boundary, so a real negation on the far side of a ; is missed -- confirmed on real corpus text (261-01-DRAFT.md AC-7), safe direction (produces a false observable, not the dangerous false unobservable). (2) A period inside an unrelated token (e.g. a filename like deploy-log.txt) between two distinct clauses can cause a signal match in the first clause to fire unobservable even though a later clause in the same sentence explicitly disclaims the SUMMARY reference -- constructed synthetically, not found in the real 1,310-AC corpus (validated twice, zero real false positives). Both point at the same root cause: a real sentence/clause boundary needs smarter detection than raw period/newline splitting. Neither gap blocked phase 274's own settle (D-G's own asymmetric-safety and staged-rollout rationale accepts this residual risk for v1.57, matching the 0.8%-population reasoning already used to defer DRAFT-time refusal to v1.58).

## rec-20260812-003 — renderSummaryMd splices operator/verifier free text into SUMMARY.md unsanitized -- an unbalanced code fence corrupts everything after it

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/parse
- files: packages/core/src/parse/summary-writer.ts
- evidence: Phase 274 T6 independent review, 2026-08-12: reproduced markdown-corruption via t.notes with an unbalanced code fence, confirmed unrelated to T6's own change
- next: cadence milestone propose

renderSummaryMd (packages/core/src/parse/summary-writer.ts) has never sanitized free-text fields it splices into the Markdown sidecar: ac.note, t.notes (operator-supplied via 'build task --notes'), g.skipReason, b.reason (--force justification), and now (phase 274 T6) the classifier's unobservable reason. Confirmed by phase 274 T6's independent reviewer: constructing a reason/notes string containing an unbalanced markdown code fence corrupts every section after it when the SUMMARY.md is viewed through an actual CommonMark renderer (verified with python-markdown, same lazy-continuation rules as GitHub) -- reproduced with zero T6 code involved, using only t.notes. Not a new defect, not introduced by phase 274 -- a repo-wide gap in the renderer shared by at least 5 free-text fields.

## rec-20260812-004 — scanTestCoverage's per-file AC-token dedup silently drops evidence when multiple asserting it() blocks share one token

- status: candidate
- ready: needs-evidence
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/verify
- files: packages/core/src/verify/coverage.ts
- evidence: packages/core/src/verify/coverage.ts:140-142 (assertion-mode dedup key); phase 274 real deep-verify refusals on AC-1 and AC-3 (settle-attempt4.log); packages/core/tests/services/settle.test.ts:1682,1737,1819 (unfixed AC-4 residual instance)
- next: cadence milestone propose

packages/core/src/verify/coverage.ts:140-142 dedups matched AC tokens by `${acId}@${relPath}` alone (no line number) — when two or more genuinely asserting it()/test() blocks in the SAME FILE carry the SAME qualified AC token (a natural, encouraged pattern: one token per AC, multiple tests proving different sub-claims), only the FIRST occurrence in file order survives in the returned TestRef[]; every subsequent real assertion is silently invisible to the test-coverage gate, evidence-floor derivation, and deep-verify's VerifyInput.tests linkage. Confirmed empirically in phase 274's own build: a real, non-mock deep-verify gate refused settle twice over exactly this (AC-1's six-fixture corpus test collapsed to appearing as one fixture; AC-3's two-fixture pair collapsed to appearing as only the first fixture), diagnosed by direct inspection of scanTestCoverage's output and fixed locally by consolidating the affected file's per-AC assertions into one it() each (packages/core/tests/verify/criteria-observability.test.ts). A third, same-shape instance was found but NOT fixed (out of scope/time for phase 274): packages/core/tests/services/settle.test.ts has three separate asserting it() blocks carrying the literal token 274-01/AC-4 (lines 1682, 1737, 1819) — only line 1682's test currently survives dedup; deep-verify has not (yet) flagged this, but the same structural gap is present and could surface on a future settle attempt or after any reordering. This is a pre-existing, repo-wide gap (not introduced by phase 274) affecting any test suite with this natural multi-test-per-AC shape — silent evidence loss is the exact failure direction CLAUDE.md's 'Token Drop' pattern warns about, just from the opposite structural cause (dedup collision, not comment-only mention).

## rec-20260813-001 — Code-review finding (medium): Exported mutable gate tables can be changed by any importer, altering later `ga…

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: packages/core
- files: packages/core/src/gates/engine.ts
- evidence: phase 274-unobservable-criteria-classification, draft 274-01, SUMMARY contentHash 2bf2cc959a487b419d2d98847674fa31cc764ba573122e48b22dde059c324699 — medium finding at packages/core/src/gates/engine.ts:22: Exported mutable gate tables can be changed by any importer, altering later `gatesFor()` results. Expose frozen/read-only data or copies instead.
- next: cadence milestone propose

medium finding at packages/core/src/gates/engine.ts:22: Exported mutable gate tables can be changed by any importer, altering later `gatesFor()` results. Expose frozen/read-only data or copies instead.

## rec-20260813-002 — SUMMARY.json cannot distinguish operator-configured mock from a silent host-cli verifier fallback

- status: candidate
- ready: needs-evidence
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/verify
- files: packages/core/src/verify/verifier-factory.ts
- evidence: 274-01-SUMMARY.json (deepVerify provider:mock for all ACs despite host-cli configured, code-review's own gate entry in the same SUMMARY succeeding via host-cli/configured); verify/verifier-factory.ts wrapWithFallback + tagProviderSelection (non-enumerable tag)
- next: cadence milestone propose

verify/verifier-factory.ts's wrapWithFallback (createVerifierFactory) transparently redirects any HostCliError (self-invocation, binary-not-found, spawn error, unparseable output) to MockVerifier, tagging the result providerSelection:'fallback'. That tag is set non-enumerable, so it never serializes into SUMMARY.json's gates array or deepVerifyMeta -- a durable settle artifact carrying provider:'mock' looks byte-identical whether the operator genuinely configured mock or a real host-cli call silently failed mid-settle. Confirmed empirically during phase 274's own build: its final accepted 274-01-SUMMARY.json shows deepVerify provider:'mock' for all 6 ACs with MockVerifier's own deterministic reason-string format, even though .cadence/config.json configures verifier.provider:'host-cli' and this exact settle run's own code-review gate (same run, same diff) DID succeed via real host-cli moments earlier -- deep-verify's specific call independently hit its own HostCliError. This is a real instance of this repo's own 'Quiet Fallback' failure mode (CLAUDE.md): every fallback is supposed to print a loud stderr notice and/or record provenance in the SUMMARY; this one does neither in the durable artifact. Did not block phase 274 (assurance.evidenceTally showed ai-verified:0, executed:6 -- no AC's PASS rested on the mock deep-verify judgment), but the gap means an operator reading a settled SUMMARY.json cannot tell 'real AI verification happened' from 'it silently fell back' without cross-referencing stderr logs from the original run, which aren't retained.

## rec-20260813-003 — classifyAcObservability's SUMMARY_TOKEN regex lacks a trailing word-boundary guard (SUMMARYFOO/SUMMARYs still match as bare SUMMARY)

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/verify
- files: packages/core/src/verify/criteria-observability.ts
- evidence: packages/core/src/verify/criteria-observability.ts SUMMARY_TOKEN regex; whole-branch review's direct node -e regex probing; full-corpus scan (1237 ACs, one benign occurrence in 244-01-DRAFT.md AC-2)
- next: cadence milestone propose

verify/criteria-observability.ts's SUMMARY_TOKEN regex (/\bSUMMARY(?:\.(?:json|md)\b)?(?!\.\w)/g) was fixed this phase (274) to stop matching SUMMARY.mdx/SUMMARY.yaml (a real code-review HIGH finding) via a (?!\.\w) negative lookahead guarding the dot-extension case specifically. An independent whole-branch review of that fix found the guard doesn't extend to a trailing word-boundary in general: text containing SUMMARY_TOKEN, SUMMARYFOO, or SUMMARYs still matches as a bare SUMMARY token, since the lookahead only excludes a following '.'+word-char, not any following word character. A full real-corpus scan (1237 parseable DRAFT ACs) found exactly one occurrence of this shape (244-01-DRAFT.md AC-2's 'pre-existing SUMMARYs') and it produced zero false positive, since it doesn't sit near any of the classifier's narrow trigger phrases -- so this is a real but currently benign gap, same root-cause family as rec-20260812-002's negation-boundary fragility (both are edge cases in the classifier's structural pattern-matching, deferred per D-G's staged-rollout rationale rather than fixed, given zero real-corpus manifestation).

## rec-20260813-004 — engine.ts's exported DELTAS/ALWAYS_FIRE tables are mutable at the type level (code-review MEDIUM, still open)

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/gates
- files: packages/core/src/gates/engine.ts
- evidence: packages/core/src/gates/engine.ts DELTAS/ALWAYS_FIRE exports; 274-01-CODE-REVIEW.json / 274-01-SUMMARY.json codeReview field (MEDIUM finding, disposition: open)
- next: cadence milestone propose

Phase 274's T7 fix exported gates/engine.ts's previously-module-private DELTAS and ALWAYS_FIRE consts (Record<Profile, Record<Tier, Gate[]>> and Gate[] respectively) so a test could assert DELTAS.standard.complex directly, per AC-6's literal Then-clause requirement. This phase's own code-review gate flagged a MEDIUM finding on the export: the exported tables are mutable at the type level (plain Gate[] arrays, not readonly/as-const), so any future importer could in principle mutate the single source-of-truth gate matrix at runtime with no compiler error. Confirmed still recorded only as disposition:'open' in 274-01-SUMMARY.json's codeReview field -- never independently filed as a recommendation. Object.freeze would only be a shallow, cosmetic fix (nested arrays stay mutable); a real fix needs 'as const' plus readonly types on both exports, which the current callers (engine.ts's internal DELTAS/ALWAYS_FIRE lookups, engine.test.ts's read-only assertions) would tolerate without change, but wasn't attempted in phase 274 to keep that fix minimal and narrowly scoped to AC-6's literal requirement.
