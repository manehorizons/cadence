# SETTLE Summary — 295-01

**Completed:** 2026-08-23T20:27:32.261Z
**Content hash (sha256):** ab08d5bab414b06262009e69a100c9c4e499bea5a8a4f83d46ee2253fe85c158

## Acceptance Criteria

- AC-1: PASS (executed)
- AC-2: PASS (executed)
- AC-3: PASS (executed)
- AC-4: PASS (executed)
- AC-5: PASS (executed)
- AC-6: PASS (executed)
- AC-7: PASS (executed)

## Tasks

- T1: DONE — Added CLAUDE_CODE_EXPECTED_HOOKS to host-toolkit/src/routing.ts (routing.ts is host-toolkit's main entrypoint, no separate index.ts exists). Refactored install.ts's desired map to build from it. All 101 existing host-claude-code tests pass unchanged -- byte-identical installed shape confirmed.
- T2: DONE — Added core's own CLAUDE_CODE_EXPECTED_HOOKS copy + findMissingManagedHooks to host-hooks.ts; wired into checkHostHooks (severity error, fixId host-install) before the existing hasManagedCadence/stale-scope fallthrough. Exported the constant from core/src/index.ts (core's first-ever public JS export) for T4's drift test. Updated hasManagedCadence's doc comment to record the deliberate checkHostHooks/checkCodexHooks divergence. Core builds clean. EXPECTED RED: 7 pre-existing tests across host-hooks.test.ts, host-checks.test.ts, run.test.ts, fix-id.test.ts now fail because their single-entry/empty fixtures are newly incomplete under the completeness check -- this is by design, T3 updates those fixtures. Full suite is NOT green until T3 lands.
- T3: DONE — Added shared host-hooks-fixture.ts builder. Fixed all 7 pre-existing test failures from T2 across host-hooks.test.ts (1), host-checks.test.ts (2), run.test.ts (3), fix-id.test.ts (1). Added new tests for AC-1/AC-2 (measured-shape reproduction: missing Skill matcher + no SubagentStart -> error naming both), AC-3 (complete set -> ok, exact literal message pinned), AC-4 read side (non-managed third-party entry never named), AC-7 (checkCodexHooks still ok on single marker, unaffected). Full core suite: 452/452 files, 4452/4452 tests green.
- T4: DONE — Added expected-hooks-drift.test.ts in host-claude-code, importing core's and host-toolkit's independent CLAUDE_CODE_EXPECTED_HOOKS copies and asserting agreement. Desync proof performed live: temporarily changed core's SubagentStart matcher to 'DESYNC-TEST', rebuilt, confirmed the drift test fails with a clear diff; reverted, rebuilt, confirmed 2/2 pass again. Added AC-4 fix-side test to host-hooks.test.ts (partial install + non-managed deja-style entry -> --fix --wire-host completes it, non-managed entry survives verbatim). Updated docs/reference/commands.md's host-hooks row to 'error / warning' with the new completeness description. Added .changeset/host-hooks-completeness-check.md covering all 3 changed packages (core, host-toolkit, host-claude-code) as minor. Full host-claude-code suite: 103/103 tests green.
- T5: DONE — Repaired this repo's .claude/settings.json via the real installer (install --no-commands --command ... --cadence ..., matching the exact committed command string -- NOT --local, which would have corrupted the path to this worktree). First attempt without --no-commands also rewrote 12 slash-command files to non-portable dogfood run-lines as a side effect of --cadence threading into command generation too -- discarded and redid with --no-commands. Verified: all 7 events / 8 entries now present, non-managed deja entries survive verbatim (content unchanged, only reordered by the real evict-and-reappend merge algorithm), cadence doctor host-hooks flips error->ok with the exact pre-phase-295 message. Full monorepo test suite green (all 6 packages).

## Gate provenance

- draft-read: ran
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
- revision: 33
- session subagent spawns: 14
