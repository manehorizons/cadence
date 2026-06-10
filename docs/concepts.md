# CADENCE Concepts

This page is the conceptual spine of the CADENCE user guide. Everything else
in `docs/` builds on the vocabulary defined here.

**CADENCE** — named for the rhythm of its core DRAFT → BUILD → SETTLE loop — is
a draft/build/settle framework for AI-assisted development. The goal is GSD-grade
discipline with far less wall-clock cost, achieved by letting you choose which
quality gates fire for each phase of work.

One engine drives everything below; you reach it through three surfaces — the
**CLI** (`cadence …`), the **Claude Code adapter** (lifecycle hooks + slash
commands, the only surface with *ambient* edit-time gates), and an **MCP server**
(`cadence mcp serve`, for any MCP host). The concepts here apply to all three.
See [the user guide](README.md#three-surface-model) and [docs/mcp.md](mcp.md).
The adapter shape itself is a versioned contract — see
[Write your own adapter](host-adapters.md).

---

## Table of contents

- [The loop](#the-loop) (incl. the optional [SPEC](#spec-optional) stage)
- [Two-commit convention](#two-commit-convention)
- [Profiles × tiers](#profiles--tiers)
- [The gate universe](#the-gate-universe)
- [Providers](#providers)
- [The Praxis layer](#the-praxis-layer) — strategic intelligence that feeds the loop
- [Observability](#observability)
- [Worktrees & the single-writer assumption](#worktrees--the-single-writer-assumption)

---

## The loop

Every unit of work in CADENCE moves through three core loop positions, with an
optional pre-DRAFT **SPEC** stage:

```
IDLE → [SPEC] → DRAFT → BUILD → SETTLE → IDLE
```

### SPEC (optional)

SPEC is an opt-in stage that runs *before* DRAFT. When you want to lock down
*what* a phase delivers before planning *how*, `cadence spec new` (IDLE→SPEC)
scaffolds a `<id>-SPEC.md` — an objective, acceptance criteria, constraints, and
open questions. You (or the AI) author it; `cadence spec check` is a read-only
structural sanity check (objective present + ≥1 AC).

`cadence spec approve` runs a **convergent spec-review gate** (described in the
gate universe below) and, on pass, marks the spec `APPROVED` and returns to IDLE
so the normal `draft new` proceeds. When an approved SPEC of the same id is
present, `cadence draft new` seeds the DRAFT's objective and acceptance criteria
from it rather than scaffolding an empty draft.

If you skip SPEC, the loop starts at DRAFT exactly as before — nothing requires
a spec.

**Phase artifact:** `.cadence/phases/<phase>/<id>-SPEC.md`

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

### Session continuity (handoff / resume)

`cadence handoff` and `cadence resume` are loop-**adjacent** — a continuity
capability, *not* a loop phase. Machine state (loop position, active draft,
tasks, decisions) already persists in `state.json` and survives session
restarts, so a fresh session never needs that state "restored." What gets lost
between sessions is the **narrative**: what landed and why, what is half-done,
the gotchas, the next-action reasoning. `cadence handoff` captures that narrative
in a `.cadence/handoff/SESSION-<date>.md` doc with the machine facts pre-filled
(so they are never stale or wrong), and `cadence resume` replays the freshest
doc read-only alongside live state. See
[docs/reference/commands.md — handoff](reference/commands.md#handoff) and
[resume](reference/commands.md#resume).

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
| `deep-verify` | Independent AI verifier runs at settle (`--deep` or baked in for `standard × complex`); it is sent the actual phase diff (`git diff HEAD`, capped by `verifier.diffCapBytes`) plus the ACs and linked tests, so it judges the implementation, not just test-linkage; per-AC `pass=false` refuses settle | `--force` or `--allow-verifier-failure` for transport errors (on `settle run`) |
| `interactive-verdict` | Human walks each AC at settle (`--interactive`); `fail` verdict refuses settle | `--no-interactive` to opt out; `--force` to settle past failures |
| `plan-review` | AI plan-review agent runs at `cadence draft approve` (strict × complex only); `pass=false` refuses approve | `--allow-plan-review-failure` (on `draft approve`) |
| `security-audit` | AI security-audit agent runs at `cadence settle run` after code-review (strict × complex only); CRITICAL findings refuse settle | `--allow-security-audit-failure` or `--force` (on `settle run`) |

### Stage-scoped gates (outside the profile × tier matrix)

The 13 gates above are the profile × tier universe. A few **stage-scoped**,
provider-backed review gates fire at a specific loop transition regardless of
the active cell — they are deliberately *not* matrix cells because the stage
itself (or the relevant tier) is the opt-in. `plan-review` (above) is one such
gate; `spec-review` is the other.

| Gate | When it fires | Bypass flag |
|---|---|---|
| `spec-review` | Convergent AI spec-review runs at `cadence spec approve`; `pass=false` re-loops up to `convergence.maxAttempts`, then refuses approve | `--allow-spec-review-failure` (on `spec approve`) |

`spec-review` reuses the same convergence primitive as `plan-review` and is
configured per provider in `.cadence/config.json` under the `specReview` key
(providers `mock` / `anthropic` / `local`, with an optional `model` override).
Because the SPEC stage is itself optional, `spec-review` never fires unless you
choose to run `cadence spec approve`.

### Gate bypass reference summary

| Flag | Command | Gate bypassed |
|---|---|---|
| `--allow-stale-draft` | `settle run` | `draft-read` |
| `--allow-missing-coverage` | `settle run` | `test-coverage` |
| `--no-approve` | `draft approve` | `approve` |
| `--allow-per-task-failure` | `build task` | `per-task-verify` |
| `--allow-code-review-failure` | `settle run` | `code-review` |
| `--allow-plan-review-failure` | `draft approve` | `plan-review` |
| `--allow-spec-review-failure` | `spec approve` | `spec-review` |
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

Every gate defaults to `mock`, so a fresh project does **no** real AI
verification until you switch a provider on. The guided one-command way is
`cadence activate` (v1.22), which writes `verifier.provider`, validates your key
with a live check, and never persists the key; `cadence doctor`'s
`verification-readiness` check reports whether real verification is actually
wired. Provider selection, fallback behavior, and per-gate configuration are
covered in detail in [docs/providers.md](providers.md).

---

## The Praxis layer

Everything above is the **execution loop** — the cycle that does the work and
mutates loop state. CADENCE has a second, independent layer: **Praxis**, the
strategic-intelligence layer that decides *what is worth doing* and feeds the
loop, without ever touching loop state.

The two layers are deliberately decoupled. Praxis is **read-narrow**: it reads
the repo and the loop's state but writes only its own records. The loop never
reads or writes Praxis. They meet at exactly one seam, described at the end of
this section.

All Praxis records live under `.cadence/intelligence/` as versioned JSON, each
with an auto-generated Markdown render for humans.

### The ledger

The **intelligence ledger** is the persistent home for Praxis records — five
versioned subject ledgers, plus derived outputs:

| File | Holds |
|---|---|
| `recommendations.json` → `RECOMMENDATIONS.md` | Recommendations |
| `evidence.json` | Evidence (no Markdown render) |
| `assumptions.json` → `ASSUMPTIONS.md` | Assumptions |
| `decisions.json` → `DECISIONS.md` | Decisions |
| `milestones.json` → `MILESTONES.md` | Milestones |
| `recommend.json` → `RECOMMEND.md` | The latest recommend report (derived) |
| `inspection.json` → `STRATEGY.md` | The latest inspection (derived) |
| `context/<scope>.{json,md}` | Context packets |

### Recommendation

A **recommendation** (rec) is the central Praxis record: a scored, free-floating
change candidate. It carries three orthogonal lifecycle facets:

- **status** — `candidate` → `accepted` → then `deferred` | `rejected` |
  `converted`. The operator-driven disposition.
- **readiness** — a maturity gate: `raw-idea` → `needs-evidence` →
  `needs-decision` → `ready-for-milestone` → `ready-for-cadence-spec`, or
  `blocked`. How close the idea is to being actionable.
- **decay state** — *auto-derived* truth/time erosion: `fresh`, `aging`,
  `stale`, `superseded` (a newer rec contradicts it), `contradicted` (a tied
  assumption was rejected or a tied decision rescinded), `needs-revalidation`.

A rec is also scored (priority, leverage, risk, confidence) — those scores drive
the recommend report's ranking.

### Evidence, assumptions, decisions

Recs are backed and constrained by three tied record types:

- **Evidence** — backing material, of kind `file` / `command` /
  `cadence-artifact` / `note`. Always tied to a rec.
- **Assumption** — a stated belief that constrains a rec's validity. Always
  tied to a rec. Lifecycle: `open` → `validated` | `rejected` (reopenable).
  Rejecting an assumption can push its rec's decay state to `contradicted`.
- **Decision** — an architectural choice, *optionally* tied to a rec (untied
  decisions are valid). Decisions form a **supersession graph**: `active` →
  `superseded` (replaced by a newer decision) | `rescinded` (invalidated with
  no replacement), and back via `reactivate`. `cadence decision graph <id>`
  walks the chain.

### Milestone

A **milestone** clusters one or more `ready-for-milestone` /
`ready-for-cadence-spec` recs destined for a single CADENCE phase. Lifecycle:
`proposed` (clustered automatically; ephemeral) → `accepted` (persisted) →
`exported` (a SPEC scaffold staged) | `deferred` | `closed`.

Each milestone carries an operator-owned **pre-mortem** — likely failure modes,
hidden dependencies, drift risks, and explicit out-of-scope — that is never
auto-derived. `cadence milestone export <id> --to cadence` renders a
deterministic SPEC scaffold from the milestone's facts and stages it under
`exports/`; it does **not** run `cadence spec new` and never allocates a loop
id. Staging and entering the loop stay separate, deliberate steps.

### Reading the ledger: recommend, inspect, context packets

Three read-only views turn the ledger into something actionable:

- `cadence recommend` produces the **recommend report** — partitions the ledger
  (excludes rejected/converted; surfaces superseded/contradicted as
  `needsAttention`; parks deferred; ranks the rest with a transparent 0–100
  score) and derives a loop-aware **advisory**: `finish-loop` (a phase is in
  flight), `top-recommendation`, `spec-new` (top rec is ready for a spec), or
  `empty`.
- `cadence inspect` produces the **inspection** — a strategic health scan over
  git, loop state, and ledger decay, raising flags (`git-dirty-or-diverged`,
  `loop-state-inconsistent`, `ledger-decay`, `docs-missing`). It is distinct
  from `status` / `progress`, which report execution-layer state.
- `cadence context <scope>` produces a **context packet** — a bounded, read-only
  snapshot for one of four scopes: `phase` (forward-looking context a slice
  carries), `handoff` (cross-session resume trail), `review` (backward-looking
  audit with a `needsAttention` bucket), `agent` (a trimmed subagent dispatch
  brief).

### The seam — how Praxis feeds the loop

Praxis is strategic input; the loop is execution. They connect on exactly one
path, in one direction at a time:

```
rec (readiness → ready-for-cadence-spec)
  → cluster into a milestone
    → milestone export  ⟶  SPEC scaffold        [Praxis → loop]
      → SPEC → DRAFT → BUILD → SETTLE            (one or more slices)
        → recommendation convert --to-phase  ⟶  rec status = converted   [loop → Praxis]
```

Praxis never writes loop state; the loop never writes the ledger. The only
coupling is the staged SPEC scaffold (Praxis → loop) and the terminal convert
link (loop → Praxis). `convert` is one-way — there is no unconvert.

### Scouting recs into the ledger

Recommendations enter the ledger one at a time via `cadence recommendation add`.
To *generate and triage many candidates at once* for a fuzzy problem, the Claude
Code host installs **`/cadence-scout`** — a divergent→convergent ideation
dialogue that lands the survivors as recs (with provenance evidence) and then
hands you back to `cadence recommend` and the seam above. Scout is host-side
only: it produces ordinary Praxis records and never drives the loop, allocates a
loop id, or runs a gate.

> **Terminology:** this guide and the codebase use precise names for these
> concepts — see the project glossary, [`CONTEXT.md`](https://github.com/manehorizons/cadence/blob/main/CONTEXT.md), for the
> canonical term for each (and the aliases to avoid).

---

## Observability

When you need to see *why* CADENCE did something — which gate refused, which
lifecycle hook fired, what an AI verifier call did — turn on the structured
diagnostic logger. It is **default-off** and writes **only to stderr**, so it
never disturbs normal output, `--json`, or the `cadence mcp serve` protocol channel.

```bash
CADENCE_LOG_LEVEL=debug cadence settle run --auto   # one-off, human-readable to stderr
CADENCE_LOG_LEVEL=debug CADENCE_LOG_FORMAT=json cadence mcp serve   # machine-readable
```

Records carry a `seam` tag: `gate` (settle gate skipped/passed/refused), `hook`
(host event dispatch), and `verify` (verifier request/response/error, with token
usage). Verifier auth headers and API keys are never logged. Persist a default
with the [`logging` config block](reference/config.md#logging); env vars override
it. This is operational logging — separate from the user-behavior `telemetry`
(skill audit) above.

---

## Worktrees & the single-writer assumption

CADENCE's loop state is **file-based and lives in the working tree** —
`.cadence/state.json`, `STATE.md`, and `.cadence/phases/*` are tracked files. Git
worktrees share one `.git` but each has its own working tree, so **each worktree
holds its own private copy of `.cadence/`**. Phase numbers are operator-supplied,
and the "next: N" surfaced by `progress`/`recommend` is just a read of the
committed snapshot. The loop implicitly assumes a **single writer** to the
phase-number space.

Two worktrees branched from the same commit can therefore both conclude "phase N
is next." If they use the same slug (`30-foo` in both), you get a real git
conflict at merge — loud. If they use *different* slugs (`30-auth` vs `30-cache`),
the directories don't textually conflict, so git **silently merges both in** —
two phase 30s and a broken invariant, no conflict marker. That quiet case is the
dangerous one. (`state.json` re-stamps on every read, so concurrent worktrees'
copies diverge constantly — that file is inherently single-writer and must never
be merged across loops.)

The **phase-collision guard** (v1.18, default-on) makes this loud. The
coordination primitive already exists: `git worktree list` enumerates every
sibling worktree, and the upstream ref records already-merged phases — CADENCE
just consults them. Before scaffolding (`spec new` / `draft new`) and again as a
settle backstop, it refuses a phase number already claimed by a sibling worktree
or `origin/<integrationRef>`, names the conflict, and suggests the next free
number. It is best-effort: a non-git, offline, or single-worktree checkout
degrades to exactly the pre-v1.18 behavior — the only hard failure is an actual
collision. Tune or disable it via the
[`phaseGuard` config block](reference/config.md#phaseguard); bypass one run with
`--allow-phase-collision`. This is a *guard*, not an allocator: it does not
reserve numbers ahead of time or auto-renumber — it observes ground truth and
fails loud.

---

*Next: [docs/reference/config.md](reference/config.md) — full configuration
reference | [docs/reference/commands.md](reference/commands.md) — command
reference | [docs/cli.md](cli.md) — how-to guide*
