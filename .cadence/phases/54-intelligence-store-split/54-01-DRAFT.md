---
phase: 54-intelligence-store-split
id: 54-01
tier: standard
status: PENDING
---

# 54-01 — Split intelligence/store.ts god-module into focused store/ modules behind a re-export barrel

## Objective

Decompose the 985-LOC `packages/core/src/intelligence/store.ts` god-module into ~10 single-responsibility modules under `intelligence/store/`, keeping `store.ts` as a thin re-export barrel so all 36 existing import sites and the full test suite pass byte-unchanged (behavior-preserving refactor).

## Acceptance Criteria

### AC-1: Behavior is preserved — existing suite passes unchanged
Given the current `packages/core/tests/**` suite (29 files import from `intelligence/store.js`)
When the module is split into `store/` files with `store.ts` re-exporting them
Then `pnpm --filter @manehorizons/cadence-core test typecheck build` passes with **zero edits to any pre-existing test or source call site** (only new files added + `store.ts` body replaced by re-exports).

### AC-2: `store.ts` is a pure re-export barrel
Given the refactored module
When `store.ts` is read
Then it contains only `export … from './store/*.js'` statements (no function bodies, no `const` logic, no top-level statements other than re-exports), and it re-exports every symbol the old `store.ts` exported — verified by a new test asserting the public surface is intact.

### AC-3: Responsibilities are split along the documented seams
Given the new `intelligence/store/` directory
When its files are enumerated
Then each domain lives in its own module (`paths.ts`, `ids.ts`, `io.ts`, `recommendations.ts`, `assumptions.ts`, `decisions.ts`, `stats.ts`, `audit.ts`, `reconcile.ts`, `milestones.ts`), no single new module exceeds ~300 LOC, and `store.ts` is under 60 LOC.

## Tasks

### T1: Extract shared infra (paths, ids, io)
- files: `packages/core/src/intelligence/store/paths.ts`, `store/ids.ts`, `store/io.ts`
- action: Move dir/file constants + `intelligenceDir` + `*Path` helpers → `paths.ts`; `slugDate` + `next*Id` generators → `ids.ts`; the `read*Ledger` / `write*Ledger` / `writeIntelligenceLedgers` / `rerenderRecommendationsMdIfPresent` helpers → `io.ts`. Keep relative import depth correct (`../../state/atomic-write.js`, `../render*.js` become `../../../…`? — they are siblings of `store.ts`, so from `store/` it is `../render.js` etc. Verify paths.)
- verify: `pnpm --filter @manehorizons/cadence-core typecheck`
- done: AC-3

### T2: Extract the four domain modules + cross-cutting computations
- files: `store/recommendations.ts`, `store/assumptions.ts`, `store/decisions.ts`, `store/stats.ts`, `store/audit.ts`, `store/reconcile.ts`, `store/milestones.ts`
- action: Move each domain's add/derive/transition functions and its input/result types into the matching module, importing shared infra from `paths`/`ids`/`io`. Preserve every export name and signature exactly.
- verify: `pnpm --filter @manehorizons/cadence-core typecheck`
- done: AC-3

### T3: Reduce store.ts to a re-export barrel
- files: `packages/core/src/intelligence/store.ts`
- action: Replace the entire body with `export * from './store/<module>.js'` (or explicit named re-exports) covering every previously-exported symbol. No logic remains.
- verify: `wc -l store.ts` < 60; `grep -cE "^(async )?function |^export (async )?function" store.ts` == 0
- done: AC-2

### T4: Add a public-surface guard test
- files: `packages/core/tests/intelligence/store-barrel.test.ts`
- action: New test that imports the barrel and asserts the key public symbols are exported and callable (covers AC-1, AC-2). Reference AC-3 in a comment so the test-coverage gate links all three ACs.
- verify: `pnpm --filter @manehorizons/cadence-core test -- store-barrel`
- done: AC-1

## Boundaries

- DO NOT change any function signature, return type, or runtime behavior — this is a pure move-and-rewire refactor.
- DO NOT edit any pre-existing test file or any of the 7 source call sites (`cli/commands/*.ts`). Their `intelligence/store.js` imports must keep resolving through the barrel.
- DO NOT touch `@manehorizons/cadence-types`, the render-* modules, or `atomic-write.ts` — only move references to them.
- DO NOT introduce a deep-import migration (that is a deliberate possible follow-up phase, out of scope here).
