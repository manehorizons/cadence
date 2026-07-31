# SETTLE Summary — 239-01

**Completed:** 2026-07-31T02:24:11.324Z
**Content hash (sha256):** 00f56436f7343feac53fba758df7ba9b0cf025477393dd7b2d28559687421b83

## Acceptance Criteria

- AC-1: PASS (executed)
- AC-2: PASS (executed)
- AC-3: PASS (executed)
- AC-4: PASS (executed)
- AC-5: PASS (executed)
- AC-6: PASS (executed)
- AC-7: PASS (executed)
- AC-8: PASS (executed)
- AC-9: PASS (executed)
- AC-10: PASS (executed)

## Tasks

- T1: DONE
- T2: DONE
- T3: DONE — Wired test-coverage gate to verification.coverageScheme; qualified path scans with active draft id as expectedQualifier, bare path unchanged (byte-for-byte, proven). Malformed/missing draft id refuses loudly; --force passes with loud notice, coverageBypassed stays false. All refusals name literal expected token. Independent review PASS_WITH_CONCERNS: corrected a false docstring claim, removed dead conditionality, normalized schemeHint across all 5 refusal branches. As-built recorded in DRAFT; T6 scope extended to rewire evidence derivation (currently still bare-matched).
- T4: DONE — Made verify coverage --explain scheme-aware. explainAcCoverage now checks the qualifier before the mode/span logic so a bare/foreign token reports a qualifier problem while a qualified token outside an asserting block still reports a span problem. CoverageExplainResult gained optional expectedQualifier (key omitted entirely under bare, so --json shape is unchanged). renderExplainHuman prints a scheme line only when qualified. runVerifyCoverage resolves the qualifier via a best-effort state.json read and prints a loud UNQUALIFIED notice when it cannot. DRAFT amended to declare verify/coverage.ts (third under-declaration of the config-ripple class). Independent review PASS; fixed a duplicate import and added a malformed-draft-id test. Reviewer proved --explain and the gate agree across 6 adversarial fixtures.
- T5: DONE — Registered verification.coverageScheme in the config-edit field registry with both enum values; fields.test.ts count pin updated 7->8 and asserts defaultConfig holds 'bare' (the back-compat contract). Independent review PASS_WITH_CONCERNS, no Critical/Major. Closed AC-5 clause (b), which was implemented in T1's init.ts overlay but had zero asserting coverage anywhere: added an init.test.ts case spawning the real CLI and asserting the written config.json contains coverageScheme 'phase-qualified'. Mutation-verified — removing the overlay line makes it fail with 'bare', confirming the silent-no-op failure mode it guards. DRAFT amended to declare tests/cli/init.test.ts.
- T6: DONE — SUMMARY records coverageScheme/coverageMode as additive optional fields (no Zod default — a default would break every historical SUMMARY's content hash), on both the success and refused paths. Made the shared memoized ctx.coverage() thunk scheme-aware, which fixes evidence derivation, deep-verify and interactive in one move; ac-evidence.ts needed no change because scanTestCoverage keeps bare AC-N map keys. Independent review PASS_WITH_CONCERNS; closed the Major by adding deep-verify qualified/bare tests, plus two comment fixes.
- T7: DONE — Qualified-scheme replay scans by token instead of DRAFT file-scoping; no-scoped-files never fires under phase-qualified. Two independent adversarial reviews. Review 1 returned FAIL on a Critical: the branch passed no globs, silently falling back to hardcoded DEFAULT_GLOBS and ignoring verification.testGlobs — a non-monorepo consumer would settle green through the gate then have verify phase report every AC drifted. Fixed by threading an optional testGlobs through PhaseReplayConfig, with tests covering a fixture outside packages/ (set and absent). Review 2 returned PASS_WITH_CONCERNS and ruled AC-8's 'across the whole repo' wording specifies a defect, not a target: a literal whole-repo scan under mention mode credits AC-8 from this phase's own RECOMMENDATIONS.md, evidence.json and handoff doc — planning prose satisfying its own coverage replay. AC-8 amended rather than the code loosened. The Critical is closed at the function level but NOT end-to-end: services/verify.ts is unwired, so every production replay still takes DEFAULT_GLOBS. Routed to T8 as a mandatory action-line clause plus a required service-level test, done: gains AC-8, and a marker comment now sits at the call site. Main thread re-verified independently at every step: full pipeline 24/24 three times, coverage probe measured directly (AC-8 refs=1 qualifying=1, first ref an asserting it() title at line 127), and the union-mutant kill reproduced by hand — mutant applied, exactly the new test failed, reverted and confirmed green. Also fixed: three inaccuracies in the rewritten doc comment (unwired-caller gap, a false safer-than comparative with counterexample, an unverifiable phase-233 citation now sourced to feat/kernel-assurance-v2) and T6's falsified settle.ts comment. Filed rec-20260730-001 (coverageMode provenance ignored by replay) and rec-20260730-002 (dedup first-occurrence-wins zeroes an AC when a qualified token sits outside an asserting block — cost this task a full review round-trip).
- T8: DONE — Adds an indeterminate replay state for pre-scheme SUMMARYs (AC-9) and wires config.verification.testGlobs at the services/verify.ts call site, closing the T7 Critical end-to-end (AC-8). Discriminator is summary.coverageScheme === undefined only — an explicit 'bare' keeps the unchanged file-scoped path; review confirmed SummaryZ rejects null/invalid loudly so only genuine absence reaches the branch. Independent review PASS_WITH_CONCERNS, no functional defect. Three findings fixed: the headline said 'no drift' for a phase whose coverage was never verified (245 SUMMARYs lack the field; 21 phases previously reported as drifted now print clean — now 'coverage NOT VERIFIED'), the degradation notice never reached stderr and so violated the Quiet Fallback rule with the init --ci workflow gated on exit code alone (now emitted to stderr in BOTH human and --json modes, stdout still pure JSON), and a third un-schemed test fixture in mcp-server.test.ts left the MCP/CLI parity test comparing two identical short-circuits. Implementing AC-9 correctly broke 4 pre-existing tests and silently hollowed out 7 more into vacuous passes; fixed by a one-field coverageScheme: 'bare' fixture correction in three files, with no assertion weakened, plus a new test pinning the discriminator itself. Rejected one review finding on measurement: it claimed phase 233's '5 false drifts' was really 1, having measured via direct function call under mention mode; defaultConfig.verification.coverageMode is 'assertion' and the CLI passes the config's mode, so the shipped command reports 5 — verified by extracting feat/kernel-assurance-v2 with git archive and replaying the real artifacts (mention=1, assertion=5). All citations now name the mode. Main thread re-verified independently: pipeline 24/24 with 3373 tests, coverage probe AC-1..AC-9 all qualifying>=1, and live CLI stdout/stderr checked in both modes on a scratch pre-scheme repo.
- T9: DONE — Docs paired (concepts.md test-coverage row, config.md field table incl. corrected loadConfig-merge mechanism), all 6 commands.md drifts from T7/T8 reviews fixed conditionally (bare vs phase-qualified), new coverage-scheme-docs.test.ts (16 tests, verified non-vacuous against pre-T9 doc text), changeset covering core+types. Independent review round 1: FAIL (AC-10 zero qualifying coverage from describe()-title token dedup collision, backwards loadConfig mechanism claim in config.md, phase/slice terminology placeholder). Fix round applied by original implementer, re-reviewed by same independent reviewer: PASS_WITH_CONCERNS (one new non-blocking Minor: leftover bare AC-10 mentions in describe() parentheticals, inert under phase-qualified but a landmine if reverted to bare) — fixed directly by orchestrator. Main-thread re-verify: pnpm turbo run lint typecheck test build --force = 24/24 successful; AC-10 coverage probe independently re-run, all AC-1..AC-10 qualifying>=1.
- T10: DONE — Flipped .cadence/config.json verification.coverageScheme to phase-qualified (single line, only file touched). Independent review PASS_WITH_CONCERNS: proved the flip is load-bearing via anti-degeneracy check (1372 AC-1 occurrences scanned, only the 3 genuine 239-01/AC-1 tokens satisfy; negative-control ACs 11-14 with asserting bare tokens correctly report unsatisfied) and negative control against foreign-phase/bare tokens correctly rejected even inside asserting blocks. T3's flagged risk (deriveEvidenceAndCheckFloor deriving from a bare memoized map) independently confirmed closed via reading settle.ts:409-449 and summary-coverage-scheme.test.ts's explicit-AC/foreign-token-derives-unverified assertions. Gate logic traced by hand against gates/coverage.ts: absent=[] weak=[] skippedOnly=[] under the resolved qualified scheme. Main-thread re-verify: git diff confirms exactly the one-line config change, pnpm turbo run lint typecheck test build --force = 24/24 successful. Two carry-forward items surfaced by review, deliberately deferred to whole-branch review / settle-time decision rather than actioned here: (1) draft-read gate will refuse at settle since DRAFT.md mtime > state.draftReadAt from the phase's 11 As-built amendments — remedy (re-approve vs --allow-stale-draft) deferred until after whole-branch review per advisor guidance, since a further amendment there would invalidate a re-approve done now; (2) stale AC-10 parenthetical mentions in coverage-scheme-docs.test.ts were already fixed during T9's fix round, reviewer's note was a carry-forward from memory, re-confirmed clean by direct grep.

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

## Gate bypasses

- WARN soft-cap via --allow-auto-complex: auto × complex soft cap bypassed via --allow-auto-complex (DESIGN.md §4 M2)

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_

## State at settle

- loop position before settle: BUILD
- revision: 224
- session subagent spawns: 325
