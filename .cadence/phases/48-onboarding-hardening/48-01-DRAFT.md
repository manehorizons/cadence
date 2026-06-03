---
phase: 48-onboarding-hardening
id: 48-01
tier: standard
status: PENDING
---

# 48-01 — Onboarding hardening (v1.5.1)

## Objective

Remove five first-run friction points (cryptic not-initialized error, unenforced Node floor, silent mock-fallback under `--deep`, a dead `DESIGN.md` link in the scaffolded CLAUDE.md, and unclear gate-profile approve docs) so a new user's first ten minutes are clear, with no change to engine or gate semantics.

> Source: post-launch four-area survey → approved design at `docs/superpowers/specs/2026-06-03-onboarding-hardening-design.md`; task-level plan at `docs/superpowers/plans/2026-06-03-onboarding-hardening.md`. Targets release v1.5.1.

## Acceptance Criteria

### AC-1: distinct not-initialized error
Given a directory with no `.cadence/` (user never ran `cadence init`),
When `SimpleStateBackend.readState()` runs,
Then it throws `NotInitializedError` (code `NOT_INITIALIZED`, message names `cadence init`), while a present-but-unparseable `state.json` still throws `StateCorruptError`.

### AC-2: Node version floor is enforced and readable
Given a Node major version below 20,
When the pure `checkNodeMajor(version)` guard evaluates it,
Then it returns `{ ok: false }` with a message matching `requires Node >=20` and echoing the version; Node ≥20 (and unparseable input) returns `{ ok: true }`. The three published packages declare `engines.node` `>=20`.

### AC-3: loud mock-fallback banner under --deep
Given a repo whose effective verifier provider is `mock` (the shipped default — `cadence init` writes `verifier.provider='mock'`),
When `settle run --deep` runs,
Then a prominent `MOCK verification` banner is written to stderr (via `resolveEffectiveProvider(...).provider === 'mock'`); a non-`--deep` run, or a configured *real* provider (e.g. `anthropic`), produces no banner from this check.

> Deviation (build, 2026-06-03): original AC keyed the banner on `defaulted === true` (provider field absent). Discovered during T3 that `defaultConfig.verifier = { provider: 'mock' }`, so a freshly-init'd repo has `mock` set *explicitly* — `defaulted` would never fire for the onboarding audience. Corrected to trigger on effective provider `=== 'mock'`. The helper still returns `{ provider, defaulted }`.

### AC-4: generated CLAUDE.md has no dead DESIGN.md link
Given `renderManagedBlock(opts)`,
When the managed block is rendered for a consumer project,
Then the output contains no `DESIGN.md` reference and links to `github.com/manehorizons/cadence/blob/main/docs/concepts.md`.

### AC-5: README documents all three profiles' approve behavior
Given the root `README.md`,
When its gate-profile heads-up is read,
Then it explains `auto` (non-interactive approve), `standard`/`strict` (interactive approve; `--no-approve` for CI), and the commit-count suggestion heuristic.

## Tasks

### T1: NotInitializedError + readState detection
- files: `packages/core/src/errors.ts`, `packages/core/src/state/simple.ts`, `packages/core/tests/state/simple.test.ts`, `packages/core/tests/errors.test.ts`
- action: Add `'NOT_INITIALIZED'` code + `NotInitializedError` class (default message names `cadence init`). In `readState`, when `state.json` does not exist (`existsSync`), throw `NotInitializedError` before the read; corrupt/invalid-JSON/schema paths keep `StateCorruptError`. (CLI top-level catch already prints `err.message` + exits 1 — renders cleanly.)
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/state/simple.test.ts tests/errors.test.ts`
- done: AC-1

### T2: Node version guard + engines field
- files: `packages/core/src/cli/node-guard.ts` (new), `packages/core/src/cli/index.ts`, `packages/core/bin/cadence.cjs`, `packages/core/package.json`, `packages/types/package.json`, `packages/host-claude-code/package.json`, `packages/core/tests/cli/node-guard.test.ts` (new)
- action: Add pure `checkNodeMajor(versionString, min=20)` (fails open on unparseable input). Call it first in `cli/index.ts` (`console.error` + `exit 1` on failure); inline a dependency-free equivalent at the top of `bin/cadence.cjs` before the spawn. Add `"engines": { "node": ">=20" }` to the three published `package.json`s.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/cli/node-guard.test.ts && pnpm --filter @manehorizons/cadence-core build`
- done: AC-2

### T3: loud mock-fallback warning under --deep
- files: `packages/core/src/verify/verifier-factory.ts`, `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/verify/effective-provider.test.ts` (new), `packages/core/tests/cli/settle-mock-banner.test.ts` (new)
- action: Add side-effect-free `resolveEffectiveProvider(slice, opts)` → `{ provider, defaulted }` (`defaulted` true only when neither override nor configured provider is present) plus `MOCK_FALLBACK_BANNER`. In `settle run`, when `opts.deep` and `resolveEffectiveProvider(cadenceConfig?.verifier).defaulted`, write the banner to stderr (placed early enough to emit before any loop-state refusal). Factory selection logic is untouched, so the test suite/CI keep using mock silently.
- verify: `pnpm --filter @manehorizons/cadence-core build && pnpm --filter @manehorizons/cadence-core test -- tests/verify/effective-provider.test.ts tests/cli/settle-mock-banner.test.ts`
- done: AC-3

### T4: fix DESIGN.md dead link in CLAUDE.md template
- files: `packages/core/src/init/claude-md-template.ts`, `packages/core/tests/init/claude-md-template.test.ts` (create if absent)
- action: Replace the line-30 `see DESIGN.md §4` with a `docs/concepts.md` URL note, and reword the line-37 `` `DESIGN.md` — architecture … `` bullet to point at the user's own README + the concepts.md URL. Consumer repos have no `docs/`, so use the absolute GitHub URL.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/init/claude-md-template.test.ts`
- done: AC-4

### T5: README profile/approve clarity (docs)
- files: `README.md`, `packages/core/tests/docs/readme-profiles.test.ts` (new)
- action: Expand the gate-profile heads-up (README.md:67) to cover `auto`/`standard`/`strict` approve behavior + the ≥20-commit suggestion heuristic. Add a doc-contract test (resolving the repo `README.md` from the test file's URL) asserting the note names all three profiles and `--no-approve`. (Verifies AC-5.)
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/docs/readme-profiles.test.ts`
- done: AC-5

## Boundaries

- DO NOT change the `mock` default: it stays the intentional default for tests and CI. The banner fires only when `--deep` is requested AND the effective provider is `mock`; a real configured provider (even one that downgrades to mock for a missing key — the factory warns there) does not trigger this banner.
- DO NOT alter gate-matrix membership, the DRAFT→BUILD→SETTLE state machine, the gate engine/registry, or any verifier selection algorithm — only add the read-only `resolveEffectiveProvider` helper beside it.
- DO NOT change the `files-outside-boundary` / anomaly event shapes or any existing error's behavior (corrupt state keeps `StateCorruptError`).
- DO NOT make `checkNodeMajor` block on unparseable input — it must fail open so a version-string oddity can never brick the CLI; the `engines` field is the hard floor.
- Touch only the files listed in the tasks above; leave `.cadence/` live state, `launch/`, and unrelated docs untouched.
