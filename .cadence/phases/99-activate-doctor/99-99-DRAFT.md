---
phase: 99-activate-doctor
id: 99-99
tier: standard
status: PENDING
---

# 99-99 — activate doctor check + onboarding wiring (slice 2)

## Objective

Make the verification-activation state diagnosable and the `cadence activate` verb discoverable: add a `cadence doctor` verification-readiness check (reusing the pure `assessReadiness`) and point `quickstart` / `config explain` / `init` at `activate`.

## Acceptance Criteria

### AC-1: doctor warns on an all-mock config
Given a default (all-mock) `.cadence/` repo
When `cadence doctor` runs
Then a `verification-readiness` check reports `warning` with a remediation that names `cadence activate`

### AC-2: doctor reflects real-provider readiness
Given the deep-verify seam is set to a real provider
When `cadence doctor` runs
Then the `verification-readiness` check is `ok` if the provider's key/endpoint is present, and `warning` (naming the env var) if it is absent

### AC-3: quickstart lists the activate verb
Given the onboarding command map
When `cadence quickstart` renders
Then the map includes an `activate` entry described as turning on real verification

### AC-4: config explain points at activate when all-mock
Given every verifier seam is `mock`
When `cadence config explain` builds its warnings
Then a warning with code `all-mock` is present and its message names `cadence activate`

### AC-5: init nudges toward activate
Given a fresh `cadence init`
When the first-loop guidance prints
Then it includes a line pointing at `cadence activate` to turn on real verification

## Tasks

### T1: doctor verification-readiness check
- files: `packages/core/src/doctor/run.ts`, `packages/core/tests/doctor/verification-readiness.test.ts`
- action: add `checkVerificationReadiness(root, env?)` reusing `assessReadiness` (warning on all-mock → "run cadence activate"; warning on real-provider-missing-key → env var; ok otherwise; best-effort, never throws), and register it in `runDoctor`'s checks array; bump any doctor check-count assertion
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/doctor/verification-readiness.test.ts tests/doctor`
- done: AC-1, AC-2

### T2: onboarding wiring (quickstart + config explain + init)
- files: `packages/core/src/quickstart/build.ts`, `packages/core/src/config-explain/build.ts`, `packages/core/src/config-explain/types.ts` (if `Warning['code']` is a closed union, add `'all-mock'`), `packages/core/src/cli/commands/init.ts`, `packages/core/tests/activate/wiring.test.ts`
- action: add `activate` to the quickstart `COMMAND_MAP`; add an `all-mock` warning in config-explain `deriveWarnings` when every provider row is mock (message names `cadence activate`); add an `activate` pointer line to `init`'s first-loop output; update any golden/snapshot fixtures that capture those outputs
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/activate/wiring.test.ts tests/quickstart tests/config-explain tests/cli/init`
- done: AC-3, AC-4, AC-5

## Boundaries

- DO NOT change the gate engine, verdict logic, or the `activate` command behavior from slice 1.
- DO NOT add real-provider dependencies to tests — readiness is assessed purely from config + env.
- Keep `assessReadiness` the single source of truth — the doctor check must reuse it, not re-derive readiness.
- Slice 3 (release: version bump + CLAUDE.md + changeset + docs/config.md + DESIGN.md) is a separate phase — not this one.
