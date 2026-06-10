---
phase: 98-activate
id: 98-98
tier: standard
status: PENDING
---

# 98-98 — cadence activate — first real-verification loop (slice 1)

## Objective

Ship `cadence activate` — a top-level command that flips verifier seams from mock to a real provider, validates the key via an injected live ping (never persisting it), and is registered + discoverable — built as a pure flag-driven core plus a thin impure shell.

## Acceptance Criteria

### AC-1: Activate writes the deep-verify provider
Given a `.cadence/` repo with `ANTHROPIC_API_KEY` present
When `cadence activate --provider anthropic` runs (non-interactive)
Then `verifier.provider` is written as `anthropic`, the output names `cadence settle run --deep` as the next step, and the exit code is 0

### AC-2: `--all` broadens to every verifier seam
Given a default (all-mock) config
When `cadence activate --provider anthropic --all` runs
Then all six verifier seams (`specReview`, `verifier`, `perTaskVerifier`, `codeReview`, `planReview`, `securityAudit`) are set to `anthropic`

### AC-3: Key-missing writes the selection and stays non-fatal
Given `ANTHROPIC_API_KEY` is unset
When `cadence activate --provider anthropic` runs
Then `verifier.provider` is still written as `anthropic`, the output prints the exact `export ANTHROPIC_API_KEY=…` line, and the exit code is 0

### AC-4: A failed live ping is surfaced non-zero without losing the selection
Given an injected provider ping that fails
When `cadence activate --provider anthropic` runs with the key present
Then the exit code is 1 and `verifier.provider` is still written as `anthropic`

### AC-5: Print is read-only and non-TTY requires an explicit provider
Given a `.cadence/` repo
When `cadence activate --provider anthropic --print` runs, and separately `cadence activate` runs in a non-TTY with no `--provider`
Then `--print` writes no config change, and the no-provider non-TTY run exits 1 with guidance mentioning `--provider`

### AC-6: The pure core is unit-tested offline and the command is registered
Given the activate module (`assessReadiness`, `planActivation`, `renderText`/`renderJson`, `pingProvider`)
When the package test suite runs
Then each pure unit is covered by offline tests (the ping always injected, never real network) and `activate` is registered as a top-level CLI command

## Tasks

### T1: Pure readiness assessment
- files: `packages/core/src/activate/assess.ts`, `packages/core/tests/activate/assess.test.ts`
- action: `assessReadiness(config, env)` + `credsPresent` + `VERIFIER_SEAMS`/`DEEP_VERIFY_SEAM`, reusing the six-seam model (see `config-explain/build.ts` PROVIDER_BLOCKS) and `VerifierProvider`
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/activate/assess.test.ts`
- done: AC-6

### T2: Pure activation plan
- files: `packages/core/src/activate/plan.ts`, `packages/core/tests/activate/plan.test.ts`
- action: `planActivation({provider, scope, currentConfig})` → seam changes (idempotent), env var, next step
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/activate/plan.test.ts`
- done: AC-2, AC-6

### T3: Pure renderers
- files: `packages/core/src/activate/render.ts`, `packages/core/tests/activate/render.test.ts`
- action: `renderText`/`renderJson` + `ActivationResult`; key-missing prints the export line, ping result shown
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/activate/render.test.ts`
- done: AC-3, AC-6

### T4: Injectable live-ping seam
- files: `packages/core/src/activate/ping.ts`, `packages/core/tests/activate/ping.test.ts`
- action: `pingProvider` (anthropic-only via `buildAnthropicClientConfig`; local/mock skipped); client injectable so tests never hit the network
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/activate/ping.test.ts`
- done: AC-4, AC-6

### T5: Command shell + registration
- files: `packages/core/src/cli/commands/activate.ts`, `packages/core/src/cli/register.ts`, `packages/core/tests/cli/activate.test.ts`
- action: `runActivate` orchestration (flags/interactive provider+scope, write-on-valid-selection, opt-out ping, exit codes) + `registerActivateCommand` wired into `register.ts`
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/cli/activate.test.ts`
- done: AC-1, AC-2, AC-3, AC-4, AC-5

## Boundaries

- DO NOT install host hooks or touch `.claude/` — ambient gating is orthogonal (out of scope this slice).
- DO NOT change the gate engine (`gates/engine.ts`) or verdict logic, or add a new verifier provider.
- DO NOT persist the API key to config or logs — the key stays in env; config stores `provider` only.
- DO NOT depend on a real `anthropic`/`local` provider in any test — the ping is always injected.
- Slice 2 (doctor check + onboarding wiring) and slice 3 (release) are separate phases — not this one.
