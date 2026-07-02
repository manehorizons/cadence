# SETTLE Summary — 139-01

**Completed:** 2026-07-02T03:23:54.502Z

## Acceptance Criteria

- AC-1: PASS
- AC-2: PASS
- AC-3: PASS
- AC-4: PASS
- AC-5: PASS

## Tasks

- T1: DONE — defaultConfig.verification.coverageMode flipped mention -> assertion; all 3 presets inherit; Zod schema-level backward-compat default left at mention
- T2: DONE — detectTestCommand pure helper added to init/plan.ts; 7 tests cover all 4 lockfile types + no-lockfile fallback + no scripts.test + no package.json
- T3: DONE — testCommand wired into InitPlan (planVerification) and the real init.ts write path (only set when non-null, matches optional schema field); verificationLine + CLI console output both render a 'test command' line; --dry-run and real init parity verified in CLI test
- T4: DONE — NO_TEST_COMMAND_NOTICE added to cadence-types guidance.ts mirroring MOCK_VERIFIER_NOTICE; build-test-must-pass gate now writes it via ctx.io.err on ran:false, still passes. Fallout: testkit's tempRepo({initialized:true}) writes defaultConfig verbatim, so the coverageMode flip (T1) + new notice (T4) rippled into ~25 pre-existing CLI tests across 7 files (settle-code-review, settle-codereview-convergence, settle-coverage, settle-deep, settle-gate-extraction, settle-interactive, settle-security-audit) whose comment-only seed helpers (e.g. '// covers AC-1') relied on lenient mention-mode. Fixed at the root: each shared seed helper now writes a real asserting it()/test() block; settle-gate-extraction's 2 snapshot anchors updated to include the new notice line + assertion-mode wording. Full monorepo gate (lint/typecheck/test/build, 20/20 tasks, 1918 core tests) green after the fix.
- T5: DONE — docs/reference/config.md: new testCommand/coverageMode init-behavior subsections + field table updates; docs/concepts.md: build-test-must-pass and test-coverage gate rows updated to describe the new default + notice

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
