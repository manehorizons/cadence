# Milestones

> Version → phase mapping. ROADMAP.md is the substance; this file is the index.

## Shipped

### v0.1.0 — Initial KEEL release
Phases 1–11 under the KEEL name. Host-codex archived to `keel-codex-archive` tag at Phase 11.

### v0.2.0-rc.1 — Rename
- **Phase 12** — KEEL → CADENCE source rename (packages, state dir, CLI).

### v0.3.0 — Behavioral verifier hybrid + anomaly notify (2026-05-14)
- **Phase 13** — Profile system foundation.
- **Phase 14** — Test-coverage proof gate (F5 resolved).
- **Phase 15** — `--deep` independent verifier agent (F6 resolved).
- **Phase 16** — `--interactive` human-verdict walker.
- **Phase 17.1** — Anomaly notify transport (stderr/file/none).
- **Phase 17.2** — Hook-side `files-outside-boundary` + `status anomalies` reader.
- **Phase 17.3** — `AnomalyEvent.ts` + live `--since` filter.
- **Phase 18.1** — F2 physical KEEL → CADENCE rename rollout.
- **Phase 19.1** — F4 webhook transport.
- **Phase 20.1** — F5 + F6 deferred-item strikethrough.
- **Phase 21.1** — auto × complex soft cap (M2 shipped).
- **Phase 22.1** — Release ceremony.

### v0.4.0 — Cheap gates + telemetry truth
- **Phase 23.1** — DRAFT-read mtime gate.
- **Phase 23.2** — coherence-warn anomaly emission.
- **Phase 23.3** — loop-violation anomaly emission.
- **Phase 23.4** — skillAudit wiring (invoked tracking).

### v0.5.0 — Medium gates
- **Phase 24.1** — Manual approve gate (interactive Y/N).
- **Phase 24.2** — Per-task verifier gate.
- **Phase 24.3** — Code-review verifier gate.

### v0.6.0 — Expensive gates
- **Phase 25.1** — plan-review verifier gate.
- **Phase 25.2** — security-audit verifier gate.

### v0.7.0 — Operator ergonomics
- **Phase 26.1** — `cadence init` UX polish.
- **Phase 26.2** — CLAUDE.md scaffold.
- **Phase 26.3** — `status anomalies --tail/--follow`.

### v0.8.0 — CI
- **Phase 27.1** — GitHub Actions tests-on-PR (Node 20 + 22 matrix).

### v1.0.0 — Feature-complete (2026-05-15)
- **Phase 28.1** — Cut v1.0.0 release. DESIGN.md §4.1 gate universe fully shipped.

### v1.1 milestone work (delivered, NOT separately tagged — see v1.1.0 below for the tagged release)
The v1.1 milestone bundle (Phases 29.x → 33.1) shipped reversibly but was never cut as its own tag. See ROADMAP.md §v1.1.0 sections for the substance.
- **Phase 29.x** — Shakedown (foreign-repo dogfood, expensive-gate live exercise, TTY exercise, remediation).
- **Phase 30.1 / 33.1** — Publish pipeline (reversible proof via ephemeral verdaccio; metadata hardened on 3 publishable packages; `@cadence/testkit` → private).
- **Phase 31.1** — User-facing docs (`docs/` guide + CLI-reference drift guard).
- **Phase 32.1** — Test infra (shared `vitest.shared.ts`, `tempRepo` rmdir retry; reverted per-test band-aids).
- **Phase 32.2** — Lint registration.
- **Phase 34.1** — Required-skill gate (resolves the deferred 23.4 question).
- **Phase 35** — Review-convergence primitive.
- **Phase 36** — `spec` stage (pre-DRAFT IDLE→SPEC).
- **Phase 37** — Codereview convergence.
- **Phase 38** — `spec-draft` autoseed.

### v1.1.0 — Praxis: strategic-intelligence layer (2026-05-26)
The first post-v1.0 named tag. 225 commits across 33 numbered slices on `praxis-intelligence-ledger`; merged to main as commit `e34be04`, tagged `v1.1.0`. Praxis sits ABOVE the CADENCE loop — the engine stays Praxis-unaware (no `state.json`/`STATE.md` touch, no phase-side metadata, no loop transition changes). Architecture: Approach A loose coupling, locked in Slice 34's upstream design doc.

Praxis used a different planning surface (`docs/superpowers/specs/`) than the CADENCE-engine `.cadence/phases/` indexed elsewhere in this file. Slice numbering is internal to the Praxis branch.

