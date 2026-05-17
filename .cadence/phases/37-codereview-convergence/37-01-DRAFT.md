---
phase: 37-codereview-convergence
id: 37-01
tier: standard
status: PENDING
---

# 37-01 — code-review convergence at settle

## Objective

Wrap the Phase 24.3 `code-review` gate at `cadence settle run` in the shipped Phase 35.1 `nextConvergence` primitive (verbatim Plan→CodeReview port): attempts + append-only history in a new `<id>-CODE-REVIEW.json` sidecar, hard-escalate at `config.convergence.maxAttempts` (default 3) with a new unconditional `code-review-unconverged` anomaly, while preserving the Phase 24.3 `--force`/`--allow-code-review-failure` bypass contract verbatim.

## Acceptance Criteria

### AC-1: code-review@settle is a bounded convergence loop with a back-compatible sidecar
Given the `code-review` gate fires at `settle run` and a prior `<id>-CODE-REVIEW.json` may be absent, legacy-shape, or corrupt
When the gate runs (`pass := no HIGH finding`) and reads/writes the sidecar
Then it reuses `nextConvergence` verbatim, persists `converged`/`attempts`/`maxAttempts`/append-only `history` (plan-review shape, HIGH-count `findingsCount`), treats absent/corrupt/legacy-without-`attempts` as `attemptsSoFar 0`, and preserves the legacy-style top-level sidecar fields.

### AC-2: reloop on HIGH below max with no bypass
Given a HIGH finding, attempts below `maxAttempts`, and no bypass flag
When `settle run` evaluates the code-review gate
Then it persists the incremented sidecar, prints each HIGH finding plus a `code-review: attempt N/MAX did not pass …` line, sets exit code 1, refuses settle, and writes no SUMMARY.

### AC-3: escalate at maxAttempts emits an unconditional anomaly
Given a HIGH finding and `attempts` reaching `config.convergence.maxAttempts` with no bypass flag
When `settle run` evaluates the code-review gate (including under strict×standard, which carries no `anomaly-notify`)
Then it prints a distinct "a human decision is required" message, emits the new `code-review-unconverged` anomaly unconditionally (while the sibling `code-review-high` stays `anomaly-notify`-gated and silent there), sets exit code 1, and hard-refuses unless a bypass flag is passed.

### AC-4: the Phase 24.3 bypass contract is preserved verbatim and not narrowed
Given a failing code-review (reloop OR escalate) and `--force` OR `--allow-code-review-failure`
When `settle run` evaluates the code-review gate
Then settle proceeds, `SUMMARY.codeReview` is recorded, `code-review-high` (`bypassed:true`) is emitted under its existing `anomaly-notify` guard, the sidecar history records `bypassed:true`, the existing branching "—{force|allow-code-review-failure} set; proceeding past N HIGH finding(s)" line is printed verbatim, the existing `settle-code-review.test.ts` AC-4/5/6 stay green unchanged, and `--force` keeps bypassing code-review.

### AC-5: additive, no schema/config/primitive change
Given the new anomaly type and notify helper
When the change ships
Then `AnomalyTypeZ` gains `code-review-unconverged` additively, `emitCodeReviewUnconverged` is unconditional/no-throw in `notify/code-review.ts`, no new config is added (reuse `config.convergence.maxAttempts`), and `gates/engine.ts`/`state.json`/`verify/converge.ts` are unchanged with happy-path and non-code-review cells unaffected.

### AC-6: docs and roadmap updated
Given the feature is implemented
When documentation is updated
Then DESIGN.md gains a §10 punchlist item plus a §4.1 code-review-convergence note, CHANGELOG.md gains an Added entry with the AnomalyType bump, and `.cadence/ROADMAP.md` marks #4 delivered with sequence `#6✓→#2✓→#1✓→#4✓` (v1.2 feature-expansion complete bar parked items).

## Tasks

### T1: anomaly type + schema test
- files: `packages/types/src/anomaly.ts`, `packages/types/tests/anomaly.test.ts`
- action: append `'code-review-unconverged'` to `AnomalyTypeZ` (additive); add an `AC-5`-named anomaly schema test case
- verify: `pnpm -C packages/types test && pnpm -C packages/types build`
- done: AC-5

### T2: emitCodeReviewUnconverged notify helper
- files: `packages/core/src/notify/code-review.ts`
- action: append `emitCodeReviewUnconverged` (unconditional/no-throw, `draftId` ctx) after `emitCodeReviewHigh`, cloning `emitPlanReviewUnconverged`
- verify: `pnpm -C packages/core build` (clean tsc)
- done: AC-5

### T3: rewire settle.ts code-review block + integration tests
- files: `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/cli/settle-codereview-convergence.test.ts`
- action: add 2 imports (`nextConvergence`, `emitCodeReviewUnconverged`); replace the one-shot HIGH-refuse inside the code-review `try {}` with the convergent block (sidecar read → `nextConvergence` → persist → pass/bypass/reloop/escalate, bypass-before-reloop ordering); add the 6-path convergence integration test
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run cli/settle-codereview-convergence cli/settle-code-review` (new suite green AND existing `settle-code-review` green unchanged)
- done: AC-1, AC-2, AC-3, AC-4

### T4: docs + ROADMAP
- files: `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`
- action: DESIGN §10 punchlist item + §4.1 code-review-convergence note; CHANGELOG Added entry + AnomalyType bump; ROADMAP #4 ✓ and sequence `#6✓→#2✓→#1✓→#4✓`
- verify: `git diff --stat -- DESIGN.md CHANGELOG.md .cadence/ROADMAP.md` (exactly those 3)
- done: AC-6

### T5: full gate + two-commit settle
- files: `DESIGN.md`
- action: run the full `pnpm turbo run lint typecheck test build` gate, substantive feat commit, `settle run --auto`, settle commit
- verify: full gate 16/16 green; `Settled 37-01`; loop IDLE
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

## Boundaries

- DO NOT modify `packages/core/src/verify/converge.ts` (reuse `nextConvergence` verbatim; Phase 35.1 owns its unit test).
- DO NOT modify `packages/types/src/config.ts` (`config.convergence.maxAttempts` already shipped at Phase 35.1; reuse it — no new config knob).
- DO NOT modify `packages/core/src/notify/plan-review.ts` or `spec-review.ts` (clone-source only, read not edited).
- DO NOT modify `gates/engine.ts` or the `state.json` schema (additive only; no gate-matrix cell change).
- DO NOT edit the existing `packages/core/tests/cli/settle-code-review.test.ts` — it is the Phase 24.3 contract and must stay green with zero edits.
- DO NOT narrow the `--force` bypass: `--force` OR `--allow-code-review-failure` must both bypass any failing code-review (Phase 24.3 contract).
- DO NOT add `profile:` or `requiredSkills:` frontmatter to this DRAFT (`37-01` is auto×standard by design — strict/skill-audit gates must not fire on this phase's own settle).
