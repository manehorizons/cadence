# SETTLE Summary — 236-01

**Completed:** 2026-07-31T01:29:23.004Z
**Content hash (sha256):** 6bc6457746614614d136ad7c0c914ce5cfd55c6dfdde97861cc42b310b8e6824

## Acceptance Criteria

- AC-1: PASS (executed)
- AC-2: PASS (executed)
- AC-3: PASS (executed)
- AC-4: PASS (executed)
- AC-5: PASS (executed)

## Tasks

- T1: DONE — AnchorZ.kind widened + FindingZ gains id/target/disposition/waiver (additive/optional, back-compat verified). Independent review flagged a real gap: waiver had no cross-field constraint tying it to disposition==='waived'. Fixed directly (orchestrator, post-review): added two .refine()s on FindingZ enforcing the biconditional (waived requires waiver, waiver requires waived) per source doc §7.2 ('a waiver with no expiry is a belief masquerading as knowledge'). Adjusted one pre-existing test loop that asserted bare disposition:'waived' with no waiver, added 2 new rejection tests. Re-verified independently: 22/22 anchor.test.ts, 347/347 full types-package suite, typecheck clean. No other code in the repo yet constructs disposition/waiver (grepped), so this tightening has zero fallout.
- T2: DONE — RecommendationSourceZ gains 'review' (additive enum extension). Implemented + independently reviewed + main-thread re-verified: 50/50 tests pass, diff is 5+/44+ insertions only, no deletions.
- T3: DONE — New pure module verify/finding-identity.ts: computeFindingId (sha256 over JSON.stringify([file, anchor.kind, anchor.ref??null, severity, normalizeMessage(message)]), never a line number) + attachFindingIdentity batch adapter (stamps id/target:artifact/disposition:open onto AnchoredFinding[] -> Finding[]). Independently reviewed (hash-collision-safety of the JSON encoding specifically scrutinized, confirmed sound) and independently re-verified: 15/15 tests, typecheck clean.
- T4: DONE — Wired attachFindingIdentity into gates/code-review.ts: called once right after gapResult is computed, result used consistently on all 3 summaryPatch.codeReview return paths (reloop-refuse, hard-refuse, pass/bypass). highs/pass (from raw verifyResult.findings) and gapCount/severityDistribution (from gapResult.summary) are structurally unaffected -- traced line by line, both independently and by the reviewer. Independently re-verified: 27/27 across code-review-criteria-gap/code-review/settle-code-review/settle-code-review-anchor-e2e test files, typecheck clean.
- T5: DONE — Converged code-review.ts's local Finding/FindingSeverity onto the shared cadence-types Finding (D9: one Finding type, discriminated by target). CodeReviewFinding/CodeReviewFindingSeverity kept as backward-compat re-exports in contracts/index.ts (2 real consumers: gates/types.ts, notify/code-review.ts). criteria-gap.ts's GapCandidateFinding/CriteriaGapSummary necessarily widened (severity/line derived from Finding['severity']/Finding['line']) to accommodate the wider type at anchorFindings' call site -- confirmed purely type-level (severity only ever tallied, never branched on; code-review's own verifiers never emit 'critical'; FindingResponseSchema LLM contract left unchanged at high|medium|low). Independently re-verified: build clean, 35/35 targeted tests, typecheck clean (reviewer additionally ran the full 3445-test core suite, all green).
- T6: DONE — Documented phase 236's changes in docs/concepts.md (new subsection after phase-235's, doc-accuracy verified line-by-line against real source by reviewer) and added a purely additive inline 'As built' amendment to ROADMAP.md's phase 236 entry recording the ledger-routing split (0 deletions confirmed via git diff). Independently re-ran pnpm turbo run lint typecheck test build --force: 24 successful, 24 total, 0 cached (genuine full run). Backward compat independently spot-checked against 5 real pre-phase-236 SUMMARY.json fixtures (phases 67/167/220/234/235) -- all parse.

## Gate provenance

- draft-read: skipped — not in the active tier × profile gate set
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- task-verify-required: ran
- build-test-must-pass: ran
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: skipped — not requested (no --deep / --interactive, not in gate set)
- code-review: skipped — not in the active tier × profile gate set
- security-audit: skipped — not in the active tier × profile gate set

## Assurance

- overall: mixed
- evidence tally: ai-verified=0, executed=5, assertion=0, mention=0, unverified=0

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_

## State at settle

- loop position before settle: BUILD
- revision: 45
- session subagent spawns: 80
