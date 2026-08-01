# SETTLE Summary — 235-01

**Completed:** 2026-07-29T23:38:07.431Z
**Content hash (sha256):** 612362534741676896d5e769a2b417e13111f170971c6861d0fb9cc76b62534e

## Acceptance Criteria

- AC-1: PASS (executed)
- AC-2: PASS (executed)
- AC-3: PASS (executed)
- AC-4: PASS (executed)
- AC-5: PASS (executed)
- AC-6: PASS (executed)
- AC-7: PASS (executed)

## Tasks

- T1: DONE — Anchor ladder as peer schema to AcEvidenceZ (D5): AnchorTierZ (4 tiers) + AnchorZ ({kind,ref?,tier}), anchor attached to FindingZ as optional additive field. 11 runtime tests. Orchestrator re-verified: repo-wide lint/typecheck/build green, full suite 3352 tests green. Independent review APPROVED, zero Critical/Important. Orchestrator fixed AC-2 coverage linkage — it had been satisfied only incidentally via a fixture value (ref: 'AC-2'); now four deliberate it('AC-2: ...') titles. kind deliberately narrower than 7.2 (no 'invariant'), deferred to phase 236.
- T2: DONE — Pure DI resolveAnchor implementing the full 7.1 ladder; 21 runtime tests. executable requires BOTH a task citing the AC with non-empty verify AND a build-test-must-pass provenance entry with status=='ran' (skipped/refused/missing/empty-array all fail it) per dec-20260729-004. Ladder read as four independent conditions, first-holds-wins, not a subsuming chain — justified from AC-3's text and 7.1's explicit delegation of anchor-shopping callouts to the counter-verifier (4.3); independent review argued and confirmed this from the primary sources. ORCHESTRATOR-FIXED REAL BUG: implementer used exact equality t.done === ac.id, but Task.done is a comma-separated string ('AC-2, AC-3'), so executable was unreachable for every multi-AC task — most tasks in practice, incl. three in this DRAFT. Replaced with the canonical parseAcRefs (parse/ac-refs.ts) rather than a second hand-rolled parser; added a 4-test regression block. Fix proven by mutation test: reverting it fails 3 of 4 new tests, restored from cp backup with matching sha256. AC-1 vs AC-10 prefix false-match ruled out (greedy \\d+ plus Array.includes exact-element compare). Re-verified: repo-wide lint/typecheck/build green, full suite 3373 tests green. Independent review APPROVED, zero Critical/Important.
- T3: DONE — CodeReviewInput extended with acceptanceCriteria/boundaries/taskRefs as additive optional fields; runCodeReviewGate populates them from ctx.draft via new pure buildCodeReviewInput(). CodeReviewTaskRef is Pick<Task,...> so it cannot drift from TaskZ. Imports through phase 234 contract surface, no kernel internal. Orchestrator caught and fixed a typecheck break the task reported green over (TS2305: CodeReviewTaskRef not exported from contracts/index.ts) — single-file test could not catch it since tests are neither typechecked nor linted. contracts/index.ts added to files via inline As-built amendment. Re-verified: repo-wide lint/typecheck/build green, full suite 3352 tests green. Independent review APPROVED, zero Critical/Important; confirmed a wrong implementation cannot pass these tests, GATE_ORDER and the HIGH-finding refuse/convergence contract unchanged, no pre-existing test modified.
- T4: DONE — Criteria-gap findings via new pure anchorFindings (verify/criteria-gap.ts) reusing T2's resolveAnchor; gap == anchor.tier 'undeclared'. Refusal reuses code-review's existing HIGH path per dec-20260729-005 — highs/pass computed from the RAW findings before anchoring, so anchoring can never change pass/refuse (AC-7 preserved); no new config key, gate, or bypass flag; GATE_ORDER, gates/engine.ts and gates/ac-evidence.ts untouched. ORCHESTRATOR FIXED 2 REAL FAILURES the implementer reported green over: its D3 stderr notice fired on every run incl. zero-finding runs, breaking pre-existing tests/cli/settle-code-review.test.ts AC-4 and settle-codereview-convergence.test.ts AC-1 (both assert clean-diff stderr does not match /code-review:/). Guarded the notice with gapCount>0 rather than loosening those tests, which AC-7 forbids; the substantive declaration stays unconditional (tagged findings land in summaryPatch.codeReview on all three return paths). Reading recorded as dec-20260729-006. Also corrected two of the implementer's own new assertions that had encoded 'print 0 gaps always', and added a test proving a gap IS declared when the gate PASSES — the case D3 actually protects. Note: first fix attempt looked failed only because CLI tests spawn dist/ and the build predated the edit. Re-verified after rebuild: repo-wide lint/typecheck/build green, full suite 3381 tests / 372 files green. Independent review APPROVED, zero Critical; adjudicated the D3 guard as non-weakening from AC-4's text. Known limitations filed, not hidden: rec-20260729-002 (executable tier unreachable in the live gate — SettleContext exposes no provenance, so gateProvenance is []), rec-20260729-003 (per-file not per-finding anchoring), rec-20260729-005 (boundary substring match can mask a gap).
- T5: DONE — Adversarial corpus, 17 runtime tests. MockCodeReviewVerifier gained an opt-in extraMarkers seam; zero-config output byte-for-byte unchanged (loop no-ops over [], console.log HIGH rule + postLine arithmetic + empty-diff early return untouched) — verified by reading the diff and by all 5 pre-existing mock-consumer suites (40 tests) passing. Six of section 6 Slice 3's seven corpus cases covered; the refactor-moved case correctly ABSENT (needs finding identity, boundaried to phase 236). AC-5 round trip is rigorous: the same findings object is passed by reference to both the before and after gate runs, only the draft varies, and a third test pins severity/message/line identical across both with only anchor differing. AC-6a: low and medium unanchored findings both leave the gate PASSING while still counted as gaps (refusal is HIGH-only per dec-20260729-005). AC-6b: weakness is tier !== 'executable' with NO redundant weak boolean; tests assert 'weak' in anchor === false. executable tier covered at UNIT level with injected provenance and labeled as such, since rec-20260729-002 makes it unreachable through the live gate — tests explicitly distinguish unit-level from gate-level so the coverage cannot be mistaken for end-to-end proof. ORCHESTRATOR FIX (from independent review): the seam did marker.pattern.test(body) with no lastIndex reset — a /g RegExp is stateful, so an idiomatic /pattern/g marker would have matched intermittently across diff lines, silently half-working. Added the reset (matching verify/coverage.ts's existing defense) plus a regression test; mutation-proved by removing the reset (test fails) and restoring from cp backup with matching sha256. Re-verified: repo-wide lint/typecheck/build green, full suite 3410 tests / 374 files green. Independent review APPROVED, zero Critical/Important.
- T6: DONE — Back-compat pins + paired docs + changeset. New doc test (12 runtime tests) pins GATE_ORDER exactly, the HIGH-finding reloop/pass/bypass contract byte-identically, a realistic pre-phase-235 schemaVersion 1 SUMMARY (findings with no anchor key) parsing through the REAL SummaryZ schema, and that docs/concepts.md actually contains the ladder, the gap behavior, and all three limitation disclosures — so docs cannot silently drift from code. Full doc-test surface green (18 files / 115 tests), including the mock-placeholder framing test and gates-sealed doc sync. docs/concepts.md documents the anchor ladder within the existing code-review gate: no matrix row added, GATE_ORDER unchanged, registry.ts zero diff, no hardcoded gate count, no version number or date (Speculative Stamp avoided). Three shipped limitations stated plainly under their own heading rather than buried: rec-20260729-002 (executable unreachable in a live settle — doc quotes the real gateProvenance: [] call), rec-20260729-003 (per-file not per-finding anchoring), rec-20260729-005 (boundary substring can mask a gap). Changeset lists cadence-core + cadence-types at minor, matching the convention derived from three sibling changesets (both packages when a phase touches types schema + core logic); no version number. Re-verified: repo-wide lint/typecheck/build green, full suite 3410 tests / 374 files green. Independent review APPROVED, zero Critical/Important; confirmed the docs do not overclaim and the SUMMARY back-compat test uses the real schema rather than a stub.

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
- evidence tally: ai-verified=0, executed=7, assertion=0, mention=0, unverified=0

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_

## State at settle

- loop position before settle: BUILD
- revision: 45
- session subagent spawns: 95
