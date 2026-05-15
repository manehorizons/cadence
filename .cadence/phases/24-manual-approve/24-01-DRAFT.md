---
phase: 24-manual-approve
id: 24-01
tier: standard
status: PENDING
---

# 24-01 — Manual approve gate (interactive Y/N)

## Objective

Wire an interactive `Approve and enter BUILD? [y/n]` prompt into `cadence draft approve` when `'approve'` is in the effective gate set, reusing the Phase 16 `Prompter` abstraction (`StdinPrompter` + `ScriptedPrompter`) and the `CADENCE_PROMPTER_SCRIPT` env-var test seam.

## Acceptance Criteria

### AC-1: Gate fires when in set
Given a draft whose effective gate set includes `'approve'` (default: strict-any-tier, standard×standard, standard×complex)
When the user runs `cadence draft approve <phase> <num>` on a TTY
Then the command prints `Approve and enter BUILD? [y/n]: ` via the prompter before any state mutation

### AC-2: 'y' proceeds
Given AC-1's prompt is showing
When the user answers `y` (or `yes`, case-insensitive)
Then state transitions to BUILD, `draftReadAt` is stamped, and the command exits 0 with `Approved <id>; loopPosition=BUILD` on stdout

### AC-3: 'n' refuses without state change
Given AC-1's prompt is showing
When the user answers `n` (or `no`, case-insensitive, or empty/anything else after the 3-retry walker pattern)
Then no state mutation occurs (loopPosition stays DRAFT, no `draftReadAt` bump), stderr writes `draft approve refused: user declined manual approve gate.`, and the command exits 1

### AC-4: `--no-approve` bypasses
Given an effective gate set including `'approve'`
When the user runs `cadence draft approve <phase> <num> --no-approve`
Then no prompt fires and approve proceeds exactly as if the gate were absent

### AC-5: Non-TTY refusal unless `--no-approve`
Given an effective gate set including `'approve'` and stdin is not a TTY (CI, piped invocation), and `CADENCE_PROMPTER_SCRIPT` is unset
When the user runs `cadence draft approve <phase> <num>` without `--no-approve`
Then `StdinPrompter` refuses (its existing TTY guard fires), stderr writes the `StdinPrompter: stdin is not a TTY…` line plus a hint to pass `--no-approve`, and the command exits 1

### AC-6: Gate-aware (no gate ⇒ unchanged)
Given a draft whose effective gate set does NOT include `'approve'` (e.g., `auto × quick-fix`)
When the user runs `cadence draft approve <phase> <num>`
Then no prompt fires and behavior is byte-identical to today (existing tests stay green)

## Tasks

### T1: Wire approve gate into `draft approve`
- files: `packages/core/src/cli/commands/draft.ts`
- action: After the existing coherence-blocker / soft-cap checks (so blockers still refuse first) and before the BUILD state transition, when `gateSet.gates.includes('approve')` and `opts.noApprove !== true`, construct a `Prompter` (mirror the settle.ts seam: `CADENCE_PROMPTER_SCRIPT` → `ScriptedPrompter`; else `new StdinPrompter()`), call a new `askApproveVerdict(prompter)` helper that accepts `y/yes/n/no` (3-retry walker pattern like `askVerdict` in `verify/interactive.ts`), close the prompter, and refuse with exit 1 on `n` / retry-exhaustion. Add `--no-approve` option to the commander declaration.
- verify: `pnpm --filter @cadence/core test -- draft-approve-gate` covers AC-1..AC-6.
- done: AC-1, AC-2, AC-3, AC-4, AC-6

### T2: Surface non-TTY hint
- files: `packages/core/src/cli/commands/draft.ts`
- action: When `new StdinPrompter()` throws (non-TTY guard), catch the error and write a one-line stderr message that quotes the original error AND appends `Pass --no-approve to bypass the manual approve gate.` Then exit 1 without state change.
- verify: AC-5 test asserts both the original `StdinPrompter:` prefix and the `--no-approve` hint appear on stderr.
- done: AC-5

### T3: Test suite
- files: `packages/core/tests/cli/draft-approve-gate.test.ts`
- action: New test file mirroring the spawned-CLI pattern used by `settle-interactive.test.ts`. Cases: (1) gate fires + `y` succeeds (CADENCE_PROMPTER_SCRIPT=`y\n`); (2) gate fires + `n` refuses (exit 1, state unchanged on disk); (3) `--no-approve` skips prompt; (4) non-TTY without `--no-approve` refuses with hint; (5) profile=auto tier=quick-fix → no gate, prompt skipped (regression guard for AC-6); (6) coherence blocker still wins over the approve gate (refuses before prompting).
- verify: `pnpm --filter @cadence/core test -- draft-approve-gate` green; full `pnpm turbo run test` green.
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

### T4: Docs + punchlist tick
- files: `DESIGN.md`, `CHANGELOG.md`, `README.md`
- action: DESIGN.md §4.1 — note `approve` shipped Phase 24.1 (replace the decorative cell marker). DESIGN.md §10 punchlist — tick `Phase 24.1`. CHANGELOG.md — add Unreleased entry under `### Added`. README.md — extend the gates table / "how the matrix maps to behavior" section to mention the interactive prompt.
- verify: `pnpm turbo run test` green; manual `git diff DESIGN.md` shows §4.1 + §10 ticks.
- done: AC-1, AC-6

## Boundaries

- DO NOT change `gates/engine.ts` — `'approve'` is already in the matrix; this phase is wiring, not matrix edits.
- DO NOT touch settle's interactive walker — `interactive-verdict` is a separate gate with separate semantics.
- DO NOT introduce a new `AnomalyType` for refuse-on-no — declining the manual gate is a normal exit-1, not an anomaly.
- DO NOT add a global `CADENCE_NO_APPROVE` env knob — per-invocation `--no-approve` flag only, per ROADMAP spec.
