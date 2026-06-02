---
phase: 40-verifier-factory
id: 40-01
tier: standard
status: DONE
---

# 40-01 — Verifier factory consolidation

## Objective

(Architecture review candidate #1.) Six factory files under `packages/core/src/verify/` (`factory.ts`, `code-review-factory.ts`, `plan-review-factory.ts`, `spec-review-factory.ts`, `per-task-factory.ts`, `security-audit-factory.ts` — ~355 LoC total) repeat one selection algorithm with a `mock | anthropic | local` switch and identical fallback warnings. Collapse into one generic `createVerifierFactory<C, V>(spec)` plus six thin bindings. Bit-identical behavior — pure refactor.

## Acceptance Criteria

### AC-1: one generic factory + thin bindings
Given six factory files repeating one selection algorithm
When the generic `createVerifierFactory<C, V>(spec)` is introduced
Then the generic factory exists and the six factories become thin bindings (≤ 15 LoC each) with no duplicated selection logic

### AC-2: fallback-warning rule lives in one place
Given the anthropic-missing-key and local-missing-baseURL/model fallbacks plus their warn strings
When selection runs
Then the fallback-warning rule lives in exactly one place (the generic), `spec.label` is interpolated into the two warn strings byte-identically, and the existing `factory.test.ts` + `local-factories.test.ts` pass unchanged

### AC-3: extensibility cost is bounded
Given a hypothetical seventh verifier type
When it is added
Then it costs ≤ 10 lines plus a spec, and the public API is preserved — `selectX` export names, `Pick<CadenceConfig, K>` signatures, and `Select*VerifierOptions` type names all remain exported

### AC-4: behavior bit-identical at every consumer
Given every existing verifier consumer (gates, settle, draft/build adapters)
When the refactor lands
Then behavior is bit-identical at every consumer call site and net LoC drops (~355 → ~180)

### AC-5: no factory file remains over 20 LoC
Given the rewritten bindings
When the verify/ directory is inspected
Then no remaining `*-factory.ts` binding is an over-sized duplicate of the algorithm (each is a thin spec binding)

## Tasks

### T1: generic factory + test (TDD red→green)
- files: `packages/core/src/verify/verifier-factory.ts`, `packages/core/tests/verify/verifier-factory.test.ts`
- action: create the generic `createVerifierFactory<C, V>(spec)` + `VerifierSelectOptions` / `VerifierProvider` / `VerifierFactorySpec`; one algorithm with `spec.label` injected into the two warn strings; test mock-default, override, anthropic-missing-key fallback, local-missing-baseURL/model fallback, model precedence (slice vs `CADENCE_LOCAL_MODEL`), env seams, and the exact warn strings against a fake verifier family
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run verify/verifier-factory`
- done: AC-1, AC-2

### T2: rewrite the six bindings
- files: `packages/core/src/verify/{factory,code-review-factory,plan-review-factory,spec-review-factory,per-task-factory,security-audit-factory}.ts`
- action: rewrite each as a thin binding (`label`, `read` accessor, `mock`/`anthropic`/`local` ctors); keep each `selectX` export + `Pick<CadenceConfig, K>` signature (generic over `C`); re-export `Select*VerifierOptions` as a back-compat alias of `VerifierSelectOptions`; run `factory.test.ts` + `local-factories.test.ts` after each — they must stay green unchanged (bit-identical proof)
- verify: `pnpm -C packages/core test -- run verify/factory verify/local-factories`
- done: AC-3, AC-5

### T3: full gate + every consumer compiles
- files: (none — verification)
- action: run the full `pnpm turbo run lint typecheck test build` gate; confirm every verifier consumer (gates, settle, draft/build adapters) compiles and passes
- verify: full gate green
- done: AC-4

## Boundaries

- DO NOT change selection behavior or warn-string bytes — `spec.label` must reproduce the originals exactly.
- DO NOT widen the binding param from `Pick<CadenceConfig, K>` to `CadenceConfig` — the Pick-literal call in `factory.test.ts` must keep compiling without `as any`.
- DO NOT drop or rename `selectX` exports or `Select*VerifierOptions` type names — `@manehorizons/cadence-core` is published.
- DO NOT use `keyof`-based indexing for the config slice — use a `read` accessor to stay clear of `noUncheckedIndexedAccess`.
- DO NOT edit `factory.test.ts` or `local-factories.test.ts` — they are the bit-identical proof.
