# SETTLE Summary — 250-01

**Completed:** 2026-08-02T21:40:05.220Z
**Content hash (sha256):** 08d9089ce45334cf02f0f6e400c183868a617b9115f6dc87a5edd4adb9c87d2b

## Acceptance Criteria

- AC-1: PASS (executed)
- AC-2: PASS (executed)
- AC-3: PASS (executed)
- AC-4: PASS (executed)
- AC-5: PASS (executed)
- AC-6: PASS (executed)
- AC-7: PASS (executed)
- AC-8: PASS (executed)

## Tasks

- T1: DONE — Repo-wide stray-@manehorizons sweep test, git-ls-files-based, non-vacuous (sanity test proves real hits exist in allowlisted files). Allowlist assembled across the whole phase's build history (T2-T13 findings). Independently reviewed READY: scan completeness confirmed, allowlist entries spot-checked against real file content, regex gap (case-sensitivity) checked and found unexploited. Re-verified myself: 2/2 sweep tests pass, my own independent grep (git grep -iE, excluding .cadence/+CHANGELOG) finds exactly the 5 expected tracked+allowlisted files and nothing else. Full suite 391/391 files, 3614/3614 tests, clean typecheck/build. Disclosure for settle: docs/migration-npm-scope.md and this test file itself are untracked until the phase's single commit lands, so today's green run doesn't yet exercise those two allowlist branches -- re-verify once committed, before merge.
- T2: DONE — Independently reviewed READY (6 package.json name fields + workspace deps renamed, homepage/bugs/repository.url correctly untouched, pnpm-lock.yaml regenerated and internally consistent). Re-verified: pnpm build/typecheck pass.
- T3: DONE — Independently reviewed READY (178 import specifiers codemodded across 6 packages, embedded-NUL-byte edge case in assurance-record.ts found and fixed, 4 files T4 owns correctly left untouched). Re-verified: pnpm typecheck/build pass across all 6 packages.
- T4: DONE — Independent review found one real gap (cli.test.ts:127 stale literal assertion, unblocked, should have been fixed by T4 itself) -- fixed directly by orchestrator, re-verified 11/11 tests pass. Core 4-file source change independently confirmed correct (host-wire.ts had both display + args literals needing fix, contrary to initial DRAFT assumption).
- T5: DONE — Doctor now detects stale-scope managed hooks: hasManagedCadence composed from hasManagedCadenceMarker (unchanged) && !hasStaleScopeManagedHook (new). fix.ts needed no changes -- existing host-install/wire-host repair path already unconditionally rewrites managed entries on reinstall, confirmed by reading install-merge.ts. Independently reviewed READY; re-verified myself (3612/3612 tests, clean typecheck/lint/build). Two findings routed forward, not fixed here (out of T5's file allowlist): (A) T1's sweep test must allowlist host-hooks.ts's STALE_NPM_SCOPE literal and its test fixtures as intentional, not stray. (B) AC-5/AC-7 text says plain 'cadence doctor --fix' repairs stale hooks -- verified false; the host-install fixId is wire-host-kind and applyFixes skips it without --wire-host. T8's migration doc must say 'cadence doctor --fix --wire-host', matching what the test actually proves, not the AC's literal wording.
- T6: DONE — Renamed remaining @manehorizons references across ~290 test files (import-specifier fixtures + package/command-identity assertions), plus SECURITY.md, three pending changesets (247-249), and release-cut SKILL.md discovered outside the original file list. Left bare 'manehorizons/cadence' GitHub-org fixtures and all CHANGELOG.md untouched per boundaries. pnpm typecheck/build/test green (4186 tests) after the sweep. Committed 9aab7300.
- T7: DONE — Independently reviewed READY. Doc-content test suite partial-red (3 suites) confirmed to be test-file import-resolution failures outside T7's scope, correctly deferred to T6 per dependency graph.
- T8: DONE — docs/migration-npm-scope.md created + linked from README.md, with the corrected 'cadence doctor --fix --wire-host' command (bare --fix does not repair -- verified against fix.ts's wire-host FixKind gating, independently re-confirmed by reviewer). Independently reviewed: NEEDS FIXES (narrow) -- one factual line wrongly claimed zero CLI behavior changed, when T5's doctor stale-hook detection is exactly that; fixed directly and reverified (133/133 doc tests, typecheck/build clean). Three out-of-boundary gaps routed forward rather than silently dropped: (1) packages/core/README.md and docs/README.md don't yet link the migration doc (AC-7 needs the README path, not just the doc's existence) -- opened as new as-built task T12, depends: T8. (2) T1's allowlist must also cover this doc's 12 intentional @manehorizons literals -- added to T1's DRAFT text and depends list. (3) No .changeset/*.md exists yet for phase 250 -- deferred to final settle per repo convention, not a task gap.
- T9: DONE — As-built amendment task (discovered T7's original DRAFT scope missed 12 docs files with real npm-scope content). Independently reviewed READY, clean 1:1 substitution, zero stray refs.
- T10: DONE — As-built amendment task (start/menu.ts had a real spawn args array, doctor/run.ts had 6 remediation messages, both adapters' cli.ts had functional option defaults). Independent review confirmed the safety-critical menu.ts args-array fix is correct; found one stray old-scope string in render.test.ts:16,19 (a copy of the pre-fix real default, would fail AC-1's sweep since not on the documented exception list) -- fixed directly by orchestrator, re-verified 5/5 tests pass, zero remaining refs in all 7 owned files.
- T11: DONE — Comment/JSDoc-only sweep across 18 files. Independent review confirmed zero occurrences were real code (the specific risk this task's boundary was designed to prevent); split cleanly into 25 comment lines + 21 import/export specifier lines within T3's already-covered glob, both verified correct. pnpm typecheck/build clean.
- T12: DONE — Linked docs/migration-npm-scope.md from packages/core/README.md (absolute GitHub blob/main URL, verified docs/ is excluded from the published npm 'files' field so a relative link would 404) with the exact npm uninstall/install commands inline, and from docs/README.md's Documentation list. Independently reviewed READY; re-verified myself (133/133 doc tests, clean typecheck/build). Blocker closed before T1 dispatch: amended T1's DRAFT allowlist text to also cover the @manehorizons literals this task legitimately introduces in packages/core/README.md and docs/README.md (remediation-command text), alongside T5's and T8's existing entries. Root README.md's T8-added link confirmed undisturbed, not duplicated. Note: the absolute blob/main link 404s until this phase's single commit lands on main -- same pre-existing pattern as docs/DEMO.md's blob/main link in the same file, not a T12 defect.
- T13: DONE — Renamed 3 real leftover @manehorizons references T2-T12 missed: bug_report.yml's user-facing version-report field, docs.yml's typedoc comment+step name, release.yml's testkit-skip comment. Pure string swaps, YAML validity confirmed. Independently reviewed READY alongside T1; re-verified myself.
- T14: DONE — Fixed checkHostHooks/checkCodexHooks in run.ts to branch on hasStaleScopeManagedHook before the generic not-found message, with a scope-agnostic message (no @manehorizons literal, verified via npm-scope-sweep still 2/2 green). Independently reviewed READY: 3-way branch logic proven exhaustive/non-overlapping (S implies M, so states are (not M), (M,S), (M,not S)), --fix --wire-host command re-verified correct a third time. 5 new tests assert detail content, not just severity/fixId. Re-verified myself.
- T15: DONE — Phase-qualified all 6 retagged ACs (1,3,4,5,6,8) to 250-01/AC-N on already-real, already-passing assertions -- pure title edits, no assertion bodies changed. Closed 2 genuine coverage gaps with one honest test each, not bypasses: AC-2 (exact package.json name-field equality across all 6 packages) and AC-7 (migration doc contains the correct --wire-host command + both READMEs link it). Independently reviewed READY: every retag verified as a pure string edit, pre-existing foreign AC tokens confirmed preserved, both new tests read and confirmed non-vacuous against real file content, full monorepo build/test/typecheck/lint all green (3622+357+56+14+98+52 tests). Flagged non-blocking follow-up: host-codex's install.test.ts has no plain-default hook-command assertion (pre-dates phase 250, a T4-era gap; AC-4 coverage is satisfied via host-claude-code's assertion, per-AC not per-adapter). Re-verified myself: all 8 ACs independently confirmed SATISFIED.
- T16: DONE — Extended T14's stale-vs-absent honesty fix to config-explain's third promised caller (host-hooks.ts's own docstring names all three). Added ExplainContext.hostHooksStale, threaded from gather.ts's readHostHookState (single parse, both flags derived from the same document, best-effort/never-throws) into build.ts's deriveWarnings, distinct scope-agnostic message for the stale case. Independently reviewed READY: gather.ts's single-read approach confirmed consistent with doctor's checkHostHooks; build.ts's stale branch confirmed unsuppressable by any other condition (installed/stale are mutually exclusive by construction); reviewer ran their own live 3-way scratch-repo check (absent/stale/fresh) independently, not trusting the implementer's paste -- all three matched the DRAFT spec verbatim. No @manehorizons literal introduced (confirmed by grep + npm-scope-sweep still green). Re-verified myself: 392/392 files, 3627/3627 tests, clean typecheck/build.

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
- evidence tally: ai-verified=0, executed=8, assertion=0, mention=0, unverified=0

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_

## State at settle

- loop position before settle: BUILD
- revision: 118
- session subagent spawns: 356
