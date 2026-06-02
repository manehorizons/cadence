---
phase: 39-enum-gate-coverage
id: 39-01
tier: standard
status: DONE
---

# 39-01 — Enum-gate coverage (registry completion)

## Objective

Bring the `Gate` enum to total registry coverage against the 39.1 contract. The
original roadmap left four enum members inline; this phase extracts the three
discrete checks — `draft-read` (the Phase 23.1 DRAFT-read mtime gate),
`structural-verifier`, and `build-test-must-pass` — into `gates/*.ts` modules
conforming to the `GateImpl` shape. `draft-read` is a verbatim, bit-identical
extraction. `structural-verifier` and `build-test-must-pass` were decorative
`ALWAYS_FIRE` enum members with zero in-engine enforcement; per the operator
decision (2026-05-29) they are wired for real — consciously amending the v1.3
bit-identical anchor to satisfy the v1.0 "matrix is no longer decorative"
anchor. Contract growth (blessed per 39.1): `SettleContext` gains
`draftMtimeMs()` + a `RunnerPort`; `SettleOpts` gains
`allowStaleDraft`/`allowOpenTasks`/`allowFailingBuild`; `@cadence/types`
`verification.testCommand` is added (additive, optional). `anomaly-notify`
remains the lone finalizer exception; the remaining seven enum gates await
39.3–39.7, tracked by a new registry-coverage exhaustiveness test.

## Acceptance Criteria

### AC-1: draft-read single home, bit-identical
Given the Phase 23.1 draft-read mtime gate currently inline in `settle.ts`
When it is lifted into `runDraftReadGate(ctx)` in `gates/draft-read.ts`
Then it is the single home for the gate, `settle.ts` no longer stats DRAFT.md inline for it, and output is bit-identical

### AC-2: structural-verifier refuses on open tasks
Given `runStructuralVerifierGate(ctx)`
When a task status is not in {DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED} and neither `--allow-open-tasks` nor `--force` is set
Then the gate refuses; otherwise it passes

### AC-3: build-test gate gated on testCommand exit
Given `runBuildTestGate(ctx)`
When there is no `testCommand`
Then it passes with a note; on a non-zero runner exit it refuses unless `--allow-failing-build`/`--force`; on a zero exit it passes

### AC-4: uniform GateImpl conformance
Given the three new gate modules
When checked against `GateImpl`
Then all three conform with no casts (`const _c: GateImpl = runStructuralVerifierGate` compiles for each)

### AC-5: stderr + runner only through ports
Given each gate emits output and build-test runs a command
When a test captures stderr
Then each gate writes stderr only through `ctx.io.err` and the build-test runner is reached only via `ctx.runner`, never a direct `spawn` import inside the gate

### AC-6: gate tests reach every branch without the CLI stack
Given the new gate modules
When their unit tests run
Then they reach every branch (pass / refuse / bypass-flag / `--force`; for build-test additionally `ran:false`, `ok:true`, `ok:false`) without standing up the CLI stack or spawning a real subprocess

### AC-7: no regression for existing green settles
Given `cadence settle run`
When all tasks are terminal and no `testCommand` is configured
Then behavior is bit-identical for the `draft-read` path (snapshot transcript) and for the two new gates passing — no regression for existing green settles

### AC-8: new refusals behaviorally tested at settle level
Given an ephemeral repo
When an open task is present, or a configured command exits non-zero
Then `settle run` refuses, and the documented bypass flags (`--allow-open-tasks`, `--allow-failing-build`) each clear the refusal

### AC-9: registry is total
Given a compile-time exhaustiveness check (or test)
When the registry is asserted
Then every `Gate` enum member except `anomaly-notify` either has a `GateImpl` module or is explicitly tracked for 39.3–39.7, with no enum member silently unimplemented

## Tasks

### T1: contract growth + config field
- files: `packages/core/src/gates/types.ts`, `packages/types/src/config.ts`, `packages/types/tests/config.test.ts`
- action: add `TestRunResult`/`RunnerPort`, `SettleContext.draftMtimeMs()` + `runner`, the three `SettleOpts` flags; add additive optional `verification.testCommand` to `@cadence/types` with back-compat config test
- done: AC-9

### T2: gates/draft-read.ts (verbatim extraction)
- files: `packages/core/src/gates/draft-read.ts`, `packages/core/tests/gates/draft-read.test.ts`
- action: lift the mtime gate verbatim into `runDraftReadGate`; TDD branches (mtime>baseline refuse / `--allow-stale-draft` pass / mtime≤baseline / null draftReadAt / null mtime) with exact stderr
- done: AC-1, AC-7

### T3: gates/structural-verifier.ts (new enforcement)
- files: `packages/core/src/gates/structural-verifier.ts`, `packages/core/tests/gates/structural-verifier.test.ts`
- action: refuse on any non-terminal task unless `allowOpenTasks`/`force`; terminal set = {DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED}; TDD all branches
- done: AC-2

### T4: gates/build-test-must-pass.ts (new enforcement)
- files: `packages/core/src/gates/build-test-must-pass.ts`, `packages/core/tests/gates/build-test-must-pass.test.ts`
- action: reach the subprocess only via `ctx.runner`; pass on `{ran:false}` with note, refuse on `{ok:false}` unless `allowFailingBuild`/`force`; TDD every runner branch
- done: AC-3

### T5: settle wiring + CLI flags + exhaustiveness test
- files: `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/gates/registry-coverage.test.ts`
- action: add `--allow-open-tasks`/`--allow-failing-build`, build `draftMtimeMs` + `runner` adapters, remove the inline draft-read block, call the three gates with `mergeInto` + refuse-and-halt before coverage (preserving order); add the registry-coverage exhaustiveness test
- done: AC-4, AC-5, AC-9

### T6: settle-level behavioral + bit-identical tests
- files: `packages/core/tests/cli/` (via `@cadence/testkit` ephemeral repo)
- action: green-settle bit-identical regression; IN_PROGRESS-task refusal + `--allow-open-tasks` clear; failing `testCommand` refusal + `--allow-failing-build` clear + zero-exit pass
- done: AC-6, AC-7, AC-8

### T7: doc reconciliation
- files: `docs/concepts.md`, `DESIGN.md`, `.cadence/ROADMAP.md`
- action: concepts.md gate table (terminal set, new bypass flags, build-test config-gating); DESIGN §4.1 tag both new gates live (Phase 39.2); ROADMAP 39.2 bit-identical-anchor amendment note
- done: AC-7

### T8: full gate + feature commit
- files: (repo root)
- action: run `pnpm turbo run lint typecheck test build` green; substantive feat commit
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9

## Boundaries

- DO NOT extract `anomaly-notify` — it is a cross-cutting `ctx.shouldNotify` emission toggle, not a discrete gate.
- DO NOT touch `draft.ts` — these gates fire at settle and have no `draft.ts` enforcement site (AC-2 plan deviation).
- DO NOT give `verification.testCommand` a default — absence means unconfigured (preserves bit-identical green settles).
