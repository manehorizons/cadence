---
phase: 55-intelligence-store-deep-imports
id: 55-01
tier: standard
status: PENDING
---

# 55-01 — Migrate call sites off the store barrel, then delete it

## Objective

Migrate all call sites off the `intelligence/store.js` re-export barrel to direct
`store/<module>.js` imports, then delete the barrel — completing the phase-54 split
by removing the last layer of indirection. Pure behavior-preserving refactor.

## Context

Phase 54 split the 985-LOC `intelligence/store.ts` god-module into ten focused
`store/` modules, keeping a 59-LOC re-export barrel so the ~36 import sites resolved
byte-unchanged. This phase finishes the job: point every import at its real module
and delete the barrel. The barrel's only remaining purpose was zero-churn migration;
that migration is now this phase.

### Symbol → module map (from the barrel surface)

| Module | Exports |
|---|---|
| `store/paths.js` | `intelligenceDir` |
| `store/io.js` | `readAssumptionLedger`, `readEvidenceLedger`, `readIntelligenceDecisionLedger`, `readRecommendationLedger` |
| `store/recommendations.js` | `addRecommendation`, `applyRecommendationTransition`, `deriveRecommendationLinks`, `runRecommendationTransition`, `AddRecommendationInput`, `RecommendationTransitionAction`, `RecommendationTransitionResult` |
| `store/assumptions.js` | `addAssumption`, `applyAssumptionTransition`, `runAssumptionTransition`, `AddAssumptionInput`, `AssumptionTransitionAction`, `AssumptionTransitionResult` |
| `store/decisions.js` | `addIntelligenceDecision`, `applyDecisionTransition`, `deriveDecisionInverseLinks`, `runDecisionTransition`, `AddIntelligenceDecisionInput`, `DecisionTransitionAction`, `DecisionTransitionResult` |
| `store/stats.js` | `computeIntelligenceStats`, `IntelligenceStats` |
| `store/audit.js` | `AUDIT_KINDS`, `computeIntelligenceAudit`, `AuditKind`, `IntelligenceAuditFinding`, `IntelligenceAuditReport` |
| `store/reconcile.js` | `runIntelligenceReconcile`, `IntelligenceReconcileResult` |
| `store/milestones.js` | `readMilestoneLedger`, `writeMilestoneLedger` |

### Scope (38 import statements across 38 files)

- **7 src files**: `cli/commands/{assumption,decision,draft-new,intelligence,milestone,recommendation,spec}.ts`
- **29 test files**: under `tests/cli/` and `tests/intelligence/`
- **2 dynamic imports**: `await import('.../store.js')` for `runAssumptionTransition`
  in `tests/cli/recommendation-show.test.ts` and `tests/intelligence/store.test.ts`
  → repoint to `store/assumptions.js`.
- **1 barrel-only test** to delete: `tests/intelligence/store-barrel.test.ts`
  (its surface-completeness + no-leak invariant exist only to police the barrel;
  the cross-module write/read path it also exercises is already covered by
  `tests/intelligence/store.test.ts`).

Multi-module imports (e.g. `addRecommendation` from recommendations + `readRecommendationLedger`
from io in one statement) split into one `import` per source module, alphabetised,
preserving `import type` for type-only symbols.

## Acceptance Criteria

### AC-1: No call site resolves through the barrel
Given the migration is complete
When `grep -rn "intelligence/store\.js" packages/` is run (excluding `store/` paths)
Then it returns zero matches — every static and dynamic import targets a `store/<module>.js`.

### AC-2: The barrel and its barrel-only test are gone
Given the barrel's job is done
When the working tree is inspected
Then `packages/core/src/intelligence/store.ts` and
`packages/core/tests/intelligence/store-barrel.test.ts` no longer exist.

### AC-3: Behavior is preserved — full gate pipeline green
Given a pure import-path refactor
When `pnpm turbo run lint typecheck test build` runs
Then all four pass; the test suite is green (1329 minus the deleted barrel-test cases),
with no behavioral change to any command or store function.

## Tasks

### T1: Migrate the 7 src call sites
- files: `packages/core/src/cli/commands/{assumption,decision,draft-new,intelligence,milestone,recommendation,spec}.ts`
- action: rewrite each barrel import as direct `store/<module>.js` imports per the map; split multi-module imports.
- verify: `pnpm --filter @manehorizons/cadence-core typecheck`
- done: AC-1

### T2: Migrate the 29 test call sites + 2 dynamic imports
- files: `packages/core/tests/{cli,intelligence}/*.test.ts` (barrel importers)
- action: same rewrite for static imports; repoint the two `await import('.../store.js')` to `store/assumptions.js`.
- verify: `grep -rn "intelligence/store\.js" packages/ | grep -v 'intelligence/store/'` → empty
- done: AC-1

### T3: Delete the barrel and the barrel-only test
- files: `packages/core/src/intelligence/store.ts`, `packages/core/tests/intelligence/store-barrel.test.ts`
- action: `git rm` both.
- verify: files absent; nothing imports them (AC-1 grep already empty)
- done: AC-2

### T4: Run the full gate pipeline
- files: —
- action: `pnpm turbo run lint typecheck test build`
- verify: all four green
- done: AC-3

## Boundaries

- **DO NOT** change the phase-54 module boundaries or move any symbol between
  modules — this phase only changes *who imports from where*, never the module
  contents. The recommendations-reader-lives-in-`io` split is settled.
- **DO NOT** add new public exports or change any store function's behavior/signature.
- **DO NOT** touch `website/` (standalone root) or any package outside `core`.
- **DO NOT** commit the pre-existing untracked local files (`launch/`,
  `ARCHITECTURE-BRIEF.md`, `OBJECTION-FAQ.md`, `SESSION-*`, `intelligence/context/`,
  etc.) — they are not this phase's work.
