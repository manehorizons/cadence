---
phase: 28-release
id: 28-01
tier: standard
status: PENDING
---

# 28-01 — Cut v1.0.0

## Objective

Cut the v1.0.0 release: bump all four published packages `0.3.0` → `1.0.0`, convert the CHANGELOG `[Unreleased]` block to a dated `[1.0.0]` entry (with a fresh empty `[Unreleased]`), refresh the README v1.0 banner, tick DESIGN §10, verify the full suite green, and create the annotated `v1.0.0` tag locally — pushing is explicitly gated on user approval.

## Acceptance Criteria

### AC-1: All four packages at 1.0.0
Given `packages/{core,types,testkit,host-claude-code}/package.json`
When inspected after the bump
Then each `"version"` is exactly `"1.0.0"` (the private monorepo root stays `0.0.0` — it is not published and out of scope)

### AC-2: CHANGELOG cut to a dated [1.0.0]
Given `CHANGELOG.md`
When viewed
Then the former `[Unreleased]` content is now under `## [1.0.0] - 2026-05-15` (Added / Changed / Fixed preserved verbatim), a new empty `## [Unreleased]` sits above it, and the `[1.0.0]` entry captures the v0.4–v0.8 spread already recorded there

### AC-3: README v1.0 banner
Given the README
When viewed
Then the `> **Status:**` line states package `1.0.0` and milestone tag `v1.0.0`, framed as the 1.0 release, with the v0.3–v0.8 capability spread retained and the CHANGELOG pointer intact

### AC-4: DESIGN §10 ticked
Given `DESIGN.md` §10 punchlist
When viewed
Then a ticked line for `Phase 28.1 — v1.0.0 release` is present, marking the roadmap complete

### AC-5: Full suite green + annotated tag, push gated
Given the release commit
When `pnpm turbo run lint typecheck test build` runs
Then it exits 0; an annotated tag `v1.0.0` is created locally on the settle/release commit (message `v1.0.0 — <summary>`); the tag is NOT pushed and no `git push` is performed — pushing is explicitly user-gated per the roadmap

## Tasks

### T1: Bump package versions
- files: `packages/core/package.json`, `packages/types/package.json`, `packages/testkit/package.json`, `packages/host-claude-code/package.json`
- action: Set `"version"` from `"0.3.0"` to `"1.0.0"` in each of the four package manifests. Do not touch the private root `package.json` (`0.0.0`). Do not alter any `dependencies`/`devDependencies` (workspace deps use `workspace:*`).
- verify: `grep '"version"' packages/*/package.json` shows 1.0.0 ×4; `pnpm install --frozen-lockfile` still resolves (workspace protocol, no lockfile churn).
- done: AC-1

### T2: Cut CHANGELOG [1.0.0]
- files: `CHANGELOG.md`
- action: Rename the current `## [Unreleased]` heading to `## [1.0.0] - 2026-05-15`, preserving its Added/Changed/Fixed subsections verbatim. Insert a fresh `## [Unreleased]` (empty) directly above the new `[1.0.0]` heading. Leave the older dated sections untouched.
- verify: CHANGELOG has exactly one `[Unreleased]` (empty) then `[1.0.0] - 2026-05-15` then the prior history; markdown lints/render.
- done: AC-2

### T3: README v1.0 banner
- files: `README.md`
- action: Update the `> **Status:**` blockquote to: package `1.0.0`; milestone tag `v1.0.0`; phrase it as the 1.0 release that completes the gate matrix + operator ergonomics + CI. Keep the v0.3→v0.8 capability sentences and the CHANGELOG link. Leave the CI badge as-is.
- verify: `pnpm turbo run typecheck test build` green; README renders.
- done: AC-3

### T4: DESIGN §10 tick
- files: `DESIGN.md`
- action: Append a ticked punchlist line `23. ~~Phase 28.1 — v1.0.0 release (version bump, CHANGELOG cut, tag)~~ ✓ (v1.0.0)` after the Phase 27.1 line.
- verify: §10 shows 28.1 ticked; no other punchlist lines altered.
- done: AC-4

## Boundaries

- DO NOT run `git push` or push any tag — pushing the release + `v1.0.0` tag is explicitly user-gated (roadmap AC-4); stop after the local tag.
- DO NOT bump the private root `package.json` (`0.0.0`) — it is unpublished and out of scope.
- DO NOT edit `pnpm-lock.yaml` by hand or change dependency ranges — workspace deps use `workspace:*`; the version bump must not churn the lockfile.
- DO NOT rewrite or reorder prior dated CHANGELOG sections — only add `[1.0.0]` + a fresh empty `[Unreleased]`.
- DO NOT introduce publish automation (`npm publish`, release workflows) — out of scope for the ceremony.
