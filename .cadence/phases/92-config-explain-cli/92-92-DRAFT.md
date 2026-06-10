---
phase: 92-config-explain-cli
id: 92-92
tier: standard
status: PENDING
---

# 92-92 — config explain — CLI subcommand + impure gather + docs

Slice A, phase 2 of 2. Makes the phase-91 pure core user-reachable as
`cadence config explain` (design:
`docs/superpowers/specs/2026-06-10-cadence-config-explain-design.md`).

## Objective

Wire the pure `config-explain` module into a `cadence config explain [field]`
subcommand: gather the `ExplainContext` impurely (active tier, env keys,
host-install state), render text/JSON, and document it — so a confused user can
see what their config actually does.

## Acceptance Criteria

### AC-1: Shared host-hooks-installed predicate, reused by doctor
Given `.claude/settings.json` with (or without) CADENCE-managed (`_managedBy: "cadence"`) hook entries
When the shared `hostHooksInstalled(root)` helper is called
Then it returns `true` iff a managed hook entry is present (and `false`/best-effort on absent/unreadable/invalid JSON),
And `doctor`'s `checkHostHooks` is refactored to call the same helper (no behavior change to the doctor check).

### AC-2: Impure gather assembles a faithful ExplainContext
Given a repo with a known `state.json` tier, env state, and host-install state
When `gatherExplainContext(root)` is called
Then `activeTier` reflects `state.json.tier` (null when absent), `anthropicKeyPresent`/`localKeyPresent` reflect the env vars, and `hostHooksInstalled` reflects the shared predicate — never throwing (best-effort defaults on any read failure).

### AC-3: `cadence config explain` renders, targets, and sets exit codes
Given an initialized repo
When `cadence config explain` / `… <field>` / `… --all` / `… --json` run
Then the curated text / single-block / all-keys / structured JSON render respectively (via the phase-91 renderers); an unknown `<field>` prints a did-you-mean nudge and exits non-zero; and an uninitialized repo fails with the standard NotInitializedError guidance.

### AC-4: Documented
Given the docs tree
When a reader opens `docs/reference/config.md`
Then a `config explain` subsection describes the command, its flags, and its relationship to `cadence config doctor` / `cadence doctor`, and `DESIGN.md` notes the additive read-only surface.

## Tasks

### T1: Extract shared host-hooks-installed predicate
- files: `packages/core/src/doctor/host-hooks.ts`, `packages/core/src/doctor/run.ts`, `packages/core/tests/doctor/host-hooks.test.ts`
- action: Factor the `_managedBy: "cadence"` detection out of `checkHostHooks` into a shared best-effort `hostHooksInstalled(root): Promise<boolean>`; refactor `checkHostHooks` to call it. Test the predicate across present/absent/malformed settings.
- verify: `pnpm --filter @manehorizons/cadence-core test -- doctor/host-hooks.test.ts && pnpm --filter @manehorizons/cadence-core test -- doctor/`
- done: AC-1

### T2: Impure `gatherExplainContext`
- files: `packages/core/src/config-explain/gather.ts`, `packages/core/tests/config-explain/gather.test.ts`
- action: Read `state.json` tier (best-effort null), probe `ANTHROPIC_API_KEY`/`CADENCE_LOCAL_API_KEY`, call `hostHooksInstalled`. Inject env for testability (param defaulting to `process.env`). Never throw.
- verify: `pnpm --filter @manehorizons/cadence-core test -- config-explain/gather.test.ts`
- done: AC-2

### T3: `config explain` service + subcommand
- files: `packages/core/src/cli/commands/config.ts`, `packages/core/tests/cli/config-explain.test.ts`
- action: Add `runConfigExplain(root, args, io): Promise<CommandResult>` (loadConfig → gather → buildExplanation → renderText/renderJson; exit non-zero via `isKnownField` on unknown field; NotInitializedError when uninitialized). Register `config explain [field]` with `--all` / `--json`, wiring `processIO`. Integration tests via testkit ephemeral repo.
- verify: `pnpm --filter @manehorizons/cadence-core test -- cli/config-explain.test.ts`
- done: AC-3

### T4: Docs
- files: `docs/reference/config.md`, `DESIGN.md`
- action: Add a `config explain` subsection (command, flags, relationship to `config doctor` / `cadence doctor`); add a short DESIGN.md note for the additive read-only surface. No new D-number.
- verify: `grep -n "config explain" docs/reference/config.md DESIGN.md`
- done: AC-4

## Boundaries

- DO NOT change the phase-91 pure module's behavior (build/render/types) or the config schema. This phase only adds the impure gather + CLI + docs.
- `checkHostHooks`'s doctor verdict/message must not change — only its internals delegate to the shared predicate.
- Keep the six existing `cadence config` get/set/doctor subcommands untouched.
- Field targeting stays block-level (top-level keys), per phase 91.
