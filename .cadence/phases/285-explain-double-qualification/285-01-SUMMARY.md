# SETTLE Summary — 285-01

**Completed:** 2026-08-21T00:54:39.040Z
**Content hash (sha256):** bf2ccba1750350290965f276dc0202debc22876ca30dee31228d0354b6449074

## Acceptance Criteria

- AC-1: PASS (ai-verified)
- AC-2: PASS (ai-verified)
- AC-3: PASS (ai-verified)
- AC-4: PASS (ai-verified)
- AC-5: PASS (ai-verified)

## Tasks

- T1: DONE — Snapshot fixtures for AC-2/AC-3 captured and green; AC-1 red regression test authored and confirmed failing for the documented reason (raw double-qualified acId flows through unnormalized). Independent reviewer flagged an inaccurate discriminating-mechanism comment on AC-3 (claimed satisfied would flip to false; empirically it does not, since bare AC-3 matches as a substring). Corrected the comment and the DRAFT's AC-3/T1 text to describe the real signal (expectedQualifier staying undefined / snapshot divergence). Re-verified independently before recording DONE.
- T2: DONE — Fix implemented in runVerifyCoverage (service-layer only, coverage.ts untouched): already-qualified --explain argument is stripped of its leading <qualifier>/ prefix with a stderr notice, per D-X option 3 (dec-20260820-004, linked to rec-20260816-001). AC-4 shape test added (field set derived from source, not hand-copied). First independent review found a real blocking regression: stripping to an empty string (--explain '<Q>/') produced a false 'satisfied: true' via an empty-pattern match -- worse than the original bug. Reproduced independently, fixed with an explicit empty-strip refusal (non-zero exit, mirrors the existing empty-argument guard), added a regression test, amended AC-1's DRAFT text and added an As-built amendment note. Also strengthened a weak substring stderr assertion flagged as non-blocking. Second independent review re-verified the fix (including proving the regression test is honest by reverting the guard and confirming it fails) and ran an adversarial edge-case hunt (trailing whitespace, degenerate bare ids) -- came back clean, structurally safe via tokenHasExpectedQualifier's qualifier gate. Full repo pipeline (lint/typecheck/test/build) green throughout, re-run by both reviewers and independently by me.
- T3: DONE — Docs amended: docs/reference/commands.md's verify->coverage --explain Behavior paragraph now states the bare-form contract under both schemes, the normalization+stderr-notice behavior for an already-qualified argument (T2), and the qualifier-only refusal (T2's as-built amendment). AC-5 asserting test added to coverage-scheme-docs.test.ts, reusing existing sliceSection/phraseRe helpers, tightly scoped. Independent review confirmed doc prose matches live source exactly (not a stale draft), the test is a real regression guard (verified non-vacuous by stashing the doc change and confirming the new assertions fail), and no collateral damage to the other 34 doc-content test files. One low-severity finding (Exit codes bullet didn't enumerate the new third exit-1 cause) fixed in the same pass and re-verified (38 doc test files / 225 tests green). Full repo pipeline (24/24, forced/uncached) green throughout.

## Findings

### Code review

#### docs/reference/commands.md

- MEDIUM: Incorrect: bare mode accepts `<phase>/AC-N` literally (and AC-3 tests it); only phase-qualified normalizes. Say bare `AC-N` is recommended, or scope the restriction to phase-qualified. (line 2442) [id: d9acf9332e28796a92272cb33ca30846d6728db5dd6f412a394d64b534f9af84; target: artifact; anchor: kind=ac, ref=AC-5, tier=executable; disposition: open]

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- task-verify-required: ran
- build-test-must-pass: ran
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: ran
- code-review: ran
- security-audit: skipped — not in the active tier × profile gate set

## Assurance

- overall: strong
- evidence tally: ai-verified=5, executed=0, assertion=0, mention=0, unverified=0
- verifier: host-cli (1 gate(s)) (configured)

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_

## State at settle

- loop position before settle: BUILD
- revision: 39
- session subagent spawns: 90