- **Slices 4–18** — Ledger surfaces: recommendation/assumption/decision/evidence add+list+show; bucket-partitioned MD renders; transition matrices (validate/reject/reopen on assumptions; supersede/rescind/reactivate on decisions); status-annotated link bullets in `RECOMMENDATIONS.md`.
- **Slices 19–22** — Intelligence admin: `cadence intelligence reconcile/stats/audit` with 6 baseline finding kinds (broken-link + orphan-subject).
- **Slices 23–27** — List ergonomics round one: `--filter-status`, `--filter-rec`, `--filter-text`, `--limit`, `--offset`, `--reverse` on all three list commands.
- **Slice 28** — `Decision.supersededBy` FK with cycle detection (`decision supersede --by`).
- **Slice 29** — `cadence decision graph <id>` ASCII viewer.
- **Slice 30** — `intelligence audit` stale-supersededby finding kind.
- **Slice 31** — `Decision.supersedes` derived inverse-link backfill.
- **Slices 32–33** — List ergonomics round two: `--include-untied` (decision only), `--filter-regex`.
- **Slice 34** — Upstream design doc for rec↔phase linkage (no code; design slice).
- **Slice 34.1** — `cadence recommendation convert <recId> --to-phase <phaseId>` transition + `convertedToPhaseId` schema field + detail-render bullet.
- **Slice 34.2** — `intelligence audit` stale-converted-phase finding kind (8th audit kind).

Test count: `@cadence/core` 1034, `@cadence/types` 124 (up from ~620 and 80 at v1.0.0 respectively).

Deferred at v1.1.0 — disposition (reconciled 2026-06-01): Slices 34.3, 34.4, 35 (`--sort-by`), 36 (`--filter-text-exact`), 37 (`--filter-regex-flags`), 38 (`--filter-kind` on audit) **all shipped** (see the v1.1.1 section below). Only graph-viewer optimization (Slice 39) was **not done** — closed as won't-do (`311426a`).

### v1.1.1 — Praxis polish (2026-05-27 tag; Slices 37–38 land just after)
Six post-v1.1.0 Praxis polish slices on the three list commands + the rec→phase promotion flow. **Recorded on the Praxis surface** (`docs/superpowers/{specs,plans}/`) — Praxis slices do not use `.cadence/phases/` (per the v1.1.0 note above). All shipped to `main` with full design + plan + feat + docs commits; folded into the public npm `1.1.1` publish (2026-05-30). The git tag `v1.1.1` (`eed08ec`, 05-27) covers Slices 34.3/34.4/35/36; Slices 37–38 landed 05-27→05-28 just after the tag.

- **Slice 34.3** — `cadence spec/draft new --from-rec <recId>` one-shot rec→phase promotion.
- **Slice 34.4** — `cadence recommendation list --filter-converted-to <phaseId>` reverse-lookup.
- **Slice 35** — `--sort-by <key>[:desc]` on the three list commands (17 sortable keys).
- **Slice 36** — `--filter-text-exact <str>` whole-field equality on the list commands.
- **Slice 37** — `--filter-regex-flags` on the list commands (after the v1.1.1 tag).
- **Slice 38** — `--filter-kind` on `intelligence audit` (after the v1.1.1 tag).
- **Slice 39** (graph-viewer optimization) — **won't-do**, closed `311426a`. (Distinct from CADENCE-engine *Phase* 39 / gate extraction.)

### v1.2.0 — Feature expansion (superpowers-inspired) (2026-05-17; COMPLETE)
Per ROADMAP entry-point note: #6 → #2 → #1 → #4 → #1b shipped; #3/#5 parked (host-agnostic-anchor conflict). v1.2 feature-expansion track has no non-parked work remaining. The constituent phases (34.1, 35, 36, 37, 38) are also indexed in the "v1.1 milestone work" block above; this entry records the v1.2 feature-expansion track as a whole. Never cut as its own npm tag — folded into the 2026-05-30 publish (see v1.4.0 note).

### v1.3.0 — Architecture deepening (2026-05-29; artifacts backfilled 2026-06-01)
**Status: ✓ Delivered.** All twelve phases below shipped on `main` as paired `docs(planning)` + `feat(core)` commits on 2026-05-29 (full turbo gate green at every commit). They were built through the superpowers design→plan→feat workflow and **never run through CADENCE's own settle ceremony** — so the `.cadence/phases/39–44` artifacts were **reconstructed retroactively on 2026-06-01** from the commits (each SUMMARY carries a backfill marker). The code rode into the 2026-05-30 npm `1.1.1` publish. See `.cadence/RECONCILIATION-2026-06-01.md`.

