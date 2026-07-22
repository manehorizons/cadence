# CADENCE

The canonical language of CADENCE — a framework for AI-assisted development with
configurable quality gates. This is a glossary, not a spec: it defines what each
term *is* and which aliases to avoid. Behavior and architecture live in
`DESIGN.md`, `docs/concepts.md`, and `docs/reference/`.

CADENCE has two bounded layers, glossed separately below:

- **Execution loop** — the cycle that does the work and mutates loop state.
- **Praxis layer** — read-narrow strategic intelligence that *feeds* the loop
  but never mutates its state.

The **Seam** section records how the two connect.

---

## Language — Execution loop

### The loop

**Loop**:
The `IDLE → SPEC → DRAFT → BUILD → SETTLE → IDLE` cycle that every unit of work
moves through. SPEC is optional.

**Loop position**:
The state the loop currently occupies — one of `IDLE`, `SPEC`, `DRAFT`,
`BUILD`, `SETTLE`. Always qualified as a "loop position" so the uppercase word
isn't confused with the artifact of the same name.
_Avoid_: phase (a phase is a unit of work, not a position), stage, mode, step.

### The unit of work

**Phase**:
A numbered, named theme of related work — the directory
`.cadence/phases/<n>-<slug>/` (e.g. `17-anomaly-notify`). Holds one or more
slices. The `state.phase` field.
_Avoid_: using "phase" for a single loop-trip (that's a slice).

**Slice**:
One trip through the loop — a single `<id>` unit (e.g. `17-02`) producing one
DRAFT / PROGRESS / SUMMARY set. The `state.id` field. A phase may contain
several slices.
_Avoid_: sub-phase, iteration.

**Task**:
A unit of execution declared inside a DRAFT, with its own `files:` list and a
terminal status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED).
_Avoid_: step, item, todo.

**Acceptance Criterion (AC)**:
A plain-English given/when/then success condition for a slice, identified by the
token `AC-N`. Each AC must be referenced by `AC-N` in at least one test file.
_Avoid_: requirement, spec item, story.

### Artifacts

When written bare and capitalized, **DRAFT** and **SPEC** name the *artifact
files*, not the loop positions — the document is what people talk about day to
day, so it owns the word.

**DRAFT**:
The structured plan file (`<id>-DRAFT.md`) proposing what will change (files per
task), what success looks like (acceptance criteria), and how large the work is
(tier). Owns the bare word "DRAFT"; the state is "the DRAFT loop position."
_Avoid_: the plan, spec, proposal.

**SPEC**:
The optional pre-DRAFT artifact (`<id>-SPEC.md`) that locks down *what* a slice
delivers — objective, acceptance criteria, constraints, open questions — before
the DRAFT plans *how*. Owns the bare word "SPEC"; the state is "the SPEC loop
position."
_Avoid_: requirements doc, the plan.

**UI-SPEC**:
An opt-in artifact (`<id>-UI-SPEC.md`), sibling to SPEC — a concrete
per-component design contract (layout/token detail, responsive/interaction
behavior) for a phase that touches UI surfaces. Scaffolded via `cadence spec
new --ui`; its mere existence is the opt-in signal for the `ui-spec-review`
gate at `cadence spec approve`. Owns the bare word "UI-SPEC."
_Avoid_: design doc, UI spec (two words — ambiguous with the generic term).

**Sidecar**:
A per-slice JSON record a gate writes alongside the artifacts to track its own
state across reloops — e.g. `<id>-PLAN-REVIEW.json`, `<id>-CODE-REVIEW.json`,
`<id>-SPEC-REVIEW.json`, `<id>-UI-SPEC-REVIEW.json` (attempts + history for
convergence).
_Avoid_: log, cache.

**State files**:
The pair regenerated on every state write — `state.json` (machine-readable loop
state) and `STATE.md` (the derived human view; never hand-edited).

**Single-commit convention**:
A completed slice produces exactly one commit — source, tests, docs, and phase
artifacts land together once the loop's own gates have verified the work; no
separate settle commit follows it. State files (`state.json`/`STATE.md`) stay
gitignored and never enter it. Operator-owned, not enforced by a hook.
_Avoid_: splitting the settle into a second commit; calling it a "feature
commit" once it also carries the phase artifacts.

