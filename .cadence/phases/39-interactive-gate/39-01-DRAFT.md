---
phase: 39-interactive-gate
id: 39-01
tier: standard
status: DONE
---

# 39-01 — Lift the interactive AC-walker out of settle.ts

## Objective

Pull the Phase 16 `--interactive` per-AC walker (StdinPrompter / ScriptedPrompter
/ non-TTY refusal) out of `settle.ts` into `gates/interactive.ts`, exposing
`runInteractiveGate(ctx)` against the 39.1 contract — a pure, bit-identical
extraction. The gate fires on `--interactive` OR membership of
`interactive-verdict`; walks ACs via a new prompter port; refuses on
non-overridden `fail` verdicts unless `--force`; and produces `interactiveVerify`
via `summaryPatch` for the AC-merge finalizer. The prompter is modelled as a
`create()` factory port (`SettleContext.prompter.create()`): construction can
fail (non-TTY) and that failure becomes a gate refusal with specific stderr,
keeping refuse-and-halt inside the gate while the `CADENCE_PROMPTER_SCRIPT` env
seam + TTY-refusal policy live in the settle adapter. The gate uses
`ctx.coverage()` instead of a third independent scan (realising the 39.1
memoization intent). `interactiveRequested` stays a settle local for the
AC-merge finalizer. Registry coverage: `interactive-verdict` becomes IMPLEMENTED
(6 of 13; `anomaly-notify` exception; 6 pending for 39.4–39.7).

## Acceptance Criteria

### AC-1: walker single home
Given the `--interactive` walker currently inline in `settle.ts`
When it is lifted into `runInteractiveGate(ctx)` in `gates/interactive.ts`
Then it is the single home for the walker and `settle.ts` no longer imports `walkAcsInteractively`

### AC-2: prompter reached only via the port; throw reproduced
Given the prompter is injected as `ctx.prompter`
When the gate constructs a prompter
Then it reaches the prompter only via `ctx.prompter`, the env seam + TTY refusal live in the settle adapter, and a construction throw is reproduced byte-identically as a gate refusal

### AC-3: GateImpl-conformant, contributes interactiveVerify via patch
Given `runInteractiveGate`
When checked against `GateImpl`
Then it conforms (`const _c: GateImpl = runInteractiveGate`), contributes `interactiveVerify` via `summaryPatch`, and writes no shared mutable state

### AC-4: gate tests reach every branch without the CLI stack
Given the gate module
When its unit tests run via the `CADENCE_PROMPTER_SCRIPT` / scripted-prompter seam
Then they cover every branch (not-requested / auto-false / all-pass / fail-refuse / fail-under-force / fail-overridden-by-explicitIds / create-throws) without standing up the CLI stack

### AC-5: settle behavior bit-identical
Given `cadence settle run --interactive`
When the gate runs after extraction
Then stdout walker render, stderr refusals, exit codes, SUMMARY.interactiveVerify, and the AC-merge interaction are bit-identical — the existing `settle-interactive` E2E suite passes unchanged

### AC-6: registry coverage advances
Given the registry-coverage exhaustiveness test
When `interactive-verdict` is extracted
Then it is marked IMPLEMENTED (6 of 13; `anomaly-notify` exception; 6 pending for 39.4–39.7)

## Tasks

### T1: contract additions (`gates/types.ts`)
- files: `packages/core/src/gates/types.ts`
- action: add `PrompterPort { create(): Prompter }` (importing `Prompter` from `../verify/prompter.js`), `SettleContext.prompter`, and `SettleOpts.interactive`
- done: AC-3

### T2: gates/interactive.ts + tests (red→green)
- files: `packages/core/src/gates/interactive.ts`, `packages/core/tests/gates/interactive.test.ts`
- action: implement the gate body (walk ACs via `ctx.prompter.create()`, use `ctx.coverage()`, refuse on non-overridden `fail` unless `--force`, emit `interactiveVerify` via `summaryPatch`, turn a `create()` throw into a refusal); TDD all branches via a `ScriptedPrompter` through the port
- done: AC-2, AC-3, AC-4

### T3: settle.ts wiring
- files: `packages/core/src/cli/commands/settle.ts`
- action: replace the inline walker block with the `interactiveRequested` local + `runInteractiveGate(ctx)` call + `mergeInto` + refuse-halt; build the `ctx.prompter` adapter (env seam + TTY refusal); thread `opts.interactive`; remove the now-unused `walkAcsInteractively`/`InteractiveVerdict` imports
- done: AC-1, AC-5

### T4: registry-coverage test
- files: `packages/core/tests/gates/registry-coverage.test.ts`
- action: flip `interactive-verdict` to IMPLEMENTED (6 of 13)
- done: AC-6

### T5: full gate green + bit-identical proof
- files: (repo root)
- action: run `pnpm turbo run lint typecheck test build` green; the existing `settle-interactive` E2E suite (9 tests) must pass unchanged as the bit-identical proof; substantive feat commit
- done: AC-5, AC-6

## Boundaries

- DO NOT inject an already-built `Prompter` — use a `create()` factory port so the non-TTY throw path can be a `GateResult` refusal.
- DO NOT add a third independent coverage scan — use `ctx.coverage()`.
- DO NOT thread `interactiveRequested` through `GateResult` — it stays a settle local for the AC-merge finalizer.
