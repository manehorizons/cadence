---
phase: 47-boundary-path-fix
id: 47-01
tier: standard
status: PENDING
---

# 47-01 — boundary check: normalize absolute touched paths to repo-relative

## Objective

Fix `files-outside-boundary` false positives by normalizing absolute touched-file paths to repo-relative before comparing them against the DRAFT's relative `files:` declarations.

> Root cause (found 2026-06-03 dogfooding phase 46): `runBoundaryCheck` does an exact-string `Set.has`, but settle (`notify/collect.ts`) feeds **absolute** `touchedFiles` (recorded by the PreToolUse hook) while declared files are **relative** — so every touched file is flagged. Same defect at the hook call site (`hooks/handlers.ts`).

## Acceptance Criteria

### AC-1: absolute-vs-relative no longer false-flags
Given a `root`, declared `['packages/core/src/x.ts']` (relative), and touched `['<root>/packages/core/src/x.ts']` (absolute),
When `runBoundaryCheck` runs with that `root`,
Then it emits NO event (the file is recognized as declared).

### AC-2: back-compat when no root is supplied
Given declared `['a.ts','b.ts']` and touched `['a.ts','stray.ts']` with NO `root`,
When `runBoundaryCheck` runs,
Then it emits exactly one event for `stray.ts` (existing exact-match behavior preserved).

### AC-3: genuine stray still flagged, original path preserved
Given a `root`, declared `['packages/core/src/x.ts']`, and touched `['<root>/packages/core/src/stray.ts']`,
When `runBoundaryCheck` runs with that `root`,
Then it emits one event whose `context.file` and message contain the ORIGINAL absolute path (normalize for comparison only, emit the original).

### AC-4: settle path emits zero boundary anomalies for a correctly-declared phase
Given a draft whose tasks declare relative files and a progress file whose `touchedFiles` are the absolute forms of those same files,
When `collectAnomalies` runs with `root` set,
Then it emits zero `files-outside-boundary` events.

## Tasks

### T1: Normalize inside runBoundaryCheck
- files: `packages/core/src/checks/boundary.ts`, `packages/core/tests/checks/boundary.test.ts`
- action: Add optional `root?: string` to `BoundaryCheckInput`. When set, normalize both declared and touched paths to repo-relative (relativize absolute paths via `path.relative(root, p)`; convert `\\`→`/`) before the `Set.has` comparison; still emit the ORIGINAL path. When unset, behavior is unchanged.
- verify: `pnpm --filter @manehorizons/cadence-core test -- checks/boundary`
- done: AC-1, AC-2, AC-3

### T2: Thread root through the settle + hook call sites
- files: `packages/core/src/notify/collect.ts`, `packages/core/src/cli/commands/settle.ts`, `packages/core/src/hooks/handlers.ts`, `packages/core/tests/notify/collect.test.ts`
- action: Add optional `root?: string` to `CollectAnomaliesContext`; forward it into the `runBoundaryCheck` call. In `settle.ts` pass `root: cwd` (the `const cwd = process.cwd()` at settle.ts:121) into `collectAnomalies`. In `hooks/handlers.ts` pass `root: ctx.cwd` into its `runBoundaryCheck` call. Add a `collect` test for AC-4.
- verify: `pnpm --filter @manehorizons/cadence-core test -- notify/collect && pnpm --filter @manehorizons/cadence-core build`
- done: AC-4

## Boundaries

- DO NOT change the `files-outside-boundary` event shape (`type`/`severity`/`message`/`context.file`) — only the comparison logic.
- DO NOT make `root` required — it must stay optional so existing callers/tests are unaffected (AC-2).
- DO NOT touch the gate engine, the loop, or any unrelated check.
- Normalize for COMPARISON only; always emit the original (untransformed) touched path in the event.
