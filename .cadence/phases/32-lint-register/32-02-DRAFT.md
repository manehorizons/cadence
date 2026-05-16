---
phase: 32-lint-register
id: 32-02
tier: quick-fix
---

# 32-02 — register.ts type-only import lint fix

## Objective

Fix the latent `@typescript-eslint/consistent-type-imports` lint error in `packages/core/src/cli/register.ts:1` (a Phase 31.1 extraction defect) that blocks the `main` pre-push gate's `lint` step.

## Acceptance Criteria

### AC-1: core lint clean and full pre-push gate green
Given `register.ts` line 1 imports `Command` (used only as a type) with a value `import`, failing `eslint src`
When line 1 becomes `import type`
Then `pnpm -C packages/core lint` passes and the full `pnpm turbo run lint typecheck test build` gate is green.

## Tasks

### T1: convert the type-only import
- files: `packages/core/src/cli/register.ts`
- action: change line 1 `import { Command } from 'commander';` → `import type { Command } from 'commander';` (lines 2+ are value imports — leave unchanged)
- verify: `pnpm -C packages/core lint` clean; then full gate `pnpm turbo run lint typecheck test build` green
- done: AC-1

## Boundaries

- DO NOT change any other import or file; this is a one-line type-only-import fix.
- DO NOT run eslint `--fix` broadly; apply the single targeted edit.
- DO NOT `git push` (user-gated; re-push happens after settle).
