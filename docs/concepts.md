# CADENCE Concepts

This page is the conceptual spine of the CADENCE user guide. Everything else
in `docs/` builds on the vocabulary defined here.

**CADENCE** — *Coordinated AI-Driven Engineering with Notifications and
Customizable Execution* — is a plan/build/settle framework for AI-assisted
development. The goal is GSD-grade discipline with far less wall-clock cost,
achieved by letting you choose which quality gates fire for each phase of work.

---

## Table of contents

- [The loop](#the-loop)
- [Two-commit convention](#two-commit-convention)
- [Profiles × tiers](#profiles--tiers)
- [The gate universe](#the-gate-universe)
- [Providers](#providers)

---

## The loop

Every unit of work in CADENCE moves through three loop positions:

```
IDLE → DRAFT → BUILD → SETTLE → IDLE
```

### DRAFT

You (or the AI) write a structured plan file — the **DRAFT** — that proposes:

- What will change (`files:` list per task)
- What success looks like (acceptance criteria `AC-N`)
- How large the work is (`tier:`, discussed below)
- Which profile should apply (optional override)

CADENCE coherence-checks the DRAFT against the project's AC log and touched-file
boundaries, then advances to BUILD once you (or the gate set) approve it.

**Phase artifact:** `.cadence/phases/<phase>/<id>-DRAFT.md`

### BUILD

The AI executes tasks one by one. Each task is declared DONE (or BLOCKED /
NEEDS\_CONTEXT) via `cadence build task <id> --status=DONE`. Depending on the
gate set, marking a task DONE may trigger the per-task verifier before accepting
the status.

Progress is persisted continuously so the loop survives session restarts.

**Phase artifact:** `.cadence/phases/<phase>/<id>-PROGRESS.json`

### SETTLE

`cadence settle run` closes out the phase. It:

1. Runs the gate set checks (test-coverage, deep-verify, interactive verdict,
   code-review, security-audit — whichever the active profile × tier cell
   enables).
2. Emits anomaly events for anything worth surfacing.
3. Writes the SUMMARY pair and resets state to IDLE.

**Phase artifacts:**
- `.cadence/phases/<phase>/<id>-SUMMARY.json` — machine-readable full record
- `.cadence/phases/<phase>/<id>-SUMMARY.md` — human-readable rendered view
- `.cadence/phases/<phase>/<id>-PLAN-REVIEW.json` — plan-review findings
  (written at `draft approve` when `plan-review` fires)

### State files

Two state files are always present and regenerated on every state write:

| File | Purpose |
|---|---|
| `.cadence/state.json` | Machine-readable loop state (loop position, active draft, task, tier, …) |
| `.cadence/STATE.md` | Derived human-readable view — do not edit by hand |

The `.cadence/shakedown/` directory is used for hand-crafted exercise notes
(e.g. live gate exercises, TTY verification reports). It is not managed by the
engine.

---

## Two-commit convention

A completed phase produces exactly two commits, in order:

| Commit | Prefix | Contents |
|---|---|---|
| Feature commit | `feat:` / `docs:` / `fix:` etc. | Source changes, tests, and documentation |
| Settle commit | `chore: settle` | Phase artifacts (`-DRAFT.md`, `-PROGRESS.json`, `-SUMMARY.*`, `-PLAN-REVIEW.json`, `STATE.md`, `state.json`) |

**Why the split?** Keeping artifacts out of the feature commit means `git log
--no-merges` stays readable, blame on source files is uncontaminated by
mechanical state writes, and CI diffs are scoped to code. The settle commit is a
single atomic record of the gate outcomes, making audit straightforward.

The split is enforced by CADENCE's own dogfooding process (the framework uses
the convention on itself), not by a mechanical hook — you own the two commits.

See `docs/cli.md` for the commands that drive each step.

---

## Profiles × tiers

Two axes control how much gate-work fires per phase.

### Profiles (user-involvement axis)

Set project-wide in `.cadence/config.json` (`profile`) or overridden
per-phase in DRAFT frontmatter.

| Profile | Posture |
|---|---|
| `strict` | Full control — every step is a checkpoint |
| `standard` | Major-step gating — approve at DRAFT + settle verify |
| `auto` | Hands-off — the AI drives; anomalies surface automatically |

### Tiers (phase-size axis)

The AI proposes a tier in the DRAFT frontmatter; the coherence check
verifies it against the task count and touched-file count.

| Tier | Typical scope |
|---|---|
| `quick-fix` | ≤ 1 task, ≤ 1 file |
| `standard` | ≤ 5 tasks, ≤ 8 files |
| `complex` | ≥ 6 tasks, any number of files |

### Gate matrix (deltas — always-fire gates not shown)

The table below shows which **delta gates** are added on top of the three
always-fire gates for each profile × tier cell. Source of truth:
`packages/core/src/gates/engine.ts` `DELTAS` constant.

| | `quick-fix` | `standard` | `complex` |
|---|---|---|---|
| **strict** | `draft-read` · `approve` · `test-coverage` · `interactive-verdict` | + `per-task-verify` · `code-review` | + `plan-review` · `security-audit` |
| **standard** | `test-coverage` | + `draft-read` · `approve` · `anomaly-notify` | + `code-review` · `deep-verify` |
| **auto** | `anomaly-notify` | + `test-coverage` | **soft cap** (see below) |

> **Reading the table:** each cell lists gates *added on top of the previous
> tier in that profile row* via the `+` prefix. (`engine.ts` stores the full
> flat gate list per cell; this table shows the increment for readability —
> the effective set is cumulative.)

### `auto × complex` soft cap

The `auto × complex` cell is soft-capped: CADENCE refuses to approve or settle
by default because it represents high blast-radius work with zero human
supervision. Pass `--allow-auto-complex` to override. The same gate set as
`auto × standard` fires when the cap is bypassed.

The cap is implemented as `softCap: true` in the `GateSet` return value from
`gatesFor('complex', 'auto')` in `engine.ts`.

---

## The gate universe

CADENCE has **13 gates** in total: 3 that always fire and 10 delta gates grouped
by cost band. Gate names are the canonical strings from `GateZ` in
`packages/types/src/profile.ts`.

### Always-fire gates (free)

These run on every phase regardless of profile or tier.

| Gate | What it checks | Bypass flag |
|---|---|---|
| `coherence-check` | DRAFT frontmatter consistency — tier vs task/file counts, AC format, loop position | — |
| `structural-verifier` | All tasks are in a terminal state (DONE / DONE\_WITH\_CONCERNS / NEEDS\_CONTEXT / BLOCKED); a `PENDING`/`IN_PROGRESS` task refuses settle (wired Phase 39.2) | `--allow-open-tasks` or `--force` (on `settle run`) |
| `build-test-must-pass` | When `verification.testCommand` is configured, settle runs it and refuses on a non-zero exit (wired Phase 39.2). With no `testCommand` set, the gate is evaluated but cannot enforce — it passes silently | `--allow-failing-build` or `--force` (on `settle run`) |

### Delta gates

#### Cheap

| Gate | When it fires | Bypass flag |
|---|---|---|
| `draft-read` | Settle refuses if `DRAFT.md` was modified after `draft approve` (mtime check) | `--allow-stale-draft` (on `settle run`) |
| `test-coverage` | Each AC must have at least one test file that contains the token `AC-N` anywhere in its text | `--allow-missing-coverage` (on `settle run`) |
| `anomaly-notify` | Emit anomaly events (blocked tasks, out-of-boundary edits, coherence warns, loop violations, …) via the configured transport | No bypass — transport failures degrade gracefully |

#### Medium

| Gate | When it fires | Bypass flag |
|---|---|---|
| `approve` | Interactive Y/N prompt at `cadence draft approve`; CI/non-TTY must pass flag | `--no-approve` (on `draft approve`) |
| `per-task-verify` | AI verifier runs at `cadence build task <id> --status=DONE`; `refuse` verdict blocks the status write | `--allow-per-task-failure` (on `build task`) |
| `code-review` | AI code-review agent runs at `cadence settle run`; HIGH-severity findings refuse settle | `--allow-code-review-failure` or `--force` (on `settle run`) |

#### Expensive

| Gate | When it fires | Bypass flag |
|---|---|---|
| `deep-verify` | Independent AI verifier runs at settle (`--deep` or baked in for `standard × complex`); per-AC `pass=false` refuses settle | `--force` or `--allow-verifier-failure` for transport errors (on `settle run`) |
| `interactive-verdict` | Human walks each AC at settle (`--interactive`); `fail` verdict refuses settle | `--no-interactive` to opt out; `--force` to settle past failures |
| `plan-review` | AI plan-review agent runs at `cadence draft approve` (strict × complex only); `pass=false` refuses approve | `--allow-plan-review-failure` (on `draft approve`) |
| `security-audit` | AI security-audit agent runs at `cadence settle run` after code-review (strict × complex only); CRITICAL findings refuse settle | `--allow-security-audit-failure` or `--force` (on `settle run`) |

### Gate bypass reference summary

| Flag | Command | Gate bypassed |
|---|---|---|
| `--allow-stale-draft` | `settle run` | `draft-read` |
| `--allow-missing-coverage` | `settle run` | `test-coverage` |
| `--no-approve` | `draft approve` | `approve` |
| `--allow-per-task-failure` | `build task` | `per-task-verify` |
| `--allow-code-review-failure` | `settle run` | `code-review` |
| `--allow-plan-review-failure` | `draft approve` | `plan-review` |
| `--allow-security-audit-failure` | `settle run` | `security-audit` |
| `--allow-verifier-failure` | `settle run` | `deep-verify` transport errors |
| `--force` | `settle run` | `deep-verify` / `interactive-verdict` / `code-review` / `security-audit` (all at once) |
| `--no-interactive` | `settle run` | `interactive-verdict` (opt-out, not failure bypass) |
| `--allow-auto-complex` | `draft approve` / `settle run` | `auto × complex` soft cap |

---

## Providers

Each gate that calls an AI verifier delegates to a **provider**. Three providers
are available:

| Provider | Description | Requires |
|---|---|---|
| `mock` | Deterministic offline implementation; no network call | Nothing — works everywhere |
| `anthropic` | Calls the Anthropic API; prompt-cached system prompt | `ANTHROPIC_API_KEY` in environment |
| `local` | OpenAI-compatible `/v1/chat/completions` endpoint (e.g. Ollama) | `CADENCE_LOCAL_BASE_URL` + `CADENCE_LOCAL_MODEL`; falls back to `mock` with a warning if unset |

Providers are configured per gate in `.cadence/config.json` (e.g.
`verifier.provider`, `perTaskVerifier.provider`, `codeReview.provider`,
`planReview.provider`, `securityAudit.provider`). Each gate also accepts an
optional `model` override.

Provider selection, fallback behavior, and per-gate configuration are covered
in detail in [docs/providers.md](providers.md).

---

*Next: [docs/reference/config.md](reference/config.md) — full configuration
reference | [docs/reference/commands.md](reference/commands.md) — command
reference | [docs/cli.md](cli.md) — how-to guide*
