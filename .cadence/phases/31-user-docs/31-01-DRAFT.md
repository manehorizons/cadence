---
phase: 31-user-docs
id: 31-01
tier: complex
status: PENDING
---

# 31-01 — user-guide docs

## Objective

Create a navigable plain-markdown `docs/` user guide for CADENCE adopters covering both surfaces (CLI engine + Claude Code host adapter), ground-truthed to source, with a command drift-guard test and a slimmed README.

## Context

Spec: `docs/superpowers/specs/2026-05-15-cadence-user-docs-design.md`. Plan: `docs/superpowers/plans/2026-05-15-cadence-user-docs.md` (authoritative, reviewer-approved). 8 markdown pages + 1 vitest drift guard + README slim. Docs describe current behavior incl. carry-forwards. Accuracy from `--help`/`GateZ`/`CadenceConfigZ`, not memory.

## Acceptance Criteria

### AC-1: concepts.md spine
Given `docs/concepts.md`
When read
Then it documents the loop, two-commit convention, profiles×tiers matrix, and all 13 gates (3 always-fire + 10 by cost band incl. deep-verify) with fire conditions + bypasses, matching `profile.ts`/`engine.ts`.

### AC-2: config reference
Given `docs/reference/config.md`
When read
Then every `CadenceConfigZ` field is documented (type/default/meaning) + the 3 presets, matching `config.ts`.

### AC-3: command reference + marker
Given `docs/reference/commands.md`
When read
Then every top-level + sub command from live `--help` is documented and the exact `<!-- cadence:commands:start/end -->` marker block is present.

### AC-4: drift guard
Given `packages/core/tests/docs/cli-reference.test.ts`
When run
Then it asserts the documented command set equals the CLI registry minus Commander auto `help`, and is green.

### AC-5: how-to + tutorial + index
Given `docs/cli.md`, `docs/claude-code.md`, `docs/providers.md`, `docs/quickstart.md`, `docs/README.md`
When read
Then they cover the two surfaces + providers + an end-to-end tutorial + nav, accuracy-checked vs source/`--help`.

### AC-6: README slim + meta, suite green
Given repo `README.md`, `DESIGN.md`, `CHANGELOG.md`
When the phase completes
Then README is slimmed (two-surface + local-dogfood teaser + docs link, no npx mismatch) **while preserving the `readme-shakedown.test.ts` anchor phrases**, DESIGN §10 + CHANGELOG updated, and the full turbo suite (incl. both docs guards) is green.

## Tasks

### T1: concepts.md (spine)
- files: `docs/concepts.md`
- action: per plan Task 1 — loop, two-commit, profiles×tiers matrix, 13-gate universe (cost bands + fire + bypass), providers concept; authored from `profile.ts`/`engine.ts`/`config.ts`.
- verify: every gate/flag verbatim-matches source; matrix matches `engine.ts`.
- done: AC-1

### T2: reference/config.md
- files: `docs/reference/config.md`
- action: per plan Task 2 — every `CadenceConfigZ` field + presets, from `config.ts`.
- verify: field-by-field diff vs `config.ts`.
- done: AC-2

### T3: reference/commands.md + drift marker
- files: `docs/reference/commands.md`
- action: per plan Task 3 — per-command reference from live `--help`; exact `<!-- cadence:commands:start/end -->` block (11 names, no `help`).
- verify: commands match `--help`; marker block exact.
- done: AC-3

### T4: drift-guard test (+ registrar extraction)
- files: `packages/core/tests/docs/cli-reference.test.ts`, `packages/core/src/cli/`
- action: per plan Task 4 — TDD; extract `registerAllCommands(program)` (pure refactor, `index.ts` also calls it); test = documented set == registry minus `help`.
- verify: red→green; `pnpm -C packages/core test -- run docs/cli-reference` green; no CLI behavior change.
- done: AC-4

### T5: how-to pages
- files: `docs/cli.md`, `docs/claude-code.md`, `docs/providers.md`
- action: per plan Task 5 — engine how-to; host adapter (hook groups derived from `packages/host-claude-code/src/`, 9 slash commands); providers (mock/anthropic/local env+fallback). Cross-checked vs `--help`/source.
- verify: flags/commands/env verbatim vs source.
- done: AC-5

### T6: quickstart.md
- files: `docs/quickstart.md`
- action: per plan Task 6 — end-to-end tutorial both surfaces, local-dogfood install, "npx not yet published" note; dry-run the sequence in a scratch dir.
- verify: every command/output real (dry-ran).
- done: AC-5

### T7: docs/README.md index
- files: `docs/README.md`
- action: per plan Task 7 — index/nav + two-surface model.
- verify: links resolve to the 7 pages.
- done: AC-5

### T8: slim README + DESIGN + CHANGELOG
- files: `README.md`, `DESIGN.md`, `CHANGELOG.md`
- action: per plan Task 8 — slim README **preserving `readme-shakedown.test.ts` anchor phrases** (the `--local`/gitignore + ≥20-commits/`--no-approve` carry-forward notes); DESIGN §10; CHANGELOG Added. Run `docs/readme-shakedown` green before checkpoint.
- verify: `pnpm -C packages/core test -- run docs/readme-shakedown` green; no npx mismatch.
- done: AC-6

### T9: full suite + two-commit settle
- files: (none — loop/commit mechanics per plan Task 9)
- action: full `pnpm turbo run test` green (incl. both docs guards); single docs commit; `settle run --auto`; settle commit.
- verify: suite green; feat+settle pair; loop IDLE.
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

## Boundaries

- DO NOT change CLI behavior — Task 4's registrar extraction is a pure refactor (`index.ts` keeps registering the same commands the same way).
- DO NOT break `packages/core/tests/docs/readme-shakedown.test.ts` — the slimmed README keeps its anchor phrases verbatim.
- DO NOT add a docs site / generator / typedoc — plain markdown only.
- DO NOT document unshipped/paused work (publish pipeline); state carry-forwards honestly (block/needs-context id-validation; npx unpublished).
- DO NOT flip cadence's own committed config; DO NOT push without user approval.
