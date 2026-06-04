---
phase: 52-preset-flag-rename
id: 52-01
tier: standard
status: PENDING
---

# 52-01 — Rename init --profile flag to --preset (keep --profile as deprecated alias)

## Objective

Rename `cadence init --profile` to `--preset` (it selects a config preset, not a
gate profile) while keeping `--profile` as a deprecated, still-working alias that
emits a one-line stderr deprecation notice.

## Acceptance Criteria

### AC-1: `--preset` selects the config preset
Given a fresh tree with no `.cadence/`
When the user runs `cadence init --preset solo --no-... ` (non-interactive)
Then `.cadence/config.json` reflects the `solo` preset and no deprecation
notice is printed.

### AC-2: `--profile` still works as a deprecated alias
Given a fresh tree with no `.cadence/`
When the user runs `cadence init --profile production`
Then the `production` preset is applied (identical behaviour to `--preset
production`) AND a single deprecation notice is written to stderr telling the
user to use `--preset`.

### AC-3: new flag wins; default unchanged
Given both/neither flag forms
When `--preset` and `--profile` are both passed, `--preset` takes precedence;
when neither is passed, the preset defaults to `team` (unchanged from today).
Then resolution is `opts.preset ?? opts.profile ?? 'team'`.

### AC-4: docs reflect the rename
Given `docs/reference/commands.md`
When the init flag table is read
Then it documents `--preset <preset>` as primary and notes `--profile` is a
deprecated alias; `--gate-profile` wording is untouched.

## Tasks

### T1: Add `--preset` primary + `--profile` deprecated alias
- files: `packages/core/src/cli/commands/init.ts`
- action: Register `--preset <preset>` (no commander default) and demote
  `--profile <preset>` to a deprecated alias (no default). In the action,
  resolve `const preset = opts.preset ?? opts.profile ?? 'team'`; when
  `opts.profile !== undefined`, print a one-line deprecation notice to stderr.
  Replace the remaining `opts.profile` reads (`presets[...]`, summary lines,
  `--claude-md` path) with the resolved `preset`.
- verify: `pnpm --filter @manehorizons/cadence-core typecheck` + new tests pass
- done: AC-1, AC-2, AC-3

### T2: Tests (TDD — write first, watch fail)
- files: `packages/core/tests/cli/init.test.ts` (or the existing init test file)
- action: Cover AC-1 (`--preset` applies preset, no notice), AC-2 (`--profile`
  applies preset + emits deprecation notice), AC-3 (precedence + default).
- verify: `pnpm --filter @manehorizons/cadence-core test -- init`
- done: AC-1, AC-2, AC-3

### T3: Update commands.md
- files: `docs/reference/commands.md`
- action: Change the init flag table row to `--preset <preset>` primary; add a
  short note that `--profile` is a deprecated alias kept for back-compat.
- verify: grep shows `--preset` documented; `--gate-profile` row unchanged
- done: AC-4

## Boundaries

- DO NOT touch `--gate-profile` semantics, `suggestGateProfile`, or the
  `Profile` (`strict|standard|auto`) type — this is purely the preset flag.
- DO NOT change the config preset values (`solo|team|production`) or the
  default (`team`).
- DO NOT rename the `cfg.profile` field written to `config.json` (that field IS
  the gate profile; it is correctly named).
