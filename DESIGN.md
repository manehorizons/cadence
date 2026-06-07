# Project Design — CADENCE

> **Name:** CADENCE — named for the rhythm of its core DRAFT → BUILD → SETTLE loop. Locked as of Phase 12 / `v0.2.0-rc.1` (2026-05-14). The backronym *"Coordinated AI-Driven Engineering with Notifications and Customizable Execution"* was retired 2026-06-02 as a forced fit (it over-billed the minor `anomaly-notify` feature); the word CADENCE itself is the keeper. Historical KEEL phase artifacts under `.keel/phases/` remain by design (transition narrative).

> Living design document. Captures intent, decisions, deferrals.
> Lives at repo root, **outside** `.cadence/`, so the tool isn't planning itself with itself.

**Last updated:** 2026-06-02

---

## 1. What this project is

A **customizable, AI-assisted development framework** that lets a user dial in how much they want to drive vs. how much the AI drives — without giving up the quality gates that make AI-generated work trustworthy.

Inspired by GSD (Get Shit Done). Intended as a **faster, more efficient, more customizable** alternative to GSD — *not* a lighter one. The gates exist; the user picks which ones fire.

## 2. What this project is NOT

- Not a host-agnostic framework at any cost. v1 is **Claude Code only**. Multi-host is a v1.x/v2 concern.
- Not an autopilot. Even the most hands-off profile must surface anomalies.
- Not a structural-only verifier. "Tasks marked DONE" ≠ "AC delivered." Behavioral verification is mandatory.
- Not a slow framework. The point is GSD's discipline without GSD's wall-clock cost.

## 3. Design center — three pillars

### 3.1 Profiles (user-involvement axis)

Three modes, user-selected per project or per phase:

| Profile | Posture | Gates user must approve |
|---|---|---|
| **strict** | Full control. Every step is a checkpoint. | DRAFT review · plan review · per-task verify · settle verify |
| **standard** | Major-step gating. | DRAFT approve · settle verify |
| **auto** | Hands-off; the AI drives. | None by default — but anomalies pause + notify |

KEEL's original behavior was `auto` without the notify part — closing that gap was the first priority, shipped as `anomaly-notify` (Phase 17).

### 3.2 Behavioral verification (hybrid)

`settle` must answer "does the built code actually do what the AC promised in plain English?" — not just "are tasks marked DONE?"

Hybrid implementation:

1. **Default** — structural (current `--auto`) **+** test-coverage proof. Each AC must have ≥1 test that references it.
   - **Convention (locked in Phase 14):** the AC id token (`AC-N`) must appear somewhere in a test file's contents. Typical placement: inside `describe()` or `it()` strings, but any occurrence (even a comment) counts. The gate is binary per AC: at-least-one-linked-test or refuse.
   - **Scanner:** walks `verification.testGlobs` from `.cadence/config.json` (defaults: `packages/**/*.test.ts(x)`). Whole-file text search via `/\bAC-\d+\b/g`; per-file deduplication.
   - **Bypass per-invocation:** `cadence settle run --allow-missing-coverage` skips the check entirely. Explicit `--ac AC-1=pass:note` overrides bypass the gate for that AC only.
2. **`--deep`** — spawn an independent verifier (Phase 15, shipped). Three providers via `config.verifier.provider`: `mock` (default, deterministic linked-test rule, offline), `anthropic` (opt-in via `ANTHROPIC_API_KEY`; uses `messages.parse()` with a Zod schema for per-AC verdicts; system prompt is prompt-cached), or `local` (OpenAI-compatible `/v1/chat/completions`, e.g. Ollama; requires `CADENCE_LOCAL_BASE_URL` + `CADENCE_LOCAL_MODEL`; per-gate `model` config key overrides env; falls back to `mock` with a stderr warning if base URL or model is unset). Refuses to settle on any non-overridden AC the verifier marks `pass=false` unless `--force`. Transport failures gated by `--allow-verifier-failure`. Per-AC results recorded into `SUMMARY.json deepVerify`.
3. **`--interactive`** — shipped in Phase 16. Walks each AC sequentially with its given/when/then text + linked test refs + touched files, prompts the user for `pass | fail | skip` plus an optional note. Pass/fail verdicts win over structural/deep derivation; skip falls through. Per-AC results recorded into `SUMMARY.json interactiveVerify`. Refuses on TTY-less invocations unless `--no-interactive` bypasses; tests drive the walker via `CADENCE_PROMPTER_SCRIPT` env var seam.

### 3.3 Anomaly notification (for `auto` profile) — shipped (Phase 17 + 17.2)

Two emission surfaces share one `Notifier` transport:

1. **Settle-side (Phase 17.1)** — `collectAnomalies(...)` walks the settle context and dispatches a batch through `selectNotifier(config)` at SETTLE close.
2. **Hook-side (Phase 17.2)** — `handlePreToolEdit` detects `files-outside-boundary` at edit time and dispatches one event per outside path *as the edit is about to happen*. Detection-only — the hook never refuses the edit.
3. **Coherence-side (Phase 23.2)** — `cadence draft check` and `cadence draft approve` dispatch one `coherence-warn` event per warn-severity coherence issue. Block-severity issues already refuse loudly; warns are the soft signal the auto profile needs to know about.

