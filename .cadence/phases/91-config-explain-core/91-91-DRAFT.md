---
phase: 91-config-explain-core
id: 91-91
tier: standard
status: PENDING
---

# 91-91 — config explain — pure builder + renderer + warnings

Slice A, phase 1 of 2. Implements the **pure core** of `cadence config explain`
(design: `docs/superpowers/specs/2026-06-10-cadence-config-explain-design.md`).
CLI wiring + impure gather are phase 92 — this phase has no I/O and no command
registration.

## Objective

Add a pure `config-explain` module that turns a `CadenceConfig` + an `ExplainContext`
into a structured, renderable explanation of the active configuration — including the
per-tier gate sets and the config-semantic foot-gun warnings — with no I/O.

## Acceptance Criteria

### AC-1: Per-tier gate sets computed from the configured profile
Given a `CadenceConfig` and an `ExplainContext` (with an optional `activeTier`)
When `buildExplanation(config, ctx)` is called
Then the result contains a gate set for each tier (`quickFix`, `standard`, `complex`)
equal to `gatesFor(tier, effectiveProfile(config, null))`, and the tier matching
`ctx.activeTier` is flagged `current` (none flagged when `activeTier` is absent).

### AC-2: Config-semantic warnings fire exactly on their condition
Given a `CadenceConfig` + `ExplainContext`
When `buildExplanation(config, ctx)` is called
Then the warning list contains:
- a `provider-no-key` warning iff a provider block is `anthropic` with
  `ctx.anthropicKeyPresent === false` (or `local` with `ctx.localKeyPresent === false`);
- a `hooks-not-installed` warning iff some `hooks.*` flag is `true` while
  `ctx.hostHooksInstalled === false`;
- an `auto-complex-softcap` warning iff the `complex` gate set's `softCap` is true;
and contains none of these when their conditions do not hold.

### AC-3: Renderers produce curated / field / all (text) and structured (json)
Given a `ConfigExplanation`
When `renderText(explanation, { field?, all? })` is called
Then the default (no opts) yields the five curated blocks (profile & enforcement,
per-tier gate sets, provider table, warnings-if-any, footer); a known `field` yields only
that block's deep-dive; an unknown `field` yields a did-you-mean nudge naming the closest
key; and `--all` yields every config key grouped.
And `renderJson(explanation)` returns the `ConfigExplanation` as a plain JSON-safe object.

## Tasks

### T1: Types + `buildExplanation` gate-set core
- files: `packages/core/src/config-explain/types.ts`, `packages/core/src/config-explain/build.ts`, `packages/core/tests/config-explain/build.test.ts`
- action: Define `ExplainContext` (`activeTier?`, `anthropicKeyPresent`, `localKeyPresent`, `hostHooksInstalled`) and `ConfigExplanation` (profile/enforcement summary, three tier gate-set entries with a `current` flag, provider table rows, warnings). Implement the gate-set + provider-table portion of `buildExplanation` reusing `gatesFor` / `effectiveProfile` from `gates/engine.ts`. Test-first.
- verify: `pnpm --filter @manehorizons/cadence-core test -- config-explain/build.test.ts`
- done: AC-1

### T2: Warning derivations
- files: `packages/core/src/config-explain/build.ts`, `packages/core/tests/config-explain/warnings.test.ts`
- action: Derive the three warnings (`provider-no-key`, `hooks-not-installed`, `auto-complex-softcap`) from config + ctx + the `complex` set's `softCap`. Each warning carries a stable code + human message ending with a pointer to `cadence doctor`. Test each fires only on its condition (both directions). Test-first.
- verify: `pnpm --filter @manehorizons/cadence-core test -- config-explain/warnings.test.ts`
- done: AC-2

### T3: Renderers (`renderText` + `renderJson`) with goldens
- files: `packages/core/src/config-explain/render.ts`, `packages/core/tests/config-explain/render.test.ts`
- action: Implement `renderText` (curated default, single-`field` deep-dive over top-level keys, `--all`, Levenshtein did-you-mean on unknown field) and `renderJson`. Source concept one-liners by importing existing `explain` content (read-only) — do not re-author. Golden text + JSON snapshots for `solo`, `production`, and an `anthropic`-without-key config.
- verify: `pnpm --filter @manehorizons/cadence-core test -- config-explain/render.test.ts`
- done: AC-3

## Boundaries

- DO NOT register a CLI command or do any I/O here (no `process.env` reads, no file reads) — env/host-install/active-tier all arrive via `ExplainContext`. That is phase 92.
- DO NOT modify `gates/engine.ts`, the config schema in `cadence-types`, or `doctor`. Reuse `gatesFor` / `effectiveProfile` as-is.
- Field targeting is **block-level** (top-level config keys), not nested paths.
- Concept one-liners are sourced from the existing `explain` module, not rewritten, to prevent drift. If that content is not importable in isolation, surface it as a deviation rather than copying text.
