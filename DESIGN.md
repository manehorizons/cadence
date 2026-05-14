# Project Design — CADENCE

> **Name:** CADENCE — *Coordinated AI-Driven Engineering with Notifications and Customizable Execution*. Locked as of Phase 12 / `v0.2.0-rc.1` (2026-05-14). Backronym is refinable; the word CADENCE itself is the keeper. Historical KEEL phase artifacts under `.keel/phases/` remain by design (transition narrative).

> Living design document. Captures intent, decisions, deferrals.
> Lives at repo root, **outside** `.keel/`, so the tool isn't planning itself with itself.

**Last updated:** 2026-05-14

---

## 1. What this project is

A **customizable, AI-assisted development framework** that lets a user dial in how much they want to drive vs. how much the AI drives — without giving up the quality gates that make AI-generated work trustworthy.

Inspired by GSD (Get Shit Done) and PAUL (Plan-Apply-Unify Loop). Intended as a **faster, more efficient, more customizable** alternative to GSD — *not* a lighter one. The gates exist; the user picks which ones fire.

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

Today's KEEL behavior = `auto` without the notify part. That gap is the highest-priority bug.

### 3.2 Behavioral verification (hybrid)

`settle` must answer "does the built code actually do what the AC promised in plain English?" — not just "are tasks marked DONE?"

Hybrid implementation:

1. **Default** — structural (current `--auto`) **+** test-coverage proof. Each AC must have ≥1 test that references it.
   - **Convention (locked in Phase 14):** the AC id token (`AC-N`) must appear somewhere in a test file's contents. Typical placement: inside `describe()` or `it()` strings, but any occurrence (even a comment) counts. The gate is binary per AC: at-least-one-linked-test or refuse.
   - **Scanner:** walks `verification.testGlobs` from `.cadence/config.json` (defaults: `packages/**/*.test.ts(x)`). Whole-file text search via `/\bAC-\d+\b/g`; per-file deduplication.
   - **Bypass per-invocation:** `cadence settle run --allow-missing-coverage` skips the check entirely. Explicit `--ac AC-1=pass:note` overrides bypass the gate for that AC only.
2. **`--deep`** — spawn an independent verifier (Phase 15, shipped). Two providers via `config.verifier.provider`: `mock` (default, deterministic linked-test rule, offline) and `anthropic` (opt-in via `ANTHROPIC_API_KEY`; uses `messages.parse()` with a Zod schema for per-AC verdicts; system prompt is prompt-cached). Refuses to settle on any non-overridden AC the verifier marks `pass=false` unless `--force`. Transport failures gated by `--allow-verifier-failure`. Per-AC results recorded into `SUMMARY.json deepVerify`.
3. **`--interactive`** — shipped in Phase 16. Walks each AC sequentially with its given/when/then text + linked test refs + touched files, prompts the user for `pass | fail | skip` plus an optional note. Pass/fail verdicts win over structural/deep derivation; skip falls through. Per-AC results recorded into `SUMMARY.json interactiveVerify`. Refuses on TTY-less invocations unless `--no-interactive` bypasses; tests drive the walker via `CADENCE_PROMPTER_SCRIPT` env var seam.

### 3.3 Anomaly notification (for `auto` profile) — shipped (Phase 17 + 17.2)

Two emission surfaces share one `Notifier` transport:

1. **Settle-side (Phase 17.1)** — `collectAnomalies(...)` walks the settle context and dispatches a batch through `selectNotifier(config)` at SETTLE close.
2. **Hook-side (Phase 17.2)** — `handlePreToolEdit` detects `files-outside-boundary` at edit time and dispatches one event per outside path *as the edit is about to happen*. Detection-only — the hook never refuses the edit.

Both surfaces gate on `'anomaly-notify'` being in the effective gate set (auto + standard×{standard,complex} cells). Each event carries `ts: ISO8601` (offset-aware, emitter-stamped via `new Date().toISOString()` — Phase 17.3). Six event types:

| Type | When |
|---|---|
| `ac-blocked` | A task ended `BLOCKED` |
| `ac-needs-context` | A task ended `NEEDS_CONTEXT` |
| `coverage-bypassed` | `--allow-missing-coverage` flipped an active test-coverage gate |
| `files-outside-boundary` | A touched file is not in any task's declared `files:` list (settle-time reconciliation OR hook-time per-edit detection) |
| `verifier-failure` | The `--deep` verifier transport itself failed |
| `force-used` | `--force` bypassed at least one failing structural / deep / interactive verdict |

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
| Free (always fire) | Coherence check · structural verifier · build/test must pass |
| Cheap | DRAFT-read mtime check · test-coverage proof per AC · anomaly notify |
| Medium | Approve gate (manual click) · per-task verify · code review agent |
| Expensive | Independent verifier agent (`--deep`) · interactive AC verdict (`--interactive`) · plan review · security audit |

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
| M2 | Cap shape for auto+complex? | **Soft cap.** Refuse by default; override with `--allow-auto-complex`. Tighten to notification-target cap once continuity-runtime ships. |
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
| D5 | v1 = Claude Code only; Codex deprecates | Dual-host abstraction was premature |
| D6 | Top-level planning doc (this file) lives outside `.keel/` | Avoid using KEEL to plan KEEL's rewrite |
| D7 | Name = **CADENCE** | Locked; backronym refinable |
| D8 | Tier × profile matrix locked (Section 4) | M1–M4 settled |
| D9 | Codex disposition = archive + collapse | Tag preserves; main stays clean; HostCapabilities collapsed |

## 6. Decisions deferred

| # | Item | Why deferred |
|---|---|---|
| ~~F1~~ | ~~Final profile × tier cap rules~~ | **Resolved** — see Section 4 |
| ~~F2~~ | ~~Backronym wording refinement (CADENCE is locked) + physical rename rollout (repo, packages, CLI binary)~~ | **Resolved — Phase 18.1.** Slash commands, settings, root `package.json`, state metadata, testkit fixture, install.ts legacy-eviction all on the cadence side; intentional history (DESIGN.md §8 rejected-names table, README Phase 12 banner) preserved. Backronym wording refinement is parked — the word is the keeper. |
| ~~F3~~ | ~~Codex path~~ | **Resolved — archive + collapse.** Tag current state as `keel-codex-archive`, remove `packages/host-codex/` from main, collapse `HostCapabilities` abstraction back into Claude-Code-specific code. YAGNI wins; re-add later as a fresh phase if needed. |
| ~~F4~~ | ~~Notification transport~~ | **Resolved — Phase 17 + 17.2 + 17.3 + 19.1.** Four transports shipped: `stderr` (default) / `file` (NDJSON) / `none` / `webhook` (POST JSON to any URL). Generic webhook primitive avoids baking a specific bridge into cadence — continuity-runtime / Slack / Discord / Zapier / n8n / etc. all hang off the same contract. |
| F5 | Test ↔ AC linkage convention | Likely: AC id token in test name/describe; needs implementation spike |
| F6 | Verifier agent shape (`--deep`) | Model choice, prompt design, token budget |

## 7. Anti-goals

- ❌ Adding back every GSD gate (defeats the speed goal).
- ❌ Removing quality gates to chase speed (defeats the quality goal).
- ❌ Making the user read a 4-page DRAFT before every phase (defeats the auto profile).
- ❌ Trusting "tasks DONE" as proof of "AC delivered" (defeats the verification goal).
- ❌ Adding multi-host complexity before single-host is solid.

## 8. Name — LOCKED: CADENCE

### 8.1 Current backronym (placeholder, refinable)

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

Sequencing rationale: remove dead surface before rename (smaller rename); rename before verifier (verifier born in correct namespace).
