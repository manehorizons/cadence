---
phase: 97-release-v1.21
id: 97-97
tier: quick-fix
status: PENDING
---

# 97-97 — release v1.21.0

## Objective

Cut the v1.21.0 release: bump all four published packages `1.20.0 → 1.21.0` via a changeset and update CLAUDE.md's narrative + version so the doc-sync gate passes.

## Acceptance Criteria

### AC-1: All four published packages bump to 1.21.0
Given the four published packages are at `1.20.0` and `.changeset/config.json` has `fixed: []`
When a changeset listing all four packages at `minor` is applied via `pnpm changeset version`
Then `core`, `types`, `host-claude-code`, and `host-codex` all read `1.21.0`

### AC-2: CLAUDE.md narrates v1.21 and satisfies the doc-sync gate
Given the canonical version in `packages/core/package.json` changes to `1.21.0`
When CLAUDE.md is updated with the v1.21 four-slice arc (config explain · deepen explain · config edit · quickstart) and the new version string
Then the pre-commit doc-sync gate passes (CLAUDE.md mentions `1.21.0`) and the release commit lands

## Tasks

### T1: Add the release changeset
- files: `.changeset/v1-21-0.md`
- action: write a changeset with `minor` bumps for all four published packages (`@manehorizons/cadence-core`, `@manehorizons/cadence-types`, `@manehorizons/cadence-host-claude-code`, `@manehorizons/cadence-host-codex`) — `fixed: []` means no auto-grouping
- verify: file lists all four packages at `minor`
- done: AC-1

### T2: Version the packages
- files: `packages/*/package.json`, `pnpm-lock.yaml`
- action: run `pnpm changeset version`
- verify: `node -p "require('./packages/core/package.json').version"` → `1.21.0` (and the other three match)
- done: AC-1

### T3: Update CLAUDE.md narrative + version
- files: `CLAUDE.md`
- action: add the v1.21.0 four-slice summary to the version narrative and the `1.21.0` version string (doc-sync gate)
- verify: `.githooks/check-doc-sync.sh` passes; `grep -q 1.21.0 CLAUDE.md`
- done: AC-2

## Boundaries

- DO NOT trigger the manual `Release` workflow / publish to npm — that is user-triggered.
- DO NOT change any source under `packages/*/src/` — release is version + docs only.
- DO NOT bump `cadence-testkit` (private, unpublished).
