---
phase: 90-release-v1.20.0
id: 90-90
tier: standard
status: PENDING
---

# 90-90 — Release v1.20.0

## Objective

Cut the v1.20.0 release for the handoff-retention milestone: docs, changeset, lockstep version bump across all four published packages, and the CLAUDE.md version note — prepared on the branch (publish/tag handled later via the Release workflow).

## Acceptance Criteria

### AC-1: lockstep version bump
Given the four published packages at `1.19.0`
When the release is prepared (changeset + `changeset version`)
Then `core`, `types`, `host-claude-code`, and `host-codex` are all at `1.20.0`, and each has a CHANGELOG entry for the handoff-retention work.

### AC-2: config docs
Given the new `handoff.retain` config field (Phase 88)
When `docs/reference/config.md` is updated
Then it documents a `handoff` section (field, type, default unset = disabled, behavior) consistent with the `phaseGuard`/`logging` sections.

### AC-3: doc-sync honesty
Given the canonical version moved to `1.20.0`
When `CLAUDE.md` is updated
Then it names `1.20.0` and summarizes the milestone, so the doc-sync hook passes.

### AC-4: green pipeline
Given the prepared release
When `pnpm turbo run lint typecheck test build` runs
Then all four legs pass.

## Tasks

### T1: docs
- files: `docs/reference/config.md` (+ `docs/reference/commands.md` / `docs/concepts.md` if a handoff-retention note fits)
- action: add the `handoff` config section documenting `handoff.retain`; note the `cadence doctor` `handoff-retention` check where doctor checks are listed.
- verify: manual read; `handoff.retain` documented.
- done: AC-2

### T2: changeset + version bump
- files: `.changeset/<slug>.md` (transient), all four `package.json` + `CHANGELOG.md`
- action: write a minor changeset naming the four published packages; run `pnpm changeset version` to apply the `1.19.0 → 1.20.0` bump + CHANGELOGs.
- verify: `node -p` each package version === `1.20.0`.
- done: AC-1

### T3: CLAUDE.md version note + DESIGN.md note
- files: `CLAUDE.md` (+ `DESIGN.md` if a session-continuity deepening note fits; no new D-number expected)
- action: add the v1.20.0 entry to the version history prose; brief DESIGN note if warranted.
- verify: `CLAUDE.md` contains `1.20.0`; doc-sync hook passes.
- done: AC-3

### T4: green gate
- files: (none — verification)
- action: run the full pipeline.
- verify: `pnpm turbo run lint typecheck test build` all green.
- done: AC-4

## Boundaries

- DO NOT push the branch, open a PR, publish to npm, or create the `v1.20.0` git tag — the operator drives those via the Release workflow (user decision: prepare-on-branch only).
- DO NOT change runtime behavior — this phase is docs + version metadata only.
- DO NOT bump `@manehorizons/cadence-testkit` (private; changeset-ignored).
