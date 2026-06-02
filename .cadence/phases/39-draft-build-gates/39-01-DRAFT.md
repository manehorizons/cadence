---
phase: 39-draft-build-gates
id: 39-01
tier: complex
status: DONE
---

# 39-01 — Lift the draft + build command gates

## Objective

Extract the four remaining inline enum gates — `coherence-check` (Phase 23.2), `approve` (24.1), `plan-review` (25.1 + 35.1 convergence) from `draft.ts`, and `per-task-verify` (24.2) from `build.ts` — into discrete `gates/*.ts` modules, bit-identical at the CLI surface. Operator-chosen shape: separate contexts (`DraftGateContext`, `BuildGateContext`) sharing the `GateResult` shape via a generalized `GateResult<P = SettleAccumulator>`. After this, every enum gate except `anomaly-notify` has a discrete module (12/13), so the Phase 44.1 registry can be total over the settle-dispatched subset. Each gate reaches its collaborators only through `ctx` ports; the command router owns construction (the 39.1 gate-collaborator policy applied to two new surfaces).

## Acceptance Criteria

### AC-1: four discrete gate modules
Given the inline gate logic in `draft.ts` and `build.ts`
When the four gates are extracted
Then four discrete gate modules exist under `gates/` (`coherence.ts`, `approve.ts`, `plan-review.ts`, `per-task-verify.ts`), each a `Draft/BuildGateImpl` `(ctx) => Promise<GateResult>`, and the commands no longer run the gate logic inline

### AC-2: draft.ts under 200 LoC
Given `draft.ts` at 506 LoC
When the gates are extracted to modules and the command shrinks to a router
Then `draft.ts` drops under 200 LoC (achieved: 146; `draft new` relocated to `cli/commands/draft-new.ts`)

### AC-3: build.ts under 150 LoC
Given `build.ts` at 274 LoC
When the per-task-verify gate is extracted and the command shrinks to a router
Then `build.ts` drops under 150 LoC (achieved: 116)

### AC-4: plan-review convergence sidecar preserved
Given the Phase 35.1 convergence sidecar (`ConvergenceSidecar` port, reused from 39.4)
When `plan-review` is extracted
Then the convergence sidecar is preserved — `nextConvergence` consumed unchanged, the legacy 29.7 top-level JSON layout byte-identical — and unconverged is emitted via `ctx.emit.planReviewUnconverged`

### AC-5: contracts preserved
Given the Phase 23.2 / 24.1 / 24.2 / 25.1 / 35.1 contracts
When the extraction lands
Then all of those contracts are preserved exactly (coherence blockers/warns presentation, manual-approve TTY refusal, per-task verify/bypass, plan-review three arms)

### AC-6: bit-identical CLI surface
Given every existing draft/build E2E suite
When the extraction lands
Then behavior is bit-identical at the CLI surface — stderr / exit codes / sidecar / anomaly payloads verbatim — and every existing draft/build E2E suite passes unchanged

### AC-7: registry coverage 12/13
Given `registry-coverage.test.ts` with four PENDING gate rows
When the four modules exist
Then the four move PENDING → IMPLEMENTED (12 of 13; `anomaly-notify` the lone exception; PENDING empty) and the count assertion is updated

## Tasks

### T1: generalize GateResult<P = SettleAccumulator>
- files: `packages/core/src/gates/types.ts`
- action: generalize `GateResult` to `GateResult<P = SettleAccumulator>` so per-task-verify can carry a `PerTaskVerifyRecord` payload while settle + the 8 existing gates keep the default; confirm settle, the 8 gates, and `mergeInto` still typecheck untouched
- verify: `pnpm -C packages/core typecheck`
- done: AC-1

### T2: draft-types.ts / build-types.ts
- files: `packages/core/src/gates/draft-types.ts`, `packages/core/src/gates/build-types.ts`
- action: define `DraftGateContext` + `DraftGateImpl`, `BuildGateContext` + `BuildGateImpl` + `BuildProducts`, with ports for verifier / notifier / prompter / sidecar reached only through ctx
- verify: `pnpm -C packages/core typecheck`
- done: AC-1

