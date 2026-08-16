# SETTLE Summary — 282-01

**Completed:** 2026-08-16T14:53:42.516Z
**Content hash (sha256):** 53e4d0f23d7c0bd2132b8df2e8e2831666a58b2ab100c0c222636c5edf3c6d68

## Acceptance Criteria

- AC-1: PASS (ai-verified)
- AC-2: PASS (executed)
- AC-3: PASS (ai-verified)
- AC-4: PASS (executed)

## Tasks

- T1: DONE — Fixed per-file dedup ordering (D-O option 1): qualifying/skipped now computed before slot claim; a qualifying occurrence displaces an earlier non-qualifying one for the same (id,file). Mention mode deliberately exempted (no qualifying concept, verdict-neutral) -- reasoning recorded in DRAFT Boundaries per independent reviewer's finding. Full core suite 437/437 files, 4251/4251 tests, typecheck+lint clean, independently re-verified.
- T2: DONE — Sorted listAllFiles's output for deterministic cross-file array order (root-cause fix, feeds all 3 coverage.ts call sites). Independent review reproduced the fix (revert/restore) but found AC-2's Given/action wording overclaimed run-to-run variance -- actual defect is stable-but-non-canonical order, not in-process flakiness; the pinned-order assertion (not the mutual 10-run loop) is what catches it. As-built amendment recorded in DRAFT. Full core suite 438/438 files, 4252/4252 tests, typecheck+lint clean, independently re-verified. Also fixed a duplicated-comment editing artifact before recording.
- T3: DONE — D-O hypothesis confirmed: T1's dedup-ordering fix alone resolved the --explain-vs-gate divergence (rec-20260814-002); zero source changes needed in coverage.ts or gates/coverage.ts. New test coverage-explain-agreement.test.ts (7 cases) wires the real runCoverageGate against a hand-rolled SettleContext and explainAcCoverage independently, proving agreement across divergence/clean/uncovered/weak/skip-dodge/nested-skip/cross-file shapes. Independent reviewer reproduced the discriminating claim (reverting T1 fails exactly case 1, only case 1) and confirmed the hand-rolled context is production-faithful (no load-bearing field stubbed). Full core suite 439/439 files, 4259/4259 tests, typecheck+lint clean, independently re-verified twice.
- T4: DONE — Corpus-wide coverage-drift sweep across all 293 historical *-SUMMARY.json records: 293 enumerated -> 281 verdicts (38 real re-derivations, 243 pre-phase-239 indeterminate) + 12 could-not-verify (legacy status:DONE DRAFT enum) = 293, fully accounted for. Found 3 phases / 5 ACs with real drift (252-01, 256-01, 256-02) -- rigorously proved (empirical grep + coverage-monotonicity/order-invariance analysis) that none of the 5 is caused by this phase's T1/T2 fix; pre-existing test churn. Added .changeset/coverage-dedup-determinism.md (patch). AC-4's own coverage gap (report+changeset are outside the test-coverage gate's scan surface) was closed via as-built DRAFT amendment adding packages/core/tests/docs/phase282-coverage-drift-report.test.ts to T4's files:, with 5 real asserting tests. A fresh independent reviewer (dispatched this session, no context from the prior implementer or the paused reviewer) independently re-derived the entire 293-phase sweep from scratch via its own script and confirmed every number, confirmed the coverage-monotonicity/order-invariance argument by diffing HEAD's pre-fix coverage.ts against the live post-fix file, live-spot-checked 3 drifted + 3 could-not-verify phases, and verified the proving test's assertions are real (not vacuous) and leak no drifting AC token. Verdict: PASS on the attribution claim, no Critical/Important findings. Also found and filed (unfiled by this task per its no-state-mutation instruction) a real tooling bug: verify coverage --explain silently double-qualifies an already-qualified token -- rec-20260816-001. --execution dispatch is deliberate (dec-20260816-004): this is the phase's chosen Phase-D live dispatch-escalation exercise, flipping anyTaskDispatched true and escalating boundaryEnforcement to block for this task's own settle-time boundary scan (expected effect, not a bug -- see the drift report's Notes for the settle step).

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — bypassed via --allow-boundary-scan-failure
- task-verify-required: ran
- build-test-must-pass: ran
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: ran
- code-review: ran
- security-audit: skipped — not in the active tier × profile gate set

## Gate bypasses

- ERROR settle via --force: settle --force bypassed failing verdicts (deep: AC-2, AC-4)

## Assurance

- overall: strong
- evidence tally: ai-verified=2, executed=2, assertion=0, mention=0, unverified=0
- verifier: host-cli (1 gate(s)) (configured)

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_

## State at settle

- loop position before settle: BUILD
- revision: 70
- session subagent spawns: 152