All three surfaces gate on `'anomaly-notify'` being in the effective gate set (auto + standard×{standard,complex} cells). Each event carries `ts: ISO8601` (offset-aware, emitter-stamped via `new Date().toISOString()` — Phase 17.3). Seven event types:

| Type | When |
|---|---|
| `ac-blocked` | A task ended `BLOCKED` |
| `ac-needs-context` | A task ended `NEEDS_CONTEXT` |
| `coverage-bypassed` | `--allow-missing-coverage` flipped an active test-coverage gate |
| `files-outside-boundary` | A touched file is not in any task's declared `files:` list (settle-time reconciliation OR hook-time per-edit detection) |
| `verifier-failure` | The `--deep` verifier transport itself failed |
| `force-used` | `--force` bypassed at least one failing structural / deep / interactive verdict |
| `coherence-warn` | A `severity: 'warn'` coherence issue fired from `draft check` or `draft approve` (context.source distinguishes which) |
| `loop-violation` | A `LoopViolationError` was thrown — context.expected vs context.actual record the mismatch + context.source identifies the command |
| `per-task-fail` | The per-task verifier returned `refuse` at `cadence build task <id> --status=DONE` (Phase 24.2). `context.bypassed` is true when `--allow-per-task-failure` recorded DONE anyway; false when DONE was blocked |
| `code-review-high` | The code-review verifier returned a HIGH-severity finding at settle time (Phase 24.3). One event per HIGH finding; `context.file`, optional `context.line`, `context.message`, `context.provider`, `context.bypassed` (always true at emission — refused settles exit before this emission point) |

Transports (`.cadence/config.json: notify.transport`):

- `stderr` (default) — one line per event: `cadence anomaly [severity] type: message`
- `file` — NDJSON appended to `notify.file` (defaults to `.cadence/anomalies.log`); operator owns rotation
- `none` — drop on the floor
- `webhook` — POST `{events: AnomalyEvent[]}` JSON to `notify.webhook.url`. Generic bridge primitive (Slack/Discord incoming, Zapier/n8n catch, continuity-runtime ingester, ...). Optional `headers` (for Authorization) and `timeoutMs` (default 5000). Failure (non-2xx / network / timeout) degrades to one stderr warning — the URL itself is never logged (may carry a secret).

Notifier failures degrade to a single stderr warning and never block settle (or the hook). New transports plug in via the `Notifier` interface — no slack/webhook bridge is built in.

Read recorded events via `cadence status anomalies [--since <iso>] [--type <t>] [--limit <n>]` — parses `.cadence/anomalies.log` newest-first, skips malformed lines (count reported on stderr), supports filter by `AnomalyType` and an inclusive `ts >= --since` boundary (Phase 17.3 lit this up — events now stamp `ts` at emission time on both surfaces).

## 4. Phase model — LOCKED

Two axes: **tier** (phase size) × **profile** (user-involvement). Verification level is implicit per cell with explicit override flags.

### 4.1 Gate universe

| Cost | Gate |
|---|---|
| Free (always fire) | Coherence check · structural verifier **(enforcement wired Phase 39.2)** · build/test must pass **(enforcement wired Phase 39.2; config-gated on `verification.testCommand`)** |
| Cheap | DRAFT-read mtime check **(Phase 23.1)** · test-coverage proof per AC **(Phase 14)** · anomaly notify **(Phase 17)** |
| Medium | Approve gate (manual click) **(Phase 24.1)** · per-task verify **(Phase 24.2)** · code review agent **(Phase 24.3)** |
| Expensive | Independent verifier agent (`--deep`) · interactive AC verdict (`--interactive`) · plan review **(Phase 25.1)** · security audit **(Phase 25.2)** |

> **Required-skill enforcement (Phase 34.1)** is intentionally *not* a matrix cell. A phase declares `requiredSkills` (DRAFT frontmatter ∪ `config.skillAudit.required`); `settle run` refuses on a shortfall (or `--allow-skill-audit-miss`) and emits a `skill-audit-miss` anomaly **unconditionally** — distinct from the `anomaly-notify`-gated anomalies, since declaring skills is the opt-in and strict cells (which lack `anomaly-notify`) must still leave an audit trail. Closes ROADMAP open-question 23.4.

> **Plan-review convergence (Phase 35.1)** — `plan-review` (Expensive, Phase 25.1) is no longer one-shot: at `draft approve` it tracks attempts in the `<id>-PLAN-REVIEW.json` sidecar and, after `config.convergence.maxAttempts` (default 3) failing attempts, hard-escalates with an unconditional `plan-review-unconverged` anomaly (un-gated like `skill-audit-miss`, since plan-review's only cell — strict×complex — lacks `anomaly-notify`). Same gate cell; convergence changes *how it fails*, not *whether it fires*. The `nextConvergence` primitive is reusable (survey #4's settle-gate attach-point).

