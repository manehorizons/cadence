# SETTLE Summary — 253-01

**Completed:** 2026-08-05T01:44:30.142Z
**Content hash (sha256):** 907070c3d761c9c02ef8f6b1f558a3aedffc4ae6361553973ee968fda6b47e02

## Acceptance Criteria

- AC-1: PASS (executed)
- AC-2: PASS (executed)
- AC-3: PASS (executed)
- AC-4: PASS (executed)
- AC-5: PASS (executed)
- AC-6: PASS (executed)

## Tasks

- T1: DONE — Red-first test added (packages/core/tests/docs/check-lockfile-overrides.test.ts). Confirmed red for the correct reason (module-not-found on scripts/check-lockfile-overrides.mjs, which T2 implements). Independent review: APPROVE WITH CONCERNS (2 minor: bare AC-N mentions in comments, fixed by orchestrator; no-op catch-rethrow around dynamic import, deferred to T2 which next touches this file). Main-thread re-verified after fixes: still red for the same reason.
- T2: DONE — Implemented the pure detector (extractOverrideTargets/parseLockfilePackages/checkOverrideCoverage) and wired it into security.yml's audit job on the same install path as check-audit-exceptions.mjs. Independently reviewed; two findings resolved by orchestrator before recording DONE: (1) hardened extractOverrideTargets's silent drop of unversioned override keys by adding a new pure findUnversionedOverrideKeys() export + a loud stderr warning in main() (Quiet Fallback convention), with unit tests -- does not change today's committed config since all 4 real override keys are versioned. (2) Ownership of the '253-01 / AC-5' describe block in security-ci.test.ts reassigned to T6 in these notes -- its content (audit-exceptions.md narrative correction) is T6's deliverable; T2 owns only the '253-01/AC-4' lockfile-overrides-detector-wiring describe block in that same file. Main-thread re-verified: full pnpm turbo run lint typecheck test build green (24/24), diff read directly.
- T3: DONE — Empirical override-key-grammar experiment run in disposable scratch clones (never touched the phase worktree). Findings: (1) PATH pnpm resolves to a v11.2.2 launcher that prints the misleading warning before self-switching to the packageManager-pinned 9.12.0, which works correctly; (2) override matching is declared-range intersection, not natural-resolution match -- a stale/non-intersecting key is silently ignored, no error; (3) lockfile overrides/packages/snapshots blocks all regenerate consistently on a real corrected target. Independent reviewer re-derived all 3 findings from scratch (own experiments, own clone, live npm registry hash check) and orchestrator spot-checked finding 1 directly -- all confirmed. Reviewer flagged that no transcript was persisted to disk (Self-Report Trust risk); fixed by orchestrator: full transcript + both independent confirmations now recorded in .cadence/phases/253-dependency-override-remediation/253-01-T3-EVIDENCE.md before T6 proceeds.
- T4: DONE — Applied the four corrected override targets (fast-uri >=3.1.5, brace-expansion 5.x line >=5.0.9, brace-expansion 2.x line as its own new override >=2.1.4, ip-address as a new override >=10.3.1 -- 2.x and ip-address entries deliberately shipped as caret ^ ranges rather than the DRAFT's literal >= example, after empirically finding during this task that an unbounded >= on brace-expansion's 2.x override collapsed it into the unrelated 5.x line's resolution; independently reviewer-confirmed against the real lockfile). Ran pnpm install to refresh pnpm-lock.yaml; added lockfile-overrides-current-state.test.ts asserting the real committed package.json/pnpm-lock.yaml (carrying 253-01/AC-1 and 253-01/AC-2 inside asserting blocks). Main-thread re-verified: diff read directly (package.json, pnpm-lock.yaml -- resolved versions 5.0.9/2.1.4/3.1.5/10.4.0 all satisfy their new floors), full pnpm turbo run lint typecheck test build green (24/24). Clean install + frozen-lockfile install evidence per the prior session's PROGRESS notes.
- T5: DONE — Deliberately mutated package.json's pnpm.overrides three times and restored each time (net-zero diff, verified by git hash-object matching at every checkpoint: 99fb2fa19a9bc0286b4055c382f7b23a20beac3a). Experiment 1 (negative result): the dispatch prompt's suggested fast-uri ^3.1.5->^3.1.4 revert does NOT fail (3.1.5 still satisfies ^3.1.4, correct caret semantics) -- not a DRAFT-specified example, documented as such. Experiment 2: unsatisfied-branch FAIL (brace-expansion target tightened above resolved version). Experiment 3: unguarded-line-branch FAIL (reproduces the actual historical defect shape by deleting the 2.x override key entirely). All captured verbatim in .cadence/phases/253-dependency-override-remediation/253-01-T5-EVIDENCE.md. Independent review: APPROVE WITH CONCERNS -- reviewer independently reproduced all 3 experiments from scratch (own mutations, own runs, matching output and hash). Two required fixes applied by orchestrator before DONE: (1) added this PROGRESS.json entry (verify clause requires DRAFT/PROGRESS recording, mirroring T3's precedent), (2) fixed an internally-contradictory diff snippet in Experiment 1's evidence (both sides showed ^3.1.4 instead of the real ^3.1.5->^3.1.4 change) plus corrected the 'DRAFT's illustrative example' misattribution (it was dispatch-prompt phrasing, not in 253-01-DRAFT.md). Reviewer's non-blocking finding (detector cannot catch an override floor that is stale-but-internally-consistent vs the real upstream patched version) recorded per Unlogged Audit Finding convention: appended a scope-caveat section to the evidence file and filed rec-20260805-002 (low priority). Main-thread re-verified: independently re-ran experiment 2's mutation myself is redundant since reviewer already reproduced all three from scratch; confirmed final git diff package.json matches T4's expected diff exactly, full pnpm turbo run lint typecheck test build still green (24/24, unaffected by evidence-file-only changes).
- T6: DONE — Rewrote docs/security/audit-exceptions.md's line-33 prose and docs/handoffs/HANDOFF-v1.55-integrity-release.md's sections 4, 7 Phase A, and 14 with the corrected mechanism story from T3's evidence. Independent reviewer initially REJECTed the first pass for introducing a new false claim (said the stale override 'silently stopped matching' when it actually fired correctly onto a stale target); fixed in both docs, re-verified 42/42 tests passed at the time. Ownership note (resolves the DRAFT-authoring gap flagged in the prior handoff): T6 owns the '253-01 / AC-5' describe block in packages/core/tests/docs/security-ci.test.ts even though T6's files: list never named a test file -- its assertions verify audit-exceptions.md's corrected narrative, which is T6's deliverable; T2 owns only the adjacent '253-01/AC-4' detector-wiring block in that same shared file. Main-thread re-verified: diffs read directly for both docs, corrected prose confirmed present and old false claims confirmed absent, full pnpm turbo run lint typecheck test build green (24/24).
- T7: DONE — Added a pnpm-launcher-version doc note to CLAUDE.md immediately after the existing pnpm@9.12.0/packageManager mention: a developer's PATH pnpm may resolve to a newer global major whose launcher prints a self-referential warning before delegating to the pinned 9.12.0, which applies pnpm.overrides correctly -- trust the lockfile, not the launcher's warning. Added a 'Known CI configuration discrepancies' section to docs/security/audit-exceptions.md noting (not fixing) that .github/workflows/docs.yml:44 pins pnpm/action-setup@v4 while ci.yml/release.yml/security.yml all pin @v6; filed rec-20260805-001 (low priority, area ci) for the mismatch. docs.yml itself confirmed untouched (git diff empty). Independent review: PASS -- reviewer independently confirmed both doc additions present and well-placed, independently grepped action-setup versions across all workflow files matching the claim, confirmed rec-20260805-001 well-formed/non-duplicate by reading recommendations.json directly, confirmed no boundary violations, cross-checked the doc note's accuracy against 253-01-T3-EVIDENCE.md's Finding 1, and confirmed T7 does not step on T6's line-33 AC-5 territory (additive-only, separate section). Main-thread re-verified: read CLAUDE.md and audit-exceptions.md diffs directly, confirmed docs.yml git diff is empty, confirmed rec-20260805-001 present via recommendation list, full pnpm turbo run lint typecheck test build green (24/24, fully cached -- no source/test changes).

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

## Assurance

- overall: mixed
- evidence tally: ai-verified=0, executed=6, assertion=0, mention=0, unverified=0

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_

## State at settle

- loop position before settle: BUILD
- revision: 93
- session subagent spawns: 215