### The two axes

Two independent axes decide how much gate-work fires for a slice. Their
intersection is a **cell** (e.g. `strict × complex`).

**Profile**:
The user-involvement axis — how much the human drives vs. the AI. One of
`strict` (every step a checkpoint), `standard` (major-step gating), `auto`
(hands-off, anomalies surface automatically). Set project-wide or overridden
per-phase. Always written "standard **profile**" — never bare (see Flagged
ambiguities).
_Avoid_: mode, level.

**Tier**:
The phase-size axis — `quick-fix` (≤1 task, ≤1 file), `standard` (≤5 tasks, ≤8
files), `complex` (≥6 tasks). The AI proposes it in the DRAFT; the coherence
check verifies it against actual counts. Always written "standard **tier**" —
never bare (see Flagged ambiguities).
_Avoid_: size, complexity, T-shirt size.

**Cell**:
One profile × tier intersection (e.g. `auto × complex`). Each cell fixes which
delta gates fire on top of the always-fire gates.

**Preset**:
A named starting bundle of config defaults — `solo` / `team` / `production` —
chosen at `cadence init`. A preset *seeds* an initial profile (among notify
transport, providers, telemetry, …) but is not itself the profile.
_Avoid_: profile (for solo/team/production), template, mode.

### Gates

**Gate**:
A single check that can refuse a loop transition (or warn). Identified by a
canonical string (`coherence-check`, `test-coverage`, `code-review`, …).
_Avoid_: rule, hook, validator.

**Gate universe**:
The full set of gates that exist (the 13 profile × tier gates plus stage-scoped
ones). Not all fire for a given slice.

**Gate set** (effective gate set):
The gates that actually fire for a slice — the cell's delta gates plus the
always-fire gates.
_Avoid_: active gates, enabled gates.

**Always-fire gate**:
A gate that runs on every slice regardless of cell (`coherence-check`,
`structural-verifier`, `build-test-must-pass`). Free.

**Delta gate**:
A gate *added* by a cell on top of the always-fire set. Grouped by cost band
(cheap / medium / expensive).

**Stage-scoped gate**:
A provider-backed review gate that fires at a specific loop transition because
the stage (or tier) is the opt-in, not a matrix cell — `plan-review`,
`spec-review`, `ui-spec-review`.

**Bypass flag**:
A per-invocation CLI flag that skips one gate's refusal (`--allow-…`), or
`--force` which bypasses several settle-time failures at once.
_Avoid_: override (reserve "override" for the per-phase profile override).

**Soft cap**:
The `auto × complex` rule: CADENCE refuses to approve/settle by default
(high blast-radius, zero supervision) unless `--allow-auto-complex` is passed.
_Avoid_: hard cap, block.

**Coherence check**:
The always-fire gate that checks DRAFT frontmatter consistency — tier vs
task/file counts, AC format, loop position. Issues are `block` (refuse) or
`warn` (soft signal).

**Convergence**:
The reloop-then-escalate pattern shared by `plan-review`, `spec-review`, and
`code-review` — a review gate retries up to `convergence.maxAttempts`, tracking
attempts in its sidecar, then hard-escalates with an unconditional
`*-unconverged` anomaly.
_Avoid_: retry loop.

### Verification

**Verifier**:
Specifically the `--deep` independent AI agent that reads each AC and returns a
per-AC verdict. Matches the `Verifier` interface in code. Owns the bare word.
_Avoid_: using "verifier" for the per-task, review, or audit agents.

**Review agent**:
The umbrella term for any AI-backed gate agent — the deep verifier, per-task
verify, code-review, plan-review, security-audit, spec-review. Use this when
you mean "an AI gate," not "the verifier."
_Avoid_: "the verifier" as a catch-all.

**Verdict**:
A single pass / fail / skip decision about one unit — one AC or one task —
produced by a review agent or by interactive walk.
_Avoid_: result, outcome (those are broader).

**Provider**:
The backend a review agent delegates to: `mock` (deterministic, offline,
default), `anthropic` (Anthropic API), or `local` (OpenAI-compatible endpoint).
Configured per gate. A provider produces verdicts; it is not itself a gate.
_Avoid_: backend, model (the model is a config knob *on* a provider).

