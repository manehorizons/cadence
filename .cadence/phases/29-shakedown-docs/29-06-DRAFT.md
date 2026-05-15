---
phase: 29-shakedown-docs
id: 29-06
tier: standard
status: PENDING
---

# 29-06 — F1/F4/F6 remediation + 29.1 ledger

## Objective

Close the remaining actionable Phase 29.1 shakedown findings (F1 docs, F6 docs, F4 ux) and write the consolidated 29.1 remediation ledger, leaving only the resource-blocked phases (29.2 live `anthropic`, 29.3 human TTY) before the 30.1 publish gate.

## Context

F2 (the publish-blocker) shipped in Phase 29.4 (`29-f2-testglobs/29-04`). F3/F5 are `works-as-designed` (no action). Remaining 29.1 findings, all doc/ux, no external deps:
- **F1 (`docs` MED):** `host install --local` bakes machine-absolute paths into the settings file; cadence neither warns nor gitignores → committing ships unusable paths.
- **F6 (`docs` MED):** init-suggested `standard` profile makes the first non-TTY `draft approve` refuse; quickstart never warns.
- **F4 (`ux` LOW):** init summary surfaces config preset (`team`) next to gate profile (`standard`) — overlapping "profile" vocabulary, mild confusion.

ROADMAP 29.4 names the ledger `.cadence/shakedown/29-04-REMEDIATION.md` (kept as the contract filename — it spans the whole 29.x remediation).

## Acceptance Criteria

### AC-1: F1 — `--local` install warns about machine-absolute paths
Given `cadence-host-claude-code install --local`
When the install completes
Then a stderr warning states the settings file holds machine-absolute paths and must not be committed (gitignore it); the warning is absent without `--local`.

### AC-2: F6 — init summary hints non-TTY approve under approve-gated profiles
Given `cadence init` resolves a gate profile of `standard` or `strict`
When the post-init summary prints
Then it includes a line that `draft approve` is interactive under this profile and needs `--no-approve` in non-TTY (CI/scripts); under `auto` the line is absent.

### AC-3: F4 — init summary disambiguates config preset vs gate profile
Given any `cadence init`
When the summary prints the `preset` and `gate profile` rows
Then each row carries a short qualifier distinguishing config-preset (workflow defaults: solo|team|production) from gate-profile (gate strictness: strict|standard|auto).

### AC-4: README documents F1 + F6
Given the README "Try it" and "Use with Claude Code" sections
When a reader follows them
Then they are warned that (a) on a repo with ≥20 commits the suggested `standard` profile makes non-TTY `draft approve` need `--no-approve`, and (b) `host install --local` writes machine-absolute paths that must not be committed — verified by a docs-guard test.

### AC-5: 29.1 remediation ledger exists and dispositions every finding
Given `.cadence/shakedown/29-04-REMEDIATION.md`
When read
Then it maps F1–F6 to disposition (F2 fixed@29-04, F1/F4/F6 fixed@29-06, F3/F5 wontfix-by-design) and records 29.2/29.3 as not-run (resource-blocked: live `anthropic` key spend / human TTY), with no actionable 29.1 `bug`/`docs`/`ux` finding left open.

## Tasks

### T1: F1 — host `--local` install warning
- files: `packages/host-claude-code/src/cli.ts`
- action: when `opts.local`, write a stderr warning after the install lines: settings file contains machine-absolute paths; do not commit it (add to .gitignore). No warning when `--local` is absent.
- verify: install with/without `--local` in a temp dir; assert stderr.
- done: AC-1

### T2: F6 — init approve-profile hint
- files: `packages/core/src/cli/commands/init.ts`
- action: after the summary block, if `gateProfile` is `standard` or `strict`, print a hint line: `draft approve` is interactive under this profile — pass `--no-approve` for non-TTY (CI/scripts). Nothing under `auto`.
- verify: init with `--gate-profile=standard` shows the line; `=auto` does not.
- done: AC-2

### T3: F4 — preset vs gate-profile disambiguation
- files: `packages/core/src/cli/commands/init.ts`
- action: append short qualifiers to the summary rows — preset row → `(workflow defaults: solo|team|production)`, gate-profile row → `(gate strictness: strict|standard|auto)`.
- verify: init summary shows both qualifiers.
- done: AC-3

### T4: tests
- files: `packages/host-claude-code/tests/install-local-warning.test.ts`, `packages/core/tests/cli/init.test.ts`, `packages/core/tests/docs/readme-shakedown.test.ts`
- action: host test — `--local` emits the warning, plain install does not (AC-1). init.test.ts — `standard`→hint present, `auto`→absent (AC-2); both disambiguation qualifiers present (AC-3). README guard — README contains the F6 non-TTY-approve note and the F1 `--local` don't-commit note (AC-4). Reference `AC-1`..`AC-5` tokens for the coverage gate.
- verify: `pnpm -C packages/host-claude-code test` + `pnpm -C packages/core test -- run init readme` green.
- done: AC-1, AC-2, AC-3, AC-4

### T5: README + ledger + docs + full suite
- files: `README.md`, `.cadence/shakedown/29-04-REMEDIATION.md`, `DESIGN.md`, `CHANGELOG.md`
- action: README — quickstart note for F6 (≥20 commits → `standard` → non-TTY `draft approve` needs `--no-approve`) and a `--local` don't-commit note in "Use with Claude Code". Write the ledger (AC-5 table). DESIGN §10 punchlist entry; CHANGELOG Unreleased Fixed entries for F1/F4/F6. Confirm `pnpm turbo run test` green.
- verify: full turbo suite green; ledger dispositions all findings.
- done: AC-4, AC-5

## Boundaries

- DO NOT auto-edit the user's `.gitignore` — warn only (auto-mutating repo files at install is heavier than the finding warrants; a later phase may revisit).
- DO NOT change gate-set logic, the approve gate, or `--local` path behavior — F1/F6 are about *surfacing* existing behavior, not changing it.
- DO NOT attempt Phase 29.2 / 29.3 work — resource-blocked (live `anthropic` key + token spend / real human TTY); record as not-run in the ledger.
- DO NOT rename the config preset or gate-profile concepts — F4 fix is summary-copy disambiguation only.
