---
phase: 46-handoff-resume
id: 46-01
tier: complex
status: PENDING
---

# 46-01 — cadence handoff/resume session-continuity commands

## Objective

Promote session handoff from an unowned convention (the reserved `.cadence/handoff/` dir nothing drives) into two host-agnostic engine commands — `cadence handoff` (scaffold a SESSION doc with machine facts pre-filled) and `cadence resume` (read-only replay) — plus Claude Code slash-command wrappers.

> Design + plan: `docs/superpowers/specs/2026-06-03-cadence-handoff-resume-design.md`, `docs/superpowers/plans/2026-06-03-cadence-handoff-resume.md` (local/untracked).

## Acceptance Criteria

### AC-1: GitFacts schema
Given the types package, When `GitFactsZ` parses an available or unavailable variant, Then the discriminated union validates (and rejects an available variant missing `branch`).

### AC-2: ResumeResult schema
Given the types package, When `ResumeResultZ` parses `{ found: false }` or a full found shape, Then it validates.

### AC-3: git facts available
Given a git repo, When `readGitFacts` runs, Then it returns `available: true` with non-empty `branch` and `head`.

### AC-4: git dirty detection
Given a git repo with uncommitted changes, When `readGitFacts` runs, Then `dirty` is true.

### AC-5: git unavailable
Given a non-git directory, When `readGitFacts` runs, Then it returns `{ available: false }` and never throws.

### AC-6: renderer flat frontmatter
Given a context packet + git facts, When `renderSession` runs, Then it emits flat frontmatter keys (`generated_at`, `loop_position`, `git_branch`, `git_dirty`) parseable by a one-line regex.

### AC-7: renderer narrative stubs
Given any input, When `renderSession` runs, Then it includes empty narrative section headers (TL;DR, What landed) with FILL IN prompts.

### AC-8: renderer git-unavailable
Given `{ available: false }` git facts, When `renderSession` runs, Then it renders `git_branch: unavailable` without throwing.

### AC-9: locate empty
Given an empty handoff dir, When `locateFreshestHandoff` runs, Then it returns null.

### AC-10: locate newest
Given multiple SESSION docs, When no pointer is given, Then `locateFreshestHandoff` picks the newest by `generated_at`.

### AC-11: locate prefers pointer
Given a valid `lastHandoff` pointer, When `locateFreshestHandoff` runs, Then it returns the pointer's file.

### AC-12: locate fallback
Given a missing pointer file, When `locateFreshestHandoff` runs, Then it falls back to globbing.

### AC-13: handoff writes doc
Given an initialized project, When `runHandoff` runs with a label, Then it writes `SESSION-<date>-<label>.md` with pre-filled facts.

### AC-14: handoff stamps by default
Given no `--no-stamp`, When `runHandoff` runs, Then `state.session.lastHandoff` is stamped.

### AC-15: handoff --no-stamp
Given `--no-stamp`, When `runHandoff` runs, Then `state.json` is byte-unchanged.

### AC-16: handoff clobber guard
Given an existing same-day file, When `runHandoff` runs without `--force`, Then it throws "already exists"; with `--force` it overwrites.

### AC-17: handoff refreshes packet
Given `runHandoff`, When it runs, Then `.cadence/intelligence/context/handoff.json` is (re)written.

### AC-18: resume not found
Given no handoff, When `runResume` runs, Then it returns `{ found: false }`.

### AC-19: resume replays
Given a handoff exists, When `runResume` runs, Then it returns the doc content + a fresh live context packet.

### AC-20: resume read-only
Given a handoff exists, When `runResume` runs, Then `state.json` is byte-unchanged.

### AC-21: CLI handoff path
Given `cadence handoff --label`, When run, Then exit 0 and the SESSION path is printed.

### AC-22: CLI handoff --json
Given `cadence handoff --json`, When run, Then stdout is a parseable result with `stamped: true`.

### AC-23: CLI handoff clobber exit
Given a duplicate `cadence handoff`, When run without `--force`, Then exit code 2 and stderr "already exists".

### AC-24: CLI resume empty
Given no handoff, When `cadence resume` runs, Then exit 0 with a "no handoff found" + `cadence handoff` hint.

### AC-25: CLI resume replay
Given a handoff exists, When `cadence resume` runs, Then exit 0 and the doc is printed.

### AC-26: CLI resume --json
Given `cadence resume --json`, When run, Then stdout is a parseable `ResumeResult` with `found: true`.

### AC-27: host wrappers
Given `installCommands`, When run, Then `cadence-handoff.md` and `cadence-resume.md` exist (11 total) and bind to `!cadence handoff $ARGUMENTS` / `!cadence resume`.

## Tasks

