# CLI Command Reference

This page is the authoritative per-command reference for the CADENCE CLI. Options
and defaults are verbatim from `--help` output. For conceptual explanations of the
loop, gates, profiles, and tiers, see [docs/concepts.md](../concepts.md). For
configuration fields and presets, see [docs/reference/config.md](config.md).

Two CLIs are documented here:

- **`cadence`** — the core CLI (`@cadence/core`)
- **`cadence-host-claude-code`** — the Claude Code host adapter (`@cadence/host-claude-code`)

---

## Table of contents

- [cadence](#cadence)
  - [config](#config)
  - [init](#init)
  - [draft](#draft)
  - [hook](#hook)
  - [build](#build)
  - [done](#done)
  - [block](#block)
  - [needs-context](#needs-context)
  - [settle](#settle)
  - [progress](#progress)
  - [status](#status)
  - [recommendation](#recommendation)
  - [inspect](#inspect)
  - [recommend](#recommend)
  - [milestone](#milestone)
  - [context](#context)
- [cadence-host-claude-code](#cadence-host-claude-code)
  - [install](#install)
  - [hook (host)](#hook-host)
- [Carry-forward notes](#carry-forward-notes)

---

## cadence

```
Usage: cadence [options] [command]

CADENCE — Coordinated AI-Driven Engineering with Notifications and Customizable Execution
```

**Global options**

| Option | Description |
|---|---|
| `-V, --version` | Output the version number |
| `-h, --help` | Display help for command |

<!-- cadence:commands:start -->
config
init
draft
spec
hook
build
done
block
needs-context
settle
progress
status
recommendation
inspect
recommend
milestone
context
assumption
decision
intelligence
<!-- cadence:commands:end -->

---

### config

```
Usage: cadence config [options] [command]

Read/write CADENCE config
```

**Subcommands**

| Subcommand | Synopsis |
|---|---|
| `get <key>` | Print a config value (dotted path) |
| `set <key> <value>` | Update a config value and validate against schema |
| `doctor` | Diagnose config conflicts |

**`config get`** — prints the value at the given dotted config path (e.g.
`cadence config get profile`).

**`config set`** — writes a value and validates it against the config schema.
Invalid values are rejected before writing. For the full list of config keys,
see [docs/reference/config.md](config.md).

**`config doctor`** — reports conflicts between the active config values (e.g.
a gate required by the profile that the config's provider block does not
satisfy).

**Exit codes** — invalid key/value format causes a non-zero exit; behavior on
unknown keys follows schema validation (rejected with an error message).

---

### init

```
Usage: cadence init [options]

Scaffold a new .cadence/ directory in the current working tree
```

**Options**

| Option | Default | Description |
|---|---|---|
| `--name <project>` | (prompted) | Project name |
| `--profile <preset>` | `"team"` | Config preset: `solo \| team \| production` |
| `--gate-profile <p>` | (suggested from git history) | Gate profile: `strict \| standard \| auto` |
| `--claude-md` | — | Only (re)generate the managed CLAUDE.md block at the repo root; allowed on an already-initialized project |
| `-h, --help` | — | Display help for command |

**Behavior** — writes `.cadence/config.json`, `.cadence/state.json`,
`.cadence/PROJECT.md`, and a managed block in the repo-root `CLAUDE.md`. The
`--profile` flag selects a config preset; `--gate-profile` sets which quality
gates fire by default. When `--gate-profile` is omitted, CADENCE analyses git
history to suggest a value. When `--name` is omitted and the session is
interactive, CADENCE prompts for it.

The `--claude-md` flag is the only `init` option permitted on an
already-initialized project; it is used to refresh the CLAUDE.md block without
re-scaffolding state.

**Exit codes** — exits non-zero if the directory is already initialized (without
`--claude-md`) or if required options are missing in a non-interactive context.

---

### draft

```
Usage: cadence draft [options] [command]

Draft phase workflow
```

`draft` groups the three commands that move work through the DRAFT loop
position. See [docs/concepts.md — The loop](../concepts.md#the-loop) for the
IDLE → DRAFT → BUILD → SETTLE model.

#### draft new

```
Usage: cadence draft new [options] <phase> <num>

Scaffold a new DRAFT.md under .cadence/phases/<phase>/
```

**Arguments**

| Argument | Description |
|---|---|
| `<phase>` | Phase identifier (e.g. `P24`) |
| `<num>` | Draft number within the phase (e.g. `1`) |

**Options**

| Option | Default | Description |
|---|---|---|
| `--title <t>` | `"Untitled"` | Draft title |
| `--tier <t>` | `"standard"` | Tier: `quick-fix \| standard \| complex` |
| `--from-rec <recId>` | — | Praxis recommendation id. On success, the rec is auto-converted to this phase via the Slice 34.1 transition helper. Symmetric semantics with `cadence spec new --from-rec`. Composes with the existing SPEC-seeded draft body: an approved SPEC plus `--from-rec` produces a SPEC-seeded DRAFT.md AND records the rec→phase link in one operator action. |
| `-h, --help` | — | Display help for command |

**Behavior** — creates `.cadence/phases/<phase>/<num>/DRAFT.md` pre-populated
with the tier-appropriate template. The tier affects which gates fire at
`settle run` time. See
[docs/concepts.md — Profiles × tiers](../concepts.md#profiles--tiers).

#### draft check

```
Usage: cadence draft check [options] <path>

Coherence-check a DRAFT.md against state.json + PROJECT.md
```

**Arguments**

| Argument | Description |
|---|---|
| `<path>` | Relative or absolute path to the `DRAFT.md` file to check |

**Behavior** — validates the DRAFT.md for internal consistency (required
sections present, AC IDs well-formed, tier field valid) and checks it against
the current `state.json` and `PROJECT.md`. Prints findings; does not modify
any files. Suitable to run before `draft approve`.

**Exit codes** — exits non-zero when coherence violations are found.

#### draft approve

```
Usage: cadence draft approve [options] <phase> <num>

Approve a draft and enter BUILD phase
```

**Arguments**

| Argument | Description |
|---|---|
| `<phase>` | Phase identifier |
| `<num>` | Draft number |

**Options**

| Option | Description |
|---|---|
| `--allow-auto-complex` | Override DESIGN.md §4 M2 soft cap: approve an `auto × complex` draft anyway |
| `--no-approve` | Bypass the manual approve gate (Phase 24.1) per invocation; required for non-TTY runs when the `approve` gate is in the effective set |
| `--allow-plan-review-failure` | Proceed past a failing plan-review gate (Phase 25.1) instead of refusing approve; findings are still printed |
| `-h, --help` | Display help for command |

**Behavior** — validates the named DRAFT.md, runs any configured pre-approve
gates (manual-approve gate, plan-review gate), and transitions `state.json` to
BUILD. On a `strict` or `standard` profile with the `approve` gate active,
the command requires a TTY (interactive confirmation) unless `--no-approve` is
passed.

**Gate interactions** — See [docs/concepts.md — The gate universe](../concepts.md#the-gate-universe).
The `--no-approve` flag bypasses only the manual-approve gate (Phase 24.1);
the plan-review gate (Phase 25.1) is bypassed separately with
`--allow-plan-review-failure`.

**Exit codes** — exits non-zero when a gate refuses and no bypass flag is
provided.

---

### spec

```
Usage: cadence spec [options] [command]

Spec phase workflow (pre-DRAFT)
```

The optional pre-DRAFT `SPEC` loop position (Phase 36.1). `spec new` (from
IDLE) scaffolds `<id>-SPEC.md` (objective / acceptance criteria / constraints
/ open questions) and moves the loop to `SPEC`; you author the SPEC
externally; `spec check <path>` is a read-only structural sanity; `spec
approve <phase> <num>` runs a **convergent spec-review gate** (mock /
anthropic / local via `config.specReview`) — it tracks attempts in a
`<id>-SPEC-REVIEW.json` sidecar and, after `config.convergence.maxAttempts`
(default 3) failing reviews, hard-escalates with a `spec-review-unconverged`
anomaly. On pass it returns the loop to `IDLE` (so `cadence draft new`
proceeds). `cadence draft new` refuses while a spec is active.

**Options (`spec new`)**

| Option | Description |
|---|---|
| `--title <t>` | Spec title (defaults to "Untitled"). |
| `--from-rec <recId>` | Praxis recommendation id. On success, the rec is auto-converted to this phase via the Slice 34.1 transition helper (status flips to `converted`, `convertedToPhaseId` records the link). Pre-flight: rec must exist with status `candidate` or `accepted`; otherwise refuses before any fs writes. If the chained convert fails after scaffold succeeded (race), stderr explains how to recover with `recommendation convert`. |

**Options (`spec approve`)**

| Option | Description |
|---|---|
| `--allow-spec-review-failure` | Proceed past a failing/unconverged spec-review (any verdict) instead of refusing; findings still printed, `bypassed:true` recorded. |

The spec stage is **opt-in by use** — projects that never run `cadence spec
new` are unaffected. There is no `spec discard` command; to abandon an active
spec, hand-edit `.cadence/state.json` (`loopPosition`→`IDLE`,
`activeSpec`→`null`) and delete the `<id>-SPEC.md`.

**Exit codes** — non-zero when spec-review refuses (reloop/escalate) without
`--allow-spec-review-failure`.

---

### hook

```
Usage: cadence hook [options] <event>

Dispatch an abstract hook event (called by host adapter shims)
```

**Arguments**

| Argument | Description |
|---|---|
| `<event>` | Abstract hook event name dispatched by the host adapter |

**Behavior** — this command is not intended to be called directly by users; it
is the integration point for host adapter shims (e.g. `cadence-host-claude-code hook`).
The host adapter translates tool-specific hook payloads into an abstract event
and invokes `cadence hook <event>`. CADENCE then runs the configured hook
handlers from `config.json → hooks`.

---

### build

```
Usage: cadence build [options] [command]

BUILD phase task tracking
```

`build` groups the task-recording subcommand used during the BUILD loop
position.

#### build task

```
Usage: cadence build task [options] <id>

Record outcome for task <id>
```

**Arguments**

| Argument | Description |
|---|---|
| `<id>` | Task ID to record (e.g. `T1`, `T2`) |

**Options**

| Option | Default | Description |
|---|---|---|
| `--status <s>` | `"DONE"` | `DONE \| DONE_WITH_CONCERNS \| NEEDS_CONTEXT \| BLOCKED` |
| `--notes <n>` | `""` | Notes |
| `--allow-per-task-failure` | — | Bypass the per-task verifier gate (Phase 24.2): record DONE even if the verifier refuses |
| `-h, --help` | — | Display help for command |

**Behavior** — writes the outcome for the given task ID into `.cadence/state.json`.
The per-task verifier gate (Phase 24.2) runs before recording a `DONE` status;
if the verifier refuses, the command exits non-zero unless
`--allow-per-task-failure` is passed.

**Task-ID validation** — `build task` validates that `<id>` exists in the
current draft's task list. Supplying an unknown ID causes a refusal (exit
non-zero). Note: the `block` and `needs-context` shortcut commands do **not**
share this validation — see [Carry-forward notes](#carry-forward-notes).

**Exit codes** — exits non-zero on gate refusal or unknown task ID.

---

### done

```
Usage: cadence done [options] <id>

Shortcut for `cadence build task <id> --status=DONE`
```

**Arguments**

| Argument | Description |
|---|---|
| `<id>` | Task ID to mark done |

**Options**

| Option | Default | Description |
|---|---|---|
| `--notes <n>` | `""` | Notes |
| `-h, --help` | — | Display help for command |

**Behavior** — equivalent to `cadence build task <id> --status=DONE
[--notes <n>]`. The per-task verifier gate (Phase 24.2) fires exactly as it
does for `build task`. See [build task](#build-task) for gate details.

**Exit codes** — same as `build task`: exits non-zero on gate refusal.

---

### block

```
Usage: cadence block [options] <id>

Shortcut for `cadence build task <id> --status=BLOCKED`
```

**Arguments**

| Argument | Description |
|---|---|
| `<id>` | Task ID to mark blocked |

**Options**

| Option | Default | Description |
|---|---|---|
| `--notes <n>` | `""` | Notes |
| `-h, --help` | — | Display help for command |

**Behavior** — equivalent to `cadence build task <id> --status=BLOCKED
[--notes <n>]`.

**Carry-forward limitation** — `block` does **not** validate the task ID
against the current draft. An unknown `<id>` is recorded as-is. Use
`cadence build task <id> --status=BLOCKED` if you need the validation. See
[Carry-forward notes](#carry-forward-notes).

---

### needs-context

```
Usage: cadence needs-context [options] <id>

Shortcut for `cadence build task <id> --status=NEEDS_CONTEXT`
```

**Arguments**

| Argument | Description |
|---|---|
| `<id>` | Task ID to mark as needing context |

**Options**

| Option | Default | Description |
|---|---|---|
| `--notes <n>` | `""` | Notes |
| `-h, --help` | — | Display help for command |

**Behavior** — equivalent to `cadence build task <id> --status=NEEDS_CONTEXT
[--notes <n>]`.

**Carry-forward limitation** — same as `block`: task-ID validation (Phase 29.8)
is not applied. An unknown `<id>` is recorded as-is. See
[Carry-forward notes](#carry-forward-notes).

---

### settle

```
Usage: cadence settle [options] [command]

Close the loop
```

`settle` groups the command that closes a BUILD phase, records AC verdicts, and
returns the project to IDLE.

#### settle run

```
Usage: cadence settle run [options]

Generate SUMMARY.md + JSON and return to IDLE
```

**Options**

| Option | Description |
|---|---|
| `--ac <pair...>` | AC verdicts: `AC-1=pass` or `AC-1=fail:reason` |
| `--auto` | Derive AC verdicts from task statuses (blocks on incomplete ACs) |
| `--force` | Settle even when `--auto` detects blocked or pending ACs |
| `--allow-missing-coverage` | Skip the test-coverage gate even if the active profile would enforce it |
| `--deep` | Run the independent verifier agent against each AC (provider from `config.verifier`) |
| `--allow-verifier-failure` | Do not refuse on verifier transport failures; record failure into SUMMARY and treat as `pass=false` |
| `--interactive` | Walk each AC and prompt the user for a pass/fail/skip verdict (Phase 16) |
| `--no-interactive` | Bypass the interactive-verdict gate even if the active profile would enforce it |
| `--allow-auto-complex` | Override DESIGN.md §4 M2 soft cap: settle an `auto × complex` draft anyway |
| `--allow-stale-draft` | Skip the DRAFT-read mtime gate even if the DRAFT.md was edited after approve |
| `--allow-code-review-failure` | Do not refuse on HIGH-severity code-review findings; record them in SUMMARY and emit anomalies anyway (Phase 24.3) |
| `--allow-security-audit-failure` | Do not refuse on CRITICAL security-audit findings; record them in SUMMARY and settle anyway (Phase 25.2) |
| `-h, --help` | Display help for command |

**Behavior** — runs all configured settle-time gates (coverage, verifier,
code-review, security-audit, interactive-verdict), records AC outcomes, writes
`.cadence/phases/<phase>/<num>/SUMMARY.md` and the corresponding JSON, and
transitions `state.json` back to IDLE.

AC verdicts may be supplied explicitly with `--ac`, derived automatically from
task statuses with `--auto`, or collected interactively with `--interactive`.
The three modes are mutually exclusive.

**Gate interactions** — each `--allow-*` flag bypasses exactly one gate. Using
`--force` overrides `--auto`'s refusal when ACs are incomplete but does not
bypass other gates. See [docs/concepts.md — The gate universe](../concepts.md#the-gate-universe).

**Exit codes** — exits non-zero when any gate refuses and the corresponding
`--allow-*` flag is not supplied.

---

### progress

```
Usage: cadence progress [options]

Show single recommended next action
```

**Behavior** — reads current `state.json` and prints a single recommended next
action (e.g. "Run `cadence draft new`", "Record task T2"). Intended for
quick orientation. For full loop context, use [`cadence status`](#status).

**Exit codes** — exits non-zero if `.cadence/` is missing or `state.json` is
unreadable.

---

### status

```
Usage: cadence status [options] [command]

Show full loop context (phase, draft, tasks, ACs, next)
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `-h, --help` | Display help for command |

**Behavior** — prints the current loop position, active draft title and tier,
task list with statuses, AC list with verdicts, and the next recommended
action. With `--json`, all fields are emitted as a structured JSON object
suitable for scripting.

#### status anomalies

```
Usage: cadence status anomalies [options]

List recorded anomaly events from .cadence/anomalies.log
```

**Options**

| Option | Default | Description |
|---|---|---|
| `--since <iso>` | — | Only show events with `ts >= this ISO8601 timestamp` |
| `--type <type>` | — | Filter by anomaly type: `ac-blocked`, `ac-needs-context`, `coverage-bypassed`, `files-outside-boundary`, `verifier-failure`, `force-used` |
| `--limit <n>` | `"20"` | Maximum number of events to show |
| `--tail` | — | Show the last N events oldest→newest (instead of the default newest-first list) |
| `--follow` | — | With `--tail`, keep the log open and stream new events as they are appended (Ctrl-C to stop; needs a TTY) |
| `-h, --help` | — | Display help for command |

**Behavior** — reads `.cadence/anomalies.log` and prints matching anomaly
events. Anomalies are recorded whenever a bypass flag (`--force`,
`--allow-*`) is used, or when the verifier detects a problem. The `--follow`
flag tails the log in real time; it requires a TTY.

---

### recommendation

```
Usage: cadence recommendation [options] [command]

Manage CADENCE strategic-intelligence recommendations
```

Manage CADENCE strategic-intelligence recommendations. Recommendations are
stored under `.cadence/intelligence/` and are not execution state; they become
execution input only after a later milestone/SPEC export step.

#### recommendation add

Adds a manual recommendation.

```sh
cadence recommendation add \
  --title "Add milestone pre-mortems" \
  --summary "Capture likely failure modes before milestone export." \
  --priority high \
  --readiness ready-for-milestone \
  --area core \
  --file packages/core/src/intelligence/store.ts \
  --evidence "Approved Praxis design requires milestone pre-mortems."
```

Writes:

- `.cadence/intelligence/recommendations.json`
- `.cadence/intelligence/evidence.json` when `--evidence` is provided
- `.cadence/intelligence/RECOMMENDATIONS.md`

#### recommendation list

Prints recorded recommendations in a compact table.

```sh
cadence recommendation list
```

**Options**

| Option | Description |
|---|---|
| `--filter-status <status>` | Filter to only entries with this status. |
| `--filter-text <substr>` | Case-insensitive substring search on title or summary. Mutually exclusive with `--filter-text-exact` and `--filter-regex`. |
| `--filter-text-exact <str>` | Case-insensitive whole-field equality match on title or summary. The entire scoped field must equal the literal (case-insensitive); substring matches do NOT match. Surrounding whitespace in the literal is significant (no trim). Mutually exclusive with `--filter-text` and `--filter-regex`. Empty literal returns exit 1. (Slice 36) |
| `--filter-regex <pattern>` | Power-user regex filter on title or summary (always case-sensitive by default; use `--filter-regex-flags` for case-insensitive / multiline / dotAll, or character classes like `[Cc]ycle` for one-off case-insensitivity). Mutually exclusive with `--filter-text` and `--filter-text-exact`. |
| `--filter-regex-flags <flags>` | RegExp flag letters to apply to `--filter-regex`. Allowed: `i` (case-insensitive), `m` (multiline `^/$`), `s` (dotAll `.`), `u` (unicode). Letter-string grammar mirrors JS RegExp's native second argument (`'is'` applies both). Requires `--filter-regex` to also be set (orphan use returns exit 1). Empty value, duplicate letters, and invalid letters all return exit 1 with the specific letter named. (Slice 37) |
| `--filter-converted-to <phaseId>` | Reverse-lookup filter: returns only recommendations whose `convertedToPhaseId` equals `<phaseId>`. Implies `status=converted` because only converted recs populate the field. Empty-result message uses `converted-to="<phaseId>"`. Pairs with `cadence spec new --from-rec` / `draft new --from-rec` (Slice 34.3) — operators converting a rec one direction can ask the reverse question via this filter. |
| `--sort-by <key>` | Sort by a single key, optionally suffixed with `:desc`. Default direction is ascending. Allowed keys: `created`, `updated`, `priority` (low<medium<high<critical), `status` (lifecycle order: candidate<accepted<deferred<rejected<converted), `title`, `leverage` (numeric 0–10), `risk` (numeric 0–10), `confidence` (numeric 0–1), `decay` (fresh<aging<stale<superseded<contradicted<needs-revalidation). Pipeline applies after filters, before `--reverse`/`--offset`/`--limit`. Composes with `--reverse`; `--sort-by X --reverse` ≡ `--sort-by X:desc`. (Slice 35) |

#### recommendation convert

Records the fact that a recommendation was implemented as a CADENCE phase.
The flag-name and shape of this transition was settled in
[`2026-05-25-cadence-rec-phase-linkage-design.md`](../superpowers/specs/2026-05-25-cadence-rec-phase-linkage-design.md)
(Praxis Slice 34) — terminal (no `unconvert`), 1:1 cardinality, strict FK
on the phase directory.

```sh
cadence recommendation convert <recId> --to-phase <phaseId>
```

**Options**

| Option | Description |
|---|---|
| `--to-phase <phaseId>` | Phase id; must exist under `.cadence/phases/`. Required. |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis).
The phase directory `.cadence/phases/<phaseId>/` must exist at convert
time (strict FK; mirrors Slice 28's `--by` pattern). Allowed from
`candidate` or `accepted`; refused from `deferred`, `rejected`, and
`converted` (re-convert refused naturally — `'converted'` isn't an
allowed source). On success, the rec ledger gets
`status='converted'` + `convertedToPhaseId=<phaseId>` + bumped
`updatedAt`; `RECOMMENDATIONS.md` re-renders so the Slice 15 status
bullet flips to `- status: converted`. The detail view from
`cadence recommendation show <recId>` gains a
`- converted-to-phase: <phaseId>` bullet right after `- status:`.

**Exit codes**

- `0` — converted, ledger updated.
- `1` — refused (phase dir missing, rec missing, or rec is in a
  non-convertible status). Refusal goes to stderr prefixed
  `recommendation convert refused:`; no ledger mutation on refusal.

**Drift** — if the phase directory is later deleted, the rec ledger's
`convertedToPhaseId` becomes a stale reference. Detection is deferred
to Slice 34.2's `intelligence audit` `stale-converted-phase` finding
kind (separate slice).

---

### inspect

```
Usage: cadence inspect [options]

Scan the project and synthesize strategic status (read-only)
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `-h, --help` | Display help for command |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis).
Scans the repository (git, package metadata, doc presence, build surfaces,
phase artifacts), reads CADENCE loop state **read-only** (never mutates
`state.json` or transitions the loop), folds in recommendation-ledger decay
counts, and synthesizes a strategic status with up to four conservative flags
(git dirty/diverged, loop-state inconsistency, ledger decay, missing docs).

Writes:

- `.cadence/intelligence/inspection.json`
- `.cadence/intelligence/STRATEGY.md`

With `--json`, the inspection object is emitted to stdout instead of the
rendered text. This command is distinct from `cadence status`/`progress`,
which report execution-loop position; `inspect` is the strategic layer.

**Exit codes** — exits non-zero only on a genuine failure (e.g. artifact
write error). A missing git repo or missing `.cadence/` backend degrades
gracefully and still exits 0.

---

### recommend

```
Usage: cadence recommend [options]

Rank actionable strategic recommendations and advise the next move (read-only)
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `-h, --help` | Display help for command |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis).
Reads the recommendation ledger and CADENCE loop state **read-only** (never
mutates `state.json` or transitions the loop), then: partitions the ledger
(rejected/converted excluded; superseded/contradicted surfaced as
needs-attention; deferred parked; candidate/accepted ranked), scores each
ranked recommendation with a transparent additive 0–100 model whose every
term is shown in a per-item why-line, and derives one loop-aware next-action
advisory (a loop in flight yields a finish-first advisory; otherwise the top
recommendation's action, or `cadence spec new` when it is ready for a CADENCE
spec).

Writes:

- `.cadence/intelligence/recommend.json`
- `.cadence/intelligence/RECOMMEND.md`

With `--json`, the report object is emitted to stdout instead of the
rendered text. The advisory only ever names already-legal commands as text;
it never executes or forces a loop transition. Distinct from `cadence
status`/`progress` (execution loop) and `cadence inspect` (strategic status).

**Exit codes** — exits non-zero only on a genuine failure (e.g. artifact
write error). An empty ledger, a missing git repo, or a missing `.cadence/`
backend degrades gracefully and still exits 0.

---

### milestone

```
Usage: cadence milestone [options] [command]

Shape recommendations into milestone candidates (read-narrow; never transitions the loop)
```

**Subcommands**

| Subcommand | Synopsis |
|---|---|
| `propose [--json]` | Cluster eligible recommendations into proposed milestone candidates |
| `accept <id>` | Mark a proposed milestone accepted |
| `defer <id>` | Defer a proposed or accepted milestone |
| `export <id> --to cadence` | Export an accepted milestone to a staged CADENCE SPEC draft |
| `premortem <id> [--json]` | Recompute the deterministic pre-mortem for a `proposed`/`accepted` milestone in place (refuses other statuses) |
| `list [--json]` | Show the current milestone ledger |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis).
`propose` reads the recommendation ledger **read-narrow** (it is backend-free —
it never reads or writes `state.json` and never transitions the loop),
clusters recommendations that are `accepted` and `ready-for-milestone`/
`ready-for-cadence-spec` (excluding `superseded`/`contradicted`) by their
`suggestedMilestoneId` (each ungrouped rec becomes its own singleton
candidate), and attaches a deterministically-seeded scaffolded pre-mortem
(facts-only: shared-file dependencies, doc-surface drift, low-confidence
inputs); pre-mortem entries not covered by a deterministic seed — and
`outOfScope` always — are left empty with placeholder prompts in the rendered
`MILESTONES.md` for a human to fill.
Re-running `propose` regenerates only `proposed` records; `accepted`/
`deferred`/`exported`/`closed` milestones and their recommendations are never
clobbered or re-proposed. `accept`/`defer` enforce guarded status
transitions. `premortem <id>` re-runs a deepened deterministic pre-mortem
(decay/erosion/open-assumption/overestimated-value signals) for one
`proposed`/`accepted` milestone against the **current** recommendation and
assumption ledgers, replaces that milestone's derived pre-mortem dimensions
in place, bumps its `updatedAt`, and re-renders `MILESTONES.md`; the
operator-owned `outOfScope` field is preserved verbatim and never derived.
It is refused for an unknown id or any status other than `proposed`/
`accepted`. `export <id> --to cadence` renders a deterministic CADENCE SPEC scaffold from an `accepted`
milestone's own facts, writes it to `.cadence/intelligence/exports/<id>/SPEC.md`, records an
`exportTarget`, and flips the milestone to `exported`; it **never** runs `cadence spec new`,
allocates a loop id, or writes `state.json` — the staged SPEC is promoted manually by the
operator. Export is refused for an unknown backend, unknown id, or any status other than
`accepted` (re-export of an already-`exported` milestone is refused).

Writes:

- `.cadence/intelligence/milestones.json`
- `.cadence/intelligence/MILESTONES.md`
- `.cadence/intelligence/exports/<id>/SPEC.md` (on `export`)

With `--json` (on `propose`, `premortem`, and `list`), the milestone ledger object is emitted to stdout instead of
the rendered text. Distinct from CADENCE's own execution-layer
`.cadence/MILESTONES.md`.

**Exit codes** — exits non-zero only on a genuine failure (artifact write
error, or an illegal/unknown-id `accept`/`defer`, or an unknown-backend/unknown-id/non-accepted `export`, or an unknown-id/non-`proposed`/`accepted` `premortem`). An empty/absent
recommendation ledger degrades gracefully and still exits 0.

---

### context

```
Usage: cadence context <scope> [options]

Emit a compact, read-only context packet (scope: phase | handoff | review | agent)
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `-h, --help` | Display help for command |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis).
Reads the recommendation, evidence, assumption, and decision ledgers plus
CADENCE loop state **read-only** (never mutates `state.json` or transitions
the loop); emits a bounded context packet for the given scope —
`phase` (forward-looking context a downstream CADENCE phase carries),
`handoff` (broad cross-session resume trail),
`review` (backward-looking audit packet with a surfaced needsAttention bucket of
  superseded/contradicted recs; assumptions + decisions surfaced in full so a
  reviewer audits all rationale), or
`agent` (subagent dispatch brief; top-3 ranked recs filtered to status=accepted ∩
  readiness ∈ {ready-for-milestone, ready-for-cadence-spec}; loop block in Markdown
  omits nextAction + stateError, JSON retains them).
Compactness is bounded-by-construction: only ranked recommendations (top 7 for
`phase`, top 5 for `handoff`, top 5 for `review`, top 3 (dispatchable subset)
for `agent`), only open assumptions, and file references not contents. `phase`
scopes assumptions, decisions, and files to the selected recommendations while
`handoff` carries the broader trail; both share the read-only loop block.

Writes:

- `.cadence/intelligence/context/<scope>.json`
- `.cadence/intelligence/context/<scope>.md`

With `--json`, the packet object is emitted to stdout instead of the
rendered Markdown. An unknown scope exits 2 with a clean message.

**Exit codes** — exits 2 for an invalid scope; exits 1 only on a genuine
failure (e.g. artifact write error). An empty ledger, a missing git repo,
or a missing `.cadence/` backend degrades gracefully and still exits 0.

---

### assumption

```
Usage: cadence assumption [options] [command]

Manage CADENCE strategic-intelligence assumptions
```

**Subcommands**

| Subcommand | Description |
|---|---|
| `add` | Add a manual assumption tied to a recommendation |
| `list` | List recorded assumptions |
| `validate <id>` | Mark an open assumption validated |
| `reject <id>` | Mark an open assumption rejected |
| `reopen <id>` | Reopen a validated or rejected assumption |

**`add` options**

| Option | Description |
|---|---|
| `--rec <id>` | Recommendation id this assumption belongs to (required) |
| `--text <text>` | Assumption statement (required) |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis). Refuses unknown `--rec` with exit 1 + clean stderr. New assumptions land with `status='open'`. Writes `.cadence/intelligence/assumptions.json` + `.cadence/intelligence/ASSUMPTIONS.md` atomically on every add. `list` writes a compact one-line-per-entry summary to stdout (`${id}  ${status}  ${recommendationId}  ${text}`). Status-transition subcommands: `validate <id>` flips `open → validated`, `reject <id>` flips `open → rejected`, `reopen <id>` flips `validated | rejected → open` (completing the status matrix; Slice 10). Allowed-status guard is strict per verb: `validate`/`reject` only from `'open'`; `reopen` only from `'validated'` or `'rejected'`. Refused with `cannot <action> assumption in status <s>` on wrong source or `assumption <id> not found` on unknown id; no write side effects on refusal. Render groups assumptions into 3 always-emit `## Open` / `## Validated` / `## Rejected` sections under `ASSUMPTIONS.md` — a reopened entry simply re-renders back under `## Open`.

**Exit codes** — `add`: exits 1 on unknown rec id or any artifact write error; usage error from commander on missing required option. `list`: exits 0 even on empty ledger (prints `No assumptions recorded.`).

**`list` options**

| Option | Description |
|---|---|
| `--format <format>` | Output format: `terminal` (default) or `json`. |
| `--filter-status <status>` | Filter to only entries with this status (`open` / `validated` / `rejected`). |
| `--filter-rec <recId>` | Filter to only entries tied to this recommendation. |
| `--filter-text <substr>` | Case-insensitive substring search on `text`. Mutually exclusive with `--filter-text-exact` and `--filter-regex`. |
| `--filter-text-exact <str>` | Case-insensitive whole-field equality match on `text`. The entire scoped field must equal the literal (case-insensitive); substring matches do NOT match. Surrounding whitespace in the literal is significant (no trim). Mutually exclusive with `--filter-text` and `--filter-regex`. Empty literal returns exit 1. (Slice 36) |
| `--filter-regex <pattern>` | Power-user regex filter on `text` (always case-sensitive by default; use `--filter-regex-flags` for case-insensitive / multiline / dotAll, or character classes like `[Cc]ycle` for one-off case-insensitivity). Mutually exclusive with `--filter-text` and `--filter-text-exact`. |
| `--filter-regex-flags <flags>` | RegExp flag letters to apply to `--filter-regex`. Allowed: `i` (case-insensitive), `m` (multiline `^/$`), `s` (dotAll `.`), `u` (unicode). Letter-string grammar mirrors JS RegExp's native second argument (`'is'` applies both). Requires `--filter-regex` to also be set (orphan use returns exit 1). Empty value, duplicate letters, and invalid letters all return exit 1 with the specific letter named. (Slice 37) |
| `--sort-by <key>` | Sort by a single key, optionally suffixed with `:desc`. Default direction is ascending. Allowed keys: `created`, `status` (open<validated<rejected), `text`, `rec` (recommendationId). Composes with `--reverse`. (Slice 35) |
| `--reverse` | Reverse the entry order (after filters, before offset/limit). |
| `--offset <n>` | Skip the first N entries after filters. |
| `--limit <n>` | Cap output to first N entries after filters. |

---

### decision

```
Usage: cadence decision [options] [command]

Manage CADENCE strategic-intelligence decisions
```

**Subcommands**

| Subcommand | Description |
|---|---|
| `add` | Record an architectural decision (optionally tied to a recommendation) |
| `list` | List recorded decisions |

**`add` options**

| Option | Description |
|---|---|
| `--rec <id>` | Recommendation id this decision belongs to (optional) |
| `--title <title>` | Short decision title (required) |
| `--rationale <text>` | Decision rationale (required) |

**Behavior** — `--rec` is optional; FK-checked only when provided. Untied decisions are valid (architectural decisions that don't tie to a specific recommendation). The persisted entity OMITS the `recommendationId` field entirely on untied decisions (exact-optional pattern). Writes `.cadence/intelligence/decisions.json` + `.cadence/intelligence/DECISIONS.md` on every add. `list` writes one line per entry (`${id}  ${recommendationId ?? '—'}  ${title}`); untied decisions show the em-dash placeholder in the rec column.

**Exit codes** — same shape as `assumption`.

**`list` options**

| Option | Description |
|---|---|
| `--format <format>` | Output format: `terminal` (default) or `json`. |
| `--filter-status <status>` | Filter to only entries with this status (`active` / `superseded` / `rescinded`). |
| `--filter-rec <recId>` | Filter to only entries tied to this recommendation. |
| `--include-untied` | When combined with `--filter-rec`, also include decisions with no `recommendationId`. |
| `--filter-text <substr>` | Case-insensitive substring search on title or rationale. Mutually exclusive with `--filter-text-exact` and `--filter-regex`. |
| `--filter-text-exact <str>` | Case-insensitive whole-field equality match on title or rationale. The entire scoped field must equal the literal (case-insensitive); substring matches do NOT match. Surrounding whitespace in the literal is significant (no trim). Mutually exclusive with `--filter-text` and `--filter-regex`. Empty literal returns exit 1. (Slice 36) |
| `--filter-regex <pattern>` | Power-user regex filter on title or rationale (always case-sensitive by default; use `--filter-regex-flags` for case-insensitive / multiline / dotAll, or character classes like `[Cc]ycle` for one-off case-insensitivity). Mutually exclusive with `--filter-text` and `--filter-text-exact`. |
| `--filter-regex-flags <flags>` | RegExp flag letters to apply to `--filter-regex`. Allowed: `i` (case-insensitive), `m` (multiline `^/$`), `s` (dotAll `.`), `u` (unicode). Letter-string grammar mirrors JS RegExp's native second argument (`'is'` applies both). Requires `--filter-regex` to also be set (orphan use returns exit 1). Empty value, duplicate letters, and invalid letters all return exit 1 with the specific letter named. (Slice 37) |
| `--sort-by <key>` | Sort by a single key, optionally suffixed with `:desc`. Default direction is ascending. Allowed keys: `decided`, `status` (active<superseded<rescinded), `title`, `rec` (recommendationId; untied decisions sort last in asc, first in desc). Composes with `--reverse`. (Slice 35) |
| `--reverse` | Reverse the entry order (after filters, before offset/limit). |
| `--offset <n>` | Skip the first N entries after filters. |
| `--limit <n>` | Cap output to first N entries after filters. |

---

### intelligence

```
Usage: cadence intelligence [options] [command]

CADENCE strategic-intelligence admin utilities
```

**Subcommands**

| Subcommand | Description |
|---|---|
| `reconcile` | Re-derive recommendation link arrays and re-render all intelligence MD files |
| `stats [--by-rec]` | Read-only summary counts across all 4 intelligence ledgers (or per-rec breakdown) |
| `audit [--quiet] [--filter-kind <kind>]` | Enumerate integrity issues (broken links + orphan subjects). `--filter-kind` narrows output to one finding kind. Exit 1 on findings unless `--quiet`. |

**`stats` + `audit` shared options**

| Option | Description |
|---|---|
| `--format <terminal\|json>` | Output format. Default `terminal` (markdown). `json` emits pretty-printed JSON envelope; empty workspace → JSON `null`. |

**`stats` options**

| Option | Description |
|---|---|
| `--by-rec` | Markdown-table per-rec breakdown instead of aggregate view |

**Behavior** — operator-initiated force re-derive across the strategic-intelligence layer. Reads `.cadence/intelligence/{recommendations,evidence,assumptions,decisions}.json`, recomputes `Recommendation.assumptionIds[]` / `decisionIds[]` via the same `deriveRecommendationLinks` helper Slice-11 wires into intake, and atomically writes `recommendations.json` (with re-derived links) plus all three MD files (`RECOMMENDATIONS.md` with Slice-15 status-annotated bullets; `ASSUMPTIONS.md` + `DECISIONS.md` with Slice-9/13 bucket-partitioned sections). Useful when the operator hand-edits a subject ledger and wants the rec link arrays + MD renders refreshed without doing a throwaway intake. `assumptions.json` + `decisions.json` are NOT rewritten (operator source of truth). Idempotent: a second run is byte-equal. On an empty workspace (no intelligence ledgers present) → exit 0 with `No intelligence ledgers present.\n`.

**`stats`** — read-only aggregation across all 4 intelligence ledgers. Aggregate mode prints 5 sections (Recommendations / Evidence / Assumptions / Decisions / Links) with counts partitioned by every enum value (zeros explicit; diff-stable). `--by-rec` prints a markdown table with one row per recommendation showing status + per-status linked-assumption + per-status linked-decision + evidence counts. Titles >40 chars truncated with `…`. Broken-link counts surface drift between rec link arrays and subject ledgers without enumeration (see future `audit` for per-link enumeration). Strict read-only.

**`audit`** — read-only integrity enumeration across the 4 intelligence ledgers. Surfaces eight finding kinds: broken assumption/decision/evidence links (rec references missing subject id), orphan assumption/decision/evidence (subject's `recommendationId` references missing rec), stale `supersededBy` refs (Slice 30 — decision's `supersededBy` points to a missing decision id), and stale `convertedToPhaseId` refs (Slice 34.2 — rec's `convertedToPhaseId` points to a phase directory absent from `.cadence/phases/`). Untied decisions are NOT orphans (Slice-8 contract). Clean → `Audit clean: no integrity issues.\n` exit 0. Findings present → markdown sections per finding kind in `SECTION_ORDER` (broken links, orphans, stale-supersededby, stale-converted-phase) + Remediation block, exit 1 (unless `--quiet`). `--quiet` always exits 0 (script-friendly). The `stale-converted-phase` dim reads `.cadence/phases/` once before computation; a missing `.cadence/phases/` directory is benign (treated as the empty set — every converted rec then surfaces as stale, which is the correct signal when no phases exist). No auto-fix — `cadence intelligence reconcile` repairs broken link arrays only; orphan subjects, stale-supersededby refs, and stale-converted-phase refs each require operator decision (restore the missing referent, hand-edit to clear the field, or — for stale-supersededby — run `cadence decision reactivate <id>` which clears the field per Slice 28). `--filter-kind <kind>` narrows the report to a single finding kind (one of the eight: `broken-assumption-link`, `broken-decision-link`, `broken-evidence-link`, `orphan-assumption`, `orphan-decision`, `orphan-evidence`, `stale-supersededby`, `stale-converted-phase`); an unknown kind refuses with exit 1 naming the allowed set (validated before any ledger read). Under a filter the header echoes the kind (`Found N integrity issue(s) of kind "<kind>":`), only the matching section renders, the Remediation block shows only the relevant family hint, and an empty filtered result prints `No intelligence audit findings of kind "<kind>".` (exit 0; JSON emits the narrowed report — all eight `byKind` keys present, only the filtered kind populated). Filtering composes with `--quiet` (the filtered findings drive the exit code). (Slice 38)

**Exit codes** — `reconcile`: exits 0 even on empty ledger set; exits 1 on any disk/permission/parse error. `stats`: same; exits 0 even on empty ledger set. `audit`: exit 0 on clean or empty ledgers; exit 1 on findings unless `--quiet`; exit 1 on any disk/permission/parse error.

---

## cadence-host-claude-code

```
Usage: cadence-host-claude-code [options] [command]

Claude Code host adapter for CADENCE
```

This is the adapter package that integrates CADENCE with Claude Code. It writes
hook entries and slash commands into a Claude Code project, and provides the
shim that Claude Code invokes at hook time.

**Global options**

| Option | Description |
|---|---|
| `-V, --version` | Output the version number |
| `-h, --help` | Display help for command |

---

### install

```
Usage: cadence-host-claude-code install [options]

Write Claude Code hook entries and slash commands into the project
```

**Options**

| Option | Default | Description |
|---|---|---|
| `--cwd <dir>` | (current working directory) | Project root |
| `--command <cmd>` | `"npx @cadence/host-claude-code"` | Base command for the shim |
| `--cadence <cmd>` | `"npx @cadence/core"` | Base command the shim uses to invoke core |
| `--settings <path>` | `".claude/settings.json"` | Settings file path relative to `cwd` |
| `--no-hooks` | — | Skip writing hooks to `settings.json` |
| `--no-commands` | — | Skip writing slash commands to `.claude/commands/` |
| `--local` | — | Use absolute paths to the local workspace builds (monorepo dogfood) |
| `-h, --help` | — | Display help for command |

**Behavior** — writes CADENCE hook entries into `.claude/settings.json` (unless
`--no-hooks`) and writes slash command files into `.claude/commands/` (unless
`--no-commands`). The `--local` flag is intended for monorepo development;
it substitutes `npx` invocations with absolute paths to the local build
outputs.

**Exit codes** — exits non-zero if `--cwd` does not contain an initialized
`.cadence/` directory, or if the settings file cannot be parsed.

---

### hook (host)

```
Usage: cadence-host-claude-code hook [options]

Shim invoked by Claude Code hooks: translates stdin and calls cadence hook <event>
```

**Options**

| Option | Default | Description |
|---|---|---|
| `--cadence <cmd>` | `"npx @cadence/core"` | Base command to invoke core |
| `-h, --help` | — | Display help for command |

**Behavior** — this command is invoked by Claude Code at hook time (e.g.
`PostToolUse`). It reads the hook payload from stdin, translates it into an
abstract event name, and calls `cadence hook <event>`. Not intended to be
invoked directly by users.

---

## Carry-forward notes

**`block` and `needs-context` do not validate task IDs.** These two shortcut
commands bypass the Phase 29.8 task-ID validation that `build task` enforces.
If you supply an ID that does not exist in the current draft's task list,
`block <id>` and `needs-context <id>` will record the entry as-is without
error. Use `cadence build task <id> --status=BLOCKED` or
`cadence build task <id> --status=NEEDS_CONTEXT` when you need the validation.

This is a known limitation to be addressed in a future phase.
