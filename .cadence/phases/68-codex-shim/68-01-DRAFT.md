---
phase: 68-codex-shim
id: 68-01
tier: standard
status: PENDING
---

# 68-01 — cadence-host-codex hook shim — Codex stdin to core dispatcher

## Objective

Wire the runtime shim: a `routeHookEvent` that parses Codex's stdin-JSON hook
event, maps it + extracts the apply_patch payload, and a `cadence-host-codex
hook` subcommand that spawns the core dispatcher — completing the Codex adapter's
functional surface (docs + release follow in phase 69).

## Acceptance Criteria

### AC-1: routeHookEvent maps + translates Codex events
Given a Codex stdin-JSON hook event
When `routeHookEvent(raw)` runs
Then it returns the mapped `AbstractEvent` and a translated stdin that carries
`files[]` for an `apply_patch` edit; an unmapped event, malformed JSON, or a
`PreToolUse`/`PostToolUse` for a non-`apply_patch` tool returns
`{ abstractEvent: null }` with the raw stdin passed through.

### AC-2: the hook subcommand spawns core for mapped events only
Given `cadence-host-codex hook --cadence "<core>"` reading stdin
When a mapped event arrives
Then it spawns `<core> hook <abstractEvent>` piping the translated stdin and
mirrors the child exit code; an unmapped event exits 0 silently with no spawn.

### AC-3: end-to-end shim → core drives real loop state
Given an initialized cadence temp repo
When a `SessionStart` event is piped through the built shim
Then core prints the CADENCE session context (exit 0); and a `PostToolUse`
`apply_patch` event with an active task records the patched paths into
`activeTask.touchedFiles`.

## Tasks

### T1: Write failing tests (shim unit + integration)
- files: `packages/host-codex/tests/shim.test.ts`, `packages/host-codex/tests/shim-integration.test.ts`
- action: TDD. shim.test (AC-1: each event map, apply_patch → files[], non-edit → null, malformed → null passthrough). shim-integration (AC-3: tempRepo + spawn built shim with `--cadence`; SessionStart prints context; apply_patch records touchedFiles). Reference each `AC-N`.
- verify: `pnpm --filter @manehorizons/cadence-host-codex test` fails the new suites.
- done: AC-1, AC-2, AC-3

### T2: Implement routeHookEvent
- files: `packages/host-codex/src/shim.ts`
- action: parse stdin JSON; `mapEvent(hook_event_name)`; defensive filter dropping pre/post-tool-edit when `tool_name !== 'apply_patch'`; merge `extractPayload` `files` into the translated stdin; null + raw passthrough on any miss.
- verify: AC-1 tests pass.
- done: AC-1

### T3: Add the hook subcommand to the CLI
- files: `packages/host-codex/src/cli.ts`, `packages/host-codex/src/index.ts`
- action: add a `hook` command mirroring the Claude adapter — read stdin, `routeHookEvent`, spawn `<cadence> hook <event>` (default `npx @manehorizons/cadence-core`); silent exit 0 on unmapped; export `routeHookEvent`/update the index doc comment now the shim is wired.
- verify: AC-2 + AC-3 tests pass; `pnpm --filter @manehorizons/cadence-host-codex build`.
- done: AC-2, AC-3

## Boundaries

- DO NOT implement publishing/docs — phase 69.
- DO NOT modify the Claude adapter, the contract, or core.
- DO NOT bump versions.
- DO NOT add a Skill route — Codex `skillSystem` is `'prompted'`, with no
  `skill-invoke` mapping in this adapter.