Source: `/tmp/architecture-review-20260525-103233.html` (6-candidate review run on 2026-05-25 against `praxis-intelligence-ledger` branch via the `improve-codebase-architecture` skill); **pressure-tested + revised 2026-05-29** (registry endgame, total enum coverage, `checks/` split, ctx ports — see ROADMAP.md anchor decisions). Theme: pull policy out of CLI commands into reusable deep modules; collapse adapter farms into one generic factory; close half-leaking seams. No new user-facing features.

- **Phase 39.1** — Lift coverage **+ deep-verify** gates out of `settle.ts`; define the registry-ready `SettleContext`/`GateResult`/`GateImpl` shape + verifier/emit ports (shape-defining).
- **Phase 39.2** — Lift the remaining enum gates (`structural-verifier`, `build-test-must-pass`, `draft-read`) for total registry coverage; `anomaly-notify` stays a `ctx.shouldNotify` flag.
- **Phase 39.3** — Lift interactive AC-walker out of `settle.ts`.
- **Phase 39.4** — Lift code-review gate (+ convergence sidecar) out of `settle.ts`; emit via `ctx.emitUnconverged`.
- **Phase 39.5** — Lift security-audit gate out of `settle.ts`.
- **Phase 39.6** — Lift skill-audit **check** into `checks/` (not a `Gate` enum member; outside the registry).
- **Phase 39.7** — Lift draft + build command gates (`approve`, `plan-review`, `coherence`, `per-task-verify`); `draft.ts` is 506 LoC.
- **Phase 40.1** — Verifier factory consolidation (6 factories → 1 generic + 6 thin bindings); behind the `ctx.verifier` port.
- **Phase 41.1** — `StateBackend.commit(state)` seam (closes the ~13-site two-step across ~7 files).
- **Phase 42.1** — `emitUnconverged` notify spine (3 emitters → 1 spine + 3 payloads); pure swap behind the `ctx.emitUnconverged` port.
- **Phase 43.1** — Drain boundary **check** from `handlePreToolEdit` into `checks/` (depends on 39.x).
- **Phase 44.1** — Engine-driven gate registry: settle dispatches by iterating `effectiveGateSet().gates` over an exhaustive `Record<Gate, GateImpl>` (depends on all enum-gate impls).

## Planned

### v1.4.0 — Public release (DELIVERED 2026-06-02; renumbered from v1.2.0 on 2026-05-25)
The first publish happened ahead of plan and out of band on **2026-05-30** (repo public + `@manehorizons/cadence-{core,types,host-claude-code}@1.1.1`; scope renamed `@cadence/*` → `@manehorizons/cadence-*` first, old scope never published so no consumer broke). The version-hygiene remainder closed **2026-06-02** via phase `45-public-release` (DRAFT 45-01). All items done:
- ✓ Real public-npm publish — `@manehorizons/cadence-{core,types,host-claude-code}@1.4.0` published 2026-06-02 via `release.yml` CI.
- ✓ **Version hygiene** — bumped `1.1.1 → 1.4.0` (first published version matching `main`); annotated git tag `v1.4.0` cut at the published commit (`fbbcf91`). The earlier `1.1.1` was left as-is (fix-forward, not churned).
- ✓ npm provenance — published with `--provenance` (OIDC in `release.yml`); `slsa.dev/provenance/v1` attestation confirmed on npm.
- ✓ changesets adoption — `@changesets/cli` + `.changeset/config.json` (access public, testkit ignored) for future releases.
- ✓ `@manehorizons/cadence-testkit` — re-decided: **stays private** (no external demand yet).
- Note: zod `^3 → ^4` shipped as a public-API-affecting dependency change, documented in CHANGELOG `[1.4.0]`.

### v1.5.0 — Session continuity (DELIVERED 2026-06-03)
First feature release after the v1.4.0 version-hygiene publish. `@manehorizons/cadence-{core,types,host-claude-code}@1.5.0` published to npm 2026-06-03 via `release.yml` (provenance); `package.json` bumped `1.4.0 → 1.5.0` via changesets; annotated tag `v1.5.0` cut at the published commit (`60ef475`).
- ✓ **`cadence handoff` / `cadence resume`** — session-continuity commands, built through CADENCE's own loop as phase `46-handoff-resume` (27 ACs). `handoff` scaffolds `.cadence/handoff/SESSION-<date>.md` with loop state, read-only git facts, and the context-handoff packet pre-filled; `resume` is a read-only replay of the freshest handoff + live context. Adds `/cadence-handoff` + `/cadence-resume` host slash commands (host command count 9 → 11). `readGitFacts` is core's first read-only git shell-out.
- ✓ **Boundary-check path normalization** — phase `47-boundary-path-fix`. `runBoundaryCheck` gains an optional `root`; absolute touched paths are relativized before comparison against relative DRAFT `files:` declarations, eliminating `files-outside-boundary` false positives (surfaced dogfooding phase 46).
- PRs #13 (boundary fix) and #14 (handoff/resume) merged 2026-06-03; full gate green; CHANGELOG `[1.5.0]`.

