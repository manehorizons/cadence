---
phase: 27-ci
id: 27-01
tier: standard
status: PENDING
---

# 27-01 — GitHub Actions tests-on-PR

## Objective

Add a GitHub Actions workflow that runs `pnpm install` + `pnpm turbo run lint typecheck test build` on every PR and push to `main` across a Node 20 + 22 matrix, fix the two pre-existing lint errors so the pipeline is actually green, add Dependabot, and surface a CI badge + branch-protection note in the README.

## Acceptance Criteria

### AC-1: Workflow runs on PR + push to main, Node 20 + 22 matrix
Given `.github/workflows/ci.yml`
When a PR is opened or a commit is pushed to `main`
Then a `ci` job runs on `ubuntu-latest` with a `strategy.matrix.node: [20, 22]`, triggered by `on: { push: { branches: [main] }, pull_request: {} }`, using `pnpm/action-setup` + `actions/setup-node` with `cache: pnpm`, and runs `pnpm install --frozen-lockfile` then `pnpm turbo run lint typecheck test build`

### AC-2: Pipeline is green (pre-existing lint errors fixed)
Given the repo at this phase
When `pnpm turbo run lint typecheck test build` runs locally (the exact CI command)
Then it exits 0 — the two known `@typescript-eslint/consistent-type-imports` errors (`notify/loop-violation.ts:5`, `verify/coverage.ts:89`) are fixed (type-only import + top-level `import type { Dirent }`), and no test/typecheck/build regression is introduced

### AC-3: Dependabot configured
Given `.github/dependabot.yml`
When inspected
Then it schedules weekly `github-actions` and `npm` (root, pnpm workspace) update PRs with a sane open-PR limit

### AC-4: README CI badge + branch-protection doc
Given the README
When viewed
Then it shows a CI status badge pointing at the `manehorizons/cadence` Actions workflow near the top, and a short "Continuous integration" note stating CI must pass on PRs and that branch protection (required status check) is a manual one-time GitHub setting, with the steps to enable it

### AC-5: Settles green under the dogfood loop
Given this phase has no unit tests of its own (CI config + docs + lint fixes)
When `cadence settle run --auto --allow-missing-coverage` runs
Then it settles cleanly (the coverage bypass is expected and documented here), workspace `typecheck test build` still green

## Tasks

### T1: CI workflow + Dependabot
- files: `.github/workflows/ci.yml`, `.github/dependabot.yml`
- action: `ci.yml` — name `CI`; `on: push (branches: [main])` + `pull_request:`; one job `build` on `ubuntu-latest`; `strategy.matrix.node-version: [20, 22]`, `fail-fast: false`; steps: `actions/checkout@v4`, `pnpm/action-setup@v4` (version from root `packageManager`), `actions/setup-node@v4` with `node-version: ${{ matrix.node-version }}` + `cache: 'pnpm'`, `pnpm install --frozen-lockfile`, `pnpm turbo run lint typecheck test build`. `dependabot.yml` — version 2; `package-ecosystem: github-actions` (dir `/`, weekly) and `package-ecosystem: npm` (dir `/`, weekly, `open-pull-requests-limit: 5`).
- verify: `node -e "require('js-yaml')"` not assumed — instead assert valid YAML by `cadence`-agnostic parse in T-less manner: visually + the workflow keys are present (checked via the test task reading the file).
- done: AC-1, AC-3

### T2: Fix the two pre-existing lint errors
- files: `packages/core/src/notify/loop-violation.ts`, `packages/core/src/verify/coverage.ts`
- action: `loop-violation.ts` — change the `LoopViolationError` import to `import type` (only used in a parameter annotation). `coverage.ts` — add `import type { Dirent } from 'node:fs'` at the top and replace the inline `import('node:fs').Dirent[]` annotation with `Dirent[]`.
- verify: `pnpm turbo run lint` exits 0 (was: 2 errors in @cadence/core).
- done: AC-2

### T3: README CI badge + branch-protection note
- files: `README.md`
- action: Add a `![CI](https://github.com/manehorizons/cadence/actions/workflows/ci.yml/badge.svg)` badge near the title. Add a "Continuous integration" subsection: CI runs `lint typecheck test build` on Node 20 + 22 for every PR and push to `main`; enabling branch protection (Settings → Branches → require the `build` status checks) is a manual one-time GitHub step, documented as such (no API automation per roadmap).
- verify: `pnpm turbo run typecheck test build` green; markdown renders.
- done: AC-4

## Boundaries

- DO NOT add publish/release automation — CI is test-only for v0.8.0 (release ceremony is Phase 28.1).
- DO NOT change the turbo task graph or scripts — CI calls the existing `pnpm turbo run lint typecheck test build` verbatim.
- DO NOT widen the lint fixes beyond the two flagged lines — no rule-config or unrelated refactors.
- DO NOT attempt to set GitHub branch protection from code — it is documented as a manual setting per the roadmap AC.
- DO NOT push or open a PR as part of this phase — commits are local; pushing is a separate, user-gated action.
