# @manehorizons/cadence-host-codex

## 1.28.0

### Minor Changes

- 401d86c: Coverage-gate assertion mode (phase 108): an opt-in
  `verification.coverageMode` that closes the test-coverage gate's
  "mentioned-but-not-tested" false positive. The default `mention` mode is
  unchanged — any occurrence of an `AC-N` token anywhere in a matched test file
  (comments included) counts as covered.
  - `verification.coverageMode: "assertion"` counts an `AC-N` token only when it
    sits inside an asserting `it()`/`test()` block. A comment-only or
    assertion-less mention is reported as a **weak link**: the gate refuses with a
    distinct "not inside an asserting it()/test() block" hint, separate from the
    plain "has no linked test" message for an entirely-absent AC, and the refusal
    names the mode.
  - Span detection is a pure, dependency-free, string/comment-aware scan
    (`findTestSpans`) — no AST, no new dependency, no network; deterministic and
    offline. Parens inside a title string don't break it.
  - Editable via `cadence config edit coverageMode`; documented in
    `docs/reference/config.md` and `docs/concepts.md`.

  Backward-compatible: a config with no `verification.coverageMode` loads as
  `mention` and behaves byte-for-byte as before. `cadence-types` carries the new
  schema field; `host-claude-code` / `host-codex` carry version-alignment bumps
  only.

- 3fae956: Onboarding front door + guided Next: rail (phase 113): make `cadence start` the
  single, unambiguous onboarding entry point, with `cadence quickstart` reframed
  as the post-init "where am I / what's next" map.
  - README leads with `cadence start` alone (the co-equal "or quickstart" framing
    is gone; quickstart is now described as the post-init map).
  - `cadence doctor` ends with a `Next:` line — the first problem's remediation
    when any check is non-ok, else `cadence progress` — so doctor joins the same
    guided rail as the other onboarding commands. (`--json` output unchanged.)
  - `docs/quickstart.md` opens with a 3-way driver fork (terminal / Claude Code /
    MCP) so host users branch immediately.

  Copy/UX only except the small `doctor` Next: line; v1.27's
  `init`/`--demo`/`--activate` flows are untouched, and `quickstart` keeps its
  never-throw guarantee. `cadence-types` / the two host adapters carry
  version-alignment bumps only.

- f6182c0: Onboarding papercuts (phase 114): two small fixes.
  - `cadence init` now prints a one-line heads-up when a young repo gets the
    `auto` gate profile from the git-history suggestion — warning that
    `draft approve` will flip to interactive once the repo passes ~20 commits, and
    that pinning `--gate-profile auto` keeps it hands-off. Only fires for derived
    `auto` (not when pinned explicitly, nor for `standard`/`strict`).
    (rec-20260617-009, scoped down — the preset/profile terminology already
    carries inline clarifiers.)
  - `cadence handoff` honors a `CADENCE_NOW` env override (a date string) for the
    SESSION-doc date, via a pure `resolveNow(env)` seam — making handoff runs
    reproducible and closing a UTC-midnight flake in the clobber-refusal test
    (two runs straddling midnight got different dates and never collided). No
    behavior change when unset. (rec-20260618-001.)

  `cadence-types` / the two host adapters carry version-alignment bumps only.

### Patch Changes

- Updated dependencies [401d86c]
- Updated dependencies [3fae956]
- Updated dependencies [f6182c0]
  - @manehorizons/cadence-core@1.28.0
  - @manehorizons/cadence-types@1.28.0

## 1.27.0

### Minor Changes

