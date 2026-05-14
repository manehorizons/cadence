---
phase: 02-host-codex
id: 02-01
tier: complex
status: PENDING
---

# 02-01 — Codex CLI host adapter

## Objective

Ship `@keel/host-codex` mirroring `@keel/host-claude-code`: hook installer, event translation shim, slash-command codegen, all backed by abstract KEEL events.

## Acceptance Criteria

### AC-1: package scaffolded
Given empty `packages/host-codex/`
When build runs
Then `@keel/host-codex` builds, exports `installHooks`, `mapEvent`, `extractPayload`, `routeHookEvent`, ships `bin/keel-host-codex.cjs`.

### AC-2: event mapping covers Codex hook events
Given Codex hook payload on stdin
When `routeHookEvent` runs
Then payload translates to abstract event (`session-start`, `user-prompt`, `pre-tool-edit`, `post-tool-edit`, `session-stop`, `subagent-result`) with normalized fields matching `@keel/types/events.ts`.

### AC-3: installHooks writes Codex settings idempotently
Given fresh repo
When `keel-host-codex install` runs twice
Then Codex settings file contains exactly one KEEL-managed entry per hook event, marked `_managedBy: 'keel'`, preserving any user entries.

### AC-4: slash-command codegen
Given install runs
Then Codex command directory contains `keel-{progress,draft,approve,check,build,settle}` artifacts in Codex's native format (markdown/yaml/json — confirmed during research task).

### AC-5: dogfood smoke
Given KEEL repo with both adapters installed
When `keel-host-codex install` + `keel init` complete
Then `state.activeTask.touchedFiles` updates on a simulated Codex post-tool-edit event.

## Tasks

### T1: research Codex hook format
- files: `.keel/research/codex-hooks.md`
- action: document Codex CLI hook event names, stdin payload shape, settings file location, exit-code semantics, slash-command/extension format. Reference upstream docs.
- verify: file lists each abstract KEEL event → Codex equivalent, plus payload field map.
- done: AC-2

### T2: scaffold package
- files: `packages/host-codex/{package.json,tsconfig.json,src/index.ts,bin/keel-host-codex.cjs,vitest.config.ts}`
- action: mirror `packages/host-claude-code` layout. Workspace dep on `@keel/core` + `@keel/types`. Empty src exports.
- verify: `pnpm --filter @keel/host-codex build` succeeds; `pnpm --filter @keel/host-codex test` runs (zero tests OK).
- done: AC-1

### T3: capabilities + event-map
- files: `packages/host-codex/src/capabilities.ts`, `packages/host-codex/src/event-map.ts`, plus test files
- action: TDD `mapEvent(codexEventName)` + `extractPayload(rawStdin)` per research from T1.
- verify: tests cover all 6 abstract events round-trip.
- done: AC-2

### T4: shim
- files: `packages/host-codex/src/shim.ts` + test
- action: TDD `routeHookEvent` — reads Codex stdin, translates via event-map, spawns `keel hook <abstract>` with normalized stdin. Mirror `host-claude-code/src/shim.ts`.
- verify: integration test with Codex-shaped fixture asserts `keel hook post-tool-edit` is invoked with `files: [...]`.
- done: AC-2, AC-5

### T5: install
- files: `packages/host-codex/src/install.ts` + test
- action: TDD `installHooks(repoRoot)`. Locate Codex settings, merge KEEL-managed entries with `_managedBy: 'keel'`, idempotent.
- verify: install twice → no duplicate entries; user entries preserved.
- done: AC-3

### T6: install-commands
- files: `packages/host-codex/src/install-commands.ts` + test
- action: TDD slash-command codegen — write 6 `keel-*` artifacts in Codex's format from T1 research.
- verify: 6 files exist post-install; content references `keel` CLI commands.
- done: AC-4

### T7: cli wiring
- files: `packages/host-codex/src/cli.ts`, `packages/host-codex/bin/keel-host-codex.cjs`
- action: `keel-host-codex install` runs `installHooks` + `install-commands`; `keel-host-codex hook` runs `routeHookEvent`. Match host-claude-code CLI surface.
- verify: `node bin/keel-host-codex.cjs install` writes both hooks + commands.
- done: AC-1, AC-3, AC-4

### T8: dogfood smoke
- files: `packages/host-codex/test/dogfood.test.ts`
- action: e2e test — temp dir, `keel init`, `keel-host-codex install`, simulated post-tool-edit stdin → assert `state.activeTask.touchedFiles` updates.
- verify: test green.
- done: AC-5

### T9: README + status
- files: `README.md`, memory `project_keel.md`
- action: add `@keel/host-codex` to packages list, update Phase 2 status to "Codex adapter shipped". Mention dual-host parity.
- verify: README + memory consistent.
- done: AC-1..AC-5

## Boundaries

- DO NOT modify `@keel/host-claude-code` source. If shared logic emerges, extract to `@keel/core` or new `@keel/host-shared` in a follow-up phase, not this one.
- DO NOT change abstract event schema in `@keel/types/events.ts` without separate ADR.
- DO NOT introduce non-workspace runtime deps.