### T1: Types — GitFacts, HandoffFrontmatter, ResumeResult
- files: `packages/types/src/handoff.ts`, `packages/types/src/index.ts`, `packages/types/tests/handoff.test.ts`
- action: Add Zod schemas + TS types; re-export from index.
- verify: `pnpm --filter @manehorizons/cadence-types test -- handoff`
- done: AC-1, AC-2

### T2: Read-only git facts reader
- files: `packages/core/src/handoff/git-facts.ts`, `packages/core/tests/handoff/git-facts.test.ts`
- action: `readGitFacts(root)` via `execFile`; never throws; non-repo → unavailable.
- verify: `pnpm --filter @manehorizons/cadence-core test -- handoff/git-facts`
- done: AC-3, AC-4, AC-5

### T3: SESSION doc renderer
- files: `packages/core/src/handoff/render-session.ts`, `packages/core/tests/handoff/render-session.test.ts`
- action: `renderSession(input)` → flat frontmatter + pre-filled facts + narrative stubs.
- verify: `pnpm --filter @manehorizons/cadence-core test -- handoff/render-session`
- done: AC-6, AC-7, AC-8

### T4: Freshest-handoff locator
- files: `packages/core/src/handoff/locate.ts`, `packages/core/tests/handoff/locate.test.ts`
- action: `locateFreshestHandoff(root, lastHandoff)` — pointer then glob, rank by generated_at→filename→mtime.
- verify: `pnpm --filter @manehorizons/cadence-core test -- handoff/locate`
- done: AC-9, AC-10, AC-11, AC-12

### T5: runHandoff write orchestration
- files: `packages/core/src/handoff/run-handoff.ts`, `packages/core/tests/handoff/run-handoff.test.ts`
- action: gather packet+git, render, atomic-write, clobber-guard, opt-out stamp.
- verify: `pnpm --filter @manehorizons/cadence-core test -- handoff/run-handoff`
- done: AC-13, AC-14, AC-15, AC-16, AC-17

### T6: runResume read orchestration
- files: `packages/core/src/handoff/run-resume.ts`, `packages/core/tests/handoff/run-resume.test.ts`
- action: locate + fresh live packet + drift; read-only.
- verify: `pnpm --filter @manehorizons/cadence-core test -- handoff/run-resume`
- done: AC-18, AC-19, AC-20

### T7: cadence handoff CLI command
- files: `packages/core/src/cli/commands/handoff.ts`, `packages/core/src/cli/register.ts`, `packages/core/tests/cli/handoff.test.ts`
- action: register command; flags `--label/--force/--no-stamp/--no-git/--json`; exit 2 on clobber.
- verify: `pnpm --filter @manehorizons/cadence-core build && pnpm --filter @manehorizons/cadence-core test -- cli/handoff`
- done: AC-21, AC-22, AC-23

### T8: cadence resume CLI command
- files: `packages/core/src/cli/commands/resume.ts`, `packages/core/src/cli/register.ts`, `packages/core/tests/cli/resume.test.ts`
- action: register command; `--json`; read-only replay + drift note + empty-dir hint.
- verify: `pnpm --filter @manehorizons/cadence-core build && pnpm --filter @manehorizons/cadence-core test -- cli/resume`
- done: AC-24, AC-25, AC-26

### T9: Host slash-command wrappers
- files: `packages/host-claude-code/src/install-commands.ts`, `packages/host-claude-code/tests/install-commands.test.ts`
- action: add `cadence-handoff` + `cadence-resume` to COMMANDS; update count 9→11.
- verify: `pnpm --filter @manehorizons/cadence-host-claude-code build && pnpm --filter @manehorizons/cadence-host-claude-code test -- install-commands`
- done: AC-27

### T10: Documentation
- files: `docs/reference/commands.md`, `docs/concepts.md`, `DESIGN.md`, `README.md`
- action: document both commands; record design decisions + first read-only git shell-out + cross-branch non-goal.
- verify: manual read-through; `grep -n "nine\|cadence-resume" README.md docs/reference/commands.md`
- done: (docs — no AC)

### T11: Full-gate verification
- files: (none)
- action: `pnpm turbo run lint typecheck test build`; smoke-test handoff+resume in an ephemeral dir.
- verify: all four turbo tasks green; AC-1..AC-27 each present in a test.
- done: (verification — no AC)

## Boundaries

- DO NOT modify the gate engine (`gates/engine.ts`), `settle.ts`, or any existing command's behavior — this is purely additive.
- DO NOT add new gates or touch the gate matrix in `docs/concepts.md`.
- DO NOT make `cadence resume` mutate state — it is read-only (AC-20 enforces).
- DO NOT implement cross-branch handoff discovery, gate-running, memory reconciliation, or git commit/push (explicit non-goals).
- DO NOT publish or un-private `@manehorizons/cadence-testkit`.
- DO NOT edit `.keel/` references or unrelated `.cadence/` planning records.
- git access in `git-facts.ts` is READ-ONLY (status/log/rev-parse/diff) via `execFile` with fixed arg arrays.