- v1.27.0 — onboarding breeze: make `cadence init` a zero-friction front door.
  - **Zero-prompt init** (phase 108): `cadence init` derives the project name
    (`package.json#name`, scope-stripped, else the directory name) and the gate
    profile (git-history heuristic) — it asks nothing.
  - **Auto-wire the host** (phase 108): when a `.claude/` workspace is present,
    `--wire-host` runs the Claude Code adapter install in the same step via a
    subprocess spawn (core never imports host code); a TTY offers it, non-TTY
    skips with a pointer. `--skip-host-wire` opts out.
  - **`init --demo`** (phase 109): seed a ready-to-approve demo phase (objective +
    AC-1 + T1, shared with the `tutorial` toy template) so a newcomer runs a full
    `approve → done → settle` loop in their own repo with no hand-edit.
  - **`init --activate`** (phase 110): when `ANTHROPIC_API_KEY` is present, turn on
    real verification (`verifier.provider=anthropic`, deep-verify seam) in the same
    step via the shared activate seam — the key is never persisted, and no live
    check runs (that stays in `cadence activate`).

  `cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
  version-alignment bumps only (the feature lands in `cadence-core`).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-core@1.27.0
  - @manehorizons/cadence-types@1.27.0

## 1.26.0

### Minor Changes

- Add `cadence start`, an interactive onboarding front door: "What are you doing?"
  → numbered pick → confirm → runs the matching setup command (tutorial, init,
  Claude Code / Codex host install, MCP install, or doctor). Sibling to the
  read-only `cadence quickstart`. Dispatch is a uniform subprocess spawn (the
  `cadence` binary for core routes, `npx` for the two host packages). Scriptable
  via `--pick`/`--yes`/`--json`; a non-interactive shell prints the menu and exits 0.

  cadence-core carries the feature; the other three are version-alignment bumps.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-core@1.26.0
  - @manehorizons/cadence-types@1.26.0

## 1.25.0

### Minor Changes

- v1.25.0 — real-verification-default: name mock honestly as a placeholder

  The `mock` verifier is now explicitly named a non-verifier placeholder across
  every surface, closing the gap between the "real verification gate" pitch and
  the out-of-box mock default (the #1 finding of the 2026-06-11 competitive
  assessment; rec-20260611-003).

  A single source-of-truth `MOCK_VERIFIER_NOTICE` constant in `cadence-types`
  feeds: the settle mock-fallback banner, the `cadence doctor`
  verification-readiness check, `cadence init`'s new "Turn on real verification"
  block, the `cadence quickstart` / `config explain` all-mock warning, and the
  docs (README, concepts, providers, config). Warning-only — mock stays the
  zero-config offline default; nothing is blocked. `cadence-types` carries the
  new constant; the host adapters carry version-alignment bumps only.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-core@1.25.0
  - @manehorizons/cadence-types@1.25.0

## 1.24.0

### Minor Changes

- 9d6684e: Recommendation retention (v1.24): manual + automatic soft-archival of
  recommendations. Terminal recs already drop out of the active `cadence recommend`
  surface but the ledger was append-only — v1.24 adds recoverable move-aside archival.
  - `cadence recommendation archive <id>` / `unarchive <id>` and `recommendation list
--archived` — manual soft-archive (moves a rec into the ledger's new `archived`
    array; recoverable, never deleted; `recommendation show` is archive-aware).
  - `recommendations.autoArchive` config (default **on**, recoverable): a rec is
    auto-archived when it goes terminal — `shipped`/`rejected` immediately on `promote`,
    and a `converted` rec when its phase completes SETTLE (best-effort, never blocks
    settle). Set `false` to keep terminal recs in the active ledger.

  Backward-compatible: a pre-v1.24 `recommendations.json` (no `archived` key) loads
  unchanged. `host-claude-code` / `host-codex` carry version-alignment bumps only.

### Patch Changes

- Updated dependencies [9d6684e]
  - @manehorizons/cadence-core@1.24.0
  - @manehorizons/cadence-types@1.24.0

## 1.23.0

### Minor Changes

- 14aadd0: Add a `shipped` terminal status to the recommendation lifecycle (phase 100,
  from rec-20260611-001). A rec whose work has landed — directly via a PR, or
  after a formal `convert` — can now reach a truthful positive-terminal state via
  `cadence recommendation promote <id> --status=shipped [--ref "PR #70 / v1.22.1"]`,
  instead of being stuck at `candidate`. `shipped` recs drop out of the active
  `cadence recommend` surface (like `converted`/`rejected`); the optional freeform
  `shippedRef` is rendered as a `- shipped:` provenance line. The one sanctioned
  transition out of an otherwise-terminal status is `converted → shipped`.

### Patch Changes

- Updated dependencies [14aadd0]
  - @manehorizons/cadence-core@1.23.0
  - @manehorizons/cadence-types@1.23.0

## 1.22.1

### Patch Changes

- 9a23c60: Fix the phase-id ceiling (rec-20260610-001): widen the id schema from
  `^\d{2}-\d{2}$` to `^\d{2,}-\d{2,}$` and derive ids through a single
  `derivePhaseTaskId` helper, so phases >= 100 are representable end-to-end
  instead of being mangled into `10-100`. Existing 01-99 ids are unchanged.
- Updated dependencies [9a23c60]
  - @manehorizons/cadence-core@1.22.1
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
  - @manehorizons/cadence-core@1.22.0
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
  - @manehorizons/cadence-core@1.21.0
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
  - @manehorizons/cadence-core@1.20.0
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
  - @manehorizons/cadence-core@1.19.0
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
  - @manehorizons/cadence-core@1.18.0
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
  - @manehorizons/cadence-core@1.17.0
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
  - @manehorizons/cadence-core@1.16.0
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
  - @manehorizons/cadence-core@1.15.0
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
  - @manehorizons/cadence-core@1.14.0
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
  - @manehorizons/cadence-core@1.13.0
  - @manehorizons/cadence-types@1.13.0
