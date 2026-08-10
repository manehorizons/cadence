# CADENCE Concepts

This page is the conceptual spine of the CADENCE user guide. Everything else
in `docs/` builds on the vocabulary defined here.

**CADENCE** — named for the rhythm of its core DRAFT → BUILD → SETTLE loop — is
a draft/build/settle framework for AI-assisted development. The goal is GSD-grade
discipline with far less wall-clock cost, achieved by letting you choose which
quality gates fire for each phase of work.

One engine drives everything below; you reach it through three surface
categories — the **CLI** (`cadence …`), **host adapters** (Claude Code and
Codex, wiring lifecycle hooks + slash/prompt commands — Claude Code is the
**reference adapter** for *ambient* edit-time gates), and an **MCP server**
(`cadence mcp serve`, for any MCP host, imperative loop only). The concepts
here apply across all of them.
See [the user guide](README.md#one-engine-three-surface-categories) and
[docs/mcp.md](mcp.md). The adapter shape itself is a versioned contract — see
[Write your own adapter](host-adapters.md).

---

## Table of contents

- [The loop](#the-loop) (incl. the optional [SPEC](#spec-optional) stage)
- [Single-commit convention](#single-commit-convention)
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

- What will change (`files:` list per task; an optional `depends:` list of
  task ids lets `cadence dispatch plan` compute wave-based dispatch order)
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
   enables). The first gate that refuses halts the run right there — later
   gates never run.
2. Emits anomaly events for anything worth surfacing.
3. Writes the SUMMARY pair and resets state to IDLE.

A refusal short-circuits steps 2–3 for the normal success path, but (Phase
170) still writes the SUMMARY pair before exiting — see the `gates[]` note
below — and leaves `loopPosition`/`activeDraft` untouched so the exact same
`settle run` can be retried once the refusal is addressed.

**Phase artifacts:**
- `.cadence/phases/<phase>/<id>-SUMMARY.json` — machine-readable full record
- Phase 140 added `gates[]` (per-gate ran/skipped provenance) and per-AC
  `evidence` class (`ai-verified`/`executed`/`assertion`/`mention`/`unverified`)
  to both the JSON record and the rendered Markdown — see `SUMMARY.md`'s
  "Gate provenance" section and each AC's evidence tag.
- Phase 170: `gates[]` entries also carry `status: 'refused'` (in addition to
  the existing `'ran'`/`'skipped'`) for the gate that halted the run, with a
  `reason` string — the same message the gate wrote to stderr — attached to
  that entry. The array is partial on a refusal: it holds every earlier
  gate's `ran`/`skipped` entry plus the one `refused` entry, and stops there.
  Previously a refused settle wrote no SUMMARY at all, so the refusing gate
  and its reason existed only as an ephemeral stderr line; now they're a
  durable record on disk. `reason` is JSON-only so far — the rendered
  `SUMMARY.md` "Gate provenance" section prints a skipped gate's
  `skipReason` but does not yet print a refused gate's `reason`, so read the
  `.json` record for the refusal text.
- Phase 249: the phase-170 "still writes the SUMMARY pair" behavior above
  covered only the gate-loop refusal (a `runSettleGates` gate returning
  `refused`). Three more refusal points inside `settleService`'s own
  post-gate-loop body — AC derivation (`deriveSettleAcResults`),
  anomaly/skill-audit (`runAnomalyAndSkillAuditChecks`), and the
  `evidence-floor` gate documented under [The gate universe](#the-gate-universe)
  below (`deriveEvidenceAndCheckFloor`) — previously returned their bare refusal
  result with no SUMMARY written at all. Phase 249 routes all three through
  the same phase-247 `writeRefusedSettleSummary`, called from
  `settleService` with the identical `acc`/`gates` already in scope there,
  so a findings-bearing refusal in any of these three families inherits the
  conditional `contentHash`/snapshot-sibling behavior identically to a
  gate-loop refusal. `acResults` stays `[]` on all four refusal families
  alike, preserving the phase-170 invariant unchanged. Three earlier refusal
  points remain silent by design and are unaffected, each missing a
  different piece of the context a SUMMARY needs: `loadSettlePreconditions`'s
  precondition refusal returns before `draft`/`progress`/`gates` all exist;
  `checkPhaseCollisionBackstop`'s worktree-collision backstop (its own
  docstring: "a `settleService` precondition, NOT a gate-matrix gate") runs
  with `draft`/`progress` already resolved but before `gates` exists; and
  `resolveSettleGateSet`'s soft-cap refusal runs with `draft`/`progress`
  already resolved too, missing only `gates`/`ctx`. All three are excluded
  for the same underlying reason — no `gates` provenance array exists yet
  to attach — not because none of `draft`/`progress` is available.
- Phase 232: `gates[]` entries also carry optional `provider`/`model` —
  the verifier family/model that actually ran the gate — currently populated
  only for the `code-review` and `security-audit` entries (`mock`, the
  default provider, is recorded the same as a real provider); every other
  gate's provenance entry still omits both fields. This bumps
  `SUMMARY.json`'s `schemaVersion` to `1 | 2`: writers always emit `2` now,
  and readers still accept pre-phase-232 records at `1` unchanged — a
  genuinely unrecognized higher `schemaVersion` (written by a newer Cadence
  than the one reading it) is reported as its own diagnostic rather than a
  generic parse failure.
- Phase 233: `SUMMARY.json` optionally carries `assurance` — one whole-run
  record, *derived and reported only* (it adds no gate, no refusal path, and
  no bypass flag), answering "how strongly was this settle actually
  verified?" It has three parts: `verifierRollup` (one entry per distinct
  `(provider, model)` pair observed across `gates[]` entries that carry
  verifier identity, phase 232, with a `gateCount`), `evidenceTally` (a count
  of `acResults[].evidence` classes — `ai-verified`/`executed`/`assertion`/
  `mention`/`unverified`, phase 140 — bucketed across all ACs), and `overall`
  (`'strong' | 'mixed' | 'weak' | 'unverified'`, a single deterministic label
  computed from the other two: `'unverified'` when no gate carried verifier
  identity and no AC evidence rose above `'unverified'`; `'strong'` when at
  least one gate ran under a real, non-`mock` provider and at least half of
  all ACs landed at `ai-verified`/`executed`; `'mixed'` when some real signal
  exists but not enough to clear the `'strong'` bar; `'weak'` otherwise). The
  derivation function (`packages/core/src/gates/assurance-record.ts`) is a
  pure reduction over the `gates[]` and `acResults[]` arrays with no
  gate-name special-casing, so it composes uniformly from existing gate
  provenance and AC evidence rather than adding a new verification path.
  `assurance` is covered by the same phase-223 settle-time content hash as
  the rest of `SUMMARY.json` (the hash is computed generically over the
  whole record), so a post-settle hand-edit to `assurance` is caught by
  `cadence summary verify` exactly like any other field. It is surfaced in
  both `cadence summary render` and the on-disk `SUMMARY.md` sidecar as an
  "## Assurance" section (`overall`, the evidence tally, and any verifier
  rollup entries).
- Phase 244: `SUMMARY.json` optionally carries `foreignBinaryMismatch` — a
  sibling provenance field to `assurance` above, set only when this settle
  actually ran through a `cadence` binary whose realpath resolves OUTSIDE
  the current repo checkout, despite that repo having its own local build
  (recognizably the CADENCE monorepo itself: both
  `packages/core/bin/cadence.cjs` and `.cadence/` present at its root).
  This is `rec-20260729-001`, confirmed on phases 233/234: a stale
  globally-installed `cadence` binary silently shadowed the checkout's own
  build and wrote a downgraded `schemaVersion: 1` SUMMARY with no
  `assurance` record — and the two binaries reported an *identical*
  `--version` string, so detection cannot key on version comparison. This
  guard only runs in code that contains it, so it could not have caught
  233/234 themselves and will not catch settles run through an
  already-published binary that predates this fix — it protects settles
  going forward, once a release built from this code is what operators
  actually have installed. `detectForeignCadenceBinary`
  (`packages/core/src/services/settle.ts`) is realpath-based instead: is
  the binary actually executing this settle located inside the repo's own
  toplevel. Like `assurance`, this is reported only — it adds no gate, no
  refusal path, and no bypass flag; settle still completes normally either
  way, matching this repo's Quiet Fallback convention (loud notice, never a
  silent or blocking fallback). It is recorded on **both** paths a settle
  can take: a normal completion *and* the refused-settle SUMMARY described
  above (a refused settle's running binary is just as foreign as a
  successful one's would have been) — though a content hash is
  unconditional only on the normal-completion path: phase 247 attaches one
  to a refused settle exactly when at least one of `codeReview`/
  `securityAudit` is non-empty, and none when both are empty or absent, as
  before (`assurance` is a separate field, derived on both paths and
  unchanged). When present, the field is a
  two-key object — `runningBinaryPath` (the resolved realpath of the
  binary that actually executed) and `repoToplevel` (the settle
  invocation's `cwd`, which this repo already treats as its root
  throughout `settle.ts`); when absent (not `false`/`null` —
  `exactOptionalPropertyTypes`, the key is omitted), the running binary
  and the repo agreed, which is the common/correct case, including every
  phase settled correctly. On the normal-completion path it is attached
  before `computeSummaryContentHash` runs, so it's covered by the same
  phase-223 content hash as the rest of that record — but unlike
  `assurance` it has no rendered `SUMMARY.md` section yet; it is JSON-only
  so far (the same limitation the phase-170 `reason` field above has) —
  read the `.json` record to see it. On a mismatch, a loud stderr banner —
  "SETTLING VIA A FOREIGN CADENCE BINARY"
  (`buildForeignBinaryBanner` in `packages/core/src/verify/verifier-factory.ts`),
  same shape/placement convention as `MOCK_FALLBACK_BANNER` — names both
  paths and suggests the fix (re-run via
  `node packages/core/bin/cadence.cjs settle run --auto`), so the mismatch
  is visible live on stderr even for a session that never inspects the
  JSON record.
- Phase 257: persisted `codeReview`/`securityAudit` findings are rendered
  under a shared `## Findings` heading — placed after `## Tasks` and before
  the gates heading (`## Gate provenance` in the on-disk `SUMMARY.md`
  sidecar, `## Gates` in `cadence summary render`'s output) in both
  renderers, via one shared helper
  (`packages/core/src/parse/findings-render.ts`). `codeReview` findings are
  grouped by file path (codepoint order), then severity
  (critical > high > medium > low), then `id` (falling back to original
  array order when `id` is absent, as is always true for `securityAudit`
  findings under the current schema); `securityAudit` findings are listed
  under their own subsection, sorted by severity the same way. Each finding
  line shows `severity`/`message`/`line` (if present) plus whichever of
  `id`/`target`/`anchor` (`kind`/`ref`/`tier`)/`disposition`/the waiver's
  `expiry` are present; `message` is passed through the existing
  `redactSecrets` utility at render time (`security-audit` findings are
  already redacted before they reach `SummaryZ`; this is the first point
  that redacts `code-review` findings). The `## Findings` heading itself is
  omitted entirely — not just its subsections — when `codeReview` is
  absent/`{}`/all-empty-arrays and `securityAudit` is absent/`[]`, so a
  historical summary with no findings renders byte-identically to before.
- `.cadence/phases/<phase>/<id>-SUMMARY.md` — human-readable rendered view
- `.cadence/phases/<phase>/<id>-PLAN-REVIEW.json` — plan-review findings
  (written at `draft approve` when `plan-review` fires)
- Phase 247: when a refused settle recorded non-empty `codeReview`/
  `securityAudit` findings (the case above that gets a `contentHash`), it
  additionally writes an immutable per-attempt sibling pair —
  `.cadence/phases/<phase>/<id>-refused-<completedAt-slug>-SUMMARY-
  snapshot.json`/`.md`, timestamp-slugged from that attempt's own
  `completedAt` — containing identical content to the canonical refused
  record at that moment. A later settle attempt for the same draft
  overwrites the canonical `<id>-SUMMARY.json`/`.md` as before, but never
  touches a prior attempt's sibling, so a convergence reloop's earlier
  refused findings survive on disk even after a later attempt succeeds or
  refuses again. The name is deliberately NOT `<id>-SUMMARY.json`/`.md` —
  every current SUMMARY-discovery consumer (`mcp/resources.ts`'s
  `endsWith`-based lookup, `git/diff-strict.ts`'s regex and git pathspec,
  `cadence summary render`/`verify`'s and `verify phase`'s exact-path
  construction) is invisible to it by construction, so include the wider
  `-SUMMARY-snapshot.*` glob (not just `-SUMMARY.*`) when staging a
  settle commit that produced one — see the single-commit convention
  below. Best-effort: a sibling-write failure is reported on stderr but
  never changes the canonical write or settle's exit code. The exported
  `refusedSnapshotArtifactBase` (`packages/core/src/services/settle.ts`)
  is the one place this naming scheme is defined — reuse it rather than
  reconstructing the pattern.
- Phase 248: a code-review or security-audit verifier **throw** — the call
  itself never returned (revoked key, network blip), as opposed to a
  findings-based bypass of a *completed* review — bypassed via `--force` or
  the gate-specific `--allow-code-review-failure`/
  `--allow-security-audit-failure` now records an honest
  `status: 'skipped'` `gates[]` entry, where before this phase it fell
  through to a bare `status: 'ran'` with no identity at all — actively
  misleading about what `'ran'` means here, since the `status` field alone
  gives no hint anything was bypassed (only the phase-232 `provider`/`model`
  fields' absence would, and nothing prompts a reader to check for that).
  The `skipReason` names the actual flag that triggered the bypass,
  following `registry.ts`'s own existing bypass-ladder convention for
  `build-test-must-pass`/`boundary-scan` (the gate-specific flag when it
  was explicitly set, `--force` only when it alone fired), states that a
  verifier failure was bypassed, and includes both the underlying error
  message and the
  configured provider (`ctx.config?.codeReview?.provider ?? 'mock'` /
  `ctx.config?.securityAudit?.provider ?? 'mock'`) — but only inside that
  free-text string. Unlike the phase-232 `provider`/`model` fields above,
  this entry carries neither field structurally, so it stays excluded from
  `deriveAssuranceRecord`'s `verifierRollup` — a call that never returned
  cannot honestly claim a verifier identity. The bypass also prints a loud
  stderr notice, matching this repo's no-quiet-fallback convention. Scope
  is deliberately narrow: the pre-existing findings-based bypass path (real
  HIGH/CRITICAL findings waved through on a review call that *did* return)
  is untouched and still records `status: 'ran'` with a real
  `verifierIdentity`. The new `GateFlags.reviewVerifierFailure` field
  carrying this is deliberately distinct from `deep-verify.ts`'s own
  `verifierFailure` field — that field feeds `notify/collect.ts`'s anomaly
  emission and `SUMMARY.gateBypasses`, hardcoded to attribute the failure to
  `deep-verify`, so reusing it for code-review/security-audit would have
  fabricated a false `deep-verify` bypass record. `deep-verify.ts`'s own
  identical registry-side gap (a bypassed throw there also still records
  `status: 'ran'` with empty identity) is deliberately out of scope for
  this phase.

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

## Single-commit convention

A completed phase produces exactly one commit, once the loop's own gates have
verified the work:

| Commit | Prefix | Contents |
|---|---|---|
| Settle commit | `feat:` / `docs:` / `fix:` etc. | Source changes, tests, documentation, and phase artifacts (`-DRAFT.md`, `-PROGRESS.json`, `-SUMMARY.*`, `-SUMMARY-snapshot.*` when a refused attempt recorded findings — phase 247, `-PLAN-REVIEW.json`) together — `STATE.md`/`state.json` are gitignored and never committed |

**Why one commit?** The gates already re-verified the work before this
point — there's nothing left to prove by holding artifacts back for a
second commit afterward. If the phase closes a Praxis recommendation,
promote it to `shipped` in this same commit rather than a later pass, so
the recommendation ledger never drifts out of sync with what's actually
landed.

This is operator convention (CADENCE dogfoods it on itself), not a
mechanical hook — you own the single commit.

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
| **strict** | `draft-read` · `approve` · `test-coverage` · `interactive-verdict` | + `per-task-verify` · `code-review` · `task-verify-required` | + `plan-review` · `security-audit` |
| **standard** | `test-coverage` | + `draft-read` · `approve` · `anomaly-notify` · `task-verify-required` | + `code-review` · `deep-verify` |
| **auto** | `anomaly-notify` | + `test-coverage` · `task-verify-required` | **soft cap** (see below) |

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

CADENCE has **14 gates** in total: 3 that always fire and 11 delta gates grouped
by cost band. Gate names are the canonical strings from `GateZ` in
`packages/types/src/profile.ts`.

### Always-fire gates (free)

These run on every phase regardless of profile or tier.

| Gate | What it checks | Bypass flag |
|---|---|---|
| `coherence-check` | DRAFT frontmatter consistency — tier vs task/file counts, AC format, loop position | — |
| `structural-verifier` | All tasks are in a terminal state (DONE / DONE\_WITH\_CONCERNS / NEEDS\_CONTEXT / BLOCKED); a `PENDING`/`IN_PROGRESS` task refuses settle (wired Phase 39.2) | `--allow-open-tasks` or `--force` (on `settle run`) |
| `build-test-must-pass` | When `verification.testCommand` is configured, settle runs it and refuses on a non-zero exit (wired Phase 39.2). With no `testCommand` set, the gate is evaluated but cannot enforce — it still passes, but (Phase 139) writes a loud, non-blocking stderr notice instead of passing silently. `cadence init` derives `testCommand` from `package.json#scripts.test` when it can. | `--allow-failing-build` or `--force` (on `settle run`) |

### Delta gates

#### Cheap

| Gate | When it fires | Bypass flag |
|---|---|---|
| `draft-read` | Settle refuses if `DRAFT.md` was modified after `draft approve` (mtime check) | `--allow-stale-draft` (on `settle run`) |
| `test-coverage` | Each AC must have at least one test file that contains the token `AC-N`. A fresh `cadence init` writes `verification.coverageMode: "assertion"` (Phase 139, all presets) which requires the token inside an asserting `it()`/`test()` block — a comment-only mention refuses as a *weak link*, and an AC whose only linked test(s) are `it.skip`/`test.todo`/`.failing` (the "skip dodge") refuses distinctly as *skip-only linked* (Phase 169). `coverageMode: "mention"` (any occurrence anywhere in the file counts) remains the schema-level fallback for configs that predate this field. Independently, `verification.coverageScheme` (Phase 239) controls how strictly the `AC-N` token itself must be qualified: `"bare"` (the schema-level default, and what every config that predates this field keeps on upgrade) is the token exactly as described above — unqualified, and satisfiable by any past phase's identically-numbered AC test, since AC ids restart at `AC-1` every phase. `"phase-qualified"` (what a fresh `cadence init` writes) requires the token to carry the active slice's own id prefix (`<slice-id>/AC-N`, e.g. `239-01/AC-3` — CONTEXT.md's *slice*, not the phase directory name) — a bare or foreign-phase token no longer counts as evidence, and every refusal names the exact expected token so the fix requires no source reading. Edit it with `cadence config edit coverageScheme`. | `--allow-missing-coverage` (on `settle run`) |
| `anomaly-notify` | Emit anomaly events (blocked tasks, out-of-boundary edits, coherence warns, loop violations, …) via the configured transport | No bypass — transport failures degrade gracefully |
| `task-verify-required` | Settle refuses if any `DONE` task's DRAFT block has an empty or missing `- verify:` line (issue #206 / rec-20260712-001); names every offending task id | No bypass — add the missing `- verify:` line and re-settle |
| `evidence-floor` | Refuses settle when any AC's `PASS` verdict rests on evidence ranked below the configured [`gates.evidenceFloor`](reference/config.md#gates) (Phase 214, AC-1) — the Phase 140 evidence ladder `ai-verified` > `executed` > `assertion` > `mention` > `unverified`. Names every offending AC id with its actual level vs. the required floor; only `PASS`-verdicted ACs are checked. | `--evidence-floor-bypass <AC-id:reason>` — exempts exactly the named AC, requires a non-empty reason, and is recorded in `SUMMARY.gateBypasses`; **never** a blanket, phase-wide bypass (on `settle run`) |

> `evidence-floor` differs from the other gates in this table: it is not
> selected by the `DELTAS` matrix in `engine.ts` and is not one of the 14
> `GateZ` gate names — it evaluates unconditionally on every
> `cadence settle run`, regardless of profile or tier, with its strength
> controlled entirely by the [`gates.evidenceFloor`](reference/config.md#gates)
> config value (schema-level default `mention` — a back-compat no-op floor;
> the `solo`/`team`/`production` presets set stricter defaults — see
> [Presets](reference/config.md#presets)).

#### Medium

| Gate | When it fires | Bypass flag |
|---|---|---|
| `approve` | Interactive Y/N prompt at `cadence draft approve`; in a non-TTY it **auto-passes** loudly (see [Non-TTY auto-bypass](#non-tty-auto-bypass-agents--ci)) | `--no-approve` (on `draft approve`) |
| `per-task-verify` | AI verifier runs at `cadence build task <id> --status=DONE`; `refuse` verdict blocks the status write | `--allow-per-task-failure` (on `build task`) |
| `code-review` | AI code-review agent runs at `cadence settle run`; HIGH-severity findings refuse settle | `--allow-code-review-failure` or `--force` (on `settle run`) |

#### Expensive

| Gate | When it fires | Bypass flag |
|---|---|---|
| `deep-verify` | Independent AI verifier runs at settle (`--deep` or baked in for `standard × complex`); it is sent the actual phase diff (`git diff HEAD`, capped by `verifier.diffCapBytes`) plus the ACs and linked tests, so it judges the implementation, not just test-linkage; per-AC `pass=false` refuses settle | `--force` or `--allow-verifier-failure` for transport errors (on `settle run`) |
| `interactive-verdict` | Human walks each AC at settle (`--interactive`); `fail` verdict refuses settle; in a non-TTY the walker is **auto-skipped** and the gate passes (see [Non-TTY auto-bypass](#non-tty-auto-bypass-agents--ci)) | `--no-interactive` to opt out; `--force` to settle past failures |
| `plan-review` | AI plan-review agent runs at `cadence draft approve` (strict × complex only); `pass=false` refuses approve | `--allow-plan-review-failure` (on `draft approve`) |
| `security-audit` | AI security-audit agent runs at `cadence settle run` after code-review (strict × complex only); CRITICAL findings refuse settle | `--allow-security-audit-failure` or `--force` (on `settle run`) |

### Stage-scoped gates (outside the profile × tier matrix)

The 14 gates above are the profile × tier universe. A few **stage-scoped**,
provider-backed review gates fire at a specific loop transition regardless of
the active cell — they are deliberately *not* matrix cells because the stage
itself (or the relevant tier) is the opt-in. `plan-review` (above) is one such
gate; `spec-review` and `ui-spec-review` are the other two — the latter
opt-in by the UI-SPEC's own presence, not by tier or stage.

| Gate | When it fires | Bypass flag |
|---|---|---|
| `spec-review` | Convergent AI spec-review runs at `cadence spec approve`; `pass=false` re-loops up to `convergence.maxAttempts`, then refuses approve | `--allow-spec-review-failure` (on `spec approve`) |
| `ui-spec-review` | Convergent AI review runs at `cadence spec approve`, only when a sibling `<id>-UI-SPEC.md` exists; `pass=false` re-loops up to `convergence.maxAttempts`, then refuses approve | `--allow-ui-spec-review-failure` (on `spec approve`) |

`spec-review` reuses the same convergence primitive as `plan-review` and is
configured per provider in `.cadence/config.json` under the `specReview` key
(providers `mock` / `anthropic` / `local` / `host-cli`, with an optional
`model` override — see `docs/providers.md` for which gates `host-cli` is
currently wired for). Because the SPEC stage is itself optional, `spec-review`
never fires unless you
choose to run `cadence spec approve`.

### Criteria-anchored `code-review` (phase 235)

Every `code-review` finding is also tagged with an **anchor** — how strongly
it ties back to something the phase's own DRAFT actually declared, on a
four-tier ladder from strongest to weakest:

| Tier | What it means |
|---|---|
| `executable` | The finding's file is covered by a task whose `done:` cites an AC, that task's `verify` command is non-empty, AND this settle's `build-test-must-pass` gate provenance shows `status: 'ran'` (the corroborating condition — a runnable-looking `verify` line is never trusted by itself). |
| `structured` | The AC exists and its `given`/`when`/`then` are all non-empty. |
| `declared` | The AC exists but is prose-only (empty or partial G/W/T), or the finding's file matches a `boundaries[]` entry exactly. |
| `undeclared` | Nothing citable was found for the finding's file — this is a **criteria gap**: diff work no acceptance criterion and no boundary covers. |

The pure ladder resolver is `resolveAnchor`
(`packages/core/src/verify/anchor.ts`); `anchorFindings`
(`packages/core/src/verify/criteria-gap.ts`) applies it per file — the
verifier reports findings keyed by file, not by criterion — and tags every
finding in that file with the result. The tag lands in the additive,
optional `anchor` field on `FindingZ` (`packages/types/src/summary.ts`); a
pre-phase-235 `SUMMARY.json` with no `anchor` on any finding still parses
unchanged.

A criteria gap adds **no new refusal path and no new bypass flag**: a gap
finding flows into the exact same finding stream `code-review` already
refuses on, so a HIGH-severity gap refuses through the pre-existing
HIGH-finding contract (`--allow-code-review-failure` / `--force` still
clear it, same as any other HIGH finding). Whenever at least one finding
resolves to `undeclared`, settle prints a gap-count / severity-distribution
notice to stderr — unconditionally, regardless of whether the gate ends up
passing, refusing, or being bypassed, so the gap is never hidden by the
floor outcome.

Scope is deliberately narrow: only `code-review` is criteria-anchored.
`spec-review`, `ui-spec-review`, and `plan-review` are unaffected
(`dec-20260729-003`) — generalizing the ladder to them was ruled out of
scope for this phase, not merely deferred silently.

**Three limitations were disclosed when the ladder shipped**, tracked as
Praxis recommendations rather than glossed over. The first is now closed by
phase 241; the other two remain open:

- The `executable` tier was not reachable in a real settle as originally
  shipped (`rec-20260729-002`, closed by phase 241). `SettleContext` now
  carries a frozen, per-gate `gateProvenance` snapshot accumulated over the
  course of the settle, and `gates/code-review.ts` passes it through
  (`ctx.gateProvenance ?? []`) instead of a literal `[]`. `executable` is
  reachable in a live settle when both of the ladder's conditions hold: the
  finding's AC is cited by a task with a non-empty `verify:`, **and** the
  provenance snapshot contains a `build-test-must-pass` entry with
  `status: 'ran'`. A `skipped`, `refused`, or absent `build-test-must-pass`
  entry still caps the tier below `executable` — this widened what is
  reachable, it did not weaken what must be earned.
- Anchoring is per-file, not per-finding (`rec-20260729-003`). One anchor is
  resolved for a whole file and applied to every finding reported in it, so
  a genuinely uncovered defect sitting in an otherwise-covered file does not
  register as a criteria gap.
- A boundary string that merely contains a finding's filename as a
  substring grants `declared` tier to every finding in that file
  (`rec-20260729-005`), which can mask a real gap — the check that follows
  only confirms the candidate string is present in `boundaries[]`, not that
  the boundary is actually relevant to the finding.

### Finding identity, disposition, and type convergence (phase 236)

Phase 236 (`dec-20260730-001`) gives a finding a stable identity so it can be
tracked across settles instead of being re-detected as new every time, and
converges two independently-declared `Finding` types that had drifted apart.
It is schema-and-computation only — see "What is deliberately not built yet"
below for what is explicitly deferred.

**Four new `FindingZ` fields** (`packages/types/src/summary.ts:70-114`), all
additive and `.optional()` so a pre-phase-236 `Finding` record with none of
them present still parses unchanged:

| Field | Shape | Meaning |
|---|---|---|
| `id` | `string` | Stable content-hash identity — see below. |
| `target` | `'artifact' \| 'verification'` | Which surface the finding was raised against. |
| `disposition` | `'open' \| 'accepted' \| 'waived' \| 'fixed' \| 'superseded'` | Lifecycle state for a tracked finding. |
| `waiver` | `{ expiry: string }` (ISO datetime, offset required) | Present only on a waived finding. |

`waiver` is constrained bidirectionally by two `.refine()`s on `FindingZ`
(`summary.ts:108-113`): `disposition: 'waived'` requires a `waiver`, and a
`waiver` requires `disposition: 'waived'` — an orphaned waiver on a
non-waived finding is never valid. The reasoning is stated inline in the
schema comment: "a waiver with no expiry is a belief masquerading as
knowledge." This slice only computes fresh identity and a default `open`
disposition at detection time (see `attachFindingIdentity` below) — no code
anywhere in the repo yet constructs `accepted`/`waived`/`fixed`/`superseded`;
mutating a finding's disposition is a follow-on phase's CLI surface.

**`id`'s formula.** `computeFindingId(file, anchor, severity, message)`
(`packages/core/src/verify/finding-identity.ts:62-69`) is a sha256 hex
digest, via `node:crypto` (already used elsewhere in this codebase — no new
runtime dependency), over a stably-ordered, JSON-encoded tuple of
`(file, normalized message)` **only** — deliberately **never a line
number**. Phase 245 narrowed the formula to just these two inputs:
`anchor` and `severity` are still accepted as parameters (call-site
compatibility — `attachFindingIdentity` and its callers pass them
unchanged), but no longer participate in the hash, because both can
legitimately change across settles for the same underlying defect
(re-anchoring via the DRAFT-amendment workflow, live LLM severity
classification under real providers), and including them previously minted
a new `id` — and a duplicate Recommendation — for an unchanged defect. The
message is whitespace-normalized first (`normalizeMessage`,
`finding-identity.ts:37-39`) so incidental rewrapping doesn't mint a new id,
but is not otherwise semantically folded — a genuinely different message
still produces a different id. Excluding the line number is the whole
point: an edit that only shifts where a finding sits (an unrelated diff
earlier in the file, a refactor) must not make a tracked finding look new,
or disposition/waiver state attached to it would silently reset every
settle. `attachFindingIdentity` (`finding-identity.ts:81-94`) is the batch
adapter `gates/code-review.ts` calls (`gates/code-review.ts:105`) before
persisting: it stamps every anchored finding with its computed `id`,
`target: 'artifact'` (code-review findings are always about the artifact
being changed, never a verification claim), and `disposition: 'open'`,
leaving every other field (severity, message, line, anchor) unchanged.

**`AnchorZ.kind` widens to include `'invariant'`**
(`summary.ts:58-62`), alongside the existing `'ac'|'boundary'|'none'`.
No producer emits it yet — promoting a recurring finding into an invariant
is phase 237's scope (contingent on phase 236 having routed enough findings
for `RetroRollup.findingCategories.recurring` to be non-trivially populated;
see the ROADMAP). Every pre-existing `'ac'`/`'boundary'`/`'none'` anchor
continues to parse and resolve identically to before this change.

**The two divergent `Finding` types converge into one.** Before this phase,
`packages/types/src/summary.ts`'s persisted `FindingZ` (severity
`critical|high|medium|low`) and `packages/core/src/verify/code-review.ts`'s
locally-declared `Finding`/`FindingSeverity` (severity `high|medium|low`
only) were two independently-maintained shapes for the same concept. Per the
source design doc's local D9 ("one Finding type, discriminated by `target`"),
`verify/code-review.ts` no longer declares its own type — it imports the
shared `Finding` from `@thomas-powers-jr/cadence-types` directly
(`verify/code-review.ts:4`), and every construction site (the mock walker,
the Anthropic-response mapping) keeps emitting `'high'|'medium'|'low'`
literals, a valid subtype of the wider shared severity union.
`packages/core/src/contracts/index.ts` keeps `CodeReviewFinding` /
`CodeReviewFindingSeverity` as re-exported aliases of the same shared type
(`contracts/index.ts:167-186`) purely for name back-compat with existing
consumers (`gates/types.ts`, `notify/code-review.ts`); new code can import
`Finding` from `@thomas-powers-jr/cadence-types` directly instead.
`security-audit`'s findings already used the shared `FindingZ` and are
unaffected — they simply never populate the new `id`/`target`/`disposition`
fields (wiring identity computation into `gates/security-audit.ts` is out of
scope for this phase).

**What is deliberately not built yet.** This slice is schema and pure
computation only — no I/O, no ledger writes:

- **Findings-to-ledger auto-routing was NOT implemented in this phase-236
  slice — it now is, as of phase 242.** Nothing in phase 236 itself created
  `Recommendation`/`Evidence` entries from findings during settle.
  `RecommendationSourceZ` gained a `'review'` member
  (`packages/types/src/intelligence.ts:3-15`) purely so a future routing
  phase would have correct provenance to route with instead of mislabeling
  code-review findings `'manual'`/`'cadence'` — at the time, no routing
  behavior read or wrote that value yet. This was real I/O-port-threading
  work (a settle-time writer that turns a finding into a ledger entry),
  deliberately split to a follow-on phase and recorded as an inline "As
  built" amendment on the phase 236 roadmap entry (`.cadence/ROADMAP.md`).
  That follow-on is now numbered and shipped — see "Findings-to-ledger
  auto-routing (phase 242)" directly below for what it built.
- **No disposition-management surface exists.** There is no CLI or mutation
  path to accept/waive/fix/supersede a finding; every finding this phase
  produces is stamped `disposition: 'open'` and stays there.
- **`security-audit` findings are not identity-stamped.** They already share
  the converged `Finding` schema, so the new fields simply stay absent on
  them for now.

### Findings-to-ledger auto-routing (phase 242)

Phase 242 implements the behavioral half phase 236 deliberately deferred —
the source design doc's §7.3 (`docs/handoffs/cadence-phase0-assurance-kernel-review.md`):
identified code-review findings now route into the recommendation ledger at
settle time, as ordinary `Recommendation`/`Evidence` records.

**`deriveRoutingCandidates`** (`packages/core/src/intelligence/finding-routing.ts:237-278`)
is the pure derivation, taking the settle's `codeReview` findings, the set of
already-routed `Finding.id`s, and settle-pointer facts — no fs, no clock read
(`now` is injected). It groups findings by `Finding.id` first
(`dec-20260731-001`): two or more findings that collide on identity within
one settle (the collision rec-20260731-001 found — same file/anchor/
severity/normalized-message, no occurrence discriminant) merge into a single
candidate, whose summary and evidence text explicitly record the occurrence
count — never silently minting one entry with no trace of the collapsed
duplicates, and never minting *N* separate entries for one id. A finding
with no stable `id` is skipped rather than force-routed — today that means
every `security-audit` finding, since identity is not wired into that gate
(phase 236's boundary, still true). Exactly one `scoutId` (the existing
`scout-YYYYMMDD-HHMM` convention) is minted per call and shared across the
whole batch, never one per finding.

**`finalizeAndCloseSettle`** (`packages/core/src/services/settle.ts:943-990`)
wires the derivation in as one named step, right after the SUMMARY is
written, matching the existing retro-digest step's shape exactly. It is
gated on `recommendations.autoRoute` (`z.boolean().default(true)`,
`packages/types/src/config.ts:411-416`) and skipped entirely when the
code-review gate didn't run at all. It reads the current recommendation
ledger's **both** `recommendations` and `archived` arrays to build the
already-routed-id set — a previously-routed finding can already be
soft-archived (`recommendations.autoArchive` defaults on) by the time its
phase is re-settled, so checking only the active array would let a re-settle
silently re-route it (AC-2). The step is best-effort: a caught failure (e.g.
a ledger write error) never blocks or fails settle, and always prints a
stderr notice — `io.err('note: finding-ledger routing failed — …')` — rather
than a silent `catch {}`.

Each routed candidate becomes a `Recommendation` with `source: 'review'`,
written via the extended `addRecommendation`
(`packages/core/src/intelligence/store/recommendations.ts:66-70, 92-152`),
linked to an `Evidence` entry of `kind: 'cadence-artifact'` whose `path`
points at that settle's `<draftId>-SUMMARY.json` and whose `summary` names
the phase id, draft id, and SUMMARY `contentHash`.

**Explicitly still out of scope**, matching phase 236's own boundary:
disposition mutation (accept / waive / fix / supersede) still has no CLI
surface — every routed finding stays `disposition: 'open'`; `security-audit`
findings still have no identity wired in; and there is no per-settle cap on
how many candidates a single batch can route. **A `high`/`critical`
code-review finding does not route on a normal settle at all** — the
code-review gate refuses on any `high` finding (`collectHighFindings`,
`gates/code-review.ts`), so settle takes the `writeRefusedSettleSummary`
path and never reaches `finalizeAndCloseSettle`, where this step lives. Such
findings only route when the operator bypasses the gate (`--force` /
`--allow-code-review-failure`) — see `rec-20260731-004`.

### Gate bypass reference summary

| Flag | Command | Gate bypassed |
|---|---|---|
| `--allow-stale-draft` | `settle run` | `draft-read` |
| `--allow-missing-coverage` | `settle run` | `test-coverage` |
| `--allow-open-tasks` | `settle run` | `structural-verifier` |
| `--no-approve` | `draft approve` | `approve` |
| `--allow-per-task-failure` | `build task` | `per-task-verify` |
| `--allow-code-review-failure` | `settle run` | `code-review` |
| `--allow-plan-review-failure` | `draft approve` | `plan-review` |
| `--allow-spec-review-failure` | `spec approve` | `spec-review` |
| `--allow-ui-spec-review-failure` | `spec approve` | `ui-spec-review` |
| `--allow-security-audit-failure` | `settle run` | `security-audit` |
| `--evidence-floor-bypass <AC-id:reason>` | `settle run` | `evidence-floor` (named AC only — never a blanket bypass) |
| `--allow-verifier-failure` | `settle run` | `deep-verify` transport errors |
| `--force` | `settle run` | `deep-verify` / `interactive-verdict` / `code-review` / `security-audit` (all at once) |
| `--no-interactive` | `settle run` | `interactive-verdict` (opt-out, not failure bypass) |
| `--allow-auto-complex` | `draft approve` / `settle run` | `auto × complex` soft cap |
| `--allow-failing-build` | `settle run` | `build-test-must-pass` |
| `--allow-boundary-scan-failure` | `settle run` | `boundary-scan` |

The bypass flags for `test-coverage`, `build-test-must-pass`, and `boundary-scan` in
the table above stop working when the gate's id is listed in the
[`gates.sealed`](reference/config.md#gates) config array (Phase 141) — `--force` and
the gate's own `--allow-*` flag are both ignored, and settle refuses with a distinct
message naming `gates.sealed`. This is config-driven, not a matrix change: the
`production` preset seals `test-coverage` and `build-test-must-pass` by default;
`solo`/`team` seal nothing; `boundary-scan` can be added to `gates.sealed` manually
but is not sealed by any preset.

#### Bypass-flag naming policy

Three shapes cover the table above. **`--force`** is the generic, blunt override —
it exists for the build-correctness and verification-quality gates (`test-coverage`,
`build-test-must-pass`, `boundary-scan`, `structural-verifier`, `code-review`,
`security-audit`, `deep-verify`, `interactive-verdict`) and is documented per-gate as
an alternate bypass alongside that gate's own flag, never as the only way to
proceed. Every gate with a dedicated bypass otherwise uses
**`--allow-<gate>-failure`** as its primary, self-documenting flag —
`--allow-per-task-failure` (gate id `per-task-verify`) trims the redundant
"-verify" for readability but is otherwise the same shape, not a deviation.

Four flags don't fit that shape, for two different reasons. `--allow-missing-coverage`
(`test-coverage`, Phase 14) and `--allow-stale-draft` (`draft-read`, Phase 23.1)
genuinely **pre-date** the `--allow-<gate>-failure` convention, which started with
`--allow-per-task-failure` in Phase 24.2 — both were already shipped before the
convention existed. `--allow-failing-build` (`build-test-must-pass`) and
`--allow-open-tasks` (`structural-verifier`) are different: both were introduced
together in Phase 39.2, **two weeks after** the convention was established, and simply
didn't follow it — an inconsistency at the time they were added, not a historical
holdover. All four are kept as-is regardless of which reason applies: renaming any
shipped flag is a breaking CLI change, so this is an accepted exception to fix by
documenting, not by renaming.

A few table entries sit outside both shapes by design, not by accident:
`--no-approve` and `--no-interactive` opt a stage *out* entirely rather than
proceeding past a failure; `--evidence-floor-bypass <AC-id:reason>` is a named,
per-AC exemption that can never be a blanket bypass (see its entry above);
`--allow-auto-complex` overrides the `auto × complex` tier soft cap, which isn't a
gate refusal at all. `--allow-verifier-failure` is narrower still: it never
overrides `deep-verify`'s AC verdicts, only transport failures against the verifier
provider, so it's named after the failure class it recognizes rather than the gate
id — a deliberate, narrow carve-out in the same spirit as `--evidence-floor-bypass`.

With every flag in the table accounted for above, this audit found no gate flag
that needs a follow-up rename recommendation — every deviation from
`--allow-<gate>-failure` has an explicit, intentional reason rather than being
silently absorbed.

### Non-TTY auto-bypass (agents & CI)

The two interactive gates — `approve` (at `cadence draft approve`) and
`interactive-verdict` (at `cadence settle run --interactive`) — read a human
keypress. When stdin is **not a TTY** (an AI agent, CI, a pipe), there is no human
to answer, so CADENCE auto-bypasses them instead of hard-failing:

- **`approve`** auto-passes and prints `note: non-TTY; approve gate auto-passed …`
  to stderr (the draft flow has no SUMMARY, so the notice is the audit trail).
- **`interactive-verdict`** skips its per-AC walker, the gate passes, and the
  SUMMARY records `interactiveVerifySkipped: "non-tty"`. No human verdicts are
  fabricated — the other verification gates (`test-coverage`, `deep-verify`) still
  decide the outcome.

This removes the pre-1.29 `StdinPrompter: stdin is not a TTY` error class on the
first run, with no setup. Three environment variables tune it:

| Env var | Effect |
|---|---|
| `CADENCE_REQUIRE_TTY=1` | Restore the strict pre-1.29 behavior — refuse in a non-TTY instead of bypassing (for CI that wants a hard human gate). Wins over the others. |
| `CADENCE_NONINTERACTIVE=1` | Force bypass **even when a TTY is present** — for agents that allocate a pseudo-TTY (`isTTY` is true but no human is watching). |
| `CADENCE_PROMPTER_SCRIPT=<answers>` | Existing automation seam: newline-separated scripted answers. When set, the prompt is **always honored** (never bypassed) — explicit answers were supplied. |

Precedence: `CADENCE_PROMPTER_SCRIPT` → `CADENCE_REQUIRE_TTY` → `CADENCE_NONINTERACTIVE`
→ the `isTTY` default. The per-command flags still work too: `--no-approve` and
`--no-interactive` opt out of the respective gate regardless of TTY state.

### MCP tool-trust envelope

Two of the 18 MCP tools (see [docs/mcp.md](mcp.md)) are classified
`APPROVAL_BYPASS`: `cadence_draft_approve` and `cadence_spec_approve`. A call
over MCP is inherently non-TTY, so without anything further the `approve`
gate above would simply auto-pass for them — "the tool call IS the
approval," unconditionally. `cadence mcp trust grant/revoke/list` (phase 181)
constrains that: before `cadence_draft_approve` or `cadence_spec_approve`
ever reaches `draftApproveService`/`specApproveService` — before any
`state.json`, DRAFT, or SPEC write occurs — the server checks for a valid
trust grant and refuses, naming the failing check, if one doesn't exist.

A grant binds four things:

- the **tool name** it was issued for;
- a **structural def-hash** — a sha256 over the tool's name + description +
  `inputSchema` shape exactly as currently registered in `TOOLS`. If the
  tool's definition changes (e.g. its description or schema is edited), the
  old grant's hash no longer matches and the grant is treated as invalid
  until re-granted (revoke-on-def-change);
- the **CADENCE version** it was granted under — a version bump likewise
  invalidates a stale grant (revoke-on-version-change);
- an optional **expiry** (`--ttl-days`; omit for a grant that never
  expires).

Grants are issued **only** by `cadence mcp trust grant`, run by an operator
on a real terminal. This is the core security property of the envelope: no
MCP tool call can create, list, or revoke a grant — an MCP client can never
self-attest or self-grant its own trust; only an out-of-band CLI invocation
can. `cadence mcp trust grant` itself refuses (capability-class check) for
any tool that isn't `APPROVAL_BYPASS`/`SETTLE` — there is nothing to gate on
a read-only, ledger-write, or loop-write tool.

`cadence_settle` is classified `SETTLE`. Its `run()` is wrapped with the same
trust-envelope pre-check as the two `APPROVAL_BYPASS` tools (phase 216): an
MCP call to `cadence_settle` with no valid, matching, unexpired grant is
refused before `settleService` ever runs — no `state.json`/`SUMMARY`
write, no gate-ladder execution. A valid grant, issued via
`cadence mcp trust grant --tool cadence_settle` on a real terminal, lets the
call proceed exactly as before. See
[docs/reference/commands.md — mcp](reference/commands.md#mcp) for the full
`trust grant`/`revoke`/`list` CLI reference.

---

## Providers

Each gate that calls an AI verifier delegates to a **provider**. Three providers
are available:

| Provider | Description | Requires |
|---|---|---|
| `mock` | Deterministic offline **placeholder**, **not real verification**. `deep-verify`/`per-task-verify` only check each AC links to a test. The review-family gates (`code-review`, `security-audit`, `plan-review`, `spec-review`, `ui-spec-review`) still run their own deterministic checks and can still refuse on a real finding, but a clean mock pass records as **abstained**, never as a persisted pass. | Nothing — works everywhere |
| `anthropic` | Calls the Anthropic API; prompt-cached system prompt | `ANTHROPIC_API_KEY` in environment |
| `local` | OpenAI-compatible `/v1/chat/completions` endpoint (e.g. Ollama) | `CADENCE_LOCAL_BASE_URL` + `CADENCE_LOCAL_MODEL`; falls back to `mock` with a warning if unset |

Providers are configured per gate in `.cadence/config.json` (e.g.
`verifier.provider`, `perTaskVerifier.provider`, `codeReview.provider`,
`planReview.provider`, `securityAudit.provider`). Each gate also accepts an
optional `model` override.

Every gate defaults to `mock`, which is a placeholder, **not real verification**
— a fresh project does no real AI verification until you switch a provider on. The guided one-command way is
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
the repo and the loop's state but writes only its own records. The loop's own
execution — which gate runs, what passes or refuses — never reads Praxis to
decide anything, and Praxis never writes loop state. They meet on a narrow,
mostly one-way seam, described at the end of this section (as of phase 242,
two paths wide in the loop→Praxis direction, not one).

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
  `converted` (→ `settle-pending` → `shipped` once its phase settles and later
  ships) | `shipped` (reachable directly too, via `recommendation promote`).
  The operator-driven disposition.
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
`exported` (a SPEC scaffold staged) | `deferred` | `closed`; `deferred` →
`proposed` via `cadence milestone reopen <id>`.

Each milestone carries an operator-owned **pre-mortem** — likely failure modes,
hidden dependencies, drift risks, and explicit out-of-scope — that is never
auto-derived. `cadence milestone export <id> --to cadence` renders a
deterministic SPEC scaffold from the milestone's facts and stages it under
`exports/`; it does **not** run `cadence spec new` and never allocates a loop
id. Staging and entering the loop stay separate, deliberate steps.

`clusterMilestones` treats every non-`proposed` milestone as a persisted
survivor and permanently excludes its claimed `recommendationIds` from
re-clustering — so before phase 203, `deferred` was a dead end with no CLI
path back; the only escapes were a hand-edit of `milestones.json` or
restarting the underlying recommendations from scratch. `cadence milestone
reopen <id>` closes that gap: it transitions a `deferred` milestone back to
`proposed`, dropping it out of the survivor set so its recommendationIds
re-enter the eligible pool the next time `propose` runs. It refuses (exit 1)
if the milestone isn't currently `deferred` (naming the current status), the
id doesn't exist, or any of its recommendationIds is already claimed by
another still-live milestone (any status other than `deferred`/`proposed`) —
that claim would otherwise give the same recommendation two owners.

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

Praxis is strategic input; the loop is execution. Their primary connection is
one path, in one direction at a time — a rec's journey into a phase and back:

```
rec (readiness → ready-for-cadence-spec)
  → cluster into a milestone
    → milestone export  ⟶  SPEC scaffold        [Praxis → loop]
      → SPEC → DRAFT → BUILD → SETTLE            (one or more slices)
        → recommendation convert --to-phase  ⟶  rec status = converted   [loop → Praxis]
```

Praxis never writes loop state, and the loop's own execution decisions —
which gate runs, what passes or refuses — never depend on ledger content. But
the loop→Praxis direction is now two paths, not one: the terminal `convert`
link above, and — as of phase 242 — a second, best-effort settle-time writer
that reads the ledger only to dedup (skip a finding already routed in a prior
settle) and then mints new `source: 'review'` `Recommendation` entries from
identified code-review findings (see "Findings-to-ledger auto-routing (phase
242)" above). Both paths are one-way: `convert` has no unconvert, and the
finding-routing writer never re-reads its own output within a settle to
change what the loop does. The staged SPEC scaffold (Praxis → loop) remains
the only coupling running the other direction.

### Scouting recs into the ledger

Recommendations enter the ledger one at a time via `cadence recommendation add`.
To *generate and triage many candidates at once* for a fuzzy problem, the Claude
Code host installs **`/cadence-scout`** — a divergent→convergent ideation
dialogue that lands the survivors as recs (with provenance evidence) and then
hands you back to `cadence recommend` and the seam above. Scout is host-side
only: it produces ordinary Praxis records and never drives the loop, allocates a
loop id, or runs a gate.

> **Terminology:** this guide and the codebase use precise names for these
> concepts — see the project glossary, [`CONTEXT.md`](https://github.com/thomas-powers-jr/cadence/blob/main/CONTEXT.md), for the
> canonical term for each (and the aliases to avoid).

### Empty-result and refusal messages

Any intelligence-layer command that can legitimately return "nothing" —
`cadence recommend`, `cadence milestone propose`, `cadence recommendation
promote`/`convert`/`list`, `cadence retro`, and future commands in this
family — follows one invariant (established phase 207): every empty-result
or refusal message states four things:

- **why** — the reason nothing came back, in plain language.
- **precondition** — the concrete unmet condition (e.g. "requires
  status=accepted and readiness in {ready-for-milestone,
  ready-for-cadence-spec}"), not a vague "no matches."
- **nearest candidate(s)** — named from the ledger the command already
  loaded, not a fresh query, so the message costs no extra I/O.
- **exact command** — copy-pasteable with the real id/values already at
  hand, not a placeholder.

The preferred mechanism is the shared `findNearestCandidates` helper
(`packages/core/src/intelligence/nearest-candidate.ts`), built on the same
`partitionLedger` + `scoreRecommendation` ranking `cadence recommend` and
`cadence next` already use, so a message's "nearest" never diverges from the
ranking a user would see elsewhere. It isn't universal, though:
`cadence recommend`'s own empty-ranked case is a documented exception — the
report it renders from doesn't carry the raw scoring inputs the helper
needs, so it names the first parked/needs-attention entry instead rather
than standing up a second scoring path. When a command's "nearest" concept
isn't ledger-ranking at all (an id typo, say), a small purpose-built matcher
is fine too — recommendation-lookup refusals use an id prefix/substring
matcher rather than the ranking helper or a general fuzzy-match library.

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
`.cadence/phases/*` (the DRAFT/SUMMARY/PROGRESS artifacts) are tracked files, but
`.cadence/state.json` and `STATE.md` are **gitignored by default**, precisely
because they re-stamp on every read: each is inherently single-writer and must
never be merged across loops. Git worktrees share one `.git` but each has its
own working tree, so **each worktree holds its own private copy of
`.cadence/`**. Phase numbers are operator-supplied, and the "next: N" surfaced
by `progress`/`recommend` is just a read of the local `state.json`. The loop
implicitly assumes a **single writer** to the phase-number space.

Two worktrees branched from the same commit can therefore both conclude "phase N
is next." If they use the same slug (`30-foo` in both), you get a real git
conflict at merge — loud. If they use *different* slugs (`30-auth` vs `30-cache`),
the directories don't textually conflict, so git **silently merges both in** —
two phase 30s and a broken invariant, no conflict marker. That quiet case is the
dangerous one. (`state.json` diverges constantly across concurrent worktrees'
copies — untracking it removes the merge-conflict hazard outright rather than
just documenting it. The settle-time audit-trail value that a tracked
`state.json` used to carry incidentally now lives explicitly in the
`stateAtSettle` field of `SUMMARY.json`/`SUMMARY.md`.)

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

`cadence resume` (v1.38, phases 142–143) applies the same ground-truth
philosophy to a sibling concern: resumable sessions. Each worktree writes its
own `SESSION-*.md` handoff docs, so a bare `cadence resume` now also scans
`git worktree list` live and reads each sibling's `.cadence/handoff/` directly —
no cached or shared index anywhere, just the same "observe the working trees
that exist right now" move the phase-collision guard makes for phase numbers.
By default, when 2+ resumable candidates turn up, it resumes local and prints a
stderr nudge pointing at `cadence resume --list` rather than opening the picker
automatically — a sibling pick is read-only and never touches the sibling's own
`.cadence/`. Tune or disable this via the
[`resume` config block](reference/config.md#resume) (`crossWorktree: false`
turns it off; `autoList: true` opens the picker automatically instead of
nudging).

Phase 163 (v1.42) closes two gaps that ground-truth discovery alone doesn't
catch: a handoff can be *stale relative to origin*, and a handoff can be
*incomplete*. `cadence resume` now runs a best-effort origin-freshness probe
(`resume.remoteCheck`, default `true`; `--offline` to skip) and warns when
origin holds commits this clone doesn't — the sibling-worktree scan only
sees what's checked out locally, not what another machine already pushed. It
also detects scaffolded `<!-- … FILL IN … -->` markers left unfilled in the
replayed doc and warns that those sections should be treated as absent.
`cadence handoff --check` gates the same detection at handoff-time, exiting
non-zero if the freshest doc still has unfilled sections — see
[handoff](reference/commands.md#handoff) and
[resume](reference/commands.md#resume) for the full behavior.

---

*Next: [docs/reference/config.md](reference/config.md) — full configuration
reference | [docs/reference/commands.md](reference/commands.md) — command
reference | [docs/cli.md](cli.md) — how-to guide*
