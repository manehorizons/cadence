---
phase: 60-host-adapter-contract
id: 60-01
tier: standard
status: PENDING
---

# 60-01 — Host-adapter contract + authoring guide

## Objective

Make the today-implicit Claude-Code host-adapter contract explicit as a lean,
versioned `HostAdapter` type (+ Zod) in `cadence-types` that `host-claude-code`
provably conforms to, and publish a "write your own adapter" guide on the docs
portal — without adding a second adapter or speculative capability flags.

## Resolved open questions (from SPEC)

- **Version format → integer.** `ADAPTER_CONTRACT_VERSION = 1` (coarse-grained,
  breaking-only; no semver string).
- **Typed surface vs documented.** The typed `HostAdapter` interface covers the
  core-facing surface — `contractVersion`, `capabilities`, `mapEvent`,
  `extractPayload`, and the two install entry points (generically parameterized
  so host-specific option shapes don't couple the contract). `shim`
  (`routeHookEvent`) and `locate-self` (`resolveLocalPaths`) are **documented**
  host-internal responsibilities, not pinned by the type — their shapes are
  intrinsically host-specific.

## Acceptance Criteria

### AC-1: A typed `HostAdapter` contract exists, derived from real needs
A `HostAdapter` typed surface exists in `cadence-types` capturing
`contractVersion`, `capabilities`, `mapEvent`, `extractPayload`, and the install
entry points (generically typed), modeled on `host-claude-code`'s actual
exports — no capability fields it does not itself use.

### AC-2: `HostCapabilities` gains schema parity
`HostCapabilitiesZ` Zod schema exists (parity with `AbstractEventZ`);
`claudeCodeCapabilities` validates against it (asserted by a test).

### AC-3: The contract is versioned
`ADAPTER_CONTRACT_VERSION` is exported from `cadence-types` and the authoring
guide cites it as the stability anchor.

### AC-4: `host-claude-code` provably conforms
`host-claude-code` conforms to `HostAdapter` at compile time (`satisfies`) and a
test asserts the assembled adapter matches the contract (capabilities validate,
`contractVersion` matches, mapped events ∈ `AbstractEventZ`).

### AC-5: The authoring guide is published on the docs portal
A "write your own adapter" page is published in the docs portal, route
registered in `website/scripts/routes.mjs` (sync-docs link-checker passes), and
it walks the full contract with `host-claude-code` as the worked example.

### AC-6: Existing behavior is unchanged
`host-claude-code` runtime behavior is byte-identical; all prior host + core
tests stay green; no engine changes.

## Tasks

### T1: Capabilities Zod schema + version constant (TDD)
- files: `packages/types/src/host.ts`, `packages/types/src/index.ts`,
  `packages/types/tests/host.test.ts`
- action: Failing test first — assert `HostCapabilitiesZ` parses a valid
  capabilities object and rejects an unknown `skillSystem` / a non-`AbstractEvent`
  hook. Then add `HostCapabilitiesZ` (`z.object` mirroring the interface;
  `hooks`/`blockingHooks` as `z.array(AbstractEventZ)`; `skillSystem` /
  `subagentSpawn` as `z.enum`). Keep `HostCapabilities` structurally identical
  (derive via `z.infer`, or keep the interface and add a compile-time parity
  assertion). Add `export const ADAPTER_CONTRACT_VERSION = 1`.
- verify: `pnpm --filter @manehorizons/cadence-types test` + `pnpm typecheck`
- done: AC-2, AC-3

### T2: `HostAdapter` contract type + relocate `ExtractedPayload` (TDD)
- files: `packages/types/src/host.ts`, `packages/types/src/index.ts`,
  `packages/host-claude-code/src/event-map.ts` (re-export for back-compat)
- action: Move `ExtractedPayload` into `cadence-types` (it is the core-facing
  payload shape the dispatcher consumes); re-export it from
  `host-claude-code/event-map.ts` so existing imports keep working. Define
  `HostAdapter<HookOpts = unknown, CommandOpts = unknown>`:
  `readonly contractVersion: number`, `readonly capabilities: HostCapabilities`,
  `mapEvent(hostEvent, toolName?): AbstractEvent | null`,
  `extractPayload(raw): ExtractedPayload | undefined`,
  `installHooks(options?: HookOpts): Promise<unknown> | unknown`,
  `installCommands(options?: CommandOpts): Promise<unknown> | unknown`.
  Export from the types barrel.
- verify: `pnpm typecheck`; host tests still green (re-export back-compat)
- done: AC-1

### T3: `host-claude-code` conforms to the contract (TDD)
- files: `packages/host-claude-code/src/index.ts`,
  `packages/host-claude-code/tests/adapter-conformance.test.ts`
- action: Failing conformance test first — assert `claudeCodeAdapter`:
  `HostCapabilitiesZ.parse(adapter.capabilities)` succeeds,
  `adapter.contractVersion === ADAPTER_CONTRACT_VERSION`, and every value in
  `EVENT_TABLE` ∪ `skill-invoke` is a valid `AbstractEventZ`. Then assemble and
  export `claudeCodeAdapter: HostAdapter<InstallOptions, InstallCommandsOptions>`
  = `{ contractVersion: ADAPTER_CONTRACT_VERSION, capabilities:
  claudeCodeCapabilities, mapEvent, extractPayload, installHooks,
  installCommands } satisfies HostAdapter<InstallOptions, InstallCommandsOptions>`.
  No changes to existing function bodies.
- verify: `pnpm --filter @manehorizons/cadence-host-claude-code test`;
  `pnpm turbo run lint typecheck test build` all green (AC-6)
- done: AC-4, AC-6

### T4: "Write your own adapter" guide on the docs portal
- files: `docs/host-adapters.md` (new), `website/scripts/routes.mjs` (register
  route), cross-link from `docs/concepts.md` + README adapter mention
- action: Write the guide — the `AbstractEvent` vocabulary, the `HostCapabilities`
  descriptor (+ `HostCapabilitiesZ`), `mapEvent` / `extractPayload`, the install /
  shim / locate-self responsibilities, and `ADAPTER_CONTRACT_VERSION` as the
  stability anchor, using `host-claude-code` as the end-to-end worked example.
  Register the new route in `website/scripts/routes.mjs`.
- verify: docs `sync-docs` link-checker passes (the Docs workflow gate); portal
  build succeeds
- done: AC-5

## Boundaries

- **DO NOT** add a second host package — no `packages/host-*` beyond
  `host-claude-code` (D11 / ROADMAP activation gate).
- **DO NOT** add `HostCapabilities` fields beyond what `host-claude-code` uses
  (no speculative flags).
- **DO NOT** change engine/core dispatch or any `host-claude-code` runtime
  behavior — additive only (types + docs); AC-6 requires byte-identical output.
- **DO NOT** put logic or I/O in `cadence-types` — types + Zod schema + the
  version constant only.
- **DO NOT** type the install entry points against the Claude-Code-specific
  `InstallOptions` shapes in the generic contract — keep them parameterized.
- **DO NOT** hand-edit `.cadence/STATE.md`.