### Safety surface

**Anomaly** (anomaly event):
A surfaced signal that something is worth a human's attention — a typed event
(`ac-blocked`, `files-outside-boundary`, `coherence-warn`, `force-used`, …)
emitted at settle, at edit time, or at a coherence warn.
_Avoid_: error, warning (an anomaly is neither — it never blocks on its own).

**Notifier / transport**:
The **notifier** dispatches anomaly events through a configured **transport** —
`stderr` (default), `file` (NDJSON), `none`, or `webhook` (POST JSON). Transport
failures degrade to one stderr warning and never block.
_Avoid_: channel, sink.

**Skill audit / required skills**:
A slice may declare `requiredSkills`; settle refuses (or warns) on a shortfall
and emits an unconditional `skill-audit-miss` anomaly. Declaring skills is the
opt-in — it is *not* a gate-matrix cell.

### Host

**Host / adapter**:
A host is a coding agent tool CADENCE drives — currently Claude Code and
Codex, plus any MCP-capable host via the MCP server. A host **adapter**
(`cadence-host-claude-code`, `cadence-host-codex`) translates that host's
lifecycle events into the abstract events the core dispatcher understands; it
never duplicates engine logic. Claude Code is the reference adapter for
*ambient* edit-time gates.
_Avoid_: integration, plugin.

---

## Language — Praxis layer

**Praxis**:
CADENCE's strategic-intelligence layer — recommendations, evidence, assumptions,
decisions, milestones, context packets, and inspection. It is *read-narrow*:
strategic input that never mutates loop state. Stored under
`.cadence/intelligence/`.
_Avoid_: planner, advisor, the brain.

**Intelligence ledger**:
The persistent JSON home for Praxis records under `.cadence/intelligence/` —
five versioned subject ledgers (`recommendations.json`, `evidence.json`,
`assumptions.json`, `decisions.json`, `milestones.json`), each with an
auto-generated Markdown render (except evidence), plus derived outputs
(`recommend.json`, `inspection.json`) and context packets under `context/`.
Holds strategic input, not execution state.
_Avoid_: database, store, log. Say "the ledger."

**Recommendation** (rec):
A scored, free-floating change candidate — the central Praxis record. Carries a
**status** (`candidate` → `accepted` → `deferred` | `rejected` | `converted`),
a **readiness** maturity gate (`raw-idea`, `needs-evidence`, `needs-decision`,
`ready-for-milestone`, `ready-for-cadence-spec`, `blocked`), and an auto-derived
**decay state** (`fresh`, `aging`, `stale`, `superseded`, `contradicted`,
`needs-revalidation`).
_Avoid_: suggestion, idea, ticket. "rec" is the accepted short form.

**Evidence**:
Backing material tied to a recommendation — kind `file` | `command` |
`cadence-artifact` | `note`.
_Avoid_: proof, source.

**Assumption**:
A stated belief tied to a recommendation (FK required) that constrains its
validity — status `open` → `validated` | `rejected` (reopenable).
_Avoid_: hypothesis, guess.

**Decision**:
An architectural choice, optionally tied to a recommendation. Decisions form a
**supersession graph** — status `active` → `superseded` | `rescinded`
(reactivatable). To **supersede** is to mark an older decision replaced by a
newer one; to **rescind** is to invalidate without replacement.
_Avoid_: choice, ADR (an ADR is a doc; a Decision is a ledger record).

**Tied / untied**:
A decision or assumption is *tied* when it carries a `recommendationId`,
*untied* when it does not. Untied decisions are valid; assumptions are always
tied.

**Milestone**:
A cluster of recommendations destined for a single CADENCE phase — status
`proposed` → `accepted` → `exported` | `deferred` | `closed`. Carries an
operator-owned pre-mortem (likely failure modes, hidden dependencies, drift
risks, out-of-scope). `export` stages a SPEC scaffold; it never allocates a loop
id.
_Avoid_: epic, release (those are external concepts).

**Context packet**:
A read-only, bounded context snapshot for a scope — `phase` (forward-looking
context a slice carries), `handoff` (cross-session resume trail), `review`
(backward-looking audit with a `needsAttention` bucket), `agent` (subagent
dispatch brief). Written to `.cadence/intelligence/context/<scope>.{json,md}`.
_Avoid_: bundle, dump, snapshot (use "packet").

