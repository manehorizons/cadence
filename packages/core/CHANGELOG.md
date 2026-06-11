# @manehorizons/cadence-core

## 1.22.1

### Patch Changes

- 9a23c60: Fix the phase-id ceiling (rec-20260610-001): widen the id schema from
  `^\d{2}-\d{2}$` to `^\d{2,}-\d{2,}$` and derive ids through a single
  `derivePhaseTaskId` helper, so phases >= 100 are representable end-to-end
  instead of being mangled into `10-100`. Existing 01-99 ids are unchanged.
- Updated dependencies [9a23c60]
  - @manehorizons/cadence-types@1.22.1

## 1.22.0

### Minor Changes

- Verification-activation (v1.22.0): `cadence activate` — a guided command that takes
  a project from all-mock verifiers to one real-verification loop.
  - **`cadence activate`** picks a provider and writes `verifier.provider` (the
    deep-verify seam by default; `--all` sets every seam), validates the key with a
    minimal live anthropic ping (`--no-check` to skip; `local`/`mock` skip the ping),
    and never persists the key — only the provider name is written. Key-missing still
    records the selection and prints the exact `export …` line (set-up-now-key-later);
    a failed live check exits non-zero without losing the selection. `--print` previews
    the plan without writing; non-interactive runs require `--provider`.
  - **`cadence doctor`** gains a `verification-readiness` check (reusing the same pure
    readiness assessment): `warning` on all-mock (remedy: `cadence activate`) or a real
    provider missing its key; `ok` otherwise; best-effort, never throws.
  - **Discoverability:** `cadence quickstart`, `cadence config explain` (a new
    `all-mock` warning), and `cadence init` now point at `cadence activate`.

  `cadence-host-claude-code` and `cadence-host-codex` carry version-alignment bumps
  only (no functional change).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.22.0

## 1.21.0

### Minor Changes

- Quickstart-onboarding milestone (v1.21.0): a four-slice arc that lowers the
  barrier to a first CADENCE loop and makes config self-explanatory.
  - **Slice A — `cadence config explain`**: terminal-sized, in-CLI explanation of
    the _active_ config in plain language — resolved gates, providers, and
    warnings — so operators don't have to cross-reference `docs/reference/config.md`.
  - **Slice B — deepen `config explain`**: richer per-field guidance and an
    optional `[field]` focus, extending the embedded help so it works from any
    install.
  - **Slice C — `cadence config edit`**: a guided edit wizard that writes
    validated changes back to `.cadence/config.json` without hand-editing JSON.
  - **Slice D — `cadence quickstart`**: a state-aware onboarding front door that
    orients a new user from any loop position (uninitialized, IDLE, mid-phase),
    reusing `nextAction`; never throws, with a corrupt-state fallback and `--json`.

  `cadence-host-claude-code` and `cadence-host-codex` carry version-alignment bumps
  only (no functional change).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.21.0

## 1.20.0

### Minor Changes

- Handoff retention (v1.20): opt-in, count-based pruning of dated `SESSION-*.md`
  handoff docs. A new `handoff.retain` config field keeps the N most-recent
  session handoffs and hard-deletes the rest at handoff-write time
  (deterministic, offline, best-effort — never fails a handoff, never silently
  destroys the dated archive `resume` relies on). Unset = no pruning (current
  behavior). A read-only `cadence doctor` `handoff-retention` check makes
  unmanaged accumulation visible. `host-claude-code`/`host-codex` carry
  version-alignment bumps only.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.20.0

## 1.19.0

### Minor Changes

- v1.19 worktree-safety polish: surface cross-worktree phase usage proactively on the v1.18
  collision primitive. `cadence doctor` gains a read-only `worktree-phases` check (warns when a
  sibling worktree claims a local phase number, naming the conflict + next free number; best-effort,
  sibling-vs-local only), and the IDLE `cadence draft new …` suggestion in `progress`/`recommend`
  now fills in the next free number (`max(observed)+1` over local + sibling + upstream) instead of a
  bare placeholder, so the first pick clears claims the guard would refuse. Lowest-gap numbering was
  evaluated and dropped — `nextFree` stays monotonic `max+1`. `cadence-types`,
  `cadence-host-claude-code`, and `cadence-host-codex` carry version-alignment bumps only.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.19.0

## 1.18.0

### Minor Changes

- v1.18 — worktree-safety: phase-collision guard.

  CADENCE's loop state lives in the working tree and each git worktree holds a private `.cadence/`, so
  two worktrees branched from the same commit can both scaffold "phase N" — and with different slugs
  git silently merges both in. The new phase-collision guard observes ground truth (`git worktree list`
  - `origin/<integrationRef>`) and refuses to scaffold a phase number already claimed by a sibling
    worktree or upstream, naming the conflict and suggesting the next free number, so the collision fails
    loud before wasted work.
  * Fires at scaffold time (`cadence spec new` / `cadence draft new`) and as a `cadence settle run`
    backstop. `--allow-phase-collision` bypasses per run (never bypasses the local same-dir refusal).
  * New `phaseGuard { enabled (default true), integrationRef (default "main") }` config block.
  * Best-effort: a non-git / offline / single-worktree checkout behaves exactly as before — the only
    hard failure is an actual detected collision.

  `cadence-types` adds the `phaseGuard` schema; `cadence-host-claude-code` and `cadence-host-codex`
  carry version-alignment bumps only (no functional change).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.18.0

## 1.17.0

### Minor Changes

