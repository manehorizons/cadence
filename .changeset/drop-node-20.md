---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
'@manehorizons/cadence-host-toolkit': minor
---

**BREAKING (engine floor): minimum supported Node.js raised from `>=20` to
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
this version or later — by default, npm and pnpm only *warn* on an
`engines` mismatch (this repo does not set `engine-strict`), but CI
pipelines or environments with `engine-strict` enabled will fail outright,
and pipelines pinned to Node 20 should bump their Node version to keep
using the `cadence` CLI, either host adapter, or
`@manehorizons/cadence-types`.
