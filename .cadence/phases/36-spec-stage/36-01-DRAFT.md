---
phase: 36-spec-stage
id: 36-01
tier: standard
---

# 36-01 — brainstorm-to-spec stage

## Objective

Add a pre-DRAFT SPEC loop position + `<id>-SPEC.md` artifact + `cadence spec new/check/approve` with a convergent spec-review gate reusing Phase 35.1 `nextConvergence` (v1.2 feature-expansion #1).

## Acceptance Criteria

### AC-1: SPEC loop position + spec new + draft-guard + progress arm
Given cadence has no pre-DRAFT stage
When the feature ships
Then `LoopPositionZ` gains `SPEC`; `state.activeSpec` (`.nullable().default(null)`, emptyState null); `progress.ts` gains a mandatory `case 'SPEC':` arm; `cadence spec new` (IDLE-gated) scaffolds `<id>-SPEC.md` + `loopPosition='SPEC'` + `activeSpec=id`; `cadence draft new` refuses while SPEC with a SPEC-aware message.

### AC-2: SpecZ + spec-parser
Given a `<id>-SPEC.md`
When parsed
Then `SpecZ` + `spec-parser` parse objective/ACs(GWT)/constraints/openQuestions (reuses `AcceptanceCriterionZ`; absent optional sections → []; additive/back-compat).

### AC-3: convergent spec approve (pass path)
Given an approved-quality SPEC
When `cadence spec approve` runs
Then `selectSpecReviewVerifier` runs through `nextConvergence` with `<id>-SPEC-REVIEW.json` attempts/history (plan-review sidecar shape); pass → SPEC.md `status:APPROVED` + `loopPosition='IDLE'` + `activeSpec=null`; legacy/absent sidecar → attemptsSoFar 0.

### AC-4: reloop
Given a failing spec-review below maxAttempts
When `cadence spec approve` runs
Then incremented sidecar + findings + `attempt N/MAX` + exit 1, stays SPEC, not APPROVED.

### AC-5: escalate + bypass
Given the maxAttempts-th failing spec-review
When `cadence spec approve` runs
Then distinct human-decision message + unconditional `spec-review-unconverged` anomaly + hard-refuse unless `--allow-spec-review-failure`; the flag bypasses ANY fail (reloop or escalate) → APPROVED+IDLE+activeSpec=null + `bypassed:true` history (Phase 35.1 semantics).

### AC-6: schema bumps + docs
Given the delivery
When docs update
Then `config.specReview` default mock (back-compat); `AnomalyTypeZ` additive `spec-review-unconverged`; no `gates/engine.ts` change; DESIGN (§10 item 37 + §4.1 note), CHANGELOG (Added + bumps), ROADMAP (#1 ✓ Phase 36.1, #1b deferred bullet, sequence `#1 ✓ → #4 (next)`) reflect it.

## Tasks

### T1: types
- files: `packages/types/src/state.ts`, `packages/types/src/spec.ts`, `packages/types/src/anomaly.ts`, `packages/types/src/config.ts`, `packages/types/src/index.ts`, `packages/types/tests/state.test.ts`, `packages/types/tests/anomaly.test.ts`, `packages/types/tests/config.test.ts`, `packages/types/tests/plan.test.ts`
- action: `LoopPositionZ+SPEC`; `state.activeSpec`; new `SpecZ` (spec.ts) reusing `AcceptanceCriterionZ`; `AnomalyTypeZ+spec-review-unconverged`; `config.specReview`+default; barrel export; schema tests
- verify: `pnpm -C packages/types test && pnpm -C packages/types build`
- done: AC-1, AC-2, AC-6

### T2: spec-parser
- files: `packages/core/src/parse/spec-parser.ts`, `packages/core/tests/parse/spec-parser.test.ts`
- action: clone draft-parser's 5 private helpers; `parseSpecMd` (objective/AC/constraints/openQuestions) TDD
- verify: `pnpm -C packages/core test -- run parse/spec-parser` green; `pnpm -C packages/core test -- run parse` no regression
- done: AC-2

### T3: spec-review trio
- files: `packages/core/src/verify/spec-review.ts`, `packages/core/src/verify/spec-review-factory.ts`, `packages/core/src/notify/spec-review.ts`
- action: clone plan-review verifier (mock floor requires ≥1 constraint) + factory (`config.specReview`) + notify (`emitSpecReviewUnconverged`, unconditional/no-throw)
- verify: `pnpm -C packages/core build` clean
- done: AC-3, AC-5

### T4: spec command + register + draft-guard + progress arm + integration
- files: `packages/core/src/cli/commands/spec.ts`, `packages/core/src/cli/register.ts`, `packages/core/src/cli/commands/draft.ts`, `packages/core/src/progress.ts`, `packages/core/tests/cli/spec-stage.test.ts`
- action: `progress.ts` mandatory `case 'SPEC':`; register spec; `draft new` SPEC-aware message; `spec new/check/approve` (port the Phase 35.1 convergent block Draft→Spec); 7-path integration
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run cli/spec-stage parse/spec-parser` green
- done: AC-1, AC-3, AC-4, AC-5

### T5: docs + ROADMAP
- files: `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`
- action: DESIGN §10 item 37 + §4.1 note; CHANGELOG Added; ROADMAP #1 ✓ delivered + #1b deferred bullet + sequence `#1 ✓ → #4 (next)`
- verify: `git diff --stat` only the 3 docs
- done: AC-6

### T6: full gate + two-commit settle
- files: `DESIGN.md`
- action: full `pnpm turbo run lint typecheck test build`; substantive commit; `settle run --auto`; settle commit
- verify: 16/16 green; loop IDLE after settle; feat+settle pair
- done: AC-6

## Boundaries

- DO NOT build this phase via `cadence spec new` (bootstrapping the brand-new stage on itself) — use the normal draft→build→settle loop; 36-01 is auto×standard.
- DO NOT change `gates/engine.ts` (spec-review is opt-in by use, not a matrix cell).
- DO NOT gate `spec-review-unconverged` emission on `anomaly-notify` (unconditional by design).
- DO NOT add a new convergence-bound config (reuse `config.convergence.maxAttempts`); DO NOT build SPEC→DRAFT auto-seed (deferred #1b); DO NOT add a `spec discard` command (manual escape).
- DO NOT refactor `draft-parser.ts` to export helpers (reproduce privately in spec-parser).
- DO NOT use `--allow-missing-coverage` at settle (phase adds packages/** tests).
- DO NOT `git commit` per task (two-commit convention); DO NOT `git push` (user-gated). DO NOT touch `graphify-out/`.
