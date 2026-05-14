---
phase: 22-v030-release
id: 22-01
tier: standard
status: APPROVED
---

# 22-01 — Cut v0.3.0 release

## Objective

Bank the verifier + anomaly-notify + matrix-enforcement work in a real release. Since `v0.2.0-rc.1` (Phase 12) we shipped Phases 13–17.3 + 18.1 + 19.1 + 20.1 + 21.1 — profile system, test-coverage gate, `--deep` verifier, `--interactive` walker, four-transport anomaly notify, hook-side emission, `status anomalies` reader, F2 rename rollout, F4 webhook, F5/F6 doc cleanup, and the M2 soft cap. Cut `v0.3.0` proper: bump the four `@cadence/*` package versions, write CHANGELOG.md, refresh the README status banner, and create the `v0.3.0` annotated tag locally. Tag push waits on user approval.

## Acceptance Criteria

### AC-1: All four `@cadence/*` packages bumped from `0.2.0-rc.1` to `0.3.0`
Given `packages/{core,types,testkit,host-claude-code}/package.json` currently declare `"version": "0.2.0-rc.1"`
When the bump lands
Then each declares `"version": "0.3.0"`. Workspace deps still pin via `workspace:*`. `pnpm install` runs clean.

### AC-2: CHANGELOG.md captures v0.3.0 highlights
Given the repo has no CHANGELOG today
When the phase lands
Then a `CHANGELOG.md` at repo root documents `[0.3.0] - 2026-05-14` in Keep-a-Changelog style with `### Added`, `### Changed`, `### Removed`, and a trailing `[0.2.0-rc.1]` + `[0.1.0]` traceability entry. One-line bullets, each referencing the source phase number.

### AC-3: README status banner refreshed
Given README's `> **Status:**` line currently references `v0.2.0-rc.1` only
When the phase lands
Then the banner reads `v0.3.0 (2026-05-14)` with a short summary of the verifier hybrid + anomaly notify + soft-cap shipments and points at CHANGELOG.md. KEEL history (Phase 12 rename, codex archive tag) preserved.

### AC-4: `v0.3.0` annotated tag created locally
Given T1+T2+T3 are committed in a single `chore(release): v0.3.0` commit
When `git tag -a v0.3.0 -m "..."` runs
Then the annotated tag exists locally on the release commit. The tag is **NOT pushed in this phase** — user approval required (Claude Code default safety).

### AC-5: full suite + dogfood
Given Phase 22.1 lands
When `pnpm turbo run test` runs
Then ~396 tests still pass. AC-1..AC-5 each referenced by ≥1 test file via task-header AC markers. Self-dogfood: 22.1 settles cleanly through `cadence settle run --auto --allow-missing-coverage`.

## Tasks

### T1: Bump all four package versions to 0.3.0 (AC-1)
- files: `packages/core/package.json`, `packages/types/package.json`, `packages/testkit/package.json`, `packages/host-claude-code/package.json`
- action: In each non-root `package.json`, change `"version": "0.2.0-rc.1"` to `"version": "0.3.0"`. Leave root `package.json` `"version": "0.0.0"` (root is private, never published). Workspace deps unchanged (`workspace:*`). Run `pnpm install` + `pnpm turbo run typecheck` to confirm no drift.
- verify: all four child `package.json`s show `0.3.0`; typecheck clean.
- done: AC-1

### T2: Write CHANGELOG.md (AC-2)
- files: `CHANGELOG.md` (new)
- action: Create `CHANGELOG.md` using Keep-a-Changelog format. Header `# Changelog`. Section `## [0.3.0] - 2026-05-14` with subsections: `### Added` (Phases 13 profile, 14 coverage, 15 deep, 16 interactive, 17.1 anomaly transport, 17.2 hook + reader, 17.3 ts + --since, 19.1 webhook, 21.1 soft cap); `### Changed` (Phase 12 rename pointer, Phase 18.1 physical rollout, Phase 20.1 deferred-items cleanup); `### Removed` (Phase 11 host-codex archive pointer to `keel-codex-archive` tag). Append `## [0.2.0-rc.1] - 2026-05-14` (rename) and `## [0.1.0]` (initial KEEL release). One-line bullets, each citing its phase number.
- verify: visual read; phase numbers map to commits in `git log v0.2.0-rc.1..HEAD`.
- done: AC-2

### T3: README status banner (AC-3)
- files: `README.md`
- action: Replace the `> **Status:**` block with `> **Status:** v0.3.0 (2026-05-14). Phase 12 renamed KEEL → CADENCE (v0.2.0-rc.1); v0.3.0 added the behavioral verifier hybrid (test-coverage gate, --deep verifier, --interactive walker), four-transport anomaly notify (stderr/file/none/webhook), and the auto × complex soft cap. See CHANGELOG.md for the full Phase 13–21.1 spread.` Preserve "Codex support — archived" section + `keel-codex-archive` tag mention.
- verify: visual read.
- done: AC-3

### T4: Create `v0.3.0` annotated tag locally (AC-4, AC-5)
- files: _(no file diff — git op only)_
- action: After T1+T2+T3 are committed in a single `chore(release): v0.3.0` commit, run `git tag -a v0.3.0 -m "v0.3.0 — behavioral verifier hybrid + anomaly notify (Phases 13–21.1)"`. **DO NOT push the tag** — user approval gates the push. Verify via `git tag --list 'v*'` that `v0.3.0` exists. Run full suite to confirm green. Surface the next step to the user: `git push origin v0.3.0` (at their discretion).
- verify: `git tag --list 'v*'` shows `v0.3.0`; `pnpm turbo run test` green; settle 22.1 succeeds.
- done: AC-4, AC-5

## Boundaries

- DO NOT push the `v0.3.0` tag. User approval required.
- DO NOT modify the four prior tags (`v0.1.0-phase1`, `v0.1.0-rc.1`, `v0.2.0-rc.1`, `keel-codex-archive`). Immutable history.
- DO NOT bump the root `package.json` version. `0.0.0` is correct (root is `private`, never published).
- DO NOT add a `version` constant elsewhere in source. `package.json` is the single source of truth.
- DO NOT touch internal `workspace:*` dep pins. Versioning resolves at publish time.
- DO NOT bake release-engineering automation (changesets / semantic-release / np / release-it) in this phase. Hand-cut. Automation comes later if releases get frequent.
- DO NOT write marketing-flavored CHANGELOG entries. One line per item, traceable to a phase number.
- DO NOT rewrite or remove past `## [...]` changelog entries on future releases. The history sticks.