### v1.6.0 — Ergonomics + ideation (DELIVERED 2026-06-04)
Bundles the work that landed on `main` after the `1.5.1` onboarding patch. `@manehorizons/cadence-{core,types,host-claude-code}@1.6.0` published to npm 2026-06-04 via `release.yml` (provenance); version bumped `1.5.1 → 1.6.0` (lockstep) via changesets (PR #27, commit `dd3aa93`); annotated tag `v1.6.0` cut at the published commit.
- ✓ **`/cadence-scout`** — twelfth host slash command (count 11 → 12): a divergent→convergent ideation dialogue that lands survivors as Praxis recs via `cadence recommendation add`. Host-side only, zero core change. Phase `53-cadence-scout`, PR #26.
- ✓ **`cadence init --preset`** rename — `--profile` demoted to a deprecated still-working alias. Phase `52-preset-flag-rename`, PR #24.
- ✓ **Cross-platform CI complete** — Ubuntu + macOS + Windows × Node 20/22. Phases `49-cross-platform-ci` / `50-windows-ci-leg`; the residual `windows-latest` timeout-shadowing flake fixed in PR #25.
- ✓ **Documentation portal** — Astro + Starlight site live at <https://manehorizons.github.io/cadence/>. Phase `51-docs-portal`, PRs #22/#23.
- CHANGELOG `[1.6.0]` (and a backfilled `[1.5.1]`).

> **Point releases v1.7.0–v1.12.0** (2026-06-04 → 06-05) shipped without separate
> named-milestone entries here — each cut via changesets + `release.yml` with
> provenance: `1.7.0` (`doctor` + `recommendation promote` + `install --local`
> fix), `1.8.0` (`mcp serve`), `1.9.0` (drift-decided `resume`), `1.10.0`
> (versioned **host-adapter contract** in `cadence-types`, phase 60 — the enabler
> for the milestone below), `1.11.0` (scout-session grouping + `init` first-loop
> nudge), `1.12.0` (`cadence tutorial` + `cadence explain`). Phases 56–64 form a
> de-facto **adoption & onboarding** arc, now complete.

### v1.13.0 — Multi-host reach: Codex adapter (DELIVERED 2026-06-06)
**Outcome:** shipped to npm with provenance (tag `v1.13.0`, `cd775ce`) across phases
65–69, all settled. The contract **held at v1 — no bump needed**: `ExtractedPayload`
expressed Codex's multi-file `apply_patch` paths via `extractPayload`, so the
"second consumer might force v2" risk resolved in v1's favor (the portability
proof). The new package versioned in **lockstep at `1.13.0`** (not independent
`0.1.0`); the other three public packages carried alignment bumps only.

First consumer of the phase-60 host-adapter contract (`ADAPTER_CONTRACT_VERSION = 1`).
Ships a second published package, `@manehorizons/cadence-host-codex`, that
`satisfies HostAdapter` for the OpenAI **Codex CLI**. Codex's hook lifecycle is a
near-structural clone of Claude Code's (same stdin-JSON shape — `tool_name`,
`tool_input`, `hook_event_name`, `cwd`; same exit-`2` / `permissionDecision:"deny"`
blocking; even `CLAUDE_PLUGIN_ROOT` compatibility aliases), so most of the shim's
parsing/blocking carries over. Codex chosen over OpenCode for reach (OpenAI's
official CLI); OpenCode remains the natural third adapter. Aider ruled out — no
hook system.
- **Genuine contract stress-test:** Codex's `apply_patch` bundles a *multi-file*
  patch, so `extractPayload` must parse it to recover edited paths (Claude gives
  `file_path` directly). If `ExtractedPayload` can't express what Codex needs,
  that legitimately forces `ADAPTER_CONTRACT_VERSION → 2` — the intended payoff of
  a second consumer.
