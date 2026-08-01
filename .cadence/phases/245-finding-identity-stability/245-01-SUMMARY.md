# SETTLE Summary — 245-01

**Completed:** 2026-08-01T17:26:50.573Z
**Content hash (sha256):** 3fd78fc730c0f9a35b47f5ed8173c8a6691293613d94797f398a213114aa412b

## Acceptance Criteria

- AC-1: PASS (executed)
- AC-2: PASS (executed)
- AC-3: PASS (executed)
- AC-4: PASS (executed)
- AC-5: PASS (executed)

## Tasks

- T1: DONE — Narrowed identityKey to (file, normalized message). Independently re-verified: typecheck clean, lint clean, 3483/3487 core tests pass — the 4 failures are exactly the pre-existing anchor/severity-changes-id assertions in finding-identity.test.ts that T2 will rewrite. Manual behavior check confirms same-anchor/same-severity collapse and file/message sensitivity are both correct.
- T2: DONE — Rewrote finding-identity.test.ts's anchor/severity assertions from changes-the-id to does-NOT-change-the-id, including the anchor.ref-absence describe block T1's implementer flagged. Added a literal AC-1 anchor-earning-workflow test (kind:none vs kind:ac/ref:AC-1). Independently re-verified: typecheck clean, lint clean (src via package script + tests file directly via npx eslint), full core suite 381/381 files, 3488/3488 tests pass.
- T3: DONE — Added expect(beforeFinding.id).toBe(afterFinding.id) to the AC-5 round-trip test in criteria-anchor-corpus.test.ts, proving finding identity survives the DRAFT-amendment anchor-earning workflow. Independently re-verified: typecheck clean, lint clean, full core suite 381/381 files, 3488/3488 tests pass.
- T4: DONE — Added SEVERITY_RANK; merge loop now replaces the group's canonical finding when a strictly more severe occurrence arrives, keeping severity/priority/message/line mutually consistent. Fixed stale by-construction comments in finding-routing.ts and the old 5-input formula in docs/concepts.md (incl. corrected line-number citations). 3 new regression tests. Independently re-verified: typecheck clean, lint clean (src + test file directly), full core suite 381/381 files, 3491/3491 tests pass.

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
- revision: 40
- session subagent spawns: 102