**Inspection**:
The strategic health scan (`cadence inspect`) — reads git, loop state, and
ledger decay to emit flags (`git-dirty-or-diverged`, `loop-state-inconsistent`,
`ledger-decay`, `docs-missing`). Distinct from `status`/`progress` (execution
layer).
_Avoid_: audit, check.

**Recommend report**:
The output of `cadence recommend` (≠ `cadence recommendation`) — a scored,
ranked advisory partitioning the ledger and deriving a loop-aware **advisory**
(`finish-loop`, `top-recommendation`, `spec-new`, `empty`).
_Avoid_: ranking, suggestion list.

**Convert / conversion**:
Recording that a recommendation was implemented as a CADENCE phase
(`recommendation convert <recId> --to-phase <phaseId>`) — flips the rec to
`converted` and sets `convertedToPhaseId`. Terminal; there is no unconvert.

---

## The Seam — how Praxis feeds the loop

Praxis is strategic input; the loop is execution. They meet at one path:

A **recommendation** matures through **readiness** (`raw-idea` →
`ready-for-cadence-spec`), is clustered into a **milestone**, whose `export`
stages a **SPEC** scaffold. That SPEC enters the **loop**
(`SPEC → DRAFT → BUILD → SETTLE`) as one or more **slices**. On completion,
`recommendation convert --to-phase` flips the rec to `converted`, closing the
loop back to strategy.

Praxis never writes loop state; the loop never writes the ledger. The only
coupling is the SPEC scaffold (Praxis → loop) and the convert link
(loop → Praxis).

---

## Flagged ambiguities

**"standard" (bare) is forbidden.** It is *both* a profile value and a tier
value, and `standard × standard` is a real cell. Always qualify: "standard
profile" or "standard tier." We deliberately did not rename either axis — both
words are correct in their own axis, and a rename would ripple through Zod
enums, every existing DRAFT's frontmatter, configs, and the docs matrix. The
qualification rule buys the clarity for free.

**`structural-verifier` is not a verifier in the behavioral sense.** Despite
the name, it is a free always-fire *gate* that only checks every task is in a
terminal state — no AI, no AC behavior check. The name is a wired gate string we
keep; readers should not infer behavioral verification from it.

**`cadence init --profile` sets a *preset*, not a profile.** Today the
`--profile` flag takes `solo|team|production` (a preset) while the actual domain
profile hides behind `--gate-profile`. Agreed resolution: rename the flag to
`--preset`, keeping `--profile` as a deprecated alias. Until that ships, treat
`--profile <solo|team|production>` as a known misnomer.

**DESIGN.md's "Phase 17.2" means a slice.** The design doc's prose numbers
slices as "Phase NN.N" (e.g. "Phase 38.1"). That is legacy phrasing for the
slice `38-01`, not a second granularity of phase. We document this rather than
rewrite the design doc (its phase history is load-bearing).

**Decision (Praxis) vs ADR (doc).** A *Decision* is a ledger record in the
Praxis supersession graph. An *ADR* is a `docs/adr/` markdown file. They can
describe the same choice but are different artifacts — don't conflate them.

---

## Example dialogue

> **Dev:** The `auto × complex` slice got refused at settle — is that a gate
> failing?
>
> **Expert:** Not a gate failure — that's the **soft cap**. `auto × complex` is
> high blast-radius with no human in the loop, so settle refuses by default.
> Pass `--allow-auto-complex` if you mean it.
>
> **Dev:** Got it. And the verifier flagged AC-3?
>
> **Expert:** Careful which one — if you ran `--deep`, that's the **verifier**
> returning a `pass=false` **verdict** on AC-3. The always-fire
> `structural-verifier` only checks tasks are terminal; it wouldn't look at AC
> behavior.
>
> **Dev:** Where did this slice even come from?
>
> **Expert:** It's the **Seam**. A **recommendation** hit
> `ready-for-cadence-spec`, got clustered into a **milestone**, and the
> milestone `export` staged the **SPEC**. Once we settle, we'll `convert` the
> rec so the **ledger** shows it as `converted`.
