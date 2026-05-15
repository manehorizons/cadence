---
phase: 29-shakedown
id: 29-01
tier: standard
status: PENDING
---

# 29-01 — Foreign-repo shakedown (continuity-runtime)

## Objective

Run CADENCE end-to-end on `~/Documents/Projects/continuity-runtime` (a real, abandoned, non-cadence project) to surface every assumption that holds only because the dogfood target is cadence itself; observation-only — all fixes are deferred to Phase 29.4.

## Acceptance Criteria

### AC-1: init on a foreign repo, gate-profile suggestion recorded
Given continuity-runtime (75-commit npm single-package TS repo, no `.cadence/`)
When `cadence init` is run against it
Then init completes and the friction log records the `--gate-profile` suggestion, the post-init summary verbatim, and an assessment of what the profile *should* have been

### AC-2: two real phases taken full-loop on the foreign repo
Given continuity-runtime is initialized
When ≥2 real phases are driven through `DRAFT → BUILD → SETTLE` (real code, real diffs)
Then each reaches a written SUMMARY, with every command and its verbatim output captured — `testGlobs` / test-coverage behavior on a `tests/` (non-`packages/**`) layout explicitly noted

### AC-3: friction log captures every documented-behavior deviation
Given the loop has been run on continuity-runtime
When behavior diverges from README/DESIGN
Then `.cadence/shakedown/29-01-FOREIGN.md` records each deviation with verbatim output / error text (a clean run with zero deviations is itself the recorded, valid result)

### AC-4: every finding tagged
Given the friction log exists
When each finding is reviewed
Then every entry carries exactly one of `bug | docs | ux | works-as-designed`

### AC-5: host-install onto a pre-existing `.claude/` exercised
Given continuity-runtime already has a `.claude/` (and `.planning/`)
When the CADENCE host adapter is installed locally
Then the merge-into-non-empty-`.claude/settings` behavior is recorded verbatim (this is a realistic user condition, in-scope whether desired or not)

## Tasks

### T1: Prep + local host install onto foreign repo
- files: `.cadence/shakedown/29-01-FOREIGN.md`
- action: `pnpm build` this workspace; snapshot continuity-runtime's pre-existing `.claude/` / `.planning/` / `.git` (75 commits) into the report; run `node packages/host-claude-code/bin/cadence-host-claude-code.cjs install --local --settings .claude/settings.local.json` against continuity-runtime; record the `.claude/` merge result verbatim
- verify: report has pre-state snapshot + verbatim host-install output + merge assessment
- done: AC-5

### T2: `cadence init` on continuity-runtime
- files: `.cadence/shakedown/29-01-FOREIGN.md`
- action: run `cadence init` against continuity-runtime; capture the gate-profile suggestion, the one-screen post-init summary, and judge the correct profile for a 75-commit single-package repo
- verify: report records suggestion vs. correct-profile assessment, summary verbatim
- done: AC-1

### T3: Drive ≥2 real phases full-loop on continuity-runtime
- files: `.cadence/shakedown/29-01-FOREIGN.md`
- action: pick ≥2 real units of work in continuity-runtime, take each through DRAFT→BUILD→SETTLE; capture every command + verbatim output; specifically exercise whether the default `testGlobs=packages/**/*.test.ts(x)` misses its `tests/` directory and how the test-coverage gate then behaves
- verify: ≥2 SUMMARYs written in continuity-runtime; testGlobs/test-coverage behavior captured verbatim
- done: AC-2

### T4: Compile + tag the friction log
- files: `.cadence/shakedown/29-01-FOREIGN.md`
- action: consolidate all observations into the report; one entry per deviation with verbatim output; tag each `bug | docs | ux | works-as-designed`; a zero-deviation result is recorded explicitly as the valid outcome
- verify: every entry tagged exactly once; deviations have verbatim evidence
- done: AC-3, AC-4

## Boundaries

- DO NOT modify `packages/**` or any cadence source — observation only. Every cadence bug found is logged, not fixed here; remediation is Phase 29.4.
- DO NOT fix anything cadence chokes on *inside* continuity-runtime — each choke is a finding, not a patch target. (Mitigates the "shaped it cadence-friendly" bias.)
- Language-tuning of gates (JS vs non-JS) is OUT of scope — continuity-runtime is TS+vitest; that axis stays a documented boundary / later phase, not a finding here.
- continuity-runtime is an external scratch target — do not commit its changes back into this repo.
- Test-coverage note: this is an observation phase with no test files referencing AC-1..AC-5; under the dogfood `auto × standard` cell `test-coverage` is in the gate set, so settle will run `--allow-missing-coverage` (documented here per the process-meta convention; expect the `coverage-bypassed` anomaly).
