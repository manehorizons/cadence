---
phase: 95-config-edit-cli
id: 95-95
tier: standard
status: PENDING
---

# 95-95 — config edit CLI — readline glue, subcommand, non-TTY guard, did-you-mean, docs

## Objective

Wire the phase-94 pure core into a real `cadence config edit [field]` command: a zero-dep
readline ask/confirm glue, the subcommand + service (TTY guard, did-you-mean, atomic write,
slice-A explain effect), integration tests, and docs.

## Acceptance Criteria

### AC-1: readline ask/confirm glue
Given `cli/prompt.ts`
When `makeReadlinePrompts(config)` is called
Then it returns `{ask, confirm, close}` backed by `node:readline/promises` — `ask` renders the
field prompt and reads a line; `confirm` renders the change summary and reads a y/N — with no
new runtime dependency.

### AC-2: config edit subcommand + service
Given `runConfigEdit(root, {field, isTty}, io)` registered as `cadence config edit [field]`
When invoked in an initialized repo on a TTY with no field
Then it loads config, runs the wizard over the curated 5, on `apply` writes config atomically
and prints the `cadence config explain` effect; on `noop` writes nothing and says so; on
`invalid` prints the offending field and exits non-zero. Uninitialized → `NotInitializedError`.

### AC-3: non-TTY guard
Given `cadence config edit` in a non-TTY context (`isTty=false`)
When run
Then it refuses with exit 1 and a message pointing to `cadence config set <key> <value>`,
without prompting.

### AC-4: unknown field did-you-mean (resolved before the TTY guard)
Given `cadence config edit <field>` with an unknown field
When run (even in a non-TTY)
Then it prints a did-you-mean nudge plus the editable-field list and exits non-zero —
field resolution happens BEFORE the TTY guard so the nudge is reported regardless of TTY.

### AC-5: docs
Given the docs tree
When updated
Then `docs/reference/commands.md` has a `### config edit` entry, `docs/reference/config.md`
cross-links the wizard, and `DESIGN.md` carries a one-line slice-C note (no new D-number).

## Tasks

### T1: Readline ask/confirm glue
- files: `packages/core/src/cli/prompt.ts`
- action: Per plan Task 7 — `makeReadlinePrompts(config)` over `node:readline/promises`, using `renderPrompt`/`renderChanges` from the pure core.
- verify: `pnpm --filter @manehorizons/cadence-core typecheck` clean.
- done: AC-1

### T2: config edit service + subcommand
- files: `packages/core/src/cli/commands/config.ts`
- action: Per plan Task 8 — add `runConfigEdit(root, {field, isTty}, io)` and register `edit [field]`. Wire NotInitialized check, field-resolution/did-you-mean, TTY guard, wizard, atomic write, slice-A explain effect. Resolve the field BEFORE the TTY guard (plan Task 9 ordering note) so AC-4 holds in non-TTY.
- verify: `typecheck` + `lint` clean; `build` clean.
- done: AC-2

### T3: Integration tests — non-TTY guard + did-you-mean
- files: `packages/core/tests/cli/config-edit.test.ts`
- action: Per plan Task 9 — spawn the CLI in an ephemeral repo: `config edit` (non-TTY) refuses pointing to `config set`; `config edit profil` nudges `profile` + lists editable fields. Both exit non-zero.
- verify: `pnpm --filter @manehorizons/cadence-core build && pnpm --filter @manehorizons/cadence-core test -- cli/config-edit.test.ts` green.
- done: AC-3, AC-4

### T4: Docs
- files: `docs/reference/commands.md`, `docs/reference/config.md`, `DESIGN.md`
- action: Per plan Task 10 — `### config edit` reference entry; `config.md` cross-link to the wizard + explain; one-line DESIGN.md slice-C note.
- verify: `grep -n "config edit" docs/reference/commands.md docs/reference/config.md` shows the additions.
- done: AC-5

### T5: Phase gate
- files: (none — verification only)
- action: Per plan Task 11 — run the full pipeline and confirm green.
- verify: `pnpm --filter @manehorizons/cadence-core lint && pnpm --filter @manehorizons/cadence-core typecheck && pnpm --filter @manehorizons/cadence-core test && pnpm --filter @manehorizons/cadence-core build` all green.
- done: AC-2

## Boundaries

- DO NOT add a runtime dependency; readline is `node:` built-in.
- DO NOT change the phase-94 pure modules' behavior; this phase only consumes them.
- DO NOT change `config get`/`set`/`doctor`/`explain` behavior; `edit` is an additive subcommand.
- DO NOT change gate semantics or the config schema.
- Keep the single write atomic + behind confirm; decline/non-TTY/invalid write nothing.
