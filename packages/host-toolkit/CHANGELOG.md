# @manehorizons/cadence-host-toolkit

## 1.53.0

### Patch Changes

- Updated dependencies [c27bcb0]
- Updated dependencies [5cc4085]
- Updated dependencies [7ddc72a]
- Updated dependencies [3b95218]
- Updated dependencies [cfe582a]
- Updated dependencies [bff35bf]
  - @manehorizons/cadence-types@1.53.0

## 1.52.0

### Minor Changes

- 127a06b: **BREAKING (engine floor): minimum supported Node.js raised from `>=20` to
  `>=22`.** Node 20 reaches its scheduled end-of-life in April 2026, and Phase
  238 retires the Node 20 CI/test leg across the monorepo (see
  `.cadence/phases/238-drop-node20-support/`) — these packages are no longer
  tested against, or guaranteed to work on, Node 20 or 21. Shipped as a minor
  bump rather than major, matching the precedent set by the Zod v3→v4 upgrade
  (`[1.4.0]`): no external adopters are affected at release time, and CADENCE
  is reserving its first major/2.0.0 release for when the full coupling of
  Cadence is complete.

  Every published package's `package.json` now declares
  `"engines": { "node": ">=22" }`. Consumers still on Node 20 or 21 should
  upgrade their Node.js runtime before installing or running any package at
  this version or later — by default, npm and pnpm only _warn_ on an
  `engines` mismatch (this repo does not set `engine-strict`), but CI
  pipelines or environments with `engine-strict` enabled will fail outright,
  and pipelines pinned to Node 20 should bump their Node version to keep
  using the `cadence` CLI, either host adapter, or
  `@manehorizons/cadence-types`.

### Patch Changes

- Updated dependencies [90e3ed9]
- Updated dependencies [127a06b]
- Updated dependencies [d7d4239]
  - @manehorizons/cadence-types@1.52.0

## 1.51.1

### Patch Changes

- 1f70e66: Extracts the logic host-claude-code and host-codex duplicated into a new
  shared package, `@manehorizons/cadence-host-toolkit`:

  - The hook-event routing algorithm's shape and the slash-command catalog
    (`COMMANDS`) now live in `host-toolkit/src/routing.ts`. Both adapters
    render their slash commands from this one catalog, which fixes a real
    drift bug: host-codex's local copy had silently lost `cadence-dispatch`'s
    `DISPATCH_DIALOGUE` body. Host-codex's own `mapEvent`/`extractPayload`/
    `routeHookEvent` stay local — its `apply_patch`-based extraction is
    genuinely different from host-claude-code's `file_path`-based extraction,
    not just duplicated; only the structurally-identical `RouteResult` type is
    shared.
  - `install.ts`'s managed-marker merge logic and `locate-self.ts` are also
    extracted into the toolkit, with one shared test suite; both adapters'
    own `install.ts`/`locate-self.ts` are now thin wrappers.
  - Core now enforces a new `HostCapabilities.agentIdentification` flag: a
    host that declares it cannot supply `agentId`/`agentType` (Codex, whose
    hook payload shape doesn't document one) causes core to notice loudly on
    stderr instead of silently behaving as if no subagent were involved.
    Codex's CLI now embeds its declared capabilities into the real hook
    payload it sends to `cadence hook`, so the check is live end-to-end, not
    just testable in isolation.

  No CLI-facing behavior, flags, or exit codes changed for either adapter —
  this is an internal dedup/extraction plus one new loud-notice-on-a-capability-
  gap fix, not a rewrite. `HostAdapter`'s public contract is unchanged.

- Updated dependencies [655663e]
- Updated dependencies [e05922e]
- Updated dependencies [1f70e66]
  - @manehorizons/cadence-types@1.51.1