- **Tentative phases:** `65` spike (confirm Codex command/slash surface +
  `apply_patch` payload + non-TTY/trust flow → `codexCapabilities`); package
  scaffold + `codexAdapter` + conformance test; install surface
  (`cadence-host-codex install` → `.codex/hooks.json` + command files, relative
  /`--local` discipline); shim wiring (Codex stdin-JSON → core dispatcher); docs
  (`host-adapters.md` second worked example) + release (4th public package).
- **Open:** Codex command-surface shape (main unknown — spike-first); versioning
  start for the new package (lockstep `1.13.0` vs independent `0.1.0`).

### v1.14.0 — Verifier correctness: deep-verify sees the code (DELIVERED 2026-06-06)
**Outcome:** shipped across phases 70 (keystone diff wiring + `capDiff` + `deepVerifyMeta`
provenance) and 71 (banner honesty + diff-aware docs + changeset), both settled. All
four published packages bumped `1.13.0 → 1.14.0` in lockstep. Two favorable deviations:
the `ctx.diff()` memo already existed (Phase 39.4, shared with code-review) so the
keystone was a wiring change, not new infra; and the `per-task` verifier was already
diff-aware (no blind spot). DESIGN.md **D12** records the decision.

Decided 2026-06-06. **Keystone correctness fix:** the `deep-verify` gate
sent `diff: ''` to the AI verifier (`packages/core/src/gates/deep-verify.ts:28`),
so "deep verification" judges ACs on test-linkage + filenames only — it is
structurally blind to the implementation, even with a real `anthropic`/`local`
provider whose own prompt demands it judge "the supplied diff." This milestone
makes the gate actually verify code. Sharp scope; tied directly to the product's
"refuses to settle unverified work" promise. The `anthropic`/`local` providers
themselves are already fully implemented — this is a **wiring** fix, not a provider
rewrite.
- **Keystone:** add a lazy `ctx.diff()` memo to the gate context (mirrors
  `ctx.coverage()`), running `git diff HEAD -- <files>` **once** and shared by
  `code-review` (which collects its own diff today) + `deep-verify`; wire it into
  the `VerifyInput.diff`.
- **Cap + honest truncation:** pure helper `capDiff(raw, capBytes) →
  { diff, truncated, originalBytes }` with a literal `[diff truncated: N of M bytes]`
  marker; new config field `verifier.diffCapBytes` (Zod positive int, default
  `262144` = 256KB).
- **Provenance:** new run-level `deepVerifyMeta` on the settle summary
  (`{ diffProvided, diffBytes, truncated, filesCount, provider, model }`, new type
  in `cadence-types`) so every verdict is auditable — did the verifier see code,
  how much, was it clipped.
- **Banner honesty:** re-gate the mock-fallback banner (`settle.ts:107`) on the
  gate's real firing condition (`opts.deep || gateSet.includes('deep-verify')`) so
  a `standard×complex` settle no longer runs mock verification silently.
- **Scope guards.** *In:* the `deep-verify` gate only. *Out (deferred to a later
  robustness milestone):* Anthropic repair-retries/timeouts, local auth headers, a
  CLI `--verifier` flag, token/cost instrumentation. *Verify during planning:*
  whether the `per-task` verifier shares the same empty-diff blind spot — fold in
  only if it reuses `ctx.diff()` trivially, else follow-up.