### T3: coherence + approve gates (TDD red→green)
- files: `packages/core/src/gates/coherence.ts`, `packages/core/src/gates/approve.ts`, `packages/core/tests/gates/coherence.test.ts`, `packages/core/tests/gates/approve.test.ts`
- action: port verbatim — coherence stays UNCONDITIONAL (memoized `ctx.coherence()`, blocker `runCoherenceGate`, `emitCoherenceWarns`, `printAllCoherenceIssues` with the preserved double-`[WARN]`); approve via `ctx.prompter.create()` + `askApproveVerdict`; fake-ctx tests for every branch
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run gates/coherence gates/approve`
- done: AC-1, AC-5

### T4: plan-review + per-task-verify gates (TDD red→green)
- files: `packages/core/src/gates/plan-review.ts`, `packages/core/src/gates/per-task-verify.ts`, `packages/core/tests/gates/plan-review.test.ts`, `packages/core/tests/gates/per-task-verify.test.ts`
- action: port plan-review verbatim (sidecar read/write, `nextConvergence`, three arms bypass/reloop/escalate, `ctx.emit.planReviewUnconverged`); per-task-verify returns `GateResult<BuildProducts>` with `summaryPatch.perTaskRecord`, refuse + `per-task-fail` emit / bypass + `bypassed:true`; fake-ctx branch tests
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run gates/plan-review gates/per-task-verify`
- done: AC-1, AC-4, AC-5

### T5: draft.ts + build.ts routers + context adapters
- files: `packages/core/src/cli/commands/draft.ts`, `packages/core/src/cli/commands/build.ts`, `packages/core/src/cli/commands/draft-new.ts`, `packages/core/src/gates/draft-context.ts`, `packages/core/src/gates/build-context.ts`
- action: build `DraftGateContext`/`BuildGateContext` adapters; shrink draft.ts to a router (coherence-blockers → soft-cap → approve → plan-review → coherence-warns → BUILD); relocate `draft new` to `draft-new.ts`; shrink build.ts to a router dispatching `runPerTaskVerifyGate` + threading the record; verify draft/build suites green after each swap
- verify: `pnpm -C packages/core build && pnpm -C packages/core test`
- done: AC-2, AC-3, AC-6

### T6: registry-coverage bucket flip
- files: `packages/core/tests/gates/registry-coverage.test.ts`
- action: move the 4 PENDING → IMPLEMENTED (12 implemented, 0 pending); update the count assertion
- verify: `pnpm -C packages/core test -- run gates/registry-coverage`
- done: AC-7

### T7: full gate + two-commit settle
- files: (none — gate run)
- action: run the full `pnpm turbo run lint typecheck test build` gate; all existing draft/build E2E suites pass unchanged (bit-identical proof); confirm `draft.ts < 200` and `build.ts < 150` LoC; substantive feat commit
- verify: full gate green; draft.ts 146 LoC, build.ts 116 LoC
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7

## Boundaries

- DO NOT force the draft/build gates through `SettleContext` — they fire at approve/task-record time with different inputs; `DraftGateImpl`/`BuildGateImpl` are distinct from the settle `GateImpl` (flagged for 44.1's registry-subset refinement).
- DO NOT change any settle call site or the 8 existing gates — `GateResult<P = SettleAccumulator>` defaults keep them untouched; `mergeInto` stays settle-only.
- DO NOT wire `coherence-check` to its (always-fire) membership — it stays unconditional, bit-identical (39.2's wiring was a conscious operator exception); membership wiring is deferred.
- DO NOT pull soft-cap (21.1), task-id validation (29.8), or loop-violation handling into `gates/` — they are not named enum gates and stay in the routers.
- DO NOT alter stderr, exit codes, the convergence sidecar JSON layout, or anomaly payloads — bit-identical at the CLI surface.
