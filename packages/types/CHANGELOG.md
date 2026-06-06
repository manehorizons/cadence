# @manehorizons/cadence-types

## 1.14.0

### Minor Changes

- b8861dc: Verifier correctness (v1.14.0): the `deep-verify` gate now sends the AI verifier
  the actual phase diff instead of an empty string, so deep verification judges the
  implementation rather than test-linkage alone.
  - `deep-verify` wires the memoized `git diff HEAD` (shared with `code-review`) into
    the verifier input, bounded by the new `verifier.diffCapBytes` config (default
    256KB) and truncated with an explicit `[diff truncated: N of M bytes]` marker.
  - A run-level `deepVerifyMeta` provenance record (`diffProvided`, `diffBytes`,
    `truncated`, `filesCount`, `provider`, `model`) is written to the SUMMARY so a
    verdict is auditable.
  - The mock-fallback banner now fires whenever the gate runs in mock — on `--deep`
    **or** gate-set membership (e.g. `standard × complex`) — so a settle never runs
    mock verification silently.

  `cadence-host-claude-code` and `cadence-host-codex` carry version-alignment bumps
  only (no functional change).

## 1.13.0

### Minor Changes

- **Multi-host reach: the OpenAI Codex adapter** — a new published package
  `@manehorizons/cadence-host-codex`, the second consumer of the phase-60
  host-adapter contract (`ADAPTER_CONTRACT_VERSION = 1`, unchanged). It proves the
  contract is not Claude-Code-shaped: a genuinely differently-shaped host conforms
  without a contract bump.
  - `codexAdapter satisfies HostAdapter`: capabilities, `mapEvent` (Codex's
    near-1:1 lifecycle → cadence abstract events), and `extractPayload` parsing
    Codex's multi-file `apply_patch` envelope into `ExtractedPayload.files`.
  - `cadence-host-codex install`: project-level `.codex/hooks.json` + global
    `$CODEX_HOME/prompts/cadence-*.md` slash-command prompts (with a global-scope
    warning), `--local`/`CODEX_HOME` aware.
  - `cadence-host-codex hook`: the runtime shim — translates Codex stdin-JSON and
    spawns the core dispatcher; proven end-to-end against real loop state.

  `cadence-core`, `cadence-types`, and `cadence-host-claude-code` carry
  version-alignment bumps to stay in lockstep; no functional change.

## 1.12.0

### Minor Changes

- Two adoption-layer CLI features land in `cadence-core`:
  - **`cadence tutorial`** (phase 63) runs one real DRAFT→BUILD→SETTLE loop inside
    a throwaway sandbox, printing each step's command and the engine's actual
    output before cleaning up — the executable companion to the "Your first loop"
    block in `cadence init`. Fully offline and side-effect free.
  - **`cadence explain [concept]`** (phase 64) prints curated, terminal-sized
    explanations of the core concepts (loop, gates, tiers, profiles) from content
    embedded in the binary, so the model is self-teaching without leaving the
    terminal or depending on the `docs/` tree being shipped. Bare invocation lists
    the concepts; unknown names get a nearest-match did-you-mean nudge.

  `cadence-types` and `cadence-host-claude-code` carry version-alignment bumps to
  stay in lockstep with `cadence-core`; neither has a functional change in this
  release.

## 1.11.0

### Minor Changes

- First-class scout-session grouping + guided first-loop onboarding nudge.
  - **Phase 61 — scout-session grouping (`scoutId`).** An optional `scoutId` on
    recommendations groups the N recs landed by one `/cadence-scout` session so
    they are queryable as a set: a `--scout-id` flag on `cadence recommendation
add`, a `recommend --scout-id <id>` cluster filter (scopes the report +
    totals), a `- scout: <id>` render line, and `/cadence-scout` auto-minting a
    `scout-YYYYMMDD-HHMM` session id. Additive — reports for recs without a
    `scoutId` are unchanged. (`cadence-types`: optional `scoutId` on
    `RecommendationZ` + `RecommendationRankZ`.)
  - **Phase 62 — guided first-loop nudge in `cadence init`.** The end of `cadence
init` now prints a numbered "Your first loop" block (draft new → edit →
    approve → done → settle) plus a `cadence progress` escape hatch, replacing the
    thin `Next: edit ROADMAP.md` line. Output-text only.

## 1.10.0

### Minor Changes

