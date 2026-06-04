# @manehorizons/cadence-types

## 1.6.1

### Patch Changes

- f0d2e4a: Internal refactor (phase 54): split the `intelligence/store` module.

  No user-facing or API change — the published packages' public surface is
  unchanged and all behavior is identical (the full test suite passes unmodified).
  This is a maintainability deepening: the 985-LOC `intelligence/store.ts`
  god-module was decomposed into ten single-responsibility modules under
  `intelligence/store/` (paths, ids, io, recommendations, assumptions, decisions,
  stats, audit, reconcile, milestones), with `store.ts` kept as a thin re-export
  barrel so every existing import site resolves unchanged. `cadence-types` and
  `cadence-host-claude-code` are bumped only to keep the three public packages in
  lockstep; neither changed.

## 1.6.0

### Minor Changes

- v1.6.0 — preset flag rename + `/cadence-scout`
  - **`cadence init --preset`** is the new primary flag for selecting a config
    preset (`solo | team | production`); `--profile` lives on as a deprecated,
    still-working alias that emits a one-line stderr notice. The old name was a
    misnomer — it set a preset, not a gate profile (`--gate-profile`). (Phase
    `52-preset-flag-rename`.)
  - **`/cadence-scout`** — a twelfth Claude Code slash command installed by
    `cadence-host-claude-code`: a divergent→convergent ideation dialogue that
    lands survivors as Praxis recommendations via `cadence recommendation add`.
    Host-side only; zero core-engine change, no new gate / loop position / record
    type. (Phase `53-cadence-scout`.)

## 1.5.1

### Patch Changes

- 9fe4780: Onboarding hardening (phase 48): clearer first-run experience.
  - A distinct `NotInitializedError` — running a command before `cadence init`
    now says "CADENCE not initialized here — run `cadence init`" instead of a
    misleading `StateCorruptError`.
  - Enforce the Node ≥20 floor: `engines.node` on the published packages plus a
    runtime guard that fails fast with a readable message instead of a cryptic
    ESM error.
  - `cadence settle run --deep` prints a prominent banner when the effective
    verifier provider is `mock` (the shipped default), so deep verification can't
    silently hand back fake verdicts.
  - The scaffolded `CLAUDE.md` no longer links to a `DESIGN.md` that consumer
    repos never receive; it points at the published concepts doc instead.
  - README explains all three gate profiles' `approve` behavior and the
    commit-count suggestion heuristic.

## 1.5.0

### Minor Changes

- Add session-continuity commands `cadence handoff` (scaffold a SESSION doc with loop state, read-only git facts, and the context-handoff packet pre-filled) and `cadence resume` (read-only replay of the freshest handoff + live context), plus `/cadence-handoff` and `/cadence-resume` host slash commands. Also fixes a `files-outside-boundary` false positive where absolute touched paths were compared against relative DRAFT `files:` declarations.