- **Tentative phases:** `70` diff wiring + `capDiff` + config field + `deepVerifyMeta`
  provenance + tests (core + types + config); `71` banner honesty + docs
  (`concepts.md`, `config.md`, DESIGN.md decision note) + release (v1.14.0, lockstep
  bumps — operator's call at release time).
- **Open:** one-vs-two phase split (settle during planning); `diffCapBytes` default
  size; whether to record a DESIGN.md decision (D-number) for "deep-verify reads the
  diff."

### v1.15.0 — Verifier robustness (real providers, production-ready) (DELIVERED 2026-06-06)
**Outcome:** shipped across phases 72 (provider hardening — `anthropic`
`verifier.timeoutMs`/`maxRetries` via the pure `buildAnthropicClientConfig` seam;
`local` bearer auth from `CADENCE_LOCAL_API_KEY` + `verifier.localHeaders`) and 73
(verifier selection + cost — `settle run --verifier <mock|anthropic|local>` with
precedence flag > config > default `mock`, honest mock-fallback banner interaction, and
optional token usage `{ inputTokens, outputTokens }` on `VerifyResult` →
`deepVerifyMeta` → SUMMARY), both settled. All four published packages bumped
`1.14.0 → 1.15.0` in lockstep. **Open questions resolved:** config fields named
`timeoutMs`/`maxRetries` (mirroring `diffCapBytes`); `--verifier` lives on `settle run`
only (no standalone `verify` command exists); **no new DESIGN.md D-number** — this is
provider hardening + ergonomics around unchanged verdict logic, not a behavioral-contract
change (D12 covered the meaning-changing diff-wiring). `maxRetries` left optional (SDK
default holds when unset; explicit `0` disables). Dollar cost intentionally not derived
(no price table). `cadence-types` carries the token-usage field; the host adapters are
version-aligned only.

Decided 2026-06-06, the natural follow-on to v1.14: now that `deep-verify` actually
sends the diff, make the **real** providers (`anthropic`, `local`) dependable enough to
trust in a settle gate, give the operator a way to pick one at the command line, and
make every verifier run's token/cost auditable. These are the items explicitly deferred
from v1.14's scope guard. **This is provider hardening + ergonomics, not a verifier
rewrite** — the verdict logic is unchanged; we add resilience, auth, selection, and
visibility around it. Three phases (operator-chosen grouped shape).

- **Phase 72 — Provider hardening (config-driven).**
  - `anthropic`: surface a request **`timeout`** and **`maxRetries`** on
    `AnthropicVerifier` (today `anthropic-verifier.ts` sets neither — it relies on the
    SDK default and rethrows wrapped `APIError`s), wired from new `verifier.*` config
    fields (Zod). A transient 429/5xx/network blip in a settle gate should retry, then
    fail loud, not fail fast.
  - `local`: support an **`Authorization`/bearer header + arbitrary custom headers**
    (today `local-client.ts` sends only `content-type` — no auth), so OpenAI-compatible
    local proxies / gateways that require a token work. Sourced from config + env
    (`CADENCE_LOCAL_API_KEY`-style), never logged.
  - Tests via the existing injected-`client` (anthropic) and `transport` (local) seams;
    no live network. Mirror the `verifier.diffCapBytes` config pattern from v1.14.
- **Phase 73 — Verifier selection + cost visibility.**
  - A CLI **`--verifier <mock|anthropic|local>`** flag overriding the config-only
    provider selection (resolved today in `verifier-factory.ts`), on the settle/verify
    surface; precedence flag > config > default `mock`. Honest interaction with the
    v1.14 mock-fallback banner.
  - **Token/cost instrumentation:** capture usage from the provider response
    (Anthropic's `.usage` carries input/output tokens; `local` if the endpoint returns
    it) into `VerifyResult` and surface it on `deepVerifyMeta`/SUMMARY
    (`{ inputTokens, outputTokens, ... }`, extend the v1.14 type in `cadence-types`).
    Cost is derived/optional — don't hardcode a price table that rots.
- **Phase 74 — Release v1.15.0.** Docs (`config.md` new fields, `concepts.md`/provider
  notes, DESIGN.md decision note if one is warranted), changeset, lockstep
  `1.14.0 → 1.15.0` bump across all four published packages, tag + provenance.

- **Scope guards.** *In:* `anthropic` + `local` provider resilience/auth, `--verifier`
  selection, token/cost surfacing. *Out (later / not scheduled):* a price table for $
  cost, structured-logging/OTel export (lives in Post-v1.0 observability), per-gate
  verifier overrides, streaming. *Verify during planning:* whether the Anthropic SDK's
  built-in retry already covers the transient case (if so, Phase 72's anthropic half is
  just exposing `timeout`/`maxRetries` config, not new retry logic).
- **Open:** config field names (`verifier.timeout` vs `verifier.requestTimeoutMs`);
  whether `--verifier` belongs on `settle` only or also `verify`; whether token capture
  warrants a DESIGN.md D-number; default `maxRetries` value.

> **Doc note (2026-06-08):** detailed milestone scopes were not hand-maintained
> in this file for **v1.16–v1.19** — those were tracked in CLAUDE.md prose +
> per-phase DRAFT artifacts + DESIGN.md sections. The v1.20 entry below revives
> the v1.15-style pre-ship scope; back-filling v1.16–v1.19 here is out of scope.

### v1.20.0 — Handoff retention (PLANNED 2026-06-08)
**Source:** rec-20260608-001 (filed 2026-06-08; 30 `SESSION-*.md` docs piled up
by v1.19, manually pruned to 1, then to 0 on 2026-06-08). The only scored item in
the live recommendation backlog, and a self-demonstrated need. Chosen as the v1.20
milestone 2026-06-08 over OTel export / gate benchmarks / continuity-runtime — it
fits the tight, additive v1.17–v1.19 polish cadence.

**Thesis:** `cadence handoff` writes dated `SESSION-*.md` docs into `.cadence/handoff/`
and never reaps them. Add an **opt-in, count-based** retention policy that prunes
stale handoffs at **handoff-write time** (not settle — settle fires per-phase and
would race the `lastHandoff` pointer mid-session). Deterministic + offline (no git
introspection); **never silently destructive** (opt-in, keep-N, reported).

**Locked decisions (rec notes + scoping dialogue 2026-06-08):**
- **Trigger:** handoff-write time, after the existing write + `lastHandoff` stamp.
- **Policy:** retention-by-count — `handoff.retain: N` keeps the N most-recent docs.
- **Default:** **unset = no pruning** (opt-in; safest for a destructive feature —
  unlike `phaseGuard` which defaults on but is non-destructive).
- **Prune action:** **hard-delete** the oldest beyond N (the just-written
  `lastHandoff` is always newest, so never deleted), **reported** on stdout.
- **Pairing:** a read-only `cadence doctor` `handoff-retention` check (mirrors the
  v1.18/v1.19 "active behavior + doctor visibility" house pattern).

- **Phase 88 — Retention core + wiring.**
  - `handoff` config block in `cadence-types` (`config.ts`): `retain?: z.number().int().min(1)`,
    unset = disabled. No `enabled` flag — presence of `retain` is the opt-in. Mirror
    the `phaseGuard`/`logging` schema shape.
  - New pure `selectPrunable(filenames, keep, current)` (`handoff/retention.ts`) —
    sorts `SESSION-*.md` lexicographic-descending (ISO date prefix ⇒ chronological at
    day granularity; intra-day label ties alphabetical — deterministic), keeps newest
    `keep`, **always** force-excludes `current` (= `lastHandoff`) as a belt-and-suspenders
    invariant, returns the rest. I/O-free, unit-tested first (TDD).
  - Wire into `run-handoff.ts`: after `atomicWriteText` + stamp, if resolved
    `config.handoff.retain` set → list docs, `selectPrunable`, `unlink`. **Best-effort**
    (any failure caught → soft note, never fails the handoff; same posture as
    `gatherOccupancy`). `HandoffResult` gains `pruned: string[]`; CLI/service prints
    `handoff: pruned N stale doc(s): …`.
- **Phase 89 — Doctor check.** Read-only, best-effort `handoff-retention` check in
  `doctor/run.ts` (registered in `runDoctor`). Counts `SESSION-*.md` vs `config.handoff.retain`:
  retain set & count ≤ retain → **pass**; retain set & count > retain → **pass** w/ note
  ("next handoff write prunes N−retain" — self-heals); retain **unset** & count ≥ **10**
  (threshold) → **warning** suggesting `handoff.retain` (suggested 10); else **pass**.
- **Phase 90 — Release v1.20.0.** Docs (`config.md` new `handoff.retain` field,
  handoff/session-continuity note in `concepts.md`/commands), changeset, lockstep
  `1.19.0 → 1.20.0` across all four published packages, tag + provenance.

- **Scope guards.** *In:* count-based prune-on-write + config knob + reporting + the
  doctor check. *Out (YAGNI):* manual `cadence handoff prune` command; age-based or
  merged-to-main retention; archive-instead-of-delete (just relocates the pile-up).
- **Open (resolve when each phase starts):** lexicographic-by-filename ordering vs
  mtime for "most recent" (chose filename — deterministic, day-granular); doctor
  warning threshold (10); whether DESIGN.md gets a note under session-continuity (no
  new D-number expected — additive, like v1.19 deepening §13).

> **Point releases v1.21.0–v1.23.0** (2026-06-10 → 06-11) shipped without separate
> named-milestone entries here — each cut via changesets + `release.yml` with
> provenance: `1.21.0` (**quickstart-onboarding** — `config explain` / `config edit`
> / `quickstart`), `1.22.0` (**verification-activation** — `cadence activate` +
> doctor `verification-readiness`), `1.22.1` (phase-id ceiling fix, phases ≥ 100
> representable), `1.23.0` (**phase 100** — `shipped` terminal rec status). Phases
> 93–100 form a de-facto **adoption / lifecycle-hardening** arc.

### v1.24.0 — Recommendation retention (PLANNED 2026-06-11)
**Thesis:** `.cadence/intelligence/recommendations.json` is append-only — terminal
recs (`rejected`/`converted`/`shipped`) already drop out of the **active** `cadence
recommend` surface but accumulate in the file forever, with no way to remove one and
no automatic reaping when a rec's work is truly done. Add **manual + automatic
soft-archival**: move a finished rec aside (recoverable), keeping the working ledger
lean while honoring phase 100's *retain-as-provenance* choice. Direct follow-on to
phase 100; **no new DESIGN.md D-number expected** (additive to the
recommendation-lifecycle model). Design:
`docs/superpowers/specs/2026-06-11-recommendation-retention-design.md` (in-repo).

**Locked decisions (brainstorm 2026-06-11):**
- **"Remove" = soft-archive, not hard-delete.** Recoverable; honors retain-as-provenance.
- **Storage:** a second array in the *same* file — `{ schemaVersion, recommendations,
  archived }`. One atomic write moves a rec between arrays (no two-file half-fail).
- **Command name:** `archive` / `unarchive` (the honest verb; not literally `remove`).
- **Auto-archive trigger:** `shipped`/`rejected` → archived immediately (same write
  that sets the status); `converted` → archived when its phase completes **SETTLE**
  (in-flight until done; settle→rec hook on `convertedToPhaseId`).
- **Config:** `recommendations.autoArchive` (boolean, **default `true`** — recoverable,
  so default-on is safe here, unlike `handoff.retain`'s hard-delete which defaults off).
- **Manual `archive` works on any status** (covers junk/duplicate cleanup); auto-archive
  only fires on the terminal events above.

- **Phase 101 — Archive core + manual commands.** `archived` array + `archivedAt` /
  `archiveReason` optional rec fields (`cadence-types`, `.default([])` keeps existing
  files valid); pure `archiveRecommendation` / `unarchiveRecommendation` (move
  semantics, typed errors); `runRecommendation{Archive,Unarchive}`; CLI `recommendation
  archive <id> [--reason]` / `unarchive <id>` / `list --archived`. TDD.
- **Phase 102 — Auto-archive + config.** `recommendations.autoArchive` config block;
  compose archival into the `shipped`/`rejected` status writes (same atomic write);
  best-effort settle→rec hook in `services/settle.ts` archiving a `converted` rec when
  its phase settles (never blocks settle, reported); `config explain` pointer. TDD.
- **Phase 103 — Release v1.24.0.** Docs (`commands.md` archive/unarchive + `--archived`;
  `config.md` `recommendations.autoArchive`), changeset, lockstep `1.23.0 → 1.24.0`
  across all four published packages, tag + npm provenance via the manual `Release`
  workflow.

- **Scope guards.** *In:* soft-archive (manual + auto) + the `archived` array + the
  config knob + `list --archived` + reporting. *Out (YAGNI):* hard-delete/purge;
  age-based archival; a separate archive *file*; auto-archiving live recs; a `doctor`
  archive check (defer unless a real need appears).

## Post-v1.0 (not scheduled)

- Multi-host adapter re-introduction — **Codex shipped as v1.13.0 (above, 2026-06-06)**. **OpenCode evaluated and REJECTED as the third adapter (2026-06-06)** — its gating cannot be made airtight, which breaks CADENCE's core "refuses to settle unverified work" guarantee: (a) the `tool.execute.before` pre-tool hook does **not** fire for subagent or MCP tool calls (sst/opencode #5894, #2319), so edits leak past the gate; (b) there is **no clean per-turn Stop** hook — only `session.idle`/`session.deleted` — so the session-stop/settle gate maps poorly; (c) the plugin API is young/moving with no stability promise. Also a structural mismatch: OpenCode plugins are **in-process Bun TS modules** (`.opencode/plugin/`), not external stdin-JSON hook subprocesses, so the shim would have to be a generated plugin module shelling back to the `cadence` CLI. Building it would force overclaiming the gate (against the project's verifiable-claims bar) or shipping a visibly hollow gate. Revisit only if OpenCode closes the subagent/MCP hook gaps. Aider remains ruled out (no hook system). No clear fourth-host candidate today.
- Continuity-runtime direct integration (currently abstract via webhook).
- DESIGN.md §4.4 softCap tightening (notification-target cap once continuity-runtime ships).
- Performance benchmarks of the gate stack.
- Structured logging / OpenTelemetry export.
- Server-side CI enforcement (currently client-side only via `.githooks/pre-push`).
- Backlog parking lot file (`.cadence/BACKLOG.md` or similar).
- Deferred open questions: 23.1 follow-ups, 24.3 timing, 26.2 CLAUDE.md content.
- Intelligence module internal seams (architecture review 2026-05-25 candidate #6 — *speculative*). Trigger: first markdown-render change touching ≥ 4 files in `packages/core/src/intelligence/`.
