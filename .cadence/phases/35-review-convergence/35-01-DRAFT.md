---
phase: 35-review-convergence
id: 35-01
tier: standard
---

# 35-01 — review-convergence loop primitive

## Objective

Wrap the `plan-review` gate at `draft approve` in a bounded review→reloop→escalate loop via a reusable pure `nextConvergence` primitive (v1.2 feature-expansion #2).

## Acceptance Criteria

### AC-1: pure nextConvergence primitive
Given pass + attemptsSoFar + maxAttempts
When `nextConvergence` runs
Then it returns pass (short-circuit) / reloop (`attempt<max`) / escalate (`attempt>=max`); unit-tested at attempts 0, max-1, max, and maxAttempts=1.

### AC-2: sidecar attempts/history + back-compat
Given the `<id>-PLAN-REVIEW.json` sidecar
When plan-review runs
Then it carries `converged`/`attempts`/`maxAttempts`/append-only `history` (entries `{at,pass,findingsCount,provider,model?,verdict,bypassed?}`); a legacy 29.7-shape sidecar (no `attempts`) reads as `attemptsSoFar=0`; legacy top-level fields preserved.

### AC-3: reloop
Given a failing plan-review below maxAttempts
When `draft approve` runs
Then it persists the incremented sidecar, prints findings + `attempt N/MAX`, exits 1, no BUILD transition.

### AC-4: escalate at MAX
Given the maxAttempts-th failing plan-review
When `draft approve` runs
Then it prints the distinct human-decision message, emits an unconditional `plan-review-unconverged` anomaly (fires under strict where `anomaly-notify` is absent), and hard-refuses unless the existing `--allow-plan-review-failure` (then proceeds + `bypassed:true` in history).

### AC-5: schema bumps + no regression
Given the anomaly/config schemas
When the feature ships
Then `AnomalyTypeZ` gains `plan-review-unconverged` (additive); `config.convergence.maxAttempts` default 3 (back-compat config without block); no `gates/engine.ts` matrix change; happy-path + non-strict×complex behavior unchanged.

### AC-6: docs + ROADMAP
Given the delivery
When docs update
Then DESIGN (§10 item 36 + §4.1 note), CHANGELOG (Added + AnomalyType bump), ROADMAP v1.2 feature-expansion (#2 ✓ delivered Phase 35.1, #1 next, sequence updated) reflect it.

## Tasks

### T1: type changes
- files: `packages/types/src/anomaly.ts`, `packages/types/src/config.ts`, `packages/types/tests/anomaly.test.ts`, `packages/types/tests/config.test.ts`
- action: `AnomalyTypeZ += 'plan-review-unconverged'`; `config.convergence.maxAttempts` (default 3); back-compat schema tests
- verify: `pnpm -C packages/types test && pnpm -C packages/types build`
- done: AC-5

### T2: converge.ts pure primitive
- files: `packages/core/src/verify/converge.ts`, `packages/core/tests/verify/converge.test.ts`
- action: TDD `nextConvergence(pass,attemptsSoFar,maxAttempts)`
- verify: `pnpm -C packages/core test -- run verify/converge` green (4)
- done: AC-1

### T3: emitPlanReviewUnconverged
- files: `packages/core/src/notify/plan-review.ts`
- action: unconditional/no-throw emit helper mirroring `notify/skill-audit.ts`
- verify: `pnpm -C packages/core build` clean
- done: AC-4

### T4: draft.ts plan-review rewire + integration
- files: `packages/core/src/cli/commands/draft.ts`, `packages/core/tests/cli/draft-approve-convergence.test.ts`
- action: replace the one-shot plan-review block — sidecar attempts read → verify → `nextConvergence` → persist new-shape sidecar+history → reloop/escalate/pass; 5-path strict×complex integration via mock provider
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run cli/draft-approve-convergence verify/converge` green
- done: AC-2, AC-3, AC-4

### T5: docs + ROADMAP
- files: `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`
- action: DESIGN §10 item 36 + §4.1 note; CHANGELOG Added; ROADMAP #2 ✓ delivered / #1 next / sequence updated
- verify: `git diff --stat` only the 3 docs
- done: AC-6

### T6: full gate + two-commit settle
- files: `DESIGN.md`
- action: full `pnpm turbo run lint typecheck test build`; substantive commit; `settle run --auto`; settle commit
- verify: 16/16 green; loop IDLE after settle; feat+settle pair
- done: AC-6

## Boundaries

- DO NOT add `profile`/`requiredSkills` frontmatter to THIS draft (35-01 = auto×standard → plan-review does NOT fire on its own settle; no bootstrapping a brand-new convergence path against itself).
- DO NOT change `gates/engine.ts` (no matrix cell — convergence changes how plan-review fails, not whether it fires).
- DO NOT gate `plan-review-unconverged` emission on `anomaly-notify` (unconditional by design — strict cells lack it).
- DO NOT add a new override flag (reuse existing `--allow-plan-review-failure`); DO NOT build an in-core auto-fixer (deferred #4).
- DO NOT use `--allow-missing-coverage` at settle (phase adds packages/** tests).
- DO NOT `git commit` per task (two-commit convention); DO NOT `git push` (user-gated). DO NOT touch `graphify-out/`.
