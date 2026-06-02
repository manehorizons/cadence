---
phase: 39-code-review-gate
id: 39-01
tier: complex
status: DONE
---

# 39-01 — Lift the code-review gate (+ convergence sidecar) into gates/code-review.ts

## Objective

Extract the Phase 24.3 code-review gate **and** its Phase 37.1 bounded-convergence sidecar (~190 lines, `settle.ts:353–544`) into a single `gates/code-review.ts` module against the 39.1 contract — **bit-identical**. First gate to ride the `ctx.emit` port and to add a `verifiers.codeReview` member, a memoized `diff()`, and a reusable `ConvergenceSidecar` port. The gate imports no factory/notifier/fs directly; all four collaborators are wired in the settle adapter. `settle.ts` becomes a router for this gate.

## Acceptance Criteria

### AC-1: single home for gate + convergence
Given the extracted module
When `runCodeReviewGate` runs the code-review verifier + the convergence loop
Then it is the single home for both, and `settle.ts` no longer imports `selectCodeReviewVerifier` / `nextConvergence` / `emitCodeReview*` for this gate

### AC-2: gate depends only on injected ports
Given the gate module
When it needs the verifier, notifier, diff, or sidecar
Then it reads the verifier via `ctx.verifiers.codeReview`, the notifier via `ctx.emit.*`, the diff via `ctx.diff()`, and the sidecar via `ctx.codeReviewSidecar` — with no direct factory/notifier/fs import in the gate

### AC-3: GateImpl-conformant via summaryPatch
Given the 39.1 gate contract
When the gate completes
Then it is `GateImpl`-conformant and contributes `codeReview` findings to SUMMARY via `summaryPatch`

### AC-4: unit-testable branches without the CLI stack
Given fake verifier/emit/diff/sidecar ports
When the gate is exercised
Then tests cover bypass / reloop / escalate / verifier-throw / anomaly-notify-on-vs-off without the CLI stack or real git/disk

### AC-5: bit-identical
Given the extraction
When the existing settle-code-review + settle-codereview-convergence E2E suites run
Then stderr, sidecar JSON bytes, emit order, exit codes, and SUMMARY.codeReview are unchanged and the suites pass unchanged

### AC-6: registry coverage
Given the gate registry
When `code-review` is implemented
Then the registry marks it IMPLEMENTED (7 of 13; `anomaly-notify` exception; 5 pending for 39.5/39.7)

## Tasks

### T1: types.ts collaborators + opt
- files: `packages/core/src/gates/types.ts`
- action: add `VerifierPorts.codeReview`, `EmitPort.codeReviewHigh` / `codeReviewUnconverged`, `ConvergenceSidecar`, `SettleContext.diff` + `codeReviewSidecar`, `SettleOpts.allowCodeReviewFailure`; import `CodeReviewInput`/`CodeReviewResult`
- verify: `pnpm -C packages/core typecheck`
- done: AC-2

### T2: gates/code-review.ts + test (TDD red→green)
- files: `packages/core/src/gates/code-review.ts`, `packages/core/tests/gates/code-review.test.ts`
- action: port the block verbatim reading `ctx.diff()` / `ctx.verifiers.codeReview` / `ctx.codeReviewSidecar` / `ctx.emit.*`; move `collectHighFindings` in (HIGH-only); cover no-HIGH pass, reloop, escalate, both bypass arms, verifier-throw, anomaly-notify on/off with fakes
- verify: `pnpm -C packages/core test -- run gates/code-review`
- done: AC-1, AC-3, AC-4

### T3: settle.ts wiring
- files: `packages/core/src/cli/commands/settle.ts`
- action: build the four adapters (lazy codeReview verifier memo like deep; memoized `diff`; sidecar read/write over the path; emit wrappers); replace the inline block with `runCodeReviewGate(ctx)` + merge + bridge `codeReviewFindings`; thread `allowCodeReviewFailure` into SettleOpts; drop now-unused imports
- verify: `pnpm -C packages/core test -- run cli/settle-code-review cli/settle-codereview-convergence`
- done: AC-1, AC-5

### T4: registry coverage
- files: `packages/core/tests/gates/registry-coverage.test.ts`
- action: flip `code-review` → IMPLEMENTED (7 of 13; 5 pending)
- verify: `pnpm -C packages/core test -- run gates/registry-coverage`
- done: AC-6

### T5: full gate + two-commit settle
- files: (none — verification only)
- action: run the full `pnpm turbo run lint typecheck test build` gate; substantive feat commit; settle
- verify: full gate green; existing E2E suites (15 tests) pass unchanged = bit-identical proof
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

## Boundaries

- DO NOT import any factory/notifier/fs directly in the gate — only the injected `ctx` ports.
- DO NOT change the sidecar JSON byte layout (history entry shape, HIGH-only `findingsCount`, the `attempts` rule, legacy top-level parity fields, trailing `\n`).
- DO NOT move the `anomaly-notify` membership guard out of the gate — it reads `ctx.gateSet`; the emit port stays a dumb dispatcher.
- DO NOT alter emit order (`codeReviewHigh` then `codeReviewUnconverged` on escalate).
- DO NOT change stderr lines, exit codes, or SUMMARY.codeReview — existing E2E suites must pass unchanged.
