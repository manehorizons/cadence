# SETTLE Summary — 289-01

**Completed:** 2026-08-22T18:24:17.031Z
**Content hash (sha256):** ecaced52f14cb6f013a6317fca056ee8950ed8c4317b1e17bb48ef771cd4fd06

## Acceptance Criteria

- AC-4: PASS (unverified) — Proven via real dispatched sub-agent (Agent tool, --execution dispatch) with CADENCE_READ_ONLY set in the primary checkout's .claude/settings.json env block; child process refused a ledger write with the guard's own message, captured verbatim in T4's PROGRESS.json note. Not test-coverable by design (proof-only task, no files declared).
- AC-1: PASS (executed)
- AC-2: PASS (executed)
- AC-3: PASS (executed)
- AC-5: PASS (ai-verified)
- AC-6: PASS (ai-verified)

## Tasks

- T1: DONE — Third revisit, driven by a real code-review gate (host-cli, ran during D-AN's --force settle) finding a genuine HIGH-severity structural gap: writeLedger (packages/core/src/intelligence/store/ledger.ts) is the shared low-level primitive under all four guarded wrapper functions but was itself exported, directly importable, and unguarded -- nothing structurally stopped a future caller that imports ledger.js directly (skipping all four wrappers) from mutating any ledger under CADENCE_READ_ONLY. Verified via repo-wide grep before fixing: today only the four wrappers and ledger.test.ts's own unit tests call it, so no current caller exploits this, but the exposed surface contradicted AC-1's 'structurally refused at the write layer' claim. Fixed: added assertNotReadOnly('writeLedger') as the function's own first statement -- a no-op on all four existing call paths (which already guard earlier with more specific operation names), closing the primitive itself for any future direct importer. New test in ledger.test.ts (which already imports writeLedger directly for its generic-primitive tests via a fake widget subject spec): 289-01/AC-1, 289-01/AC-5 direct call under CADENCE_READ_ONLY refuses with the guard's message and never creates the file. Operator explicitly authorized this fix-and-re-settle before starting ('Yes, authorized to fix and re-settle') -- this was reported and approved, not decided unilaterally, since it surfaced only after the phase had already settled once under D-AN's --force. Re-verified: typecheck clean, full suite green (24/24 turbo tasks), ledger.test.ts 15/15 (was 14, +1), cadence verify coverage --explain reports SATISFIED for AC-1 and AC-5 (both unaffected in scope, strengthened in substance).
- T2: DONE — Fix round driven by settle's independent deep-verify pass (host-cli provider, real): refused AC-1 for lacking a CLI-subprocess (process-level, non-zero exit) refusal test across all AC-1-enumerated mutating subcommands -- read-only-guard.test.ts's direct-import tests satisfy AC-5 but not AC-1's literal 'it exits non-zero' wording, which is a claim about the cadence <command> process. Also flagged AC-3 as thin (only decision add / recommendation add / recommendation list exercised, not every enumerated command). Added 11 new real-CLI-subprocess tests to read-only-mode.test.ts: 7 for 289-01/AC-1 (decision add, decision supersede-as-transition, assumption add, assumption validate-as-transition, milestone propose, intelligence reconcile, recommendation add -- each asserting non-zero exit, the guard's message on stderr, and the ledger file either absent or byte-unchanged) and 4 for 289-01/AC-3 covering the same enumerated set with CADENCE_READ_ONLY unset (decision supersede, assumption add+validate, milestone propose, intelligence reconcile -- each asserting success). Probed exact CLI stdout/stderr shapes empirically first (scratchpad probe scripts) before writing assertions, per this repo's 'measure, never predict' rule. Deep-verify's separate observation that 'cadence settle catches a guard refusal while advancing a recommendation, then succeeds silently' is a distinct, real, pre-existing gap in settle.ts outside this phase's declared file boundaries -- filed as rec-20260822-004 (not fixed in-phase) and cross-referenced from docs/reference/commands.md's CADENCE_READ_ONLY section as a known gap; not treated as an AC-1 violation since cadence settle itself is not one of AC-1's named subcommands. Re-verified: typecheck clean, full suite 447/4383 green (was 446/4372; +11 new tests, +1 test file entry recount), doc-content tests green, cadence verify coverage --explain now reports SATISFIED for AC-1 and AC-3 (previously the deep-verifier's own read-only-mode.test.ts assertions were thinner; now every AC-1-enumerated subcommand has a real subprocess test).
- T3: DONE — Updated packet.ts's forbidden-actions prose to name CADENCE_READ_ONLY and state enforcement is now structural, without overclaiming per-dispatch process isolation (AC-6). Added docs/reference/commands.md 'Environment variables / CADENCE_READ_ONLY' section documenting the mechanism, gotchas, and empirically-proven scoping limits from T4's investigation. docs/host-adapters.md judged out of scope (HostAdapter-contract-only doc, confirmed by independent review). AC-5 judged already satisfied functionally by T1's direct-import guard tests; independent review's Critical finding (bare AC-N tokens fail this repo's phase-qualified coverage gate) required qualifying every 289-01 test's AC token to 289-01/AC-N across read-only-guard.test.ts, read-only-mode.test.ts, milestone.test.ts, and packet.test.ts -- done as part of this recording, plus one doc accuracy fix (milestone close was missing from the blocked-subcommands list) and a PROGRESS.json bookkeeping reconciliation (T3's work had not been recorded; T4's touchedFiles had picked up T2's in-flight file due to recording-order timing). Two golden-fixture files (packet.test.ts, pre-dp-a-plan.json) required re-pinning since packet.ts's byte-exact rendered output changed; added to this task's declared files: (documented deviation, not a boundary bypass). Re-verified after fixes: cadence verify coverage --explain reports SATISFIED for AC-1/2/3/5/6; AC-4 correctly stays NOT SATISFIED (proof-only, no automatable test -- evidenced via T4's real-dispatch PROGRESS.json record, to be settled via --ac override citing that evidence). Full suite 446/4372 green, typecheck clean, doc-content tests green (215+7+3).
- T4: DONE — AC-4 verbatim capture (amended per whole-branch review finding: prior note was a paraphrase, not the DRAFT's required verbatim capture). Second dispatch attempt's literal output: printenv CADENCE_READ_ONLY -> '1' (exit 0, confirming inheritance purely via .claude/settings.json's env block, not set by the child itself). cadence init's internal provider-selection decision write hit the guard first: 'cadence init: could not record the provider-selection decision (CADENCE_READ_ONLY is set -- refusing "addIntelligenceDecision" (intelligence ledger write blocked). Unset CADENCE_READ_ONLY to allow ledger mutations.) -- continuing; the scaffold itself is unaffected.' (init exited 0, non-fatal by design). Then the explicit test command: 'node .../cadence.cjs decision add --title t4-v2-proof-mutation --rationale ...' produced stderr 'decision add failed: CADENCE_READ_ONLY is set -- refusing "addIntelligenceDecision" (intelligence ledger write blocked). Unset CADENCE_READ_ONLY to allow ledger mutations.', exit code 1. Subsequent 'cat .cadence/intelligence/decisions.json' -> 'cat: .cadence/intelligence/decisions.json: No such file or directory' -- the file was never created. Two independent instances of the guard firing inside the dispatched child (init's internal write, and the explicit decision add), both refused, both verbatim-captured here. First dispatch attempt (inline env-prefix methodology, not settings.json propagation) is left in the historical record as-is -- honest account of the self-disclosed gap and the redo, not erased.

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: ran
- task-verify-required: ran
- build-test-must-pass: ran
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: ran
- code-review: ran
- security-audit: skipped — not in the active tier × profile gate set

## Gate bypasses

- ERROR settle via --force: settle --force bypassed failing verdicts (deep: AC-1, AC-2, AC-3, AC-4)
- WARN evidence-floor:AC-4 via --evidence-floor-bypass: proof-only task per the DRAFT's own Boundaries (T4 declares files: none) -- structurally cannot be automated-tested, since the thing being proven is that a dispatched child process refuses a write; the only real evidence is a captured real-dispatch transcript, recorded verbatim in T4's PROGRESS.json note per the DRAFT's own stop: condition. Deep-verify structurally cannot observe this AC either (no linked tests exist to point it at), consistent with the SPEC's own Open Questions framing of AC-4 as proof-only from the start.

## Assurance

- overall: mixed
- bypassed: 2 gate(s) (severity: error)
- evidence tally: ai-verified=2, executed=3, assertion=0, mention=0, unverified=1
- verifier: host-cli (1 gate(s)) (configured)

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_

## State at settle

- loop position before settle: BUILD
- revision: 99
- session subagent spawns: 182
