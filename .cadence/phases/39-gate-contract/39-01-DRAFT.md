---
phase: 39-gate-contract
id: 39-01
tier: complex
status: DONE
---

# 39-01 — Gate contract + coverage/deep-verify extraction (shape-defining phase)

## Objective

Pull two inline gates out of `cli/commands/settle.ts` — the test-coverage gate
and the `--deep` verifier gate — into `core/src/gates/`, and in doing so
**define the shared `SettleContext` / `GateResult` / `GateImpl` contract** the
rest of v1.3 (39.2–39.7, 44.1) builds against. Two gates (not one) so the shape
is validated against real variety: a pure-policy gate (coverage) and a
port-consuming gate (deep-verify needs an injected verifier). `GateImpl` is the
uniform `(ctx: SettleContext) => Promise<GateResult>` signature so 44.1 can drop
the modules into a `Record<Gate, GateImpl>` registry with no re-extraction.
`GateResult` is the uniform `{ outcome, anomalies?, summaryPatch? }` shape;
gates contribute via functional patch merged by settle (`mergeInto`) rather than
mutating shared state. Settle builds context and routes; no policy stays inline.

## Acceptance Criteria

### AC-1: coverage gate single home
Given the coverage-gate logic currently inline in `settle.ts`
When it is lifted into `runCoverageGate(ctx)` in `gates/coverage.ts`
Then `runCoverageGate(ctx)` is the single home for coverage-gate logic and `settle.ts` no longer references `scanTestCoverage`/`uncoveredAcs`/`testGlobs` for the coverage gate

### AC-2: deep-verify gate single home, reached via port
Given the deep-verify logic currently inline in `settle.ts`
When it is lifted into `runDeepVerifyGate(ctx)` in `gates/deep-verify.ts`
Then `runDeepVerifyGate(ctx)` is the single home for deep-verify logic and the verifier is reached only via `ctx.verifiers.deep`, never a direct `selectVerifier`/factory import inside the gate

### AC-3: uniform registry-ready GateImpl shape
Given both new gate modules
When their signatures are checked against `GateImpl`
Then both conform with no per-gate casts — a `const _check: GateImpl = runCoverageGate` (and the same for `runDeepVerifyGate`) type assertion compiles for both, proving the shape is uniform and registry-ready

### AC-4: functional patch carries the gates' contribution
Given the `GateResult` contract (`gates/types.ts` + `mergeInto`)
When a gate produces output
Then `GateResult.summaryPatch` + `flags` carry the gate's entire contribution and settle merges them via `mergeInto` — no gate writes shared mutable state

### AC-5: stderr only through the io port
Given each gate emits refusal/warning messages
When a test captures stderr via a fake `IoPort`
Then each gate writes stderr only through `ctx.io.err` and the capture observes byte-identical messages

### AC-6: gate tests reach every branch without the CLI stack
Given the new gate modules
When their unit tests run
Then they reach every branch (pass / refuse / `--force` / `--allow-missing-coverage` / `--allow-verifier-failure` / verifier-throws) by constructing a `SettleContext` directly, without standing up the CLI command stack

### AC-7: settle behavior bit-identical to pre-extraction
Given `cadence settle run`
When the gates run after extraction
Then stdout, stderr, exit code, SUMMARY.{json,md}, and the coverage/deep refusal transcripts are bit-identical to pre-extraction (snapshot-tested)

### AC-8: settle.ts net LoC drops
Given both inline blocks are removed
When `settle.ts` is measured
Then its net LoC drops by both inline blocks' size plus framing

## Tasks

### T1: define the gate contract (`gates/types.ts` + `mergeInto`)
- files: `packages/core/src/gates/types.ts`
- action: define `SettleContext`, `GateResult` (`{ outcome, anomalies?, summaryPatch?, flags? }`), `GateImpl = (ctx) => Promise<GateResult>`, the `VerifierPorts`/`EmitPort`/`IoPort` port interfaces, and the functional `mergeInto` patch accumulator
- done: AC-3, AC-4

### T2: extract the coverage gate (`gates/coverage.ts`)
- files: `packages/core/src/gates/coverage.ts`, `packages/core/tests/gates/coverage.test.ts`
- action: lift coverage-gate logic verbatim from the inline `settle.ts` block into `runCoverageGate(ctx)` (pure-policy gate); TDD every branch (pass / refuse / `--force` / `--allow-missing-coverage`) against a constructed ctx with a capturing `IoPort`
- done: AC-1, AC-5, AC-6

### T3: extract the deep-verify gate (`gates/deep-verify.ts`)
- files: `packages/core/src/gates/deep-verify.ts`, `packages/core/tests/gates/deep-verify.test.ts`
- action: lift deep-verify logic into `runDeepVerifyGate(ctx)`, reaching the verifier only via `ctx.verifiers.deep`; TDD pass / refuse / `--allow-verifier-failure` / verifier-throws branches
- done: AC-2, AC-5, AC-6

### T4: wire the gates into `settle.ts`
- files: `packages/core/src/cli/commands/settle.ts`
- action: replace both inline blocks with `runCoverageGate(ctx)` / `runDeepVerifyGate(ctx)` calls behind a built `SettleContext` + `mergeInto` accumulator and refuse-and-halt; delete the inline coverage/deep blocks (net LoC drop)
- done: AC-7, AC-8

### T5: bit-identical transcript snapshot
- files: `packages/core/tests/gates/` (settle-level transcript test via `@cadence/testkit` ephemeral repo)
- action: snapshot the coverage + deep-verify refusal transcripts to prove byte-identical stdout/stderr/exit before vs after extraction
- done: AC-7