> **Spec stage (Phase 36.1)** — a pre-DRAFT `SPEC` loop position (`cadence spec new/check/approve`). `spec approve` runs a convergent spec-review gate (own `<id>-SPEC-REVIEW.json` sidecar) reusing the Phase 35.1 `nextConvergence` primitive verbatim; escalation emits an unconditional `spec-review-unconverged` anomaly; override `--allow-spec-review-failure` (bypasses any fail). Opt-in by use (no matrix cell); host-agnostic (cadence scaffolds+validates, the agent/human authors `SPEC.md`). The SPEC→DRAFT content auto-seed is delivered (Phase 38.1, #1b): `draft new` reads the sibling same-id `APPROVED` SPEC and pre-fills the DRAFT Objective + ACs (lossless, via a pure `renderDraftBody`; byte-identical legacy scaffold otherwise).

> **Code-review convergence (Phase 37.1)** — `code-review` (Expensive, Phase 24.3; cells strict×standard, strict×complex, standard×complex) is no longer one-shot: at `settle run` it tracks attempts in the `<id>-CODE-REVIEW.json` sidecar and, after `config.convergence.maxAttempts` (default 3, the shared Phase 35.1 knob) failing attempts, hard-escalates with an **unconditional** `code-review-unconverged` anomaly (un-gated like `skill-audit-miss`/`plan-review-unconverged`, since code-review's strict cells lack `anomaly-notify`). The sibling `code-review-high` anomaly keeps its Phase 24.3 `anomaly-notify` guard. Same gate cells; convergence changes *how it fails*, not *whether it fires*; `--force`/`--allow-code-review-failure` still bypass any fail. Reuses the `nextConvergence` primitive (third attach-point after plan-review #2 and spec-review #1) — the final v1.2 feature-expansion item.

### 4.2 Default gates per cell (deltas only; free gates always fire)

|              | **quick-fix** | **standard** | **complex** |
|---|---|---|---|
| **strict**   | DRAFT-read · approve · test-coverage · interactive settle | + per-task verify · code review | + plan review · security audit · interactive per-AC |
| **standard** | test-coverage | + DRAFT-read · approve · anomaly notify | + code review · verifier agent (`--deep` baked in) |
| **auto**     | anomaly notify | + test-coverage · anomaly notify | **CAP — soft refuse, override with `--allow-auto-complex`** |

### 4.3 Locked decisions on the matrix

| # | Question | Decision |
|---|---|---|
| M1 | Verification: own axis or implicit? | **Implicit defaults per cell + explicit `--deep` / `--interactive` flags for override.** Two axes to teach; flags for edge cases. |
| M2 | Cap shape for auto+complex? | **Soft cap.** Refuse by default; override with `--allow-auto-complex`. Tighten to notification-target cap once continuity-runtime ships. **Shipped — Phase 21.1** (both `cadence settle run` and `cadence draft approve` refuse the cell without the flag). |
| M3 | Who picks tier? | **AI proposes tier with rationale in DRAFT.** Coherence check verifies against touched-files count + AC count. User can override. Catches the AI-lowballs-to-skip-gates failure mode. |
| M4 | Profile scope — per-project or per-phase? | **Project default in config + per-phase override in DRAFT frontmatter.** Solo user sets `auto` once; bumps sensitive phases to `strict` as needed. |

### 4.4 Cap rationale

`auto + complex` is the runaway-LLM scenario: high blast radius + zero supervision. Soft cap (M2) names the risk without removing autonomy. Once the user's continuity-runtime project ships, the cap can tighten to "requires a working notification target" — making "auto" safe by construction.

## 5. Decisions locked this session

| # | Decision | Rationale |
|---|---|---|
| D1 | Project = GSD done better, not GSD-lite | Quality gates exist; speed comes from *customization*, not *omission* |
| D2 | Three user-involvement profiles (strict/standard/auto) | Captures the persona spread in real use |
| D3 | Behavioral verification mandatory, hybrid design | Structural-only is unacceptable |
| D4 | Anomaly-notify required for auto profile | Hands-off ≠ unsupervised |
| D5 | v1 = Claude Code only; Codex deprecates | Dual-host abstraction was premature. **Amended by D11 (Phase 58):** "reach beyond Claude Code" is now served by a single MCP surface, *not* by reviving per-host adapters. |
| D6 | Top-level planning doc (this file) lives outside `.cadence/` | Avoid the tool planning its own rewrite with itself |
| D7 | Name = **CADENCE** | Locked; backronym refinable |
| D8 | Tier × profile matrix locked (Section 4) | M1–M4 settled |
| D9 | Codex disposition = archive + collapse | Tag preserves; main stays clean; HostCapabilities collapsed |
| D10 | Session handoff = two engine commands (`handoff`/`resume`), not a loop phase (Phase 46) | Promotes an unowned convention (the reserved `.cadence/handoff/` dir + `state.session.lastHandoff` field) to first-class, host-agnostic commands. `resume` is **read-only by design** — live `state.json` stays authoritative, so a stale doc can never overwrite machine state. `cadence handoff` is core's **first read-only git shell-out** (`packages/core/src/handoff/git-facts.ts`, via `execFile` with fixed arg arrays, never a shell) — a deliberate new dependency direction, best-effort and non-throwing. `lastHandoff` stamping is default-on (so `resume` finds the freshest doc reliably), opt-out via `--no-stamp`. Cross-branch handoff discovery is an explicit non-goal — a host/skill concern, not the engine's. |
| D11 | MCP is a supported **third surface** on the single engine (`cadence mcp serve`, Phase 58) | CLI · Claude-Code hooks · MCP — one engine, three ways to drive it. MCP exposes the **imperative loop only** (a curated read+write tool set over **stdio**); it wraps the same service functions the CLI renders, so command-boundary gates (coherence, the settle gate stack, spec-review) run unchanged. **Ambient edit-time gates** (the `pre-tool-edit` boundary check) require host hooks and are therefore **unavailable over MCP** — the surface degrades gracefully, it does not run ungated. This is *one surface*, **not** multi-host adapter pluralism — the bespoke Claude-Code adapter stays the reference integration for ambient gating, and the D5-era anti-goal ("no multi-host complexity before single-host is solid") still holds. The MCP SDK is a lazy-loaded `core` dependency: ordinary CLI commands never load it. stdio-only by design (no HTTP/remote/auth/multi-tenancy — a future additive call). **Deepened in v1.16 (phases 75–78, additive — no new D-number):** the surface gains the two remaining MCP primitives — **Resources** (`.cadence/` artifacts under a read-on-demand `cadence://` scheme; no subscriptions) and **Prompts** (guided workflows incl. the `cadence-scout` dialogue, sourced from a shared `cadence-types` guidance module so the slash commands and MCP share one source of truth) — plus five tool-parity additions (`handoff`/`resume`/`recommendation_add`/`recommendation_promote`/`doctor`) and a `cadence mcp install` zero-config helper that non-destructively writes/merges `.mcp.json`. Still imperative-surface-only, still stdio, still no ambient gates. |
| D12 | `deep-verify` reads the actual diff (Phase 70, 2026-06-06) | The gate previously sent `diff: ''` to the AI verifier, so "deep verification" judged ACs on test-linkage + filenames only — structurally blind to the implementation, even with a real provider whose prompt demands it judge "the supplied diff." The gate now feeds the verifier the real phase diff (the memoized `git diff HEAD` already shared with `code-review`), bounded by `verifier.diffCapBytes` (default 256KB) and truncated with an explicit marker when oversized. Run-level provenance (`deepVerifyMeta`: `diffProvided`/`diffBytes`/`truncated`/`filesCount`/`provider`/`model`) is written to the SUMMARY so a verdict is auditable. The mock-fallback banner (Phase 71) now fires on the gate's real firing condition (`--deep` **or** gate-set membership), not just `--deep`, so a `standard × complex` settle never runs mock verification silently. |

## 6. Decisions deferred

| # | Item | Why deferred |
|---|---|---|
| ~~F1~~ | ~~Final profile × tier cap rules~~ | **Resolved** — see Section 4 |
| ~~F2~~ | ~~Backronym wording refinement (CADENCE is locked) + physical rename rollout (repo, packages, CLI binary)~~ | **Resolved — Phase 18.1.** Slash commands, settings, root `package.json`, state metadata, testkit fixture, install.ts legacy-eviction all on the cadence side; intentional history (DESIGN.md §8 rejected-names table, README Phase 12 banner) preserved. Backronym wording refinement is parked — the word is the keeper. |
| ~~F3~~ | ~~Codex path~~ | **Resolved — archive + collapse.** Tag current state as `keel-codex-archive`, remove `packages/host-codex/` from main, collapse `HostCapabilities` abstraction back into Claude-Code-specific code. YAGNI wins; re-add later as a fresh phase if needed. |
| ~~F4~~ | ~~Notification transport~~ | **Resolved — Phase 17 + 17.2 + 17.3 + 19.1.** Four transports shipped: `stderr` (default) / `file` (NDJSON) / `none` / `webhook` (POST JSON to any URL). Generic webhook primitive avoids baking a specific bridge into cadence — continuity-runtime / Slack / Discord / Zapier / n8n / etc. all hang off the same contract. |
| ~~F5~~ | ~~Test ↔ AC linkage convention~~ | **Resolved — Phase 14.** AC id token (`AC-N`) anywhere in a test file's contents; binary per-AC; scanner walks `verification.testGlobs` from `.cadence/config.json` (default `packages/**/*.test.ts(x)`). |
| ~~F6~~ | ~~Verifier agent shape (`--deep`)~~ | **Resolved — Phase 15.** Two providers: `mock` (deterministic, offline, linked-test rule) + `anthropic` (opt-in via `ANTHROPIC_API_KEY`, prompt-cached system prompt, Zod-typed per-AC verdicts via `messages.parse()`). |

## 7. Anti-goals

- ❌ Adding back every GSD gate (defeats the speed goal).
- ❌ Removing quality gates to chase speed (defeats the quality goal).
- ❌ Making the user read a 4-page DRAFT before every phase (defeats the auto profile).
- ❌ Trusting "tasks DONE" as proof of "AC delivered" (defeats the verification goal).
- ❌ Adding multi-host complexity before single-host is solid.

## 8. Name — LOCKED: CADENCE

### 8.1 Retired backronym (dropped 2026-06-02)

The launch placeholder backronym, kept here as a record. It is no longer used
in the README, `docs/`, or the `cadence --help` banner — it over-billed
*Notifications* (the minor `anomaly-notify` safety floor) relative to its real
weight, so it was dropped as a forced fit. The word CADENCE — the rhythm of the
loop — stands on its own (see §8.2).

**CADENCE** — **C**oordinated **A**I-**D**riven **E**ngineering with **N**otifications and **C**ustomizable **E**xecution

- *Coordinated* — the loop has structure; AI and human stay in sync
- *AI-Driven* — the AI does the typing
- *Engineering* — software engineering, not freeform chat
- *Notifications* — anomaly notify, the safety floor
- *Customizable Execution* — the three-profile system; user picks the gates

### 8.2 Why CADENCE works

- Rhythmic; suggests pace + repetition without forcing the loop framing
- Verb-friendly: "run cadence," "cadence shipped this," "open cadence"
- Tool-agnostic: doesn't lock to nautical, doesn't lock to one host
- Acronym = pure bonus; the word stands alone if the backronym ever shifts

### 8.3 Rejected / set-aside

| Name | Status | Reason |
|---|---|---|
| KEEL | retired (will rename) | Acronym overfits v0 loop-only design |
| AEGIS | strong runner-up | Slightly heavier connotation (military/protection); CADENCE feels truer to the rhythm of the work |
| HELM | strong runner-up | Tighter acronym fit but narrower metaphor; CADENCE generalizes better |

## 9. Cost of the rework

Phases already shipped on KEEL that the new design changes:

- **Phase 02 (Codex host)** + **Phase 04 (HostCapabilities)** + **Phase 09 (Codex skill codegen)** — multi-host work. ~3 phases of effort to deprecate/archive in v1.
- **Phase 06 (`settle --auto`)** — structural verifier. Replaced/wrapped by hybrid behavioral verifier.
- **Phase 10 (smoke-test fixes)** — these stay, they're orthogonal.

Roughly: 4 phases of work needs revisit. Not all is throwaway — schemas, state engine, hook dispatcher, slash-command codegen for Claude Code are all kept.

## 10. Next concrete steps

1. ~~Lock the name (CADENCE).~~ ✓
2. ~~Phase tier × profile cap matrix.~~ ✓ (Section 4)
3. ~~Codex disposition (F3).~~ ✓ (archive + collapse)
4. ~~Archive codex + collapse HostCapabilities~~ ✓ (Phase 11)
5. ~~Rename rollout~~ ✓ (Phase 12 / `v0.2.0-rc.1`)
6. **Plan + build the verifier hybrid** — in progress.
   - ~~Phase 13 — Profile system foundation~~ ✓
   - ~~Phase 14 — Test-coverage proof default verifier~~ ✓
   - ~~Phase 15 — `--deep` independent verifier agent~~ ✓
   - ~~Phase 16 — `--interactive` human-verdict mode~~ ✓
   - ~~Phase 17 — Anomaly notify transport~~ ✓
   - ~~Phase 17.2 — Hook-side detection + `status anomalies` reader~~ ✓
   - ~~Phase 17.3 — `AnomalyEvent.ts` + live `--since` filter~~ ✓
7. ~~Phase 18.1 — F2 physical rename rollout~~ ✓
8. ~~Phase 19.1 — F4 webhook transport~~ ✓
9. ~~Phase 21.1 — auto × complex soft cap (M2)~~ ✓
10. ~~Phase 23.1 — draft-read mtime gate~~ ✓
11. ~~Phase 23.2 — coherence-warn anomaly emission~~ ✓
12. ~~Phase 23.3 — loop-violation anomaly emission~~ ✓
13. ~~Phase 23.4 — skillAudit wiring (`invoked` tracking; tokenUtilization deferred)~~ ✓
14. ~~Phase 24.1 — manual approve gate (interactive Y/N at `draft approve`)~~ ✓
15. ~~Phase 24.2 — per-task verifier agent (gate at `build task --status=DONE`)~~ ✓
16. ~~Phase 24.3 — code-review verifier agent (gate at `settle run`)~~ ✓ (closes v0.5.0 medium-gate milestone)
17. ~~Phase 25.1 — plan-review verifier agent (gate at `draft approve`, strict×complex)~~ ✓
18. ~~Phase 25.2 — security-audit verifier agent (gate at `settle run`, strict×complex)~~ ✓ (closes v0.6.0 expensive-gate milestone)
19. ~~Phase 26.1 — `cadence init` UX polish (name prompt, gate-profile heuristic, post-init summary)~~ ✓
20. ~~Phase 26.2 — `CLAUDE.md` scaffold (managed-marker, `--claude-md` regenerate)~~ ✓
21. ~~Phase 26.3 — `status anomalies --tail/--follow`~~ ✓ (closes v0.7.0 operator-ergonomics milestone)
22. ~~Phase 27.1 — GitHub Actions tests-on-PR + Dependabot + lint fixes~~ ✓ (closes v0.8.0 CI milestone)
23. ~~Phase 28.1 — v1.0.0 release (version bump 0.3.0 → 1.0.0, CHANGELOG cut, annotated tag)~~ ✓ (v1.0.0 — roadmap complete)
24. ~~Phase 29.4 (F2 pulled forward) — `init` layout-detected `testGlobs`: `packages/` → workspace glob, else `**/*.test.ts(x)`; summary reports detected layout~~ ✓ (v1.1 publish-blocker from 29.1 shakedown)
25. ~~Phase 29.6 — 29.1 doc/ux remediation: F1 (`--local` install warning), F6 (init non-TTY-approve hint + README), F4 (preset/gate-profile summary disambiguation) + consolidated `29-04-REMEDIATION.md` ledger~~ ✓ (29.2/29.3 resource-blocked; 30.1 publish gate cleared of open 29.1 defects)
26. ~~Phase 30.1 — local LLM provider (OpenAI-compatible /v1/chat/completions; CADENCE_LOCAL_BASE_URL/MODEL; warn+mock fallback)~~ ✓
27. ~~Phase 30.2 — build-per-task spawn-CLI test block-timeout (2nd parallel-load flake after 29.5; v1.2 test-infra lane still deferred)~~ ✓
28. ~~Phase 29.2 — expensive-gate live exercise on Ollama `qwen3-coder:30b` (zero cloud spend; ROADMAP anthropic→local divergence documented); `29-02-EXPENSIVE.md`~~ ✓
29. ~~Phase 29.7 — 29.2 remediation: G1 (deep-verify local prompt id-binding + 2 retries), G2 (failed-provider stamp), G3 (plan-review pass-time artifact); G4 withdrawn~~ ✓ (all 5 gates live-verified on local)
30. ~~Phase 29.3 — interactive/approve TTY exercise (human-driven; `29-03-TTY.md`)~~ ✓
31. ~~Phase 29.8 — 29.3 remediation: T2 (approve-prompt feedback), T3 (`build task` id validation), T4 (interactive skip falls through to structural derivation)~~ ✓ (all 3 shakedowns now closed; publish gate clear of open shakedown defects)
32. ~~Phase 31.1 — user-guide docs/ tree (quickstart/concepts/cli/claude-code/providers + reference) + command-drift guard + slimmed README~~ ✓
33. ~~Phase 32.1 — test-infra flake root-fix: shared `vitest.shared.ts` base (`testTimeout`/`hookTimeout`/`maxForks`) + `tempRepo` rmdir retry + revert 29.5/30.2 per-test timeout band-aids (pulled the ROADMAP v1.2 test-infra lane forward; 3rd parallel-load recurrence)~~ ✓
34. ~~Phase 33.1 (ROADMAP "Phase 30.1") — publish pipeline reversible proof: metadata hardening (license/publishConfig/repository, per-pkg LICENSE/README), `scripts/publish-proof.mjs` (ephemeral verdaccio real publish + clean-install, no `workspace:` leak, both bins run, Windows-safe teardown), public `--dry-run` + tarball-clean (types 39 / core 240 / host 36 files, no src/tests/.cadence); `@manehorizons/cadence-testkit` `private`; real public publish / provenance / `release.yml` / changesets deferred to a named v1.2 public-release milestone~~ ✓
35. ~~Phase 34.1 (closes ROADMAP open-question 23.4) — required-skill enforcement: `DraftZ.requiredSkills` ∪ `config.skillAudit.required` → effective set written to `state.skillAudit.required`; settle-time check (declaration = opt-in, NOT a gate-matrix cell), inert when empty, skip+warn when telemetry off, else refuse + unconditional `skill-audit-miss` anomaly unless `--allow-skill-audit-miss`~~ ✓
36. ~~Phase 35.1 (v1.2 feature-expansion #2) — review-convergence loop primitive: pure `nextConvergence` (reusable by #4); `plan-review`@approve now bounded — attempts/history in the `<id>-PLAN-REVIEW.json` sidecar, reloop on fail, hard-escalate at `config.convergence.maxAttempts` (default 3) with an unconditional `plan-review-unconverged` anomaly, override = existing `--allow-plan-review-failure`. No state.json / gate-matrix change~~ ✓
37. ~~Phase 36.1 (v1.2 feature-expansion #1) — brainstorm→spec stage: new `SPEC` loop position + `<id>-SPEC.md` artifact + `cadence spec new/check/approve`; `spec approve` runs a convergent spec-review gate reusing Phase 35.1 `nextConvergence` + sidecar/history + unconditional `spec-review-unconverged` anomaly + `--allow-spec-review-failure` (35.1 flag semantics). Host-agnostic (scaffold+validate); SPEC→DRAFT auto-seed deferred (#1b)~~ ✓
38. ~~Phase 37.1 (v1.2 feature-expansion #4, final) — code-review convergence at settle: the Phase 24.3 `code-review` gate is no longer one-shot. It reuses the Phase 35.1 `nextConvergence` primitive verbatim — attempts + append-only `history` in a new `<id>-CODE-REVIEW.json` sidecar (`pass := no HIGH`; legacy/absent → 0), reloop on HIGH, hard-escalate at `config.convergence.maxAttempts` (default 3, shared knob) with a new **unconditional** `code-review-unconverged` anomaly. The Phase 24.3 `--force` / `--allow-code-review-failure` bypass contract is preserved verbatim (bypasses any fail; existing settle-code-review tests green). No state.json / gate-matrix change~~ ✓
39. ~~Phase 38.1 (v1.2 feature-expansion #1b — closes #1) — SPEC→DRAFT auto-seed: `cadence draft new` reads the sibling same-id `APPROVED` `<id>-SPEC.md` and pre-fills the DRAFT Objective + ACs (lossless incl. AC name) via a pure `renderDraftBody`; byte-identical legacy scaffold when no/non-APPROVED/unparseable SPEC; warn+empty fallback, never refuses. Additive `AcceptanceCriterionZ.name` (back-compat default; spec-parser & draft-parser populate it from the AC head); no state.json/config/gate change~~ ✓
40. ~~Phase 46 — session handoff/resume: two host-agnostic engine commands (`cadence handoff` write + `cadence resume` read-only replay) promote the previously-unowned `.cadence/handoff/` convention to first-class. The SESSION doc has a machine-filled zone (loop + read-only git facts + reused `runContext('handoff')` packet, correct by construction) and an empty narrative zone. `handoff` stamps `state.session.lastHandoff` by default (`--no-stamp` opts out); refuses to clobber an existing same-day doc (exit 2) without `--force`. `resume` mutates nothing (state.json byte-unchanged), prefers the `lastHandoff` pointer then globs `SESSION-*.md`, and prints a drift note when the doc's loop position ≠ live state. `git-facts.ts` is core's first read-only git shell-out (`execFile`, fixed arg arrays); cross-branch discovery left to the host/skill layer (non-goal). +2 Claude Code slash commands (9 → 11). See D10~~ ✓
41. ~~Phase 58 — MCP server surface (`cadence mcp serve`): a third surface on the single engine (CLI · Claude-Code hooks · MCP) so any MCP-capable host can drive the loop over **stdio** with no bespoke adapter. The 10 curated commands (`progress`/`status`/`recommend` read; `draft new/check/approve`, `build task`, `settle`, `spec new/approve` write) had their logic factored into pure `*Service(repoRoot, args, io)` functions under `packages/core/src/services/`; the CLI action wires `io` to the process streams (byte-identical output — all prior tests green), the MCP tool handler wires it to buffers and serializes structured `data`. Excludes `init`/`config`/`doctor`/`install`/`handoff`/`resume`. Command-boundary gates run unchanged; ambient edit-time gates need host hooks (unavailable over MCP). `@modelcontextprotocol/sdk` is a **lazy-loaded** `core` dep (proven off the CLI hot path via a `module.register` load probe). MCP tests use the SDK in-memory transport against a testkit ephemeral repo. No new package; `core` minor bump. See D11~~ ✓

Sequencing rationale: remove dead surface before rename (smaller rename); rename before verifier (verifier born in correct namespace).

### Publish pipeline (v1.1 — reversible proof)

Three packages publish: `@manehorizons/cadence-core`, `@manehorizons/cadence-types`, `@manehorizons/cadence-host-claude-code`. `@manehorizons/cadence-testkit` is `private` (dev-only test tooling — nothing runtime-depends on it). Each publishable package carries `license:"MIT"`, `publishConfig.access:"public"`, a `repository` block, and its own `LICENSE`/`README`. The path is proven **reversibly** by `scripts/publish-proof.mjs`: it stands up an ephemeral local verdaccio (anonymous publish, npmjs uplink for transitive deps), runs a real `pnpm publish` of the three (which rewrites `workspace:*` → the concrete version — raw `npm publish` would not), installs them into a clean dir, asserts no `workspace:` survives and both bins (`cadence`, `cadence-host-claude-code`) execute, then tears the verdaccio process tree + all OS-temp down unconditionally. A public `pnpm publish --dry-run` + `npm pack --json` inspection prove the public-npm shape (tarballs = `dist`/`bin`/`package.json`/`LICENSE`/`README` only). No non-localhost registry is ever contacted for publish.

**Deliberately deferred to a named v1.4 "Public release" milestone** (see ROADMAP): the real public-npm publish, npm provenance (requires the source repo be public — a conscious repo-visibility decision), `.github/workflows/release.yml` gated on `ci-success`, changesets adoption, and re-deciding whether `@manehorizons/cadence-testkit` ever publishes. The v1.1 boundary is "prove the path without irreversible action."

## 11. Telemetry

`state.skillAudit.invoked: string[]` records which cadence skills the user has invoked during the active session (Phase 23.4). Wiring:

- Claude Code's `Skill` tool fires `PostToolUse` with `tool_name === 'Skill'` and `tool_input.skill === '<name>'`.
- The host shim maps it to the `'skill-invoke'` abstract event and forwards the skill name via `ctx.raw.skill`.
- The dispatcher routes `'skill-invoke'` to `handleSkillInvoke` which appends to `state.skillAudit.invoked` when `config.telemetry.skillInvocations === true`.
- Dedup: a skill is recorded at most once per session. Cap: array is bounded at 100 entries with FIFO eviction.
- `cadence status --json` surfaces the populated array.

`tokenUtilization` real-signal wiring is deferred — host payload shape varies across Claude Code versions; a separate phase scopes the investigation. Current behavior: `handleUserPrompt` increments by `+0.01` per user-prompt event (proxy, not a real signal).

`state.skillAudit.required[]` semantics (the list of skills the user *expects* to invoke each session, with a `skill-audit-miss` anomaly when one is absent at SessionStop) are also deferred.

## 12. Observability (operational logging)

Operational logging is **distinct** from §11 telemetry: telemetry tracks *user behavior*
(`skillAudit`), whereas observability is *operator-facing diagnostics* for why CADENCE itself did
something. Shipped in the v1.17 milestone (phases 80–82, the Post-v1.0 "structured logging" vector).

Locked decisions:

- **Zero runtime dependency.** A homegrown logger in `cadence-core` (`src/logging/`), with the
  `LogLevel`/`LogFormat`/`LogRecord` types in `cadence-types`. No `pino`/`debug` — fits the lean-deps
  + verifiable-claims bar and works identically across CLI, subprocess-hook, and MCP-stdio runtimes.
- **Default-off.** Default level is `silent`; the logger emits nothing unless `CADENCE_LOG_LEVEL`
  or `config.logging.level` raises it. Existing output and golden fixtures are unaffected by construction.
- **stderr-only.** Records are written exclusively to stderr — load-bearing because `cadence mcp
  serve` owns stdout as the MCP protocol channel and `--json` output must stay clean on stdout.
- **Additive instrumentation.** Three seams emit via `getLogger().child({ seam })`: `gate` (settle
  gate decisions), `hook` (lifecycle event dispatch), `verify` (AI verifier calls, incl. token
  usage). No diagnostic `console.*` existed at these seams to migrate; the `host.ts`/`hook` context
  payload remains the intentional stdout contract. Secret material (verifier auth headers, API keys,
  webhook URLs) is never logged.
- **Control precedence: env > config > default.** `CADENCE_LOG_LEVEL`/`CADENCE_LOG_FORMAT` override
  `config.logging.{level,format}`, which override the `silent` / TTY-derived defaults.

Deferred (still Post-v1.0): state-transition logging, OpenTelemetry / OTLP export (the logger leaves
a clean extension point for an exporter without re-plumbing call sites), and an audit NDJSON sink.

## 13. Worktree safety (phase-collision guard)

CADENCE's loop state is file-based and lives in the working tree, and git worktrees each hold a
private `.cadence/`. Two worktrees branched from one commit independently conclude "phase N is next";
with different slugs (`30-auth` vs `30-cache`) git silently merges both in — two phase Ns, no
conflict marker. Shipped in the v1.18 milestone (phases 83–84).

Locked decisions:

- **Observe ground truth, not a reservation registry (Approach A over B).** Phase-number uniqueness
  is enforced by *observing* sibling worktrees (`git worktree list`) + the upstream ref
  (`origin/<integrationRef>`), not by reserving numbers in a parallel allocation registry. The
  worktree list IS the registry; the phase dirs ARE the claims. Rationale: no parallel state to drift
  out of sync, and it degrades gracefully offline / in a non-git checkout. A reservation registry
  (reserve a number before the dir exists) was considered and rejected as the wrong weight for the
  problem — the scaffold guard + settle backstop cover the collision without it.
- **Refuse + suggest, never auto-renumber.** On collision the guard fails loud, names what is taken
  and where, and suggests the next free number (`max(observed) + 1`, monotonic — not lowest-gap). It
  never silently changes the number you asked for. `--allow-phase-collision` bypasses per run.
- **Scaffold-time primary, settle backstop secondary.** Refuse at `spec new` / `draft new` before
  work begins; re-check at `settle run` to catch a scaffold-race. The backstop is a `settleService`
  precondition, **not** a profile×tier gate-matrix cell — it is a cross-cutting safety check.
- **Self is identified by source, not number.** The collision authority is the `sibling` + `upstream`
  sources. The `local` source (this worktree's own dirs) is excluded from conflict matching — at
  scaffold time the dir is being created; at settle the active phase *is* local. (Self and a genuine
  same-number sibling share the number, so a number-based self-exclusion would also hide the sibling
  — exclusion must be by source.) Local still feeds the `next free` computation.
- **Best-effort, default-on, additive.** Any git/fs failure on a source contributes nothing and never
  throws; the only hard failure is an actual detected collision. Pure `detectPhaseCollision` +
  impure `gatherOccupancy` mirror the repo's pure-seam split. The existing local same-directory
  `existsSync` refusal is untouched and is never bypassed by the flag.

Deferred (clean additive follow-ups): a `cadence doctor` read-only cross-worktree phase-usage line;
proactive next-free allocation in `progress`/`recommend`; lowest-gap (vs `max + 1`) numbering.