- Observability: structured operator-debugging logger (v1.17)

  Add a zero-dependency, additive, default-off structured logger for diagnosing CADENCE itself.
  Writes only to stderr (never stdout — safe for `--json` and the `cadence mcp serve` protocol
  channel), gated by `CADENCE_LOG_LEVEL`/`CADENCE_LOG_FORMAT` env vars and an optional
  `config.logging { level, format }` block (precedence env > config > default `silent`).

  Three seams are instrumented via context-bound child loggers: `gate` (settle gate
  skipped/passed/refused decisions), `hook` (host lifecycle event dispatch), and `verify` (AI
  verifier provider request/response/error, including token usage). Verifier auth headers and API
  keys are never logged. `cadence-types` gains the pure `LogLevel`/`LogFormat`/`LogRecord` types;
  `cadence-host-*` carry version-alignment bumps only (no functional change).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.17.0

## 1.16.0

### Minor Changes

- MCP surface deepening (v1.16.0): grow the `cadence mcp serve` surface from a
  thin tools-only slice into a full MCP integration, along four dimensions.
  - **Resources (phase 75).** `.cadence/` artifacts are exposed read-on-demand
    under a `cadence://` scheme — `state`, `state.json`, `roadmap`, `project`,
    `recommendations`, plus templated `phase/{phase}/draft|summary`. No
    subscriptions / file-watching; readers reuse the same bytes the CLI reads.
  - **Tool parity (phase 76).** Five proven-out commands join the tool set:
    `cadence_handoff`, `cadence_resume`, `cadence_recommendation_add`,
    `cadence_recommendation_promote`, `cadence_doctor` — enabling session
    continuity and the full scout → rec → promote path over MCP (15 tools total).
  - **Prompts + shared guidance (phase 77).** The canonical command guidance and
    the `cadence-scout` dialogue move into a shared `cadence-types` module
    (`COMMAND_GUIDANCE` + `SCOUT_DIALOGUE`) — one source of truth for both the
    Claude Code slash commands (rendered output byte-identical) and the new MCP
    prompts (`cadence_scout`, `cadence_next`, `cadence_draft`, `cadence_settle`).
  - **Zero-config (phase 78).** New `cadence mcp install [--print] [--client <c>]`
    non-destructively writes/merges a project `.mcp.json` (idempotent; refuses to
    clobber a malformed file); `--print` emits a snippet for other hosts.

  `cadence-types` carries the shared guidance module; `cadence-host-claude-code`
  re-sources its slash-command prose from it (byte-identical); `cadence-host-codex`
  carries a version-alignment bump only. stdio-only and imperative-surface-only
  still hold — ambient edit-time gates remain host-hook-only (DESIGN.md D11,
  deepened additively, no new D-number).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.16.0

## 1.15.0

### Minor Changes

- f501588: Verifier robustness (v1.15.0): make the real verifier providers dependable in a
  settle gate, let the operator pick one at the command line, and make every
  verifier run's token usage auditable. Provider hardening + ergonomics around
  unchanged verdict logic — not a verifier rewrite.
  - **Provider hardening (Phase 72).** `anthropic` gains configurable
    `verifier.timeoutMs` + `verifier.maxRetries` (threaded via a pure
    `buildAnthropicClientConfig` seam), so a transient 429/5xx/network blip in a
    settle gate retries before failing loud. `local` gains auth: a bearer
    `Authorization` header from `CADENCE_LOCAL_API_KEY` plus arbitrary
    `verifier.localHeaders`, so token-gated OpenAI-compatible proxies work. Header
    values are never logged. Three new backward-compatible `verifier.*` config
    fields.
  - **Verifier selection + cost visibility (Phase 73).** `cadence settle run
--verifier <mock|anthropic|local>` overrides the config-only provider
    selection (precedence flag > config > default `mock`; invalid values rejected
    at parse time). The override flows into the v1.14 mock-fallback banner so it
    reflects the effective provider. `VerifyResult` and the SUMMARY's
    `deepVerifyMeta` gain optional token usage (`inputTokens` / `outputTokens`),
    captured from Anthropic's `usage` and from `local` endpoints that return one.
    Dollar cost is not derived (no price table to rot).

  `cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
  version-alignment bumps only (the token-usage field on `deepVerifyMeta` lives in
  `cadence-types`; the host adapters are unchanged).

### Patch Changes

- Updated dependencies [f501588]
  - @manehorizons/cadence-types@1.15.0

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

### Patch Changes

- Updated dependencies [b8861dc]
  - @manehorizons/cadence-types@1.14.0

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

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.13.0

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

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.12.0

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

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.11.0

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

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.10.0

## 1.9.0

### Minor Changes

- e95def0: `cadence resume` now defaults to brief output when live state matches the
  handoff doc, and auto-promotes to full output (whole doc + live-context replay)
  on drift. New `--full` / `--brief` flags force a mode; `--json` gains a `mode`
  field and `context` is now nullable (null in brief mode, since the live-context
  recompute is skipped).

### Patch Changes

- Updated dependencies [e95def0]
  - @manehorizons/cadence-types@1.9.0

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

### Patch Changes

- Updated dependencies [7cb7695]
  - @manehorizons/cadence-types@1.8.0

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

- Updated dependencies [d478355]
- Updated dependencies [b3c4008]
- Updated dependencies [05d6ea4]
  - @manehorizons/cadence-types@1.7.0

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

- Updated dependencies [f0d2e4a]
  - @manehorizons/cadence-types@1.6.1

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

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.6.0

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

- Updated dependencies [9fe4780]
  - @manehorizons/cadence-types@1.5.1

## 1.5.0

### Minor Changes

- Add session-continuity commands `cadence handoff` (scaffold a SESSION doc with loop state, read-only git facts, and the context-handoff packet pre-filled) and `cadence resume` (read-only replay of the freshest handoff + live context), plus `/cadence-handoff` and `/cadence-resume` host slash commands. Also fixes a `files-outside-boundary` false positive where absolute touched paths were compared against relative DRAFT `files:` declarations.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.5.0
