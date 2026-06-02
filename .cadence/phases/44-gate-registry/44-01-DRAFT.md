---
phase: 44-gate-registry
id: 44-01
tier: complex
status: DONE
---

# 44-01 — Engine-driven gate registry (the hybrid endgame)

## Objective

With every enum gate now a discrete `GateImpl` module (39.1–39.7), convert
settle's hand-wired `if (gateSet.gates.includes(X)) { runXGate(ctx); mergeInto;
halt-on-refuse }` sequence (`settle.ts:343–441`, ~100 LoC) into a single
engine-driven dispatch: a `Record<SettleGate, GateEntry>` registry that a
`runSettleGates(ctx)` driver walks in a canonical `GATE_ORDER`. This makes
`gates/registry.ts` the one source of truth for *which* settle gates fire and
*in what order* — instead of that order living implicitly in settle's call
sequence. Bit-identical at the CLI surface.

## Acceptance Criteria

### AC-1: GATE_REGISTRY total over SettleGate (compile-error on a miss)
Given `gates/registry.ts` defines `type SettleGate = Exclude<Gate, 'coherence-check' | 'approve' | 'plan-review' | 'per-task-verify' | 'anomaly-notify'>`
When `const GATE_REGISTRY: Record<SettleGate, GateEntry>` is declared
Then it is total over the 8-member settle-dispatched subset and a missing entry is a compile error (the four 39.7 DRAFT/BUILD gates + `anomaly-notify` are excluded as operator-confirmed scope, per the 39.7 flag; the ROADMAP "12 gates" text is corrected to the settle-dispatched subset)

### AC-2: settle dispatches by walking GATE_ORDER, no gate name in control flow
Given settle's hand-wired 343–441 ladder
When it is replaced with `const { acc, refused } = await runSettleGates(ctx)` plus post-loop accumulator reads
Then settle dispatches by walking the canonical `GATE_ORDER` constant; no gate name appears in settle's gate control flow (the lone remaining `interactive-verdict` literal is a finalizer data derivation, not dispatch)

### AC-3: firing order matches the pre-44.1 execution sequence
Given matrix order (`[...ALWAYS_FIRE, ...deltas]`) ≠ execution order
When the driver walks `GATE_ORDER` (`draft-read → structural-verifier → build-test-must-pass → test-coverage → interactive-verdict → deep-verify → code-review → security-audit`)
Then firing order matches the pre-44.1 execution sequence (snapshot-tested), so the first refusal stays the cheapest; iterating `gateSet.gates` in array order would NOT be behavior-preserving

### AC-4: adding a future settle gate is registry-local, settle untouched
Given the registry + `GATE_ORDER` are the source of truth
When a future settle gate is added
Then it requires only an enum member + a `GATE_ORDER` entry + a `GATE_REGISTRY` entry; `settle.ts` is untouched

### AC-5: behavior bit-identical at the CLI surface
Given the full existing settle E2E suite (every `cli/settle-*` + gate tests)
When the dispatch is rewritten to the engine-driven driver
Then behavior is bit-identical at the CLI surface (stdout, stderr, exit codes, SUMMARY) and the full suite passes unchanged; `deep-verify`/`interactive-verdict` remain `selfGuarded` (invoked unconditionally; impl self-guards on `--deep`/`--interactive` OR membership) so flag-driven runs are not dropped

## Tasks

### T1: registry.ts — SettleGate + GATE_REGISTRY + GATE_ORDER + runSettleGates (TDD)
- files: `packages/core/src/gates/registry.ts`, `packages/core/tests/gates/registry.test.ts`
- action: new module — `SettleGate` exclude-type, `GateEntry { impl; selfGuarded? }`, the 8-entry `Record<SettleGate, GateEntry>` (deep-verify + interactive-verdict `selfGuarded: true`), the `GATE_ORDER` execution-order constant, and the `runSettleGates(ctx)` driver (`selfGuarded || gateSet.gates.includes(gate)`, mergeInto, first-refuse halts); TDD with order-snapshot + membership-gating + first-refuse-halt + exhaustiveness + mergeInto-wiring tests
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run gates/registry`
- done: AC-1, AC-3, AC-5

### T2: settle.ts — replace the hand-wired ladder with the driver
- files: `packages/core/src/cli/commands/settle.ts`
- action: replace the 343–441 dispatch block with `const { acc, refused } = await runSettleGates(ctx); if (refused) { process.exitCode = 1; return; }` + the post-loop `const` reads (coverageBypassed, interactiveVerify, deepVerify, verifierFailure, codeReview, securityAudit); drop the 8 gate-runner imports + local `acc`/`mergeInto` plumbing; `interactiveRequested` stays a settle local (finalizer input)
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run cli/settle`
- done: AC-2, AC-4

### T3: full gate + two-commit settle
- files: (gate run only)
- action: run the full `pnpm turbo run lint typecheck test build` gate; full settle E2E suite green unchanged (bit-identical proof); substantive feat commit
- verify: full gate green; loop returns to IDLE
- done: AC-5

## Boundaries

- DO NOT include the four 39.7 DRAFT/BUILD gates (`coherence-check`, `approve`, `plan-review`, `per-task-verify`) or `anomaly-notify` in the registry — they use different impl shapes / are finalizers; the registry is the 8-member `SettleGate` subset only.
- DO NOT iterate `gateSet.gates` in array order — matrix order ≠ execution order; the driver MUST walk the explicit `GATE_ORDER` constant.
- DO NOT drop `deep-verify`/`interactive-verdict` when absent from the gate set — they are `selfGuarded` and run on `--deep`/`--interactive`; a pure `GATE_ORDER ∩ gateSet.gates` intersection would regress.
- DO NOT thread `opts` into `effectiveGateSet()` to fold the flags into the gate set — rejected as larger/riskier; keep `selfGuarded` on the registry entry.
- DO NOT move `interactiveRequested` behind a port — it stays a settle local (finalizer input), keeping the change scoped to dispatch and the bit-identical guarantee intact.
- DO NOT change `gates/engine.ts`, `state.json`, `config`, or any CLI-surface behavior — internal dispatch refactor only.
- DO NOT touch `checks/` (skill-audit, boundary) — they stay explicitly dispatched outside the registry.