- Explicit, versioned host-adapter contract. `@manehorizons/cadence-types` now
  exports a first-class `HostAdapter` interface plus `HostCapabilitiesZ`,
  `ADAPTER_CONTRACT_VERSION`, and `ExtractedPayload`, formalising what a host
  integration must implement. `claudeCodeAdapter` in
  `@manehorizons/cadence-host-claude-code` conforms to the contract, and the docs
  portal gains a "write your own adapter" guide. Also bumps `commander` 13 → 14 in
  `@manehorizons/cadence-core` (the engine floor stays Node `>=20`; commander is
  pinned to `^14` deliberately).

## 1.9.0

### Minor Changes

- e95def0: `cadence resume` now defaults to brief output when live state matches the
  handoff doc, and auto-promotes to full output (whole doc + live-context replay)
  on drift. New `--full` / `--brief` flags force a mode; `--json` gains a `mode`
  field and `context` is now nullable (null in brief mode, since the live-context
  recompute is skipped).

## 1.8.0

### Minor Changes

- 7cb7695: Add `cadence mcp serve` — an MCP server surface (phase 58).

  CADENCE can now run as a local Model Context Protocol server over stdio, so any
  MCP-capable host (Claude Desktop, Cursor, other agents) can drive the
  DRAFT→BUILD→SETTLE loop with no bespoke adapter. It's a third surface on the
  single engine (CLI · Claude-Code hooks · MCP), not multi-host adapter pluralism
  (DESIGN.md D11).

  The server exposes 10 curated tools wrapping the same engine the CLI uses —
  `cadence_progress`/`status`/`recommend` (read) and `draft_new`/`draft_check`/
  `draft_approve`/`build_task`/`settle`/`spec_new`/`spec_approve` (write). The
  curated command logic was factored into shared `*Service(repoRoot, args, io)`
  functions so the CLI and MCP call one implementation (CLI output unchanged).
  Command-boundary gates (coherence, the settle gate stack, spec-review) run
  exactly as on the CLI; ambient edit-time gates require host hooks and are not
  available over MCP. The `@modelcontextprotocol/sdk` dependency is lazy-loaded,
  so ordinary CLI commands never pay its load cost. stdio only — no
  HTTP/remote/auth. See `docs/mcp.md`.

## 1.7.0

### Minor Changes

- d478355: Add `cadence doctor` — diagnose a project's CADENCE setup (phase 56).

  A new deterministic, offline, report-only command that health-checks a project
  and reports each finding as `ok`/`warning`/`error` with a remediation hint:
  Node floor, `.cadence/` + config validity, state-file integrity, the
  `.githooks` pre-push gate (`core.hooksPath`), Claude Code managed hooks, and —
  the check this directly earned — slash-command run-line portability (no
  machine-absolute paths). Human output by default, `--json` for scripting/CI;
  exits non-zero only on `error`-severity findings so it is usable as a CI gate.
  `cadence-types` and `cadence-host-claude-code` are bumped only to keep the three
  public packages in lockstep; neither changed.

- 05d6ea4: Add `cadence recommendation promote` — advance a recommendation's status and/or
  readiness (phase 57).

  Closes the gap where `milestone propose` (which requires `status=accepted` +
  `readiness∈{ready-for-milestone,ready-for-cadence-spec}`) was unreachable for
  manually-added recommendations: `convert` was the only status transition and
  `readiness` was write-once at `add`. `recommendation promote <id>
[--status <s>] [--readiness <r>]` sets either/both, validated against the
  status/readiness enums. It is independent of `convert` — it never sets
  `convertedToPhaseId` and refuses `--status converted` and terminal
  (`converted`/`rejected`) recs. `cadence-types` and `cadence-host-claude-code`
  are bumped only to keep the three public packages in lockstep; neither changed.

### Patch Changes

- b3c4008: Fix the `install --local` warning so it names **every** surface it wrote
  machine-absolute paths into — not just `settings.json`.

  Previously the warning mentioned only `.claude/settings.json`, so the slash
  commands written to `.claude/commands/cadence-*.md` under `--local` were a
  silent offender: their absolute `node <abs>/cli/index.js` paths could be
  committed unflagged and then failed to resolve on every other clone or machine.
  The warning now enumerates each surface actually written (settings file and/or
  command files, narrowed by `--no-hooks` / `--no-commands`) and points at the
  portable plain-`install` form that is safe to commit. Docs (`docs/claude-code.md`)
  updated to match. `cadence-core` and `cadence-types` are bumped only to keep the
  three public packages in lockstep; neither changed.

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
