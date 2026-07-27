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

### v1.24.0 — Recommendation retention (DELIVERED 2026-06-11)
**Outcome:** all three phases settled through CADENCE's own loop and merged to `main`;
all four published packages bumped `1.23.0 → 1.24.0` in lockstep (changeset consumed,
CLAUDE.md narrative leads with 1.24.0). PRs #77 (101) / #78 (102) / #79 (103), CI green
on all 6 OS×Node legs. npm publish is the operator-triggered manual `Release` workflow
(tag `v1.24.0` + provenance). Dogfood note: phase 102 went CI-red on first push — a
`promote → shipped` now auto-archives, breaking the existing `recommendation show` test;
masked locally by a stale `dist/` (CLI tests spawn the built binary). Fixed by making
`show` archive-aware (no vanish).

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

- **Phase 101 — Archive core + manual commands.** ✓ (PR #77) `archived` array +
  `archivedAt` / `archiveReason` optional rec fields (`cadence-types`, `.default([])`
  keeps existing files valid); pure `archiveRecommendation` / `unarchiveRecommendation`
  (move semantics, typed errors); `runRecommendation{Archive,Unarchive}`; CLI
  `recommendation archive <id>` / `unarchive <id>` / `list --archived`. TDD. (Deviation:
  dropped the planned `--reason` flag — `archiveReason` is an enum with no free-text
  note field, so the flag would be a no-op; manual archive records `manual`.)
- **Phase 102 — Auto-archive + config.** ✓ (PR #78) `recommendations.autoArchive` config
  block; compose archival into the `shipped`/`rejected` status writes (same atomic
  write); best-effort settle→rec hook in `services/settle.ts` archiving a `converted` rec
  when its phase settles (never blocks settle, reported); `autoArchive` added to the
  `config edit` catalog; `recommendation show` made archive-aware (no vanish). TDD.
- **Phase 103 — Release v1.24.0.** ✓ (PR #79) Docs (`commands.md` archive/unarchive +
  `--archived`; `config.md` `recommendations` section), changeset, lockstep
  `1.23.0 → 1.24.0` across all four published packages, tag + npm provenance via the
  manual `Release` workflow.

- **Scope guards.** *In:* soft-archive (manual + auto) + the `archived` array + the
  config knob + `list --archived` + reporting. *Out (YAGNI):* hard-delete/purge;
  age-based archival; a separate archive *file*; auto-archiving live recs; a `doctor`
  archive check (defer unless a real need appears).

### v1.26.0 — Guided onboarding: `cadence start` (DELIVERED 2026-06-13)
**Outcome:** all three phases settled through CADENCE's own loop on branch
`feat/v1.26-cadence-start`; all four published packages bumped `1.25.0 → 1.26.0`
in lockstep (changeset consumed, CLAUDE.md narrative leads with 1.26.0). npm
publish is the operator-triggered manual `Release` workflow. Built subagent-driven
(implementer + two-stage spec/quality review per phase); the quality review caught
a Windows-CI portability bug pre-merge (npx via `spawn` needs `shell:true` on win32).

**Thesis:** a newcomer who installs CADENCE faces several setup commands (`init`,
`tutorial`, the two host installs, `mcp install`, `doctor`) and must know which fits.
The read-only `cadence quickstart` prints a *map* but doesn't route or run anything.
**`cadence start`** is the interactive sibling: it asks "What are you doing?", takes a
numbered pick, confirms, and runs the matching command. **No new DESIGN.md D-number**
(additive onboarding/legibility over existing commands, same lane as `quickstart`/`activate`).
Design: `docs/superpowers/specs/2026-06-13-cadence-start-onboarding-design.md` (in-repo).

**Locked decisions (brainstorm 2026-06-13):**
- **New command *alongside* `quickstart`**, not replacing it — one prints the map,
  one drives you into it. `quickstart` is untouched behaviorally.
- **Name `start`** (most discoverable; the menu immediately disambiguates from "start the loop").
- **Flat six-option menu** giving both hosts first-class billing (multi-host story).
- **Confirm-then-run**: pick → show command + `[Y/n]` → run, or print the command on decline.
- **Uniform subprocess-spawn dispatch** (discovered during planning): re-spawn the
  `cadence` binary for core routes, `npx` for the two host packages. The targets have
  no uniform `run*` contract, so importing internals would be brittle; spawning keeps
  `start` a pure launcher, trivially testable via an injected `spawn` dep.
- **Scriptable everywhere**: `--pick`/`--yes`/`--json`; non-TTY prints the menu and exits 0.

- **Phase 105 — Pure core.** menu catalog (`START_OPTIONS` → runner + args) + text/JSON/confirm
  renderers + `resolvePick`. No I/O. TDD (AC-1..AC-4).
- **Phase 106 — CLI shell + wiring.** `runStart` (pick/confirm/spawn, json/non-tty, errors),
  `registerStartCommand`, `start` entry in the `quickstart` command map, a `cadence start`
  pointer in `init`'s next-steps. TDD (AC-5..AC-13). Windows npx fix folded in.
- **Phase 107 — Release v1.26.0.** docs (`commands.md` `start` entry + README pointer),
  this milestone narrative, changeset, lockstep `1.25.0 → 1.26.0`.

- **Scope guards.** *In:* the six-route interactive menu + confirm-then-run +
  `--pick`/`--yes`/`--json` + non-TTY menu + the bounded `init`-already-set-up annotation +
  discoverability pointers. *Out (YAGNI):* nested sub-menus; profile/tier selection inside
  `start`; remembering past choices; a TUI/arrow-key framework; deprecating `quickstart`.

## v1.27.0 — Onboarding breeze: `init` is the front door — STARTED 2026-06-17

v1.26 made setup *routable* (`cadence start` points a newcomer at the right command);
v1.27 makes the command it points at *just work*. Sourced from an onboarding assessment
(2026-06-17) that walked install → first successful loop and clocked ~8 typed steps + 1
hand-edit + a separate `activate` hop. **No new DESIGN.md D-number** (additive
onboarding/legibility, same lane as `quickstart`/`start`/`activate`).

**Thesis:** three recommendations cohere because each lands on `init.ts` and together they
collapse "install → working real-verification loop" to `cadence init` (auto-wired, demo
phase, real verifier when a key is present) → 3 paste-ready commands — the biggest
breeze-per-effort of the five assessment findings.

**Recs (Praxis ledger, 2026-06-17):** rec-20260617-001 (zero-prompt init + auto-wire
host), rec-20260617-002 (`init --demo` pre-filled phase), rec-20260617-004 (fold
activation into init) — all **accepted** and clustered into accepted milestone candidates.
rec-20260617-003 (auto-derive phase id + `--ac` shorthands) and rec-20260617-005
(agent/non-TTY mode) **deferred** to a v1.28 follow-on.

**Scope decision (2026-06-17):** init-hub trio only. The two CLI-ergonomics recs are
separable (they touch `draft-new`/`settle`/`progress`/`approve`, not the init front door)
and were deliberately split out to keep v1.27 tight and coherent.

- **Phase 108 — Zero-prompt init that auto-wires the host (rec-001).** Derive name
  (package.json/dir) + gate profile (`suggestGateProfile` git heuristic); when `.claude/`
  is present, offer/auto-run the host install via a spawn seam (core never imports host
  code, mirroring `start`'s launcher discipline). `--name`/`--preset`/`--gate-profile`
  remain overrides.
- **Phase 109 — `init --demo`: pre-filled first phase in the real repo (rec-002).** Scaffold
  a real phase carrying objective + AC-1 + task T1 (shared toy template with `tutorial`),
  so the user runs `approve → done → settle` and sees a real gate in their own repo —
  killing the README's "fill the DRAFT" cliff.
- **Phase 110 — Fold activation into init when a key is present (rec-004).** If
  `ANTHROPIC_API_KEY` is in the env, `init --activate` writes `verifier.provider = anthropic`
  (deep-verify seam) via the existing `activate` plan/assess seam, key never persisted;
  suppress the mock-NOT-real notice when real verification was just wired.
- **Phase 111 — Release v1.27.0.** README quickstart collapsed to the new flow;
  `commands.md` init flags; changeset; lockstep `1.26.0 → 1.27.0` across all four published
  packages; CLAUDE.md narrative leads with `1.27.0`.

- **Scope guards.** *In:* the init-hub trio + docs + release. *Out (v1.28):* rec-003
  (phase-id auto-derive + `--ac` shorthands), rec-005 (agent/non-TTY `--preset agent`).
  *Out (YAGNI):* a full interactive init wizard; remembering host choices; non-Anthropic
  key detection at init.

## v1.28.0 — Coverage depth + onboarding completion (DELIVERED 2026-06-18)

Three phases bundled into one release; closes the onboarding arc.

- **Phase 112 — coverage-gate assertion mode (rec-20260611-004).** Opt-in
  `verification.coverageMode: 'assertion'` counts an `AC-N` token only inside an
  asserting `it()`/`test()` block (pure, dependency-free, string/comment-aware
  `findTestSpans` + `weaklyLinkedAcs`); a comment-only mention becomes a *weak link*
  with a distinct refusal hint. Default `mention` mode byte-for-byte unchanged.
- **Phase 113 — one onboarding front door + guided Next: rail (rec-20260617-007).**
  `cadence start` is the single front door (README leads with it; `quickstart`
  reframed as the post-init map); `cadence doctor` ends with a `Next:` line (pure
  `doctorNextStep`); `docs/quickstart.md` opens with a terminal/Claude Code/MCP
  driver fork.
- **Phase 114 — onboarding papercuts (rec-20260617-009 scoped + rec-20260618-001).**
  `cadence init` warns when a young repo's *derived* `auto` profile will flip
  `approve` to interactive past ~20 commits; `cadence handoff` honors a `CADENCE_NOW`
  clock override (pure `resolveNow`), closing a UTC-midnight flake in the
  clobber-refusal test.
- **Phase 115 — Release v1.28.0.** Changeset consumed; lockstep `1.27.0 → 1.28.0`
  across all four published packages; CLAUDE.md narrative leads with `1.28.0`.

**Outcome.** The onboarding arc is complete — recs 006/007/008/009 all shipped (006/008
via v1.27, 007/009 here). No new DESIGN.md D-number. Remaining backlog is non-onboarding
(rec-003 arg-syntax, rec-005 agent/non-TTY, rec-611-005 gate-bypass audit,
rec-611-007 COMPETITIVE.md, rec-611-006 codex test-parity).

### v1.29.0 — Non-TTY gate auto-bypass (DELIVERED 2026-06-18)
- **Phase 116 — non-TTY auto-bypass for the two interactive loop gates** (rec-20260617-005,
  top backlog). `approve` and `interactive-verdict` no longer hard-fail in a non-TTY with
  `StdinPrompter: stdin is not a TTY`. A pure `resolveInteractivity(env, isTTY) →
  'interactive' | 'bypass' | 'require-tty'` drives both: `approve` auto-passes loudly
  (stderr audit trail); `interactive-verdict` skips its walker, passes, and records
  `interactiveVerifySkipped: "non-tty"` in the SUMMARY (no fabricated human verdicts — the
  other verification gates still decide). Env controls `CADENCE_REQUIRE_TTY=1` (strict
  restore, wins), `CADENCE_NONINTERACTIVE=1` (force bypass under a pseudo-TTY), and the
  always-honored `CADENCE_PROMPTER_SCRIPT`. Env-only — no config knob; `init` and the
  explicitly-interactive commands untouched. TDD (5 ACs), two adversarial reviews PASS.
- **Phase 117 — Release v1.29.0.** Changeset consumed; lockstep `1.28.0 → 1.29.0` across all
  four published packages; CLAUDE.md narrative leads with `1.29.0`.

**Outcome.** The top non-onboarding backlog item shipped; CADENCE is now safe to drive
end-to-end from an AI agent or CI on the default profile. No new DESIGN.md D-number
(additive legibility over the existing gate model).

*Backfilled 2026-07-27: phases 118–230 closed a ~6-week gap where this index went stale
while `.cadence/phases/` kept advancing. See ROADMAP.md for full detail; sections below
follow the same convention already used above.*

### v1.30.0 – v1.32.0 — Hardening pass, draft/settle ergonomics, and release integrity (DELIVERED 2026-06-18 → 06-23)
*Backfilled 2026-07-27. None of these tags has a dedicated release phase, so the phase→version
mapping below is **date-derived** (settle date vs tag date) and approximate at the boundaries.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.30.0 | 2026-06-18 | 118–122 |
| v1.31.0 | 2026-06-19 | 123 |
| v1.32.0 | 2026-06-23 | 124, 129 |

- **Phase 118** — hardening review: fail-closed config, phase-slug path safety, `execFile`-based
  git diffs, Codex docs reconciliation.
- **Phase 119** — `draft new` auto-derived phase/task id; `--pass-all`/`--ac-pass` settle
  shorthands.
- **Phase 120** — durable settle bypass audit trail (`SUMMARY.json` `gateBypasses`, loud stderr
  warning).
- **Phase 121** — local-only, sourced competitive-positioning + objection FAQ (`COMPETITIVE.md`,
  gitignored).
- **Phase 122** — Codex host-adapter test parity: local hook roundtrip, shared
  `COMMAND_GUIDANCE` prompts.
- **Phase 123** — `draft new --template <bugfix|feature|refactor>` first-real-DRAFT scaffolds.
- **Phase 124** — `scripts/release-integrity.mjs`; Release workflow verifies npm+tag+GitHub
  Release agreement.
- **Phase 129** — `cadence tutorial` rebuilt around a genuine refuse→fix→pass arc.

**Outcome.** No new DESIGN.md D-number resulted from this arc — all eight phases are additive to
existing models (path/config safety, the draft/settle CLI surface, the Codex adapter, the
release pipeline, the tutorial demo). Phase 120's bypass audit trail (`gateBypasses` in
`SUMMARY.json`, loud stderr warning) and phase 124's release-integrity script both introduced
durable "done" definitions — bypass visibility at settle time, npm+tag+GitHub-Release+latest
agreement at release time — that the repo's release workflow and summary schema still carry
today. Nothing recorded as deferred in these phases' SUMMARYs is still outstanding: every
118–129 SUMMARY lists no deferred scope.

### v1.33.0 – v1.36.0 — Onboarding trust: agent-prompt, doctor repairs, dry-run preview, and the onboarding-honesty wave (DELIVERED 2026-06-25 → 07-01)
*Backfilled 2026-07-27. Phase→version mapping is **date-derived** (no dedicated release phase
inside this arc).*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.33.0 | 2026-06-25 | 130 |
| v1.34.0 | 2026-06-26 | 131 |
| v1.35.0 | 2026-06-26 | 132 |
| v1.36.0 | 2026-07-01 | 133–139 |

- **Phase 130** — `cadence agent-prompt` + init "hand it to your AI agent" block, one shared
  pure renderer.
- **Phase 131** — `doctor --fix`/`--wire-host`/`--dry-run` best-effort onboarding repairs
  (rec-20260619-004).
- **Phase 132** — `init --dry-run` fit-check preview via pure `planInit` (rec-20260619-005).
- **Phase 133** — doctor git-hooks check: missing dir → not-applicable, never overwrite custom
  hooksPath (rec-20260701-002).
- **Phase 134** — `cadence progress --json` structured payload (rec-20260701-004).
- **Phase 135** — `init --demo` suppresses conflicting/refusing next-step blocks
  (rec-20260701-005).
- **Phase 136** — README real-phase walkthrough: inline `--no-approve` pointer
  (rec-20260701-006).
- **Phase 137** — Refusal trio: BUILD progress names real task id, clean `draft approve`
  refusal, `settle run` next-step (rec-20260701-007).
- **Phase 138** — Slash-command count reconciled to 12 across 3 docs; `cadence start` gains
  "activate" option (rec-20260701-011).
- **Phase 139** — Default install flips `coverageMode` to `assertion`, derives real
  `testCommand`, adds `NO_TEST_COMMAND_NOTICE` (rec-20260701-001).

**Outcome.** Two campaigns closed this window: first-run trust surfaces (agent-prompt,
doctor auto-repair, init dry-run preview) that let an adopter see and fix onboarding state
before committing to it, then a full audit-driven sweep (phases 133–139, shipped together as
v1.36.0 "onboarding-honesty wave 1") that closed six named findings (F2/F4/F5/F6/F9/F10) from
the `rec-20260701-00x` series plus the larger rec-20260701-001 enforcement-default flip. That
last change is the substantive one: new inits now default to `assertion`-mode coverage with a
real derived test command, closing the gap between what `cadence tutorial` demonstrated and
what a fresh `init` actually enforced — existing `.cadence/config.json` files are untouched.
No new DESIGN.md D-number in this window. Two items were explicitly deferred out of this arc
rather than dropped: rec-003 (SUMMARY provenance) and rec-009 (sealed gates), both flagged in
phase 139's DRAFT as separate, later phases — not verified here as still outstanding, just
recorded as the arc's own stated deferral.

### v1.37.0 – v1.38.0 — SUMMARY gate provenance + sealed production gates (DELIVERED 2026-07-02 → 07-03)
*Backfilled 2026-07-27. Phase 140 → v1.37.0 is **evidenced** (named in the v1.37.0 release
commit/CHANGELOG). Phase 141 → v1.38.0 is **date-derived** — its commit merged after the
v1.37.0 tag and before the v1.38.0 tag, but shipped without its own changeset, so it's absent
from that release's CHANGELOG text.*

| tag | tagged | phases attributed |
|---|---|---|
| v1.37.0 | 2026-07-02 | 140 (evidenced) |
| v1.38.0 | 2026-07-03 | 141 (date-derived; undocumented in changelog) |

- **Phase 140** — `SUMMARY.json` per-gate ran/skipped provenance + per-AC evidence class
  (`ai-verified`/`executed`/`assertion`/`mention`/`unverified`) (rec-20260701-003).
- **Phase 141** — `gates.sealed` config; `production` preset seals `test-coverage` +
  `build-test-must-pass` against `--force`/`--allow-*` (rec-20260701-009).

**Outcome.** Closes the three-recommendation "enforcement-wedge wave 2" trio
(rec-20260701-001/-003/-009) that v1.37.0's own release commit called "partial" because phase
141 hadn't landed yet. Phase 141 merged after the v1.37.0 tag with no dedicated changeset, so
`gates.sealed` shipped silently inside v1.38.0's minor bump — that release's CHANGELOG entry
names only phases 142–144, not 141. No new DESIGN.md D-number from either phase. Nothing
deferred out of this arc's two phases is called out as still outstanding in their DRAFT/SUMMARY
records.

### v1.38.0 – v1.39.0 — Cross-worktree handoff picker + intelligence-ledger lifecycle (DELIVERED 2026-07-03)
*Backfilled 2026-07-27.*

| tag | tagged | phases attributed |
|---|---|---|
| v1.38.0 | 2026-07-03 | 142–144 (**evidenced** — phase 144 is the release phase) |
| v1.39.0 | 2026-07-03 | 145–149 (date-derived) |

- **Phase 142** — worktree-discovery extraction + `gatherHandoffCandidates` core primitive.
- **Phase 143** — `cadence resume` picker: `--list`/`--pick`/`--path`/`--local` + read-only sibling resume.
- **Phase 144** — docs + v1.38.0 lockstep release; DESIGN.md §13 addendum, no new D-number.
- **Phase 145** — `settle-pending` recommendation status (replaces silent archive on settle).
- **Phase 146** — `cadence recommend --top <n>` + `/cadence-recommend` slash command (12→13 commands).
- **Phase 147** — upstream self-authorship exemption for the phase-collision guard (issue #129).
- **Phase 148** — `settle run --ship-ref <text>` shortcut to `shipped` (issue #134).
- **Phase 149** — `cadence milestone close <id>` verb, `--ref`/`closedRef`, advisory warning (issue #135).

**Outcome.** Two independent gaps closed on the same day: `cadence resume` gained cross-worktree
awareness built on the same live-scan, no-cached-index philosophy the phase-collision guard already
used (DESIGN.md §13 addendum, no new D-number), and the recommendation/milestone ledger gained a
full lifecycle — a settled phase's recommendation now visibly waits in `settle-pending` instead of
disappearing, with a fast path to `shipped` via `--ship-ref`, and an `exported` milestone can finally
reach a terminal `closed` state. Phase 147's fix also closed a real operational trap: a phase's own
already-pushed SPEC/DRAFT could reflect back from `origin` and refuse a later `draft new`/`settle
run` as a false collision. No new DESIGN.md D-number resulted from either version. One item is still
outstanding today: phase 149's DRAFT left its `docs/reference/commands.md` update as optional
("if time allows"), and as of 2026-07-27 `milestone close` is still undocumented there — no later
phase closed this gap.

### v1.40.0 – v1.41.0 — AC-ref parser fix, structured draft editing, MCP intelligence-lifecycle parity (DELIVERED 2026-07-04)
*Backfilled 2026-07-27. Phase→version mapping **evidenced** — phase 152 is v1.40.0's release
phase, phase 154 is v1.41.0's; both tags shipped the same day.*

| tag | tagged | phases attributed |
|---|---|---|
| v1.40.0 | 2026-07-04 | 150–152 (**evidenced** — phase 152 is the release phase) |
| v1.41.0 | 2026-07-04 | 153–154 (**evidenced** — phase 154 is the release phase) |

- **Phase 150** — deduplicated `parseAcRefs` into a shared prefix-matching helper; fixes silent
  AC-id drops after trailing annotation text.
- **Phase 151** — `cadence draft set-objective` / `add-ac` / `add-task`: additive structured
  DRAFT.md write path alongside hand-editing.
- **Phase 152** — Release v1.40.0; docs for phase 151's subcommands; lockstep `1.39.0 → 1.40.0`.
- **Phase 153** — MCP tools `recommendation_convert` / `milestone_propose` /
  `recommendation_archive` + `summary.json` resource; fixed promote tool's dead-end description.
- **Phase 154** — Release v1.41.0; docs for phase 153's additions (MCP tool count 15 → 18);
  lockstep `1.40.0 → 1.41.0`.

**Outcome.** Both releases were additive, no-D-number changes: phase 150-151 hardened the
draft-authoring path (a silent parser bug fixed, then a structured write path added to prevent
the class of hand-edit typo that caused it), and phase 153 closed the MCP surface's remaining
gap in the scout→phase→milestone lifecycle so an MCP-only client can now complete the same
recommendation workflow the CLI supports. Phase 153 explicitly deferred
`cadence_recommendation_unarchive` and `cadence_milestone_accept/defer/export` as MCP tools
(out of scope per rec-20260701-010); whether that gap is still open would need a check against
the current recommendations ledger. No new DESIGN.md D-number in either version.

### v1.42.0 — Boundary enforcement + subagent dispatch (DELIVERED 2026-07-06)
*Backfilled 2026-07-27. Phase→version mapping **evidenced** — phase 160 is this tag's
release phase.*

- **Phase 155** — edit-time `boundaryEnforcement: 'block'` mode (rec-20260704-001).
- **Phase 156** — settle-time boundary diff scan (follow-on to 155).
- **Phase 157** — `parseSpecMd` multi-line Objective truncation fix (rec-20260704-002).
- **Phase 158** — subagent task-redundancy monitoring (post-DONE file touches, live).
- **Phase 159** — `cadence dispatch plan` wave-based subagent dispatch groups.
- **Phase 160** — Release v1.42.0; lockstep `1.41.0 → 1.42.0`.

**Outcome.** Boundary enforcement went from advisory to enforcing at both ends of the
loop — an opt-in edit-time refusal plus a settle-time re-derivation from the diff —
closing the gap where a violation could be observed but never refused. Phase 159's wave
grouping became the mechanism the repo's own subagent-driven phases have run on since.
No new DESIGN.md D-number (additive to the boundary + dispatch models). Nothing deferred
out of this milestone is still outstanding.

### v1.43.0 – v1.44.1 — Trustworthy verification, gate/settle audit-trail integrity, onboarding polish (DELIVERED 2026-07-10 → 07-12)
*Backfilled 2026-07-27. None of these tags has a dedicated release phase; phase→version mapping
is **date-derived** (settle date vs tag date), approximate at the boundaries.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.43.0 | 2026-07-10 | 161–164 |
| v1.44.0 | 2026-07-11 | 165–169 |
| v1.44.1 | 2026-07-12 | 170, 171, 173, 174, 176, 177 |

- **Phase 161** — portfolio readiness doc sync: surface-model vocabulary, stale-claim cleanup,
  README technical-reviewer section + architecture diagram.
- **Phase 162** — Codex one-command first-run bootstrap (rec-20260708-001).
- **Phase 163** — handoff/resume freshness gates: fetch-backed git facts, origin-ahead banner,
  unfilled-section detection, `handoff --check`.
- **Phase 164** — trustworthy verifier activation: broader key discovery, non-skippable
  activation smoke test, committed-provider-config inheritance.
- **Phase 165** — `host-cli` headless verifier provider, wired end-to-end for `per-task-verify`
  (rec-20260710-002).
- **Phase 166** — language-aware `coverageMode`/test-glob defaults at `cadence init`.
- **Phase 167** — shared-lexer multi-language assertion-coverage engine (python/go/rust/php) +
  `verify coverage --explain`.
- **Phase 168** — test-gutting demo landed as a committed, deterministic `examples/` package.
- **Phase 169** — assertion-mode coverage refuses the `.skip`/`.todo`/`.failing` dodge.
- **Phase 170** — refused settle now persists gate provenance + SUMMARY (was silently dropped).
- **Phase 171** — installer refuses on malformed `settings.json` instead of wiping it; backup +
  atomic writes.
- **Phase 173** — optimistic-concurrency `revision` check on `SimpleStateBackend.commit()`.
- **Phase 174** — post-settle retro artifact + optional `gh issue` offer (rec-20260712-001).
- **Phase 175** — README hero repositioned to lead with the test-gutting demo (no phase
  directory — see numbering ledger).
- **Phase 176** — gate-throw exceptions now normalize to an audited SUMMARY, not a silent crash
  out (rec-20260712-007).
- **Phase 177** — README hero restored (post-revert) with an animated `gutting.svg` recording.

**Outcome.** This window closed the "mock-default undercuts the enforcement wedge" competitive
risk from two directions at once — real verifier key discovery/activation (164) and a
zero-extra-key `host-cli` provider (165) — while phases 166–167 took assertion-mode coverage from
JS/TS-only to a shared four-language engine and phase 169 closed a documented dodge in that same
gate. In parallel, the settle/gate audit trail was hardened end to end: a refusing gate (170), a
throwing gate (176), and a racing state write (173) all now leave a durable, auditable record
instead of silently vanishing or corrupting state — closing the gap the project's own thesis
("an AI agent's self-report of done is not proof") depends on. No new DESIGN.md D-number (D12
predates this window). Per the live recommendations ledger, rec-20260710-003 (the MCP-driven
inversion alternative to the host-cli provider) remains status `deferred` and is still
outstanding as of this backfill.

### v1.45.0 – v1.46.0 — Verifier/security hardening + onboarding ergonomics (DELIVERED 2026-07-15 → 07-17)
*Backfilled 2026-07-27. Phase→version mapping is **date-derived** (settle date vs tag date);
neither tag has a dedicated release phase.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.45.0 | 2026-07-15 | 178–185 |
| v1.46.0 | 2026-07-17 | 186–191 |

- **Phase 178** — headless-CLI verifier: quota notice, self-invocation guard, spawn timeout (rec-20260710-006).
- **Phase 179** — `cadence milestone status`: read-only worktree fan-in reconciliation.
- **Phase 180** — `redactSecrets()` for evidence summaries + security-audit findings; ledger files `0o600`.
- **Phase 181** — MCP tool-trust envelope (capability class, def-hash, expiry) for `draft_approve`/`spec_approve`.
- **Phase 182** — CI security automation: CodeQL, gitleaks, npm-audit exceptions, SBOM (rec-20260712-013).
- **Phase 183** — generated-docs drift checks extended to flags, config keys, exit-code taxonomy (rec-20260712-012).
- **Phase 184** — `AbortSignal`/`traceId` plumbing through `Verifier` + `SecurityAuditVerifier` (rec-20260712-010).
- **Phase 185** — `publish-proof.mjs` smoke-tests the real init→draft→settle loop, not just `--help`.
- **Phase 186** — `cadence retro`: cross-phase gate-bypass/finding-category rollup (rec-20260712-002).
- **Phase 187** — fix: `--allow-auto-complex` overrides now land in `SUMMARY.json`'s `gateBypasses`.
- **Phase 188** — `cadence init --full`: one flag composing `--wire-host --demo --activate`.
- **Phase 189** — `cadence onboard`: per-machine setup for a teammate cloning an initialized repo.
- **Phase 190** — `doctor --fix` auto-remediates handoff-retention (narrowed slice of rec-20260709-002).
- **Phase 191** — host-cli builders wired for spec/plan/code-review, security-audit, deep-verify.

**Outcome.** The first half of this arc turned CADENCE's own security posture from ad hoc into
systematic — a redaction choke point for two known secret-leak vectors, an MCP trust envelope
replacing an unconditional "the tool call IS the approval," and CI-level CodeQL/secret-scan/
audit/SBOM coverage that previously didn't exist at all. The second half closed a real
production gap: a downstream project's `host-cli`-configured spec-review gate had been silently
mock-falling-back and rubber-stamping since phase 165 left 5 of 6 verifier families unwired
(191) — now all six route through the real headless CLI when configured to. No new DESIGN.md
D-number resulted from either version. Two items remain deliberately out of scope going forward,
not just deferred within this arc: `cadence_settle` staying ungated under the MCP trust envelope
(181), and retro-friction feeding back into Praxis recommendation scoring (rec-20260712-003,
tracked separately from 186's rollup) — neither has been independently verified as still
outstanding today beyond what the phase artifacts themselves state.

### v1.47.0 – v1.48.0 — Dispatch-safety hardening, worktree-safe state tracking, and intelligence-ledger fixes (DELIVERED 2026-07-18 → 07-19)
*Backfilled 2026-07-27. Phase→version mapping **evidenced** — the v1.47.0 (`1923f6bb`) and
v1.48.0 (`0bec56bb`) release commits each enumerate their bundled phases explicitly, superseding
a pure date-derived guess (which would have misplaced the 194/195 boundary at 195/196).*

| tag | tagged | phases attributed (evidenced via release-commit body) |
|---|---|---|
| v1.47.0 | 2026-07-18 | 192–194 |
| v1.48.0 | 2026-07-19 | 195–200 (of the release's 195–201; 201 is outside this arc) |

- **Phase 192** — mandatory dispatch-packet prohibition on self-recording outcomes
  (rec-20260718-001).
- **Phase 193** — `recommendIsolation` per-task worktree-isolation signal in `dispatch plan`
  (rec-20260718-002).
- **Phase 194** — `bumpSessionCounter` exempts telemetry-only session counters from the
  revision-guarded commit, fixing issue #234.
- **Phase 195** — `task-verify-required` settle gate refuses bare `TN: DONE` with no verify
  evidence (issue #206, rec-20260712-001); gate count 13→14.
- **Phase 196** — `state.json`/`STATE.md`/`mcp-trust.json`/`intelligence/context/` gitignored by
  default + `doctor --fix` migration + `stateAtSettle` audit snapshot + conflict repair (issue
  #177).
- **Phase 197** — `cadence onboard` bootstraps a missing `state.json` for fresh
  worktrees/clones (196 fallout).
- **Phase 198** — `--filter-regex` length bound closes a CodeQL ReDoS finding (issue #249).
- **Phase 199** — `cadence recommendation evidence add` CLI writer + store function.
- **Phase 200** — `nextRecommendationId` scans archived IDs too, fixing a same-day collision
  (issue #248).

**Outcome.** This arc converts three previously-advisory or previously-silent failure modes into
enforced or repaired ones: dispatch packets now refuse self-recording rather than merely lacking
support for it (post-incident, same-day fix); settle refuses a bare DONE claim instead of writing
one; and cross-worktree `state.json` conflicts (issue #177) are closed by removing the tracked
file from git entirely rather than patching the merge behavior, with phase 197 catching the
onboarding regression that fix created within 24 hours. No new DESIGN.md D-number — D12 remains
the latest entry; all nine phases are additive to the existing state-backend, gate-matrix, and
dispatch-packet models. Both releases needed the same manual lockstep lockstep-version lift
(changesets' `fixed`/`linked` config is intentionally left empty) — a known, recurring, non-defect
step per the v1.48.0 release commit, not something newly discovered here.

### v1.49.0 – v1.50.0 — Praxis lifecycle UX + consumer-repo CI verification (DELIVERED 2026-07-20 → 07-22)
*Backfilled 2026-07-27. Neither tag has a dedicated release phase; phase→version mapping below is **date-derived** (settle date vs tag date), approximate at the boundaries.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.49.0 | 2026-07-20 | 201–203 |
| v1.50.0 | 2026-07-22 | 204–211 |

- **Phase 201** — `cadence milestone premortem` writer flags for operator-authored fields, survives refreshes (rec-20260714-001).
- **Phase 202** — `cadence summary render <phase> <num>` + team rollout docs; PR-visible gate/settle output.
- **Phase 203** — `cadence milestone reopen <id>`: `deferred → proposed` transition, collision-guarded.
- **Phase 204** — `cadence verify phase` + `cadence init --ci`: phase-scoped coverage re-derivation + CI scaffold (rec-20260709-003).
- **Phase 205** — UI-SPEC gate: `spec new --ui` + convergent `ui-spec-review` (rec-20260711-004).
- **Phase 206** — `cadence next`: ranked legal moves from `nextAction()`, versioned `--json` (rec-20260721-002).
- **Phase 207** — empty/refusal messages name precondition + nearest candidate + unblocking command (rec-20260721-001).
- **Phase 208** — `doctor` `phase-freshness` check + concurrent-session guidance in CLAUDE.md/skills (rec-20260722-001).
- **Phase 209** — anthropic mock-fallback warning names Claude-Code-login insufficiency (rec-20260723-001).
- **Phase 210** — `docs/providers.md` anthropic-section auth-distinction callout (rec-20260723-002).
- **Phase 211** — CLAUDECODE-aware `doctor`/`activate` messaging suggests `host-cli` (rec-20260723-003).

**Outcome.** This window closed the "Claude Code login ≠ API key" confusion end-to-end across three deliberately split phases (runtime warning, docs, doctor/activate) and closed the loop on 202's own deferred scope — the CI-gate generator it explicitly punted landed two phases later as 204's `cadence init --ci`, and 206's deferred empty-state footer integration landed the very next phase as 207. No new DESIGN.md D-number resulted from either tag (204's `cadence verify phase`, 205's UI-SPEC gate, and 206's `cadence next` are all additive to the existing gate matrix / CLI surface — 205 is recorded as a §4 gate-matrix delta, not a locked decision). Phase 208 is the first appearance of what CLAUDE.md now calls the "Zombie Session" failure mode. Nothing deferred out of this window is still outstanding as of 2026-07-27: `rec-20260709-003`, `rec-20260721-001`, and all others cited above show `status: shipped` in the live `.cadence/intelligence/recommendations.json` ledger.


### v1.51.0 – v1.51.1 — Evidence-floor + trust-envelope gates, Praxis ledger unification (DELIVERED 2026-07-24 → 07-25)
*Backfilled 2026-07-27. Phase→version mapping **date-derived**, cross-checked against `CHANGELOG.md`'s `[1.51.0]`/`[1.51.1]` sections, which name every phase below explicitly.*

| tag | tagged | phases attributed (date-derived) |
|---|---|---|
| v1.51.0 | 2026-07-24 | 212–218 |
| v1.51.1 | 2026-07-25 | 219–221 |

- **Phase 212** — `cadence retro feedback`: recurring retro friction scores into Praxis via a new `frictionPts` term (rec-20260712-003).
- **Phase 213** — Real per-package coverage thresholds enforced in CI, dead root coverage block removed (rec-20260712-014).
- **Phase 214** — `gates.evidenceFloor`: settle refuses PASS verdicts below a configured evidence-ladder floor (rec-20260724-001).
- **Phase 215** — "The Unlogged Audit Finding" ledger-diff step added to CLAUDE.md's audit protocol (rec-20260724-002, dec-20260724-001).
- **Phase 216** — `cadence_settle` MCP tool gated by the trust envelope; helper renamed `enforceGatedToolGrant` (rec-20260724-005).
- **Phase 217** — CHANGELOG.md currency gated at commit/push time, mirroring the CLAUDE.md version check (rec-20260724-003).
- **Phase 218** — Post-publish npm verification retry budget raised to 10 attempts, fixing a real Release-workflow false-red (rec-20260725-001).
- **Phase 219** — `nextRecommendationId` cross-checks `evidence.json`; `cadence doctor` flags orphaned evidence rows (rec-20260724-013).
- **Phase 220** — Five Praxis subject ledgers unified onto one shared read/write/id-mint module; milestones reach audit/reconcile/stats parity (rec-20260725-002).
- **Phase 221** — MCP/CLI parity: promote `ref` provenance, deduped milestone predicate, next/verify/explain as MCP tools (rec-20260725-003).

**Outcome.** This pair of releases closed the enforcement gap at both ends of a settle claim — an evidence-quality floor on the AC verdicts themselves (214) and a trust-envelope check on the MCP surface that can trigger settle (216) — plus a matching gap on the release process's own record (CHANGELOG currency, 217) and a hardening of the audit protocol that produced those recommendations in the first place (215's ledger-diff step, closing `dec-20260724-001`). v1.51.1 then consolidated: phase 219's one-off id-collision fix generalized into phase 220's shared ledger module the very next day, so the same safeguard now covers all four minting subjects instead of needing separate patches. No new DESIGN.md D-number resulted from either release (both gates and the ledger unification are additive to existing models). One explicit descope carried in this window: phase 217 scoped CHANGELOG-currency enforcement gate-only per `dec-20260724-002`, deferring changelog-generation-from-`SUMMARY.json`; the recommendation it came from (`rec-20260724-003`) is nonetheless recorded `shipped` for the gate-only scope actually delivered.


### Unreleased — dogfooding-driven hardening: adapter dedup, attestation, doctor coverage, convergent-review consolidation
*Backfilled 2026-07-27. Phases 222–230, confirmed on `main` via `git log` but **not yet
published** — `npm view @manehorizons/cadence-core version` still reports `1.51.1` (the last
tag), 9 commits behind `main`'s tip. This is a previously-invisible fact this backfill surfaces:
the work is done and settled, but nobody has cut a release for it yet.*

- **Phase 222** — new `@manehorizons/cadence-host-toolkit` package dedupes hook-routing,
  slash-command catalog, install-merge, and locate-self logic shared by both host adapters.
- **Phase 223** — settle-time SUMMARY sha256 content hash + `cadence summary verify` command
  (rec-20260724-006); detection only, signing deferred (dec-20260726-001).
- **Phase 224** — `cadence doctor` `ledger-remote-collision` check: catches cross-session
  `mintId` id collisions against the tracked upstream before push (rec-20260726-003).
- **Phase 225** — shared `runConvergentReview` primitive replaces 4 copy-pasted convergence
  sequences (rec-20260725-008); byte-identical sidecar JSON and branch behavior.
- **Phase 226** — centralizes `gates.sealed` bypass/seal documentation and provenance;
  fixes doc undercounts and adds missing skip-reason recording.
- **Phase 227** — `NotInitializedError`/`cadence init` refusal now points fresh worktrees
  missing `state.json` at `cadence onboard` (rec-20260726-002).
- **Phase 228** — mechanical split of the ~555-line `settleService` into 10 named,
  behavior-preserving step functions (rec-20260725-007).
- **Phase 229** — doc-content test guards README's mermaid architecture diagram against
  code drift (rec-20260726-004).
- **Phase 230** — python coverage opener regex now recognizes `-> <type>:` return-type
  annotations, fixing silent zero-coverage on annotated test functions.

**Outcome.** Nine phases spanning the tail of the `v1.51.1` gap, none yet released — the
clearest single fact this backfill surfaces is that `main` is 9 commits ahead of the latest
npm-published version with no release phase queued in this window. Thematically the arc splits
into mechanical dedup (222 host-toolkit extraction, 225 convergent-review runner, 228 settle
step-function split — all behavior-preserving refactors proven via characterization tests or
zero test-file edits) and verification-honesty hardening that follows directly from this repo's
own thesis (223 makes a hand-edited SUMMARY detectable, 224 makes a cross-session ledger-id
collision detectable before push, 226 closes doc/provenance drift around which gates the
`sealed` policy actually covers). No new DESIGN.md D-number resulted from any of the nine
phases (checked against DESIGN.md's D1–D12 table and phase-list section directly — everything
here is additive to existing models). Nothing in this window was explicitly deferred except
223's signing scope, which already has a tracking rec (rec-20260726-001, parked behind a
threat-model rec per dec-20260726-001) — not newly discovered here.



## Post-v1.0 (not scheduled)

- Multi-host adapter re-introduction — **Codex shipped as v1.13.0 (above, 2026-06-06)**. **OpenCode evaluated and REJECTED as the third adapter (2026-06-06)** — its gating cannot be made airtight, which breaks CADENCE's core "refuses to settle unverified work" guarantee: (a) the `tool.execute.before` pre-tool hook does **not** fire for subagent or MCP tool calls (sst/opencode #5894, #2319), so edits leak past the gate; (b) there is **no clean per-turn Stop** hook — only `session.idle`/`session.deleted` — so the session-stop/settle gate maps poorly; (c) the plugin API is young/moving with no stability promise. Also a structural mismatch: OpenCode plugins are **in-process Bun TS modules** (`.opencode/plugin/`), not external stdin-JSON hook subprocesses, so the shim would have to be a generated plugin module shelling back to the `cadence` CLI. Building it would force overclaiming the gate (against the project's verifiable-claims bar) or shipping a visibly hollow gate. Revisit only if OpenCode closes the subagent/MCP hook gaps. Aider remains ruled out (no hook system). No clear fourth-host candidate today.
- Continuity-runtime direct integration (currently abstract via webhook).
- DESIGN.md §4.4 softCap tightening (notification-target cap once continuity-runtime ships).
- Performance benchmarks of the gate stack.
- Structured logging / OpenTelemetry export.
- ~~Server-side CI enforcement (currently client-side only via `.githooks/pre-push`).~~
  Shipped: the `ci-success` check has been required + `enforce_admins`-protected on `main`
  since phases 49–50 (confirmed live throughout this session's own PRs).
- Backlog parking lot file (`.cadence/BACKLOG.md` or similar).
- Deferred open questions: 23.1 follow-ups, 24.3 timing, 26.2 CLAUDE.md content.
- Intelligence module internal seams (architecture review 2026-05-25 candidate #6 — *speculative*). Trigger: first markdown-render change touching ≥ 4 files in `packages/core/src/intelligence/`.
