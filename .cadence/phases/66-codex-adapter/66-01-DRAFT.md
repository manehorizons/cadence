---
phase: 66-codex-adapter
id: 66-01
tier: standard
status: PENDING
---

# 66-01 — cadence-host-codex package scaffold + adapter + conformance

## Objective

Scaffold the new `@manehorizons/cadence-host-codex` package and ship the pure
adapter core — `codexCapabilities`, `mapEvent`, `extractPayload` (Codex
`apply_patch` parser), and `codexAdapter satisfies HostAdapter` — proven by a
conformance test mirroring the Claude reference. Install + shim are phases 67/68.

## Acceptance Criteria

### AC-1: Capabilities reflect Codex and validate
Given the Codex CLI environment (spike findings §4)
When `codexCapabilities` is parsed against `HostCapabilitiesZ`
Then it validates and declares `slashCommands: true`, `skillSystem: 'prompted'`,
`subagentSpawn: 'native'`, the mapped hook set, and `blockingHooks` containing
`pre-tool-edit`.

### AC-2: Event map translates Codex events
Given a Codex hook event name
When `mapEvent` is called
Then `SessionStart→session-start`, `PreToolUse→pre-tool-edit`,
`PostToolUse→post-tool-edit`, `Stop→session-stop`,
`SubagentStop→subagent-result`, `UserPromptSubmit→user-prompt`; an unmapped
event returns `null`; every non-null result is a valid `AbstractEvent`.

### AC-3: extractPayload recovers apply_patch file paths
Given a `PreToolUse` event for `tool_name: 'apply_patch'` whose `tool_input`
carries a patch envelope with `*** Add/Update/Delete File:` (and `*** Move to:`)
markers
When `extractPayload` is called
Then it returns `{ files: [...] }` with every added/updated/deleted/moved path;
a non-edit tool (`Bash`, MCP) or a non-tool event returns `undefined`.

### AC-4: codexAdapter conforms to HostAdapter
Given the assembled `codexAdapter`
When the conformance test runs
Then it `satisfies HostAdapter` at compile time, exposes all six contract
members, `contractVersion === ADAPTER_CONTRACT_VERSION`, capabilities validate,
and `mapEvent`/`extractPayload` are wired to the real functions.

## Tasks

### T1: Write failing tests (event-map + conformance)
- files: `packages/host-codex/tests/event-map.test.ts`, `packages/host-codex/tests/adapter-conformance.test.ts`
- action: TDD — mapEvent table (AC-2), extractPayload apply_patch parsing incl.
  multi-file + move + non-edit→undefined (AC-3), and the conformance suite
  mirroring the Claude one (AC-1, AC-4). Reference each `AC-N` token.
- verify: `pnpm --filter @manehorizons/cadence-host-codex test` fails (no src yet).
- done: AC-1, AC-2, AC-3, AC-4

### T2: Scaffold the package
- files: `packages/host-codex/package.json`, `packages/host-codex/tsconfig.json`, `packages/host-codex/vitest.config.ts`
- action: Mirror `host-claude-code` package config; name `@manehorizons/cadence-host-codex`, version `1.12.0` (release renumbers at phase 69), deps on cadence-core + cadence-types, Codex keywords.
- verify: `pnpm install` links the workspace package; `pnpm --filter @manehorizons/cadence-host-codex typecheck` resolves.
- done: AC-4

### T3: Implement capabilities + event-map
- files: `packages/host-codex/src/capabilities.ts`, `packages/host-codex/src/event-map.ts`
- action: `codexCapabilities` per findings §4; `mapEvent` Codex table; `extractPayload` parsing the apply_patch envelope markers from `tool_input` (robust to the documented field ambiguity — scan string fields for `*** … File:` / `*** Move to:`).
- verify: AC-1/AC-2/AC-3 tests pass.
- done: AC-1, AC-2, AC-3

### T4: Assemble the adapter
- files: `packages/host-codex/src/index.ts`, `packages/host-codex/src/install.ts`, `packages/host-codex/src/install-commands.ts`
- action: `codexAdapter satisfies HostAdapter`; `install.ts`/`install-commands.ts` are explicit phase-67 stubs that throw a descriptive "implemented in phase 67" error (they depend on the phase-68 shim path), keeping the contract surface complete and typed.
- verify: `pnpm --filter @manehorizons/cadence-host-codex build` + conformance test pass.
- done: AC-4

## Boundaries

- DO NOT implement the real install surface or the shim — phases 67/68; stubs only.
- DO NOT modify the contract (`packages/types/src/host.ts`) or the Claude adapter.
- DO NOT publish or bump versions — release is phase 69.
- DO NOT write into `~/.codex/` or the host filesystem from any test.
