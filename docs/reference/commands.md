# CLI Command Reference

This page is the authoritative per-command reference for the CADENCE CLI. Options
and defaults are verbatim from `--help` output. For conceptual explanations of the
loop, gates, profiles, and tiers, see [docs/concepts.md](../concepts.md). For
configuration fields and presets, see [docs/reference/config.md](config.md).

Two CLIs are documented here:

- **`cadence`** — the core CLI (`@manehorizons/cadence-core`)
- **`cadence-host-claude-code`** — the Claude Code host adapter (`@manehorizons/cadence-host-claude-code`)

---

## Table of contents

- [cadence](#cadence)
  - [config](#config)
  - [init](#init)
  - [draft](#draft)
  - [hook](#hook)
  - [build](#build)
  - [dispatch](#dispatch)
  - [done](#done)
  - [block](#block)
  - [needs-context](#needs-context)
  - [settle](#settle)
  - [progress](#progress)
  - [status](#status)
  - [doctor](#doctor)
  - [recommendation](#recommendation)
  - [inspect](#inspect)
  - [recommend](#recommend)
  - [milestone](#milestone)
  - [context](#context)
  - [handoff](#handoff)
  - [resume](#resume)
  - [onboard](#onboard)
  - [tutorial](#tutorial)
  - [start](#start)
  - [quickstart](#quickstart)
  - [activate](#activate)
  - [agent-prompt](#agent-prompt)
  - [verify](#verify)
  - [retro](#retro)
  - [summary](#summary)
- [cadence-host-claude-code](#cadence-host-claude-code)
  - [install](#install)
  - [hook (host)](#hook-host)
- [Carry-forward notes](#carry-forward-notes)

---

## cadence

```
Usage: cadence [options] [command]

CADENCE — a draft/build/settle framework for AI-assisted development with configurable quality gates
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
next
status
recommendation
inspect
recommend
milestone
context
handoff
resume
assumption
decision
intelligence
doctor
onboard
mcp
tutorial
explain
start
quickstart
activate
agent-prompt
dispatch
verify
retro
summary
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
| `explain [field]` | Explain the active config in plain language — gates, providers, warnings |
| `edit [field]` | Guided wizard to edit curated config keys (interactive) |

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

### config edit

```
Usage: cadence config edit [field]

Guided wizard to edit curated config keys (interactive)
```

**Arguments**

| Argument | Description |
|---|---|
| `[field]` | Jump to one key — `profile`, `loopEnforcement` (alias `enforcement`), `acDiscipline`, `commitCadence`, or `verifier`. Omit to walk all five. Unknown names get a did-you-mean nudge. |

**Behavior** — an interactive, zero-dependency wizard over the five behavior-shaping
config keys. Shows each key's current value and legal choices (Enter keeps current),
validates the result against the schema, shows a change summary, and on confirm writes
`.cadence/config.json` atomically — then prints the `cadence config explain` effect
(the gate set that now fires + any foot-gun warnings). Advanced keys stay
`cadence config set <key> <value>` territory. In a non-TTY context it refuses and points
to `config set`. Decline or Ctrl-C writes nothing.

---

### init

```
Usage: cadence init [options]

Scaffold a new .cadence/ directory in the current working tree
```

**Options**

| Option | Default | Description |
|---|---|---|
| `--name <project>` | (derived) | Project name. When omitted it is derived from `package.json#name` (scope stripped) then the directory name |
| `--preset <preset>` | `"team"` | Config preset: `solo \| team \| production` |
| `--profile <preset>` | — | **Deprecated** alias for `--preset` (kept for back-compat; emits a notice) |
| `--gate-profile <p>` | (suggested from git history) | Gate profile: `strict \| standard \| auto` |
| `--demo` | — | Seed a ready-to-approve demo phase (`01-demo`, objective + AC-1 + T1) so you can run a full loop in this repo with no hand-edit |
| `--activate` | — | When `ANTHROPIC_API_KEY` is present, turn on real verification (`verifier.provider=anthropic`, deep-verify seam) in the same step. The key is never stored; no live check runs (that stays in `cadence activate`) |
| `--full` | — | One-command full setup: wire the host, seed the demo phase, and activate real verification when their preconditions are met (each still yields to an explicitly-passed flag, e.g. `--skip-host-wire`) |
| `--dry-run` | — | **Fit-check.** Resolve everything init would (name, gate profile, layout, test globs, verification/provider status, host surface, and the exact files it would create) and print a preview **without touching the repo** — then exit 0. Honors the resolution flags above; safe to run inside a populated or already-initialized repo |
| `--host <host>` | — | Wire a host during init: `claude \| codex`. `codex` runs the Codex host installer and writes managed `AGENTS.md` instructions |
| `--wire-host` | — | When a `.claude/` workspace is present, run `cadence-host-claude-code install` in the same step (subprocess spawn; auto-run, no prompt) |
| `--skip-host-wire` | — | Never wire the Claude Code host, even when `.claude/` is present |
| `--claude-md` | — | Only (re)generate the managed CLAUDE.md block at the repo root; allowed on an already-initialized project |
| `--agents-md` | — | Only (re)generate the managed AGENTS.md block at the repo root; allowed on an already-initialized project |
| `--ci` | — | Generate a GitHub Actions workflow that runs `cadence verify phase --changed` on pull requests, plus a branch-protection recipe; allowed on an already-initialized project |
| `-h, --help` | — | Display help for command |

**Behavior** — writes `.cadence/config.json`, `.cadence/state.json`,
`.cadence/PROJECT.md`, a managed block in the repo-root `CLAUDE.md`, and (as of
phase 196) `.gitignore` entries for the four CADENCE-owned ephemeral paths
(`state.json`, `STATE.md`, `mcp-trust.json`, `intelligence/context/`) so they
stay untracked. Init is
**zero-prompt**: it derives the project name and (via git history) the gate
profile, asking nothing. The `--preset` flag selects a config preset;
`--gate-profile` sets which quality gates fire by default. (`--profile` is a
deprecated alias for `--preset`, retained for back-compat — it was a misnomer,
since it sets a preset, not a gate profile.)

When a `.claude/` workspace is detected, `--wire-host` installs the Claude Code
adapter in the same step (a TTY offers it interactively; non-TTY skips with a
pointer); `--skip-host-wire` opts out. `--host codex` is the explicit first-run
bootstrap for Codex and should be run before opening Codex in the repo: it
writes `.cadence/`, creates the managed `AGENTS.md` block Codex reads at session
start, runs `npx -y @manehorizons/cadence-host-codex install`, and prints the
"approve hooks then start a new Codex session" next step. The plain Codex host
installer is adapter-only; use it for already-initialized repos, paired with
`cadence init --agents-md` if `AGENTS.md` is missing. `--demo` seeds a
ready-to-approve demo phase so the very next commands are `draft approve
01-demo 01` → `done T1` → `settle run --ac AC-1=pass`. `--activate` flips on
real verification when a key is already in the environment.

`--ci` (phase 204, rec-20260709-003) writes `.github/workflows/cadence-verify.yml`
— a workflow that runs `npx cadence verify phase --changed --base "${{
github.event.pull_request.base.sha }}"` on every pull request, using the install
command detected by `detectInstallCommand` — which shares the same underlying
lockfile-based `detectPackageManager` detection (`packages/core/src/init/plan.ts`)
that `detectTestCommand` also uses for `--dry-run`'s test-command preview, though
`--dry-run` itself never derives or displays an install command — and refuses
(nonzero exit, no file written) if that path already exists; there is no `--force`/overwrite flag, matching `draft new`'s
existing-file precedent. After writing the workflow it prints (never executes) a
`gh api` branch-protection recipe requiring the `cadence-verify` check on the
repo's default branch, substituting the real `<owner>/<repo>` when resolvable
from `git remote get-url origin` (a GitHub-shaped remote) and the real default
branch name when resolvable from `git symbolic-ref refs/remotes/origin/HEAD` —
both fall back to placeholders (`<owner>/<repo>`, `main`) when not resolvable.
Like `--claude-md`/`--agents-md`, `--ci` is permitted on an already-initialized
project and only touches its one artifact.

`--full` is sugar for `--wire-host --demo --activate` together: it composes
all three per-step flags in one run and prints a single consolidated "Full
setup summary" listing each as done or skipped-with-reason, printed in
addition to the existing per-feature messages above it. Any explicitly-passed
flag (including `--skip-host-wire`) still overrides its default within
`--full`, and bare `cadence init` with no flags is unchanged.

`--dry-run` is a non-destructive **fit-check**: run it first to preview the
detected name, gate profile, layout, test globs, provider status, host surface,
and the files init would write — before committing to the scaffold in an existing
repo. It writes nothing, honors the resolution flags (e.g. `--gate-profile`,
`--activate`, `--demo`), and — unlike a real `init` — previews rather than
refuses when `.cadence/` already exists, so it stays a safe pre-flight check.

The `--claude-md`, `--agents-md`, and `--ci` flags are the only `init` options
permitted on an already-initialized project; `--claude-md`/`--agents-md` refresh
managed agent-instruction blocks and `--ci` (re)writes the CI workflow — none of
the three re-scaffold state.

**Exit codes** — exits non-zero if the directory is already initialized (without
`--claude-md`, `--agents-md`, `--ci`, or `--dry-run`) or if required options are missing in a
non-interactive context. `--dry-run` always exits 0 (even on an already-initialized
repo); an invalid `--gate-profile` or `--host` exits 2; `--ci` itself exits 2 (no file
written) if `.github/workflows/cadence-verify.yml` already exists.

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
Usage: cadence draft new [options] [phase] [num]

Scaffold a new DRAFT.md under .cadence/phases/<phase>/
```

**Arguments**

| Argument | Description |
|---|---|
| `[phase]` | Optional phase identifier (e.g. `01-retry`). When omitted, Cadence derives the next free phase id from `--title` |
| `[num]` | Optional draft number within the phase (e.g. `1`). Defaults to `1` when omitted |

**Options**

| Option | Default | Description |
|---|---|---|
| `--title <t>` | `"Untitled"` | Draft title |
| `--tier <t>` | `"standard"` | Tier: `quick-fix \| standard \| complex` |
| `--template <name>` | — | First-task template: `bugfix \| feature \| refactor`. Generates editable Objective, AC, Task, and Boundary sections from the title |
| `--from-rec <recId>` | — | Praxis recommendation id. On success, the rec is auto-converted to this phase via the Slice 34.1 transition helper. Symmetric semantics with `cadence spec new --from-rec`. Composes with the existing SPEC-seeded draft body: an approved SPEC plus `--from-rec` produces a SPEC-seeded DRAFT.md AND records the rec→phase link in one operator action. |
| `--allow-phase-collision` | — | Bypass the worktree phase-collision guard; the local same-dir/file refusal still applies |
| `-h, --help` | — | Display help for command |

**Behavior** — creates `.cadence/phases/<phase>/<id>-DRAFT.md`. With no approved
same-id SPEC and no `--template`, Cadence writes the legacy placeholder DRAFT
scaffold. With an approved same-id SPEC, it seeds Objective and ACs from the
SPEC. With `--template`, it writes the selected first-task scaffold instead:
`bugfix`, `feature`, or `refactor`. Templates are editable starting points, not
verification; the normal approve and settle gates still decide whether work can
close. The tier affects which gates fire at `settle run` time. See
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
| `--no-approve` | Bypass the manual approve gate (Phase 24.1) per invocation. In a non-TTY the gate **auto-passes** by default (since v1.29), so this flag is only needed to skip the gate entirely or alongside `CADENCE_REQUIRE_TTY=1` |
| `--allow-plan-review-failure` | Proceed past a failing plan-review gate (Phase 25.1) instead of refusing approve; findings are still printed |
| `-h, --help` | Display help for command |

**Behavior** — validates the named DRAFT.md, runs any configured pre-approve
gates (manual-approve gate, plan-review gate), and transitions `state.json` to
BUILD. On a `strict` or `standard` profile with the `approve` gate active, a TTY
gets the interactive Y/N confirmation; a non-TTY (agent, CI, pipe) **auto-passes
the gate** with a loud stderr notice (set `CADENCE_REQUIRE_TTY=1` to restore the
strict refusal, or pass `--no-approve` to skip the gate). See
[docs/concepts.md — Non-TTY auto-bypass](../concepts.md#non-tty-auto-bypass-agents--ci).

**Gate interactions** — See [docs/concepts.md — The gate universe](../concepts.md#the-gate-universe).
The `--no-approve` flag bypasses only the manual-approve gate (Phase 24.1);
the plan-review gate (Phase 25.1) is bypassed separately with
`--allow-plan-review-failure`.

**Exit codes** — exits non-zero when a gate refuses and no bypass flag is
provided.

#### draft set-objective

```
Usage: cadence draft set-objective [options] <phase> <num>

Replace a PENDING draft's ## Objective body (Phase 151)
```

**Arguments**

| Argument | Description |
|---|---|
| `<phase>` | Phase identifier |
| `<num>` | Draft number |

**Options**

| Option | Description |
|---|---|
| `--text <t>` | New objective sentence (required) |
| `-h, --help` | Display help for command |

**Behavior** — replaces the `## Objective` section body in-place with `--text`;
every other section (frontmatter, Acceptance Criteria, Tasks, Boundaries) is
left byte-identical. Refuses (exit 1, clear stderr) unless the draft's
frontmatter `status` is `PENDING`.

#### draft add-ac

```
Usage: cadence draft add-ac [options] <phase> <num>

Append a sequential AC block to a PENDING draft (Phase 151)
```

**Arguments**

| Argument | Description |
|---|---|
| `<phase>` | Phase identifier |
| `<num>` | Draft number |

**Options**

| Option | Description |
|---|---|
| `--given <g>` | Given (precondition) (required) |
| `--when <w>` | When (action) (required) |
| `--then <t>` | Then (outcome) (required) |
| `--name <n>` | AC name (optional) |
| `-h, --help` | Display help for command |

**Behavior** — appends a new `### AC-(k+1)` block to `## Acceptance Criteria`,
where `k` is the highest existing AC id, in the exact Given/When/Then shape
the coherence checker and settle gates expect. Refuses (exit 1, clear stderr)
unless the draft's frontmatter `status` is `PENDING`.

#### draft add-task

```
Usage: cadence draft add-task [options] <phase> <num>

Append a sequential Task block to a PENDING draft (Phase 151)
```

**Arguments**

| Argument | Description |
|---|---|
| `<phase>` | Phase identifier |
| `<num>` | Draft number |

**Options**

| Option | Description |
|---|---|
| `--files <f1,f2,...>` | Comma-separated touched files (required) |
| `--action <a>` | What to do (required) |
| `--verify <v>` | How to verify (required) |
| `--done <ids>` | Comma-separated AC id(s) this task satisfies (required) |
| `-h, --help` | Display help for command |

**Behavior** — appends a new `### T-(k+1)` block to `## Tasks`, where `k` is
the highest existing task id, with the given files/action/verify/done lines.
Every id passed to `--done` must already exist among the draft's Acceptance
Criteria; if any is unknown, the command refuses (exit 1, stderr lists the
unknown id(s): `add-task refused: unknown AC id(s) in --done: ...`) and the
file is left unmodified. Also refuses (exit 1, clear stderr) unless the
draft's frontmatter `status` is `PENDING`.

**Note (all three subcommands)** — these are an *additive* write path for
agents; hand-editing `DRAFT.md` directly remains fully supported. Each
subcommand's output round-trips through the same parser
(`packages/core/src/parse/draft-parser.ts`) that `draft check`/`draft approve`
use, so id sequencing and section formatting can't drift the way a hand-typed
heading typo could (see phase 150/151 in `CLAUDE.md`).

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

`spec new --ui` additionally scaffolds an opt-in `<id>-UI-SPEC.md` sibling
(rec-20260711-004); its mere presence is what makes `spec approve` also run
the convergent `ui-spec-review` gate — see `docs/concepts.md`'s stage-scoped
gates table for the gate mechanics.

**Options (`spec new`)**

| Option | Description |
|---|---|
| `--title <t>` | Spec title (defaults to "Untitled"). |
| `--from-rec <recId>` | Praxis recommendation id. On success, the rec is auto-converted to this phase via the Slice 34.1 transition helper (status flips to `converted`, `convertedToPhaseId` records the link). Pre-flight: rec must exist with status `candidate` or `accepted`; otherwise refuses before any fs writes. If the chained convert fails after scaffold succeeded (race), stderr explains how to recover with `recommendation convert`. |
| `--ui` | Also scaffold a sibling `<id>-UI-SPEC.md`; `cadence spec approve` will run `ui-spec-review` against it when present (rec-20260711-004). |

**Options (`spec approve`)**

| Option | Description |
|---|---|
| `--allow-spec-review-failure` | Proceed past a failing/unconverged spec-review (any verdict) instead of refusing; findings still printed, `bypassed:true` recorded. |
| `--allow-ui-spec-review-failure` | Proceed past a failing/unconverged `ui-spec-review` instead of refusing; findings still printed. Only relevant when a sibling `<id>-UI-SPEC.md` exists. |

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

### dispatch

```
Usage: cadence dispatch [options] [command]

Compute wave-based subagent dispatch plans
```

`dispatch` groups the read-only wave-planning subcommand consumed by the
`/cadence-dispatch` Claude Code slash command.

#### dispatch plan

```
Usage: cadence dispatch plan [options]

Compute the next dispatch wave(s) from the active BUILD draft
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON (`{ waves: [{ wave, tasks: [{ id, name, packet, recommendedIsolation }] }] }`) instead of rendered text |
| `-h, --help` | Display help for command |

**Behavior** — read-only; never mutates state. Reads the active BUILD draft +
`PROGRESS.json`, computes wave-based dispatch groups via a single topological-
leveling pass over both `depends:` edges and synthetic `files:`-overlap
prerequisite edges (a task's wave is always strictly after every one of its
real-or-synthetic prerequisites — not a separate `depends:` pass followed by a
`files:` veto, which can silently place a task in the same wave as its own
dependent), and renders a self-contained dispatch packet per task. Every
rendered packet includes a mandatory prohibition block: the dispatched
agent is forbidden from running state-mutating `cadence` subcommands (e.g.
`cadence build`/`cadence settle`), `git commit`/`git push`, `gh`/network
actions, or invoking `AskUserQuestion` — once its verify condition is met
(or it is blocked), it must stop and report back to the orchestrating
session, which alone records the task's outcome. Every task also carries a
`recommendedIsolation` value of `'worktree'` or `'none'` — `'worktree'` when
the task declares one or more `files:` (it will mutate the working tree),
`'none'` when it declares none (read-only/no mutation expected) — surfaced
both as the `recommendedIsolation` JSON field and as an advisory line in the
rendered packet text itself. Tasks already `DONE`/`DONE_WITH_CONCERNS` are
excluded from every wave.
Outside BUILD (no active draft), reports "nothing to plan" at exit 0. When
every task is already finished, reports "nothing to dispatch" at exit 0.

**Exit codes** — exits non-zero (with a message naming the cycle, or the
unknown task id) if `depends:` forms a dependency cycle, or references a
task id that doesn't exist in the draft.

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
| `--verifier <provider>` | Override `config.verifier.provider` for the `deep-verify` gate: `mock`, `anthropic`, or `local`. Precedence is **flag > config > default `mock`**. An invalid value is rejected at parse time. The v1.14 mock-fallback banner honors the effective provider — an explicit `--verifier mock` still warns that results are not real. (Phase 73) |
| `--allow-verifier-failure` | Do not refuse on verifier transport failures; record failure into SUMMARY and treat as `pass=false` |
| `--interactive` | Walk each AC and prompt the user for a pass/fail/skip verdict (Phase 16) |
| `--no-interactive` | Bypass the interactive-verdict gate even if the active profile would enforce it. In a non-TTY the walker is **auto-skipped** by default (since v1.29; `interactiveVerifySkipped: "non-tty"` in the SUMMARY) — set `CADENCE_REQUIRE_TTY=1` to restore the strict refusal |
| `--allow-auto-complex` | Override DESIGN.md §4 M2 soft cap: settle an `auto × complex` draft anyway |
| `--allow-stale-draft` | Skip the DRAFT-read mtime gate even if the DRAFT.md was edited after approve |
| `--allow-open-tasks` | Skip the structural-verifier gate even if a task is still PENDING / IN_PROGRESS (Phase 39.2) |
| `--allow-failing-build` | Do not refuse on a non-zero `verification.testCommand` exit; settle anyway (Phase 39.2) |
| `--allow-code-review-failure` | Do not refuse on HIGH-severity code-review findings; record them in SUMMARY and emit anomalies anyway (Phase 24.3) |
| `--allow-security-audit-failure` | Do not refuse on CRITICAL security-audit findings; record them in SUMMARY and settle anyway (Phase 25.2) |
| `--allow-skill-audit-miss` | Do not refuse when required skills were not invoked; emit a warn anomaly (`bypassed:true`) and settle anyway (Phase 34.1) |
| `-h, --help` | Display help for command |

**Behavior** — runs all configured settle-time gates (coverage, verifier,
code-review, security-audit, interactive-verdict), records AC outcomes, writes
`.cadence/phases/<phase>/<id>-SUMMARY.md` and the corresponding JSON, and
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

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON (`{ command, reason, note? }`) instead of rendered text |
| `-h, --help` | Display help for command |

**Behavior** — reads current `state.json` and prints a single recommended next
action (e.g. "Run `cadence draft new`", "Record task T2"). Intended for
quick orientation. For full loop context, use [`cadence status`](#status).
`--json` emits the same `{ command, reason }` payload MCP callers get, for
agents that would otherwise regex the rendered text lines.

**Settle-pending note** — independent of loop position, an extra `Note:`
line (and `--json` `note` field) appears when one or more recommendations are in
`settle-pending` — code that settled locally but hasn't been confirmed shipped:

```
Next: cadence draft new --title "..."
Reason: No active draft. Start the loop by drafting a new unit of work.
Note: 2 recommendation(s) settled but not yet confirmed shipped — see `cadence doctor`.
```

Best-effort: omitted entirely (no key in `--json`, no line in text output) when
there are none, or if the recommendation ledger can't be read.

**Proactive next-free phase number (v1.19)** — at `IDLE`, the suggested
`cadence draft new …` no longer prints a bare `<num>` placeholder: it fills in
the next free phase number, computed as `max(observed) + 1` over local phases
plus any sibling-worktree and upstream claims (the same collision collector
`cadence doctor`'s `worktree-phases` check uses). So your first pick already
clears numbers a sibling worktree or upstream holds — no round-trip through the
v1.18 guard's refusal. This is best-effort: in a non-git checkout, or if the
occupancy read fails, `progress` falls back to the literal placeholder and never
blocks. The same occupancy-aware suggestion surfaces in the recommend/Praxis
backend's IDLE legal action.

**Exit codes** — exits non-zero if `.cadence/` is missing or `state.json` is
unreadable.

---

### next

```
Usage: cadence next [options]

Show ranked legal next moves at the current loop position
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `-h, --help` | Display help for command |

**Behavior** — read-only, at any loop position: prints the current position
plus 1-3 ranked legal moves with their exact commands, computed from the same
underlying `nextAction()` logic [`cadence progress`](#progress) and
[`cadence quickstart`](#quickstart) already use — not a parallel
reimplementation. Unlike `progress`'s single suggestion, `next` surfaces every
legal alternative at once (e.g. at `IDLE`, continuing an in-flight milestone
ranks above promoting a recommendation, which ranks above a bare
`draft new`). Names the door — the exact command — never advises *how* to
implement the work behind it; that stays the agent's job.

`--json` emits a stable, versioned contract:
`{ schemaVersion: 1, position, remainingTasks, blockedOn, legalMoves: [{ position, command, reason, remainingTasks, blockedOn }] }`.
`position` is the overall loop position; `remainingTasks`/`blockedOn` are
top-level convenience fields mirroring the top-ranked move's own fields of the
same name.

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

### doctor

```
Usage: cadence doctor [options]

Diagnose this project’s CADENCE setup and report problems
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `--fix` | Apply safe, deterministic repairs for the fixable findings *(v1.34)* |
| `--wire-host` | With `--fix`, also re-run host installs for host findings *(v1.34)* |
| `--dry-run` | With `--fix`, print the repair plan without writing anything *(v1.34)* |
| `--resolve-state-conflict <side>` | With `--fix`, resolves an unresolved `state.json` git merge conflict by writing the chosen side (`local` or `incoming`); requires `--fix` (errors without it) and is a no-op if `state.json` has no conflict-marker corruption to resolve *(phase 196)* |
| `-h, --help` | Display help for command |

**Behavior** — runs a set of deterministic, offline health checks on the
project's CADENCE setup and reports each as `ok` / `warning` / `error` with a
one-line detail and (for problems) a remediation hint. Pure filesystem + config
inspection: no network, no AI verifier, no host process spawn, and it never
touches loop state. **Report-only by default** — it diagnoses and points at the
fix; pass `--fix` to apply the safe repairs (see below).

v1 check set:

| Check | What it verifies | Fail severity |
|---|---|---|
| `node` | Node major ≥ 20 (the `engines` floor) | error |
| `initialized` | `.cadence/` exists and `config.json` is valid | error |
| `state` | `state.json` parses; `STATE.md` (derived view) present | error / warning |
| `state-tracked` | *(git repos)* none of the four CADENCE-owned ephemeral paths (`state.json`, `STATE.md`, `mcp-trust.json`, `intelligence/context/`) are tracked by git — tracking any guarantees a cross-worktree merge conflict *(phase 196)* | warning |
| `git-hooks` | *(git repos)* `core.hooksPath` resolves to `.githooks` (the pre-push gate) | warning |
| `host-hooks` | *(if `.claude/settings.json`)* CADENCE-managed hook entries present | warning |
| `host-commands` | *(if `.claude/commands/`)* every managed `cadence-*.md` run-line is portable (no machine-absolute path) | warning |
| `codex-hooks` | *(if Codex readiness artifacts exist)* `.codex/hooks.json` contains CADENCE-managed hook entries | warning |
| `codex-prompts` | *(if Codex readiness artifacts exist)* `$CODEX_HOME/prompts/cadence-*.md` contains CADENCE-managed prompt commands | warning |
| `codex-agents-md` | *(if Codex readiness artifacts exist)* `AGENTS.md` contains the managed CADENCE instruction block | warning |
| `codex-cadence-command` | *(if Codex readiness artifacts exist)* `cadence` is available on `PATH` for Codex prompt commands | warning |
| `worktree-phases` | *(v1.19)* no **sibling git worktree** claims a phase number equal to a local phase number (the silent-dual-merge precondition the v1.18 guard refuses at scaffold time) | warning |
| `phase-freshness` | *(phase 208)* the active phase/draft's `PROGRESS.json` has no task `updatedAt` within the last 10 minutes — a timestamp that fresh could mean a concurrent session is still live on the same phase/draft. Warns naming the task and how recently it was touched, with remediation to confirm no other session is actively working before continuing | warning |
| `handoff-retention` | *(v1.20)* `SESSION-*.md` handoff docs are within `handoff.retain`, or — when retention is unset — have not accumulated past the warn threshold | warning |
| `verification-readiness` | *(v1.22)* the deep-verify seam uses a **real** provider whose credentials are present (i.e. settle gates do real AI verification, not mock). Warns on all-mock (→ `cadence activate`) or a real provider missing its key | warning |
| `recommendation-shipped-drift` | no recommendation is stuck in `settle-pending` — its linked phase settled locally but nobody has confirmed the work actually shipped. Warns naming each one's id, title, phase, and the exact `recommendation promote --status=shipped` command to run | warning |
| `orphaned-evidence` | *(phase 219)* no `evidence.json` row references a `recommendationId` missing from both the active and archived lists in `recommendations.json` — a dangling reference that can silently collide with a later freshly-minted recommendation id. Warns naming each orphaned evidence id and the missing recommendation id it points at | warning |
| `coverage-mode-language-support` | *(Phase 166; registry-driven since Phase 167)* `verification.coverageMode` **is** `'assertion'` paired with a detected project language with no registered assertion-mode coverage profile — checked against the live profile registry (js/ts, Python, Go, Rust, and PHP all have real support as of Phase 167; see `docs/reference/config.md`'s supported-language matrix). Warns naming the detected language and the exact `cadence config edit coverageMode` command to switch to `'mention'` | warning |

Host checks run only when the relevant files exist; their absence is not a
problem. Codex readiness checks activate when `.codex/` exists or `AGENTS.md`
already contains the managed CADENCE block.

The `worktree-phases` check (v1.19, phase 85) reuses the v1.18 collision
collector: it reports `ok` when no sibling worktree holds a colliding number
(listing any non-colliding sibling/upstream claims as an inventory), and
`warning` — naming the colliding number, where it is claimed, and the next free
number — when a sibling collides with a local phase. Collisions are
**sibling-vs-local only**: upstream (`origin/<integrationRef>`) is the merged
baseline, so a local phase also appearing there is normal, not a warning (it
still feeds the suggested next free number). Best-effort and offline: a
non-git checkout or any git/fs failure degrades to `ok`, never throwing.

**Exit codes** — `0` when no `error`-severity problem exists (warnings do not
fail), `1` otherwise. Safe to use as a CI gate: `cadence doctor` will fail the
job only on hard errors. With `--json`, stdout is a single object
`{ ok, checks: [{ name, status, severity, detail, remediation, fixId }] }`
(`fixId` is the repair id `--fix` uses, or `null` when there is no safe
auto-repair).

**`--fix` (v1.34)** — applies the *safe, deterministic* repairs and re-runs the
checks. Safety comes from how each finding is classified, not from a
confirmation prompt, so `--fix` is **non-interactive and agent/non-TTY-safe** (it
never prompts):

| Fix kind | Findings | What `--fix` does |
|---|---|---|
| **auto** | `git-hooks`, missing `STATE.md`, missing managed `AGENTS.md`, `handoff-retention`, `state-tracked` | applied by plain `--fix` — `git config core.hooksPath .githooks`; regenerate `STATE.md` from the valid `state.json` (never rewriting `state.json`); regenerate `AGENTS.md`; set `handoff.retain` to the default (10) when unset and prune the `SESSION-*.md` archive down to that budget (the active `lastHandoff` doc is always kept); write the four CADENCE-owned ephemeral paths to `.gitignore` and `git rm --cached` any that are tracked, without committing *(phase 196)* |
| **wire-host** | `host-hooks`, `host-commands`, `codex-hooks`, `codex-prompts` | applied only with `--fix --wire-host` — re-runs the relevant host installer once per host repair id (deduped) to rewrite hooks/commands |
| **manual** | `node`, `initialized`, corrupt `state.json`, `worktree-phases`, `verification-readiness`, `codex-cadence-command`, user-owned prompt/agent files | never auto-applied — reported as guidance with the check's remediation |

Each repair is best-effort: a repair that fails is reported (`✗ failed`) and the
rest still run; `--fix` never throws on a repair failure. `--fix --dry-run`
prints the plan and writes nothing. Exit code reflects the post-fix report
(`--dry-run` reflects the pre-fix report). With `--json`, `--fix` emits
`{ report, fixPlan, fixesApplied, postFixReport }` (a dry run emits
`{ report, fixPlan }`).

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

**Options**

| Option | Description |
|---|---|
| `--title <title>` | Recommendation title. |
| `--summary <summary>` | Recommendation summary. |
| `--priority <priority>` | `low \| medium \| high \| critical` (default: `medium`). |
| `--readiness <readiness>` | `raw-idea \| needs-evidence \| needs-decision \| ready-for-milestone \| ready-for-cadence-spec \| blocked` (default: `raw-idea`). |
| `--area <areas>` | Comma-separated affected areas. |
| `--file <files>` | Comma-separated affected file paths. |
| `--evidence <summary>` | Short evidence note. |
| `--scout-id <id>` | Group this rec under a scout-session id so the recs from one `/cadence-scout` run are queryable as a cluster. Convention: `scout-YYYYMMDD-HHMM` (not enforced). |

Writes:

- `.cadence/intelligence/recommendations.json`
- `.cadence/intelligence/evidence.json` when `--evidence` is provided
- `.cadence/intelligence/RECOMMENDATIONS.md`

#### recommendation evidence add

Appends a new evidence note to an **existing** recommendation. Unlike
`recommendation add --evidence`, which only attaches evidence at creation
time, this is the tied-record writer for the post-creation case — today the
only other path to attach evidence to a recommendation that already exists
is a manual hand-edit of both ledger files in lockstep, which is easy to get
out of sync (`cadence intelligence reconcile` does not help here: it only
re-derives `assumptionIds`/`decisionIds`, never `evidenceIds`).

```sh
cadence recommendation evidence add <recId> --note "confirmed the behavior in a manual repro"
```

**Arguments**

| Argument | Description |
|---|---|
| `<recId>` | Id of the recommendation to attach evidence to. Must already exist. |

**Options**

| Option | Description |
|---|---|
| `--note <text>` | Evidence note text. Required. Redacted the same way `recommendation add --evidence` is (see below) before it is persisted. |

**Behavior** — reads both the recommendation and evidence ledgers, appends a
new `Evidence` record (`kind: 'note'`) to `.cadence/intelligence/evidence.json`
with `recommendationId` set to `<recId>`, and links its id into that
recommendation's `evidenceIds` in `.cadence/intelligence/recommendations.json`
— both files (and the derived `RECOMMENDATIONS.md`) are written atomically in
a single `writeIntelligenceLedgers` call, so `cadence recommendation show
<recId>` reflects the new evidence immediately, with no `reconcile` step
needed. The recommendation's `updatedAt` is bumped. `--note` text passes
through the same `redactSecrets` choke point `addRecommendation` uses for
`--evidence` — a secret-shaped substring (e.g. an API key pattern) is
replaced with `[REDACTED]` in the persisted `Evidence.summary`, never stored
raw.

**Exit codes**

- `0` — evidence appended, both ledgers updated.
- `1` — refused (unknown `<recId>`). Refusal goes to stderr as
  `recommendation evidence add refused: recommendation <id> not found`; no
  ledger mutation on refusal.

---

#### recommendation list

Prints recorded recommendations in a compact table.

```sh
cadence recommendation list
```

**Options**

| Option | Description |
|---|---|
| `--format <format>` | Output format: `terminal` (default) or `json`. |
| `--filter-status <status>` | Filter to only entries with this status. |
| `--filter-text <substr>` | Case-insensitive substring search on title or summary. Mutually exclusive with `--filter-text-exact` and `--filter-regex`. |
| `--filter-text-exact <str>` | Case-insensitive whole-field equality match on title or summary. The entire scoped field must equal the literal (case-insensitive); substring matches do NOT match. Surrounding whitespace in the literal is significant (no trim). Mutually exclusive with `--filter-text` and `--filter-regex`. Empty literal returns exit 1. (Slice 36) |
| `--filter-regex <pattern>` | Power-user regex filter on title or summary (always case-sensitive by default; use `--filter-regex-flags` for case-insensitive / multiline / dotAll, or character classes like `[Cc]ycle` for one-off case-insensitivity). Mutually exclusive with `--filter-text` and `--filter-text-exact`. Max length 200 characters. |
| `--filter-regex-flags <flags>` | RegExp flag letters to apply to `--filter-regex`. Allowed: `i` (case-insensitive), `m` (multiline `^/$`), `s` (dotAll `.`), `u` (unicode). Letter-string grammar mirrors JS RegExp's native second argument (`'is'` applies both). Requires `--filter-regex` to also be set (orphan use returns exit 1). Empty value, duplicate letters, and invalid letters all return exit 1 with the specific letter named. (Slice 37) |
| `--filter-converted-to <phaseId>` | Reverse-lookup filter: returns only recommendations whose `convertedToPhaseId` equals `<phaseId>`. Implies `status=converted` because only converted recs populate the field. Empty-result message uses `converted-to="<phaseId>"`. Pairs with `cadence spec new --from-rec` / `draft new --from-rec` (Slice 34.3) — operators converting a rec one direction can ask the reverse question via this filter. |
| `--sort-by <key>` | Sort by a single key, optionally suffixed with `:desc`. Default direction is ascending. Allowed keys: `created`, `updated`, `priority` (low<medium<high<critical), `status` (lifecycle order: candidate<accepted<deferred<rejected<converted), `title`, `leverage` (numeric 0–10), `risk` (numeric 0–10), `confidence` (numeric 0–1), `decay` (fresh<aging<stale<superseded<contradicted<needs-revalidation). Pipeline applies after filters, before `--reverse`/`--offset`/`--limit`. Composes with `--reverse`; `--sort-by X --reverse` ≡ `--sort-by X:desc`. (Slice 35) |
| `--reverse` | Reverse the entry order (after filters, before offset/limit). |
| `--offset <n>` | Skip the first N entries (after filters). |
| `--limit <n>` | Cap output to first N entries (after filters). |
| `--archived` | List the **soft-archived** recommendations (the ledger's `archived` array) instead of the active set. Without it, archived recs never appear and the active list footers their count (`(N archived — see \`recommendation list --archived\`)`). (v1.24) |

#### recommendation show

Shows a single recommendation with all linked assumptions, decisions, and
evidence.

```sh
cadence recommendation show <id>
```

**Arguments**

| Argument | Description |
|---|---|
| `<id>` | Recommendation id to display. |

**Options**

| Option | Description |
|---|---|
| `--open-assumptions-only` | Filter assumptions to `status=open` only (default: `false`). |
| `--active-decisions-only` | Filter decisions to `status=active` only (default: `false`). |
| `--format <format>` | Output format: `terminal` (default) or `json`. |

#### recommendation convert

Records the fact that a recommendation was implemented as a CADENCE phase.
The flag-name and shape of this transition was settled in Praxis Slice 34 —
terminal (no `unconvert`), 1:1 cardinality, strict FK on the phase directory.

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

#### recommendation promote

Advances a recommendation's `status` and/or `readiness` so the
[`milestone propose`](#milestone) pipeline becomes reachable for
manually-added recommendations (which `add` creates as `candidate` /
`needs-evidence`). Independent of `convert`: it never sets
`convertedToPhaseId`.

```sh
cadence recommendation promote <recId> --status accepted --readiness ready-for-milestone
```

**Options**

| Option | Description |
|---|---|
| `--status <status>` | New status: `candidate`, `accepted`, `deferred`, `rejected`, or `shipped`. (`converted` is rejected — that transition is owned by [`recommendation convert`](#recommendation-convert). `settle-pending` is also rejected — see below; it is set automatically, never a manual promote target.) |
| `--readiness <readiness>` | New readiness: `raw-idea`, `needs-evidence`, `needs-decision`, `ready-for-milestone`, `ready-for-cadence-spec`, or `blocked`. |
| `--ref <text>` | Freeform provenance recorded on a `shipped` rec (e.g. `"PR #70 / v1.22.1"`). Only valid with `--status shipped`; rejected otherwise. Stored verbatim and rendered as a `- shipped:` line. |

**Behavior** — at least one of `--status` / `--readiness` is required.
Status and readiness are independent axes (no forced monotonic
progression). Refused for recommendations in a terminal status
(`converted`, `rejected`, `shipped`). On success the ledger is persisted
(atomic JSON + `RECOMMENDATIONS.md` re-render) with a bumped `updatedAt`. To
make a rec milestone-eligible, set both `--status accepted` and
`--readiness ready-for-milestone` (or `ready-for-cadence-spec`).

`shipped` is the positive-terminal status for a rec whose work has **landed**
without (or after) a formal `convert` — e.g. a direct fix that merged via a PR.
It drops the rec out of the active `cadence recommend` surface, exactly like
`converted`/`rejected`. The sanctioned transitions out of an otherwise-terminal
status are `converted → shipped` (a converted phase that later shipped) and
`settle-pending → shipped` (see below).

**`settle-pending`** — a non-terminal waypoint between `converted` and
`shipped`: `cadence settle run` automatically moves a `converted` recommendation
here when its linked phase settles (settle happens on a feature branch, before
the PR merges — so `settle-pending` says "the code was written for this," not
yet "this shipped"). It stays in the **active** ledger (not archived) as a
standing reminder, surfaced by `cadence doctor`'s `recommendation-shipped-drift`
check and an optional `cadence progress` `Note:` line. The only way out is
`recommendation promote <id> --status=shipped --ref "<PR/tag>"` once the phase's
branch actually merges; `settle-pending` cannot be set manually via `promote`.

**Auto-archive (v1.24)** — when `recommendations.autoArchive` is on (the default),
promoting to `shipped` or `rejected` also **soft-archives** the rec in the same atomic
write (it moves to the ledger's `archived` array; see
[`recommendation archive`](#recommendation-archive)). The rec keeps its status and any
`--ref`, and stays inspectable via `recommendation show` / `list --archived`. Set
`recommendations.autoArchive: false` to leave terminal recs in the active ledger. A
rec moved to `settle-pending` is **not** archived at that point (v1.24's old
behavior of archiving a `converted` rec on settle was replaced by the
`settle-pending` waypoint above) — archiving happens only once it reaches
`shipped`.

**Exit codes**

- `0` — promoted, ledger updated.
- `1` — refused (no flags, invalid enum value, unknown id, or terminal
  status). Refusal goes to stderr; no ledger mutation on refusal.

---

#### recommendation archive

Soft-archives a recommendation — moves it aside but **retains** it (recoverable),
keeping the active ledger lean without deleting provenance. The honest counterpart to
deletion: nothing is destroyed. (v1.24)

```sh
cadence recommendation archive <recId>
```

**Behavior** — moves the rec from the ledger's `recommendations` array to its
`archived` array in one atomic write (JSON + `RECOMMENDATIONS.md` re-render), stamping
`archivedAt` and `archiveReason: 'manual'`. Works on a rec in **any** status (for
clearing a junk/duplicate). Archived recs drop out of the default `recommendation list`
(see `--archived`) but remain visible to `recommendation show <id>`. The inverse is
[`recommendation unarchive`](#recommendation-unarchive).

Automatic archival (on terminal status via `promote`) is wired through the same
primitive and gated by [`recommendations.autoArchive`](config.md#recommendations).
A `converted` rec whose phase settles is **not** auto-archived — instead it
moves to the `settle-pending` status instead (see [`recommendation
promote`](#recommendation-promote)) and stays in the active ledger until it's
promoted to `shipped`.

**Exit codes**

- `0` — archived.
- `1` — refused (unknown id, or the id is not in the active set — e.g. already
  archived). Refusal goes to stderr; no ledger mutation on refusal.

---

#### recommendation unarchive

Restores a soft-archived recommendation back into the active set. (v1.24)

```sh
cadence recommendation unarchive <recId>
```

**Behavior** — moves the rec from `archived` back to `recommendations`, clearing
`archivedAt`/`archiveReason` and bumping `updatedAt` (atomic JSON +
`RECOMMENDATIONS.md` re-render). The rec's status is unchanged — unarchiving a
`shipped` rec leaves it `shipped`, just back in the active ledger.

**Exit codes**

- `0` — restored.
- `1` — refused (id not in the `archived` array). Refusal goes to stderr; no ledger
  mutation on refusal.

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
| `--scout-id <id>` | Narrow the report to one scout-session cluster (recs whose `scoutId` matches); totals reflect the scoped set. |
| `--top <n>` | Show only the top N ranked recommendations (`totals.ranked` still reports the full count). Must be a positive integer. |
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
| `reopen <id>` | Reopen a deferred milestone back to proposed |
| `export <id> --to cadence` | Export an accepted milestone to a staged CADENCE SPEC draft |
| `premortem <id> [--json] [--add-out-of-scope <text...>] [--add-likely-failure-mode <text...>] [--add-hidden-dependency <text...>]` | Recompute the deterministic pre-mortem for a `proposed`/`accepted` milestone in place (refuses other statuses); the repeatable `--add-*` flags append operator-authored entries to the corresponding field and refuse (exit 1, no write) on any empty/whitespace-only value |
| `status <id> [--json]` | Report each of the milestone's phases (derived from its recommendations' `convertedToPhaseId`) with its owning worktree, live loop position, and settled/not-settled state |
| `list [--json]` | Show the current milestone ledger |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis).
`propose` reads the recommendation ledger **read-narrow** (it is backend-free —
it never reads or writes `state.json` and never transitions the loop).
`status <id>` (below) is read-narrow in the complementary sense — it *reads*
(never writes) `state.json` across both the local repo and any sibling
worktrees, via `gatherHandoffCandidates` (phase 142), and likewise never
transitions the loop.
`propose` clusters recommendations that are `accepted` and `ready-for-milestone`/
`ready-for-cadence-spec` (excluding `superseded`/`contradicted`) by their
`suggestedMilestoneId` (each ungrouped rec becomes its own singleton
candidate), and attaches a deterministically-seeded scaffolded pre-mortem
(facts-only: shared-file dependencies, doc-surface drift, low-confidence
inputs); pre-mortem entries not covered by a deterministic seed — and
`outOfScope` always — are left empty with placeholder prompts in the rendered
`MILESTONES.md` for a human to fill.
Re-running `propose` regenerates only `proposed` records; `accepted`/
`deferred`/`exported`/`closed` milestones and their recommendations are never
clobbered or re-proposed. `accept`/`defer`/`reopen` enforce guarded status
transitions. `reopen <id>` moves a `deferred` milestone back to `proposed`,
so its `recommendationIds` re-enter the eligible pool the next time
`propose` runs; it is refused (exit 1) if the milestone isn't currently
`deferred` (the error names the current status), the id is unknown, or any
of its `recommendationIds` is already claimed by another still-live
milestone — one whose status is anything other than `deferred`/`proposed`
(the error names the colliding milestone id and its status). `premortem <id>` re-runs a deepened deterministic pre-mortem
(decay/erosion/open-assumption/overestimated-value signals) for one
`proposed`/`accepted` milestone against the **current** recommendation and
assumption ledgers, replaces that milestone's derived pre-mortem dimensions
in place, bumps its `updatedAt`, and re-renders `MILESTONES.md`; the
operator-owned `outOfScope` field is preserved verbatim and never derived.
It is refused for an unknown id or any status other than `proposed`/
`accepted`. The repeatable `--add-out-of-scope <text...>`,
`--add-likely-failure-mode <text...>`, and `--add-hidden-dependency <text...>`
options append operator-authored text to the corresponding `preMortem` field
before the refresh runs; any empty/whitespace-only value refuses the whole
command (exit 1, stderr message, no write) before touching the ledger.
Operator-authored `likelyFailureModes`/`hiddenDependencies` entries added this
way survive later plain refreshes (no `--add-*` flags) alongside the
freshly-derived deterministic entries, the same way `outOfScope` already
does. `export <id> --to cadence` renders a deterministic CADENCE SPEC scaffold from an `accepted`
milestone's own facts, writes it to `.cadence/intelligence/exports/<id>/SPEC.md`, records an
`exportTarget`, and flips the milestone to `exported`; it **never** runs `cadence spec new`,
allocates a loop id, or writes `state.json` — the staged SPEC is promoted manually by the
operator. Export is refused for an unknown backend, unknown id, or any status other than
`accepted` (re-export of an already-`exported` milestone is refused).
`status <id>` is a read-only fan-in reconciliation: for each of the milestone's
`recommendationIds` it looks up that recommendation's `convertedToPhaseId` and,
for each converted phase, resolves the worktree (local or sibling) currently
reporting that phase as its live `activePhase` via `gatherHandoffCandidates`
(phase 142), then reports that worktree's source (`local`/`sibling`), path,
branch, and live loop position — replacing N manual `cadence status`
round-trips (one per worktree) with a single command. A recommendation with no
`convertedToPhaseId` yet is reported as `not-yet-converted`; a converted phase
with no local/sibling worktree currently reporting it active is reported as
`no-worktree-found`; both are listed, never dropped. A resolved phase is
marked `settled` when the owning worktree's live loop position is `IDLE`, and
`not-settled` otherwise. `status` does not create, provision, or otherwise
fan out worktrees, and it never writes to any ledger or transitions the loop
— it is refused (exit 1) for an unknown milestone id, matching the existing
`accept`/`defer`/`close` refusal shape.

Writes:

- `.cadence/intelligence/milestones.json`
- `.cadence/intelligence/MILESTONES.md`
- `.cadence/intelligence/exports/<id>/SPEC.md` (on `export`)

`status` writes nothing.

With `--json` (on `propose`, `premortem`, `status`, and `list`), the milestone ledger object — or, for `status`, the
`{ ok, milestoneId, phases }` reconciliation result — is emitted to stdout instead of
the rendered text. Distinct from CADENCE's own execution-layer
`.cadence/MILESTONES.md`.

**Exit codes** — exits non-zero only on a genuine failure (artifact write
error, or an illegal/unknown-id `accept`/`defer`/`reopen` (a `reopen` is also
refused when a claimed recommendation collides with another still-live
milestone), or an unknown-backend/unknown-id/non-accepted `export`, or an
unknown-id/non-`proposed`/`accepted` `premortem`, or an unknown-id `status`).
An empty/absent recommendation ledger degrades gracefully and still exits 0.

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

### handoff

```
Usage: cadence handoff [options] [label]

Scaffold a SESSION handoff doc in .cadence/handoff/ with machine facts pre-filled
```

**Arguments**

| Argument | Description |
|---|---|
| `[label]` | Optional context label, appended to the filename (alternative to `--label`) |

**Options**

| Option | Description |
|---|---|
| `--label <s>` | Context label (alternative to the positional arg) |
| `--force` | Overwrite an existing same-day SESSION doc instead of refusing |
| `--no-stamp` | Do not write `state.session.lastHandoff` (leaves `state.json` unchanged) |
| `--no-git` | Skip the read-only git facts section |
| `--no-fetch` | Skip the `git fetch` that normally runs before reading git facts (offline) |
| `--check` | Verify the freshest SESSION doc has no unfilled `FILL IN` sections instead of writing a new one; exits 3 if any remain |
| `--json` | Emit machine-readable JSON instead of a summary |
| `-h, --help` | Display help for command |

**Behavior** — writes `.cadence/handoff/SESSION-<YYYY-MM-DD>[-<label>].md`. The
doc has two zones: a **machine-filled** zone (loop position, read-only git facts,
and the `cadence context handoff` intelligence packet — correct by construction,
labeled "verify, don't retype") and an empty **narrative** zone (TL;DR, what
landed, gotchas, next action) for a human to fill in. Generating the doc also
refreshes `.cadence/intelligence/context/handoff.{json,md}` as a side effect of
`cadence context handoff`. By default the command stamps
`state.session.lastHandoff` with the new filename (so `cadence resume` finds it
reliably); `--no-stamp` skips that single state write. When git is unavailable
(non-repo or git missing), the git section renders as `unavailable` and the
command still succeeds — git facts are best-effort, never a hard dependency.
By default the git facts read runs a best-effort `git fetch` first, so the
recorded ahead/behind counts reflect origin's current state rather than
whatever was last fetched; `--no-fetch` skips it for a fully offline write.

**`--check`** — a completion gate, not a scaffold: skips writing a new doc
and instead re-reads the freshest existing SESSION doc for unfilled
`<!-- … FILL IN … -->` markers left by a session that stamped a handoff
without finishing its narrative. Prints `handoff check: <path> complete` and
exits 0 when every section was filled in; exits 3 and names the unfilled
section(s) otherwise; exits 1 if no SESSION doc exists yet.

**Exit codes** — exits 2 when the target file already exists and `--force` was
not passed (never silently overwrites a human's narrative); exits 3 under
`--check` when unfilled sections remain; exits non-zero on other genuine
failures (e.g. `.cadence/` not initialized).

---

### resume

```
Usage: cadence resume [options]

Replay the freshest .cadence/handoff/ SESSION doc + live context (read-only)
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `--full` | Force full output (whole doc + live context replay) |
| `--brief` | Force brief output (key sections only, no context replay) |
| `--list` | List every discoverable handoff candidate (local + sibling worktrees) and resume nothing |
| `--pick <n>` | Resolve directly to the Nth candidate from `cadence resume --list` (1-based), skipping the menu |
| `--path <p>` | Resolve directly to the handoff doc at this exact path, skipping the menu |
| `--local` | Force the local-only fast path, ignoring sibling worktrees entirely |
| `--offline` | Skip the origin-freshness probe (no network) |
| `-h, --help` | Display help for command |

**Behavior** — read-only; mutates nothing, including when a pick resolves to a
sibling worktree (a test asserts `state.json` is byte-unchanged across a
`resume`). Locates the freshest SESSION doc for the *local* worktree —
preferring the `state.session.lastHandoff` pointer when its file exists,
otherwise globbing `.cadence/handoff/SESSION-*.md` ranked by frontmatter
`generated_at` — and emits it verbatim alongside a freshly recomputed live
`cadence context handoff` packet (authoritative if the machine facts have
drifted since the doc was written). If the doc's recorded loop position
differs from live state, it prints a one-line drift note (e.g. `⚠ handoff
written at BUILD; live state now IDLE`).

Output mode defaults to drift-decides: `full` (whole doc + live context) when
drift is detected, else `brief` (key sections only, no context recompute).
`--full`/`--brief` force one or the other explicitly.

**Origin-freshness probe** — after resolving the doc, `resume` runs a
best-effort `git fetch` and compares local `HEAD` against `@{u}` (config
`resume.remoteCheck`, default `true`; `--offline` skips it for a fully
offline run). If origin has commits this clone lacks, it prints `⚠
origin/<branch> is N commit(s) ahead of local HEAD — this handoff may be
superseded by work pushed from another machine.` with an `git log --oneline
HEAD..@{u}` hint — a signal to inspect and reconcile before acting on the
replayed next action, never an automatic pull/rebase/reset. The probe is
soft: a non-repo, detached HEAD, no upstream, or failed fetch prints `note:
could not verify freshness against origin (<reason>)` instead of failing the
command.

**Unfilled-section warning** — if the resolved doc still has scaffolded
`<!-- … FILL IN … -->` markers (a prior session ran `cadence handoff` but
never finished the narrative), `resume` prints `⚠ handoff has unfilled
sections: <sections> — treat them as absent; the previous session did not
complete its handoff.` before the doc body. See
[`handoff --check`](#handoff) for gating this at handoff-time instead.

**Cross-worktree discovery** — alongside the local doc, `cadence resume`
best-effort discovers the freshest handoff doc in every sibling git worktree
(config `resume.crossWorktree`, default `true`). With 0–1 total candidates,
behavior is identical to the local-only command. With 2+ candidates and no
explicit selector (`--pick`/`--path`/`--list`), the default
(`resume.autoList: false`) still resumes the local candidate but prints one
stderr nudge: `note: N other worktree(s) have resumable handoffs — cadence
resume --list`. Setting `resume.autoList: true` instead opens an interactive
picker (prompting `Pick a number (or q to quit): `) once 2+ candidates exist
and nothing was explicitly selected; in a non-TTY the picker prints the
candidate menu and returns cleanly without prompting — it never hangs waiting
on stdin. `--local` (or config `resume.crossWorktree: false`) skips discovery
entirely, restoring the exact pre-phase-142/143 local-only behavior.

`--list` prints the numbered candidate menu (`[local]`/`[sibling]` tag,
branch, label, loop position, generated-at, worktree path) and resumes
nothing. `--pick <n>` resolves the Nth entry from that same list (1-based);
`--path <p>` resolves the candidate at that exact doc path. An out-of-range
`--pick` or a `--path` matching no candidate is not a hard error — it falls
back to the local candidate (or, with 2+ candidates and `autoList: true`,
the interactive picker).

Picking a **sibling** candidate — via `--pick`, `--path`, or the interactive
picker — is strictly read-only: it never writes into the sibling's
`.cadence/`, and never stamps the local `state.session.lastHandoff`. Its
output opens with a `--- from sibling worktree: <path> ---` header, followed
by the usual `--- narrative from <handoffPath> ---` line — both print,
unconditionally, in that order. A sibling's live
context is never recomputed (doing so would require writing into its
`.cadence/intelligence/context/`), so `context` is always `null` for a
sibling pick: full mode prints a footer — `live context recompute skipped:
<path> is a different worktree — cd there and run `cadence resume --full` to
get its live context` — instead of a real context packet, and brief mode
prints the equivalent shorter note pointing at the same `cd`-and-`--full`
fix.

**Flag-conflict refusals** (exit 1, clear stderr message, nothing run):
- `--full` and `--brief` together — `resume: --full and --brief are mutually exclusive`
- more than one of `--list`, `--pick`, `--path` together — `resume: <flags> are mutually exclusive`
- `--local` combined with any of `--list`/`--pick`/`--path` — `resume: --local and <flag> are mutually exclusive`
- `--pick` given a non-numeric value — `resume: --pick must be a number`

**Exit codes** — exits 0 when no handoff is found, printing an informational
message with a `cadence handoff` hint (an empty handoff dir is not an error);
exits 1 on the flag-conflict refusals above; exits non-zero on other genuine
failures.

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
| `show <id>` | Show a single assumption with its tied recommendation cross-ref |
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
| `--filter-regex <pattern>` | Power-user regex filter on `text` (always case-sensitive by default; use `--filter-regex-flags` for case-insensitive / multiline / dotAll, or character classes like `[Cc]ycle` for one-off case-insensitivity). Mutually exclusive with `--filter-text` and `--filter-text-exact`. Max length 200 characters. |
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
| `show <id>` | Show a single decision with its tied recommendation cross-ref |
| `graph <id>` | Show the supersession chain (ancestors + descendants) for a decision |
| `list` | List recorded decisions |
| `supersede <id>` | Mark an active decision superseded |
| `rescind <id>` | Mark an active decision rescinded |
| `reactivate <id>` | Reactivate a superseded or rescinded decision |

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
| `--filter-regex <pattern>` | Power-user regex filter on title or rationale (always case-sensitive by default; use `--filter-regex-flags` for case-insensitive / multiline / dotAll, or character classes like `[Cc]ycle` for one-off case-insensitivity). Mutually exclusive with `--filter-text` and `--filter-text-exact`. Max length 200 characters. |
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

### onboard

```
Usage: cadence onboard [options]

Per-machine setup for a repo that already has .cadence/ committed (install host hooks, report verifier readiness)
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text |
| `--host <host>` | Wire a host during onboarding: `claude \| codex` |
| `--wire-host` | When a `.claude/` workspace is present, run the Claude Code host install in the same step (auto-run, no prompt) |
| `--skip-host-wire` | Never wire the Claude Code host, even when `.claude/` is present |

**Behavior** — the per-machine counterpart to `cadence init`: onboarding a
*new machine* (or a fresh clone/worktree) onto a repo whose `.cadence/` is
already committed, rather than scaffolding a new project. It never writes
`.cadence/config.json` — only (optionally) installs host hooks and reports
verifier readiness there. Refuses with exit code 2 when no `.cadence/`
directory exists in the current working tree, pointing at `cadence init` to
scaffold a new project instead.

`state.json`/`STATE.md` are gitignored and per-worktree (Phase 196, issue
#177), so a fresh worktree or fresh clone of an already-`.cadence/`-committed
repo has no `state.json` yet. When `.cadence/state.json` is missing, `onboard`
bootstraps a fresh one (`loopPosition: IDLE`, no active phase/draft/task,
`revision: 0`), deriving the project name from `.cadence/PROJECT.md`'s
first-line `# <name>` header (falling back to `"unnamed"` if that file is
missing or doesn't match the expected shape), and prints a notice to stderr
naming the bootstrapped project. When `state.json` already exists, it is left
completely untouched — `onboard` instead reads the existing project name from
it (best-effort — falls back to `"unnamed"` on a missing or unparsable file).

Either way it then reads the gate profile from the loaded config and reports
verifier readiness via the same `assessReadiness` check `cadence doctor`'s
`verification-readiness` check and `cadence activate` use. Host wiring reuses
`cadence init`'s decision table: `--host <claude|codex>` or `--wire-host`
wires unconditionally (no prompt); `--skip-host-wire` always opts out; with
none of the three passed and a `.claude/` workspace detected, a TTY is offered
the install interactively while a non-TTY skips it (the rendered summary's
"host hooks" line reports the outcome either way). With `--json`, stdout is
`{ ok: true, project, gateProfile, hostWire: { wired, offered }, verifier: {
provider, keyPresent, ready, reason } }` on success, or `{ ok: false, error }`
on the missing-`.cadence/` refusal.

**Exit codes** — `2` when `.cadence/` is missing; `1` on an unexpected error
(e.g. a config load failure, reported to stderr); `0` on success.

---

### mcp

```
Usage: cadence mcp [options] [command]

Model Context Protocol surface
```

**Subcommands**

| Subcommand | Description |
|---|---|
| `serve [--repo <path>]` | Run the CADENCE MCP server over stdio so any MCP host can drive the loop |
| `install [--print] [--client <c>]` | Wire the MCP server into a host by writing/merging `.mcp.json` |
| `trust grant --tool <name> [--ttl-days <n>]` | Grant a trust envelope for an `APPROVAL_BYPASS`/`SETTLE` MCP tool (CLI-only) |
| `trust revoke --tool <name>` | Revoke a previously granted trust envelope |
| `trust list [--json]` | List trust grants and whether each is currently valid |

**`serve` options**

| Option | Description |
|---|---|
| `--repo <path>` | Repo root to operate on (default: current working directory) |
| `-h, --help` | Display help for command |

**`install` options**

| Option | Description |
|---|---|
| `--repo <path>` | Repo root to operate on (default: current working directory) |
| `--print` | Print the config snippet instead of writing a file |
| `--client <client>` | Target host: `claude-code` \| `claude-desktop` \| `cursor` (default `claude-code`; non-claude-code is print-only) |
| `-h, --help` | Display help for command |

**`install` behavior** — by default writes/merges a project `.mcp.json` with the
`cadence` server entry. The merge is **non-destructive and idempotent** (existing
`mcpServers` and unknown top-level keys preserved; only the `cadence` key set)
and **refuses to overwrite a malformed `.mcp.json`**. Only Claude Code's
`.mcp.json` is written; `--print` (or `--client claude-desktop|cursor`) emits a
paste-ready snippet plus a path hint and writes nothing.

**`trust grant` options**

| Option | Description |
|---|---|
| `--repo <path>` | Repo root to operate on (default: current working directory) |
| `--tool <name>` | MCP tool name to grant, e.g. `cadence_draft_approve` (required) |
| `--ttl-days <n>` | Grant expires after N days (default: never expires) |
| `-h, --help` | Display help for command |

**`trust revoke` options**

| Option | Description |
|---|---|
| `--repo <path>` | Repo root to operate on (default: current working directory) |
| `--tool <name>` | MCP tool name to revoke (required) |
| `-h, --help` | Display help for command |

**`trust list` options**

| Option | Description |
|---|---|
| `--repo <path>` | Repo root to operate on (default: current working directory) |
| `--json` | Print the raw trust ledger as JSON instead of the rendered table |
| `-h, --help` | Display help for command |

**`trust` behavior** — the MCP tool-trust envelope (phase 181; extended to
`SETTLE` in phase 216). Two of the 18 registered MCP tools are classified
`APPROVAL_BYPASS` (`cadence_draft_approve`, `cadence_spec_approve`): calling
either one over MCP skips the interactive manual-approve prompt the CLI
would otherwise show. A third, `cadence_settle`, is classified `SETTLE` — it
closes the loop and writes `SUMMARY.{json,md}`, and is gated by the same
envelope. `cadence mcp trust grant/revoke/list` constrains all three instead
of leaving them unconditional.
A grant binds a sha256 structural hash of the tool's live definition (name +
description + `inputSchema` shape), the CADENCE version it was granted
against, and an optional expiry. `grant` refuses (exit 1, refuse+suggest) for
any tool whose capability class is not `APPROVAL_BYPASS`/`SETTLE` — there is
nothing to gate on a read-only, ledger-write, or loop-write tool. Grants are
issued **only** through this CLI command, run interactively on a real
terminal — there is no MCP tool that can create, list, or revoke a grant, so
an MCP client can never self-attest or self-grant its own trust. `list`'s
`valid` column is `yes` only when the grant's stored version matches the
running CADENCE version and it is unexpired; it does not re-check the
def-hash (that check runs at call time, inside `cadence_draft_approve` /
`cadence_spec_approve` / `cadence_settle` themselves). See
[Driving CADENCE over MCP](../mcp.md) for how a gated tool call is refused
when no valid grant exists.

**Exit codes** — `trust grant`: exits 1 on an unknown tool name, a capability
class that isn't `APPROVAL_BYPASS`/`SETTLE`, or an invalid `--ttl-days`;
exits 0 on success. `trust revoke`: exits 1 if no grant exists for `--tool`;
exits 0 on success. `trust list`: always exits 0, including on an empty
ledger.

**Behavior** — starts a local [Model Context Protocol](https://modelcontextprotocol.io)
server on **stdio** (one of Cadence's three surface categories — CLI, host
adapters, MCP). An MCP-capable host (Claude Desktop, Cursor, other agents) launches it
as a child process and drives the DRAFT→BUILD→SETTLE loop through a curated tool
set. It is **not** a network service — there is no daemon, URL, or auth; the
server operates on the `.cadence/` of `--repo` (or the launch cwd), exactly like
the CLI. See **[Driving CADENCE over MCP](../mcp.md)** for setup and the full
tool list.

The server advertises 18 tools that wrap the same engine the CLI does:
`cadence_progress`, `cadence_status`, `cadence_recommend`, `cadence_doctor`,
`cadence_resume` (read); `cadence_draft_new`, `cadence_draft_check`,
`cadence_draft_approve`, `cadence_build_task`, `cadence_settle`,
`cadence_spec_new`, `cadence_spec_approve`, `cadence_handoff`,
`cadence_recommendation_add`, `cadence_recommendation_promote`,
`cadence_recommendation_convert`, `cadence_recommendation_archive`,
`cadence_milestone_propose` (write). It also
exposes `.cadence/` artifacts as read-on-demand **resources** (`cadence://…`)
and guided **prompts** (incl. `cadence_scout`). Command-boundary gates
(coherence, the settle gate stack, spec-review) run exactly as they do from the
CLI; **ambient edit-time gates require host hooks and are not available over
MCP**. The MCP SDK is lazy-loaded — ordinary CLI commands never pay its load
cost.

**Exit codes** — runs until stdin closes (the host owns the lifecycle). Exits
non-zero only on a startup failure.

---

### tutorial

```
Usage: cadence tutorial [options]

Run one real DRAFT→BUILD→SETTLE loop — including the moment settle refuses
```

**Options**

| Option | Description |
|---|---|
| `--no-pause` | Do not pause between steps (auto-advance; required for non-TTY runs — CI, pipes, agents) |
| `-h, --help` | Display help for command |

**Behavior** — runs one real loop built around the catch. In a disposable
`.cadence/` sandbox it drives draft → approve → build through the **real engine**,
then stages a lie: task `T1` is marked DONE and `sum.mjs` exists, but no test
backs `AC-1`. The first `settle run --auto` therefore **refuses** — the
`test-coverage` gate names `AC-1` and the loop stays open. The tutorial then
writes a real `sum.test.mjs`, the second `settle run --auto` executes it via
`build-test-must-pass` (`node --test`, real exit code), and the loop closes with
a SUMMARY. It uses no `--ac` manual assertion and no coverage bypass: the gates
decide on real state alone, so the refuse → fix → pass arc can never drift from
real behavior.

It is fully **offline and side-effect free**: the only verifier is the default
mock (no API key or network) and the only executed test is the sandbox's own
`node --test`; it never reads or writes the `.cadence/` of the current working
directory, and always removes its temp sandbox — even if a step fails. In a TTY
it auto-advances with a short pause between beats and a longer beat at the
refusal; with `--no-pause` (or any non-TTY stdin) it runs straight through.

**Exit codes** — `0` on a clean run (which *includes* the staged refusal being
caught and then resolved); non-zero only if the loop misbehaves — e.g. the
staged settle fails to refuse, or the fixed settle fails to close.

---

### explain

```
Usage: cadence explain [concept]

Print an in-terminal explanation of a CADENCE concept
```

**Arguments**

| Argument | Description |
|---|---|
| `[concept]` | Concept to explain — `loop`, `gates`, `tiers`, `profiles`, or `config` (aliases `gate`/`tier`/`profile`/`configuration` and any casing resolve). Omit to list the available concepts. |

**Behavior** — prints a curated, terminal-sized explanation of a core CADENCE
concept so you can learn the model without leaving the terminal. The content is
**embedded in the binary** (distilled from [docs/concepts.md](../concepts.md)),
never read from disk at runtime, so it works identically from any install —
including an `npx` one where the `docs/` tree is not shipped. Run bare
(`cadence explain`) to list the concepts with one-line blurbs; an unrecognized
name prints that list plus a nearest-match "did you mean …?" nudge. A coverage
test (`tests/cli/explain.test.ts`, AC-5) guards that every advertised concept
keeps non-empty content.

The concepts are **cross-linked**, not standalone: the central idea is that
profile (user-involvement) × tier (phase size) selects the effective gate set,
and each axis concept points across to the others via a "See also" line. The
`config` concept bridges to [`cadence config explain`](#config) — where that
abstract profile × tier → gate-set mapping is rendered concretely against *your*
own `.cadence/config.json`.

**Exit codes** — `0` for a known concept or the bare list; `1` for an unknown
concept (after printing the list + suggestion).

---

### start

```
Usage: cadence start [options]

Interactive onboarding — pick what you're doing, and run it
```

**Options**

| Option | Description |
|---|---|
| `--pick <n>` | Select a menu option non-interactively (still confirms unless `--yes`) |
| `--yes` | Skip the confirm and run the picked option |
| `--json` | Emit the structured menu and exit (no prompt) |

**Behavior** — the interactive front door, sibling to the read-only `quickstart`
(which prints the map without running anything). `start` first prints an
opinionated recommended command based on local state: uninitialized repos point
at the no-install `npx -y @manehorizons/cadence-core tutorial`, initialized
IDLE repos point at `cadence draft new --title "Fix login timeout" --template
bugfix`, active loops point at `cadence progress`, and unreadable state points
at `cadence doctor`.

It then asks "What are you doing?", takes a numbered pick, shows the exact
command and a `[Y/n]` confirm, then runs it. The six routes are:
`cadence tutorial` (throwaway sandbox), `cadence init` (this repo),
`npx @manehorizons/cadence-host-claude-code install` (Claude Code),
`npx @manehorizons/cadence-host-codex install` (Codex CLI), `cadence mcp
install` (MCP), and `cadence doctor` (health check). Dispatch is a subprocess
spawn — the `cadence` binary for core routes, `npx` for the two host packages —
so `start` never imports host code. Declining the confirm prints the command so
you can run it yourself. If the repo is already initialized, the `init` option
is annotated as safe to re-run. In a non-interactive shell with no `--pick`, it
prints the recommendation plus menu and exits `0` (never hangs).

For Codex first-run setup, prefer `cadence init --host codex` before launching
Codex. The `start` menu's Codex route is the adapter-only installer for an
already-initialized repo; it does not create `.cadence/` or `AGENTS.md` by
itself.

**Exit codes** — `0` on menu print / quit / declined-confirm; the dispatched
command's exit code when it runs; `1` on an invalid `--pick`.

---

### quickstart

```
Usage: cadence quickstart [options]

Read-only front door: where you are + your next moves
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit the structured orientation as JSON |

**Behavior** — a read-only, never-failing orientation: the obvious command to run
first. Before `init` it shows how to set up (`cadence init`) and how to see the
loop without touching your project (`cadence tutorial`). After `init` it shows
the same next move `cadence progress` computes (reused, so the two never drift),
plus a one-line map of the onboarding commands (`init`, `tutorial`, `explain`,
`config explain`, `doctor`, `progress`). Content is embedded in the binary, so
it works from any install. Any failure to read state degrades to the
uninitialized front door — it never crashes.

**Exit codes** — `0` always (the uninitialized state is the happy primary path, not an error).

---

### activate

```
Usage: cadence activate [options]

Turn on real verification — pick a provider, validate the key, wire deep-verify
```

**Options**

| Option | Description |
|---|---|
| `--provider <provider>` | `mock` \| `anthropic` \| `local` (required in a non-interactive shell) |
| `--all` | Activate every verifier seam, not just deep-verify |
| `--no-check` | Skip the live provider credential check |
| `--print` | Show the plan without writing config |
| `--json` | Emit the result as JSON |

**Behavior** — the guided on-ramp from the default all-`mock` verifiers to real AI
verification. Writes `verifier.provider` (only the deep-verify seam by default; `--all`
sets every seam) and, unless `--no-check`, makes one minimal live call to confirm the
provider's key works before declaring success (anthropic only; `local`/`mock` skip the
ping). The API key is discovered from the environment (`ANTHROPIC_API_KEY`, or
`CADENCE_LOCAL_BASE_URL` for `local`) or, failing that, a `.env` file at the repo root —
and is **never** written to config or logged — only
the provider name is persisted. If the key is absent the provider is still selected and
the exact `export …` line is printed (set-up-now-key-later). In a TTY with no
`--provider`, it prompts; in a non-TTY it requires `--provider`. `cadence doctor`'s
`verification-readiness` check reports the resulting state.

**Exit codes** — `0` on success or key-missing (non-fatal); `1` when a live check fails,
the config is invalid, or a non-interactive run omits `--provider`. (`--print` writes
nothing and exits `0`.)

---

### agent-prompt

```
Usage: cadence agent-prompt [options]

Print a copy-paste prompt that hands the loop to your AI agent
```

**Options**

| Option | Description |
|---|---|
| `--goal <text>` | Bake a specific goal into the prompt (e.g. `"fix the login timeout"`). Without it, the prompt contains a `<your goal>` placeholder |
| `--json` | Emit `{ goal, prompt }` as JSON instead of plain text (`goal` is `null` when `--goal` is omitted) |
| `-h, --help` | Display help for command |

**Behavior** — print a copy-paste prompt that tells your AI agent to scaffold the first
real CADENCE phase: run `cadence draft new --template …`, write testable acceptance
criteria tagged `AC-N`, and stop at approval for your review. `--goal` bakes a
specific goal into the prompt; `--json` emits `{ goal, prompt }`. Pure output —
reads and changes nothing.

The same block is also printed at the end of `cadence init` so you see it on every
new project without having to ask for it.

**Exit codes** — `0` always (pure output; no state read or write).

---

### verify

```
Usage: cadence verify [options] [command]

Read-only verification diagnostics
```

**Subcommands**

| Subcommand | Description |
|---|---|
| `coverage --explain <acId>` | Explain why an AC does or does not satisfy coverage (read-only, no state mutation) |
| `phase [phase] [num]` | Re-derive whether a settled phase's AC coverage still holds against the current working tree (read-only, no active loop state required) |

**`coverage` options**

| Option | Description |
|---|---|
| `--explain <acId>` | AC id to explain, e.g. `AC-8` (required) |
| `--json` | Emit machine-readable JSON instead of a human-readable report |

**Behavior** (phase 167, T8) — a read-only diagnostic companion to the `test-coverage`
gate (`docs/concepts.md`). It re-derives, for a single target AC id, everything the
gate computes internally but never prints: which test files matched
`verification.testGlobs`, which coverage profile (`docs/reference/config.md`'s
supported-language matrix) scanned each one — or, for an unclaimed extension, that
none did — every span the profile found, and, per occurrence of the AC token, which
span (if any) contains it and a plain-language reason it does or doesn't satisfy the
configured `coverageMode`, e.g. "token present but block not asserting" (`assertion`
mode) vs. a straightforward mention (`mention` mode). Globs and mode are read from
`.cadence/config.json` (defaults apply if absent); it does not require an active
BUILD/phase and never reads or writes `.cadence/state.json`, `STATE.md`, or any other
loop state — safe to run at any time, including outside the loop. `--json` emits the
same facts as structured JSON on stdout (`{ acId, mode, globs, anyFilesMatched, files,
satisfied }`); human mode prints an equivalent multi-line report, also on stdout.
Diagnostics (config-load failures, an empty `--explain` value) go to stderr.

**Exit codes** — `0` on a successful run (regardless of whether the AC is satisfied —
this command diagnoses, it does not gate); `1` on a config-load failure or an empty
`--explain` value.

**`phase` options**

| Option | Description |
|---|---|
| `[phase]` | Phase directory name (positional; paired with `[num]`) |
| `[num]` | Phase id number (positional; paired with `[phase]`) |
| `--changed` | Discover phases via `git diff` against `--base` instead of an explicit `[phase] [num]` |
| `--base <ref>` | Base ref to diff against when `--changed` is set |
| `--json` | Emit machine-readable JSON instead of a human-readable report |
| `--no-test-run` | Skip the optional `verification.testCommand` re-run |

**Behavior** (phase 204, T5) — a state-independent, phase-scoped re-derivation of
whether a settled phase's recorded AC coverage still holds, closing
rec-20260709-003. Unlike `verify coverage --explain`, it never requires an active
BUILD/loop or `.cadence/state.json` — it reads only the target phase's committed
`DRAFT.md` and `SUMMARY.json`, plus (unless `--no-test-run`) the current working
tree and the configured `verification.testCommand`.

Two modes: pass `[phase] [num]` directly to re-derive one phase, or `--changed
--base <ref>` to discover every phase whose `SUMMARY.json` changed between
`<ref>` and `HEAD` (via `git diff --name-only --diff-filter=ACMR`, which excludes
deletions) and re-derive all of them — the shape `cadence init --ci`'s generated
workflow invokes on every pull request. A git-diff failure (an unfetched base ref,
a shallow clone, an invalid `--base`) fails loudly with a distinct stderr message
and exit `2`, never silently treated as "nothing changed"; a genuinely empty diff
instead prints `verify phase: nothing to verify — no changed SUMMARY.json files
against the given base` and exits `0`.

Coverage re-scanning is deliberately scoped to the file paths the phase's own
DRAFT declared on its tasks (`draft.tasks[].files`) — never a whole-repo scan.
`AC-N` ids are small integers that repeat across every phase this repo has run;
scanning the whole repo would let an unrelated phase's identically-numbered AC
test satisfy this phase's recheck purely by coincidence of numbering, masking
real drift in the phase actually being replayed. A DRAFT that declares no task
files refuses outright rather than silently widening the scan. Drift is reported
per AC recorded in the phase's `SUMMARY.json`: an AC whose recorded result was
`pass: true` with `evidence: 'executed'` but is no longer covered by its linked
test is drift, printed as `<phase>/<id>: no drift` or `<phase>/<id>: N AC(s)
drifted` followed by one line per drifted AC (`<id>: recorded PASS (executed), no
longer covered by its linked test`).

Separately from coverage drift, unless `--no-test-run` is passed, the configured
`verification.testCommand` is re-run and its pass/fail reported on its own line:
`test command: passed|FAILED (suite-wide result, not attributed to a specific
AC)`. This is a real limitation, not just a caveat: a test-command failure means
*some* test in the suite failed, not that the specific AC(s) this phase claimed
are the ones that broke — there is no per-AC attribution of a whole-suite test
failure. `--json` emits `{ mode, results, testRun }` on stdout in both
single-phase and `--changed` modes: `mode` is `"single"` or `"changed"`, `results`
is one `{ phase, id, perAc, driftCount }` entry per target phase, and `testRun` is
one of three shapes: `null` when `--no-test-run` is passed (or when `--changed`
finds nothing to verify), `{ ran: false }` (no `passed` key) when
`verification.testCommand` isn't configured in `.cadence/config.json`, or
`{ ran: true, passed }` when the command actually ran.

**Exit codes** — `0` clean (no drift, and the test command passed or wasn't run);
`1` when drift is found or the test command failed; `2` on a usage error (neither
`[phase] [num]` nor `--changed` supplied, or `--changed` without `--base`) or an
input error (git-diff failure, a missing/malformed/schema-invalid `SUMMARY.json`,
a missing/unparseable `DRAFT.md`, a DRAFT that declares no task files to scope
the scan to (`no-scoped-files`, refused rather than falling back to an unscoped
whole-repo scan), or a config-load failure).

---

### retro

```
Usage: cadence retro [options]

Cross-phase rollup of recurring retro friction (gate bypasses, rough tasks,
findings)
```

**Options**

| Option | Description |
|---|---|
| `--format <format>` | Output format: terminal \| json (default: "terminal") |
| `-h, --help` | Display help for command |

**Behavior** (phase 186, rec-20260712-002) — a read-only cross-phase rollup over
every settled phase's post-settle retro artifact (`.cadence/phases/*/*-RETRO.json`,
written by the phase-174 retro-artifact feature). It scans `.cadence/phases/` for
`*-RETRO.json` files, parses each against `RetroDigestZ`, and aggregates three
dimensions across all scanned phases: gate-bypass names, rough-task status values,
and code-review/security-audit/boundary-scan finding categories. Each dimension is
split into a **recurring** bucket (the key appears in 2 or more distinct phases) and
a **one-off** bucket (exactly 1 phase), so friction that keeps showing up isn't
buried under single-occurrence noise — the rec's "surfaces recurring workflow
friction" intent. A phase directory whose `*-RETRO.json` is unreadable or fails
`RetroDigestZ` validation is skipped with a stderr notice; the rollup still computes
over the remaining valid phases. With `--format json`, the computed `RetroRollup`
object is emitted as JSON on stdout (or `null` if no retro artifacts were found);
terminal mode (the default) renders a Markdown summary. If `.cadence/phases/` is
missing, or phases exist but none carry a `*-RETRO.json`, it prints "No retro
artifacts found." (terminal) or `null` (JSON) rather than an empty object that could
be misread as data; the command is read-only throughout and never mutates
`.cadence/state.json`, `STATE.md`, or any phase artifact.

**Exit codes** — exits `0` on success, including when the rollup finds recurring
friction (informational, like `intelligence stats` — not a pass/fail gate like
`intelligence audit`). Exits `1` on an invalid `--format` value or a genuine
unexpected error (e.g. a filesystem error other than a missing `.cadence/phases/`
directory).

---

#### retro feedback

Matches recurring retro friction to recommendations and records it as
evidence — closing the loop from "this keeps going wrong across phases" to
Praxis scoring without a manual `recommendation evidence add` per finding.

```
Usage: cadence retro feedback [options]

Match recurring retro friction to recommendations and record it as evidence,
boosting Praxis scores
```

**Options**

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON instead of rendered text lines. |
| `-h, --help` | Display help for command |

**Behavior** (phase 212) — recomputes the same rollup bare `cadence retro`
computes (`scanRetroArtifacts` + `computeRetroRollup` over
`.cadence/phases/*/*-RETRO.json`); the rollup is read fresh every run and
never persisted. Only **recurring** friction is considered — a key that
appears in 2 or more distinct phases, across the same three dimensions bare
`retro` reports (gate bypasses, rough task statuses, finding categories).
One-off friction from a single phase is never matched or recorded.

For every recurring friction entry, a token-based heuristic matches it
against each recommendation's `affectedAreas`/`affectedFiles` (every word
token of the friction key must appear as an exact token of the candidate
string — not a raw substring check). Each match becomes one line of output
and, if new, one `Evidence` entry appended to
`.cadence/intelligence/evidence.json` and linked into the matched
recommendation's `evidenceIds` in `.cadence/intelligence/recommendations.json`
— the same tied-record write path `recommendation evidence add` uses.
Idempotent: a friction key already recorded against a given recommendation
(detected by a stable `[retro-friction:<bucket>:<key>]` marker at the start
of the evidence `summary`) is skipped on a later run rather than duplicated.
Recorded friction evidence feeds a capped `frictionPts` term into `cadence
recommend`'s scoring model — a recommendation tied to friction that keeps
recurring ranks higher without any manual evidence entry.

Each (recurring friction entry × matched recommendation) pair produces
exactly one outcome:

| Outcome | Meaning |
|---|---|
| `wrote` | New evidence recorded; both `.cadence/intelligence/evidence.json` and `.cadence/intelligence/recommendations.json` were updated. |
| `skipped-already-recorded` | This friction key was already recorded as evidence against this recommendation on a prior run; no new write. |
| `no-match` | The friction entry overlapped no recommendation's `affectedAreas`/`affectedFiles`; nothing recorded. One line per unmatched friction entry (not per recommendation). |
| `error` | The evidence write failed for this match (e.g. the matched recommendation id was no longer present in the ledger snapshot read at the start of the run); reported rather than silently dropped, per this repo's no-quiet-fallback convention — not expected in normal operation. |

Terminal output (the default) prints one line per outcome:

```
wrote evidence: [bypasses] "code-review" -> recommendation rec-20260701-002 (evidence ev-20260723-001)
already recorded (skipped, no new evidence): [findingCategories] "security" -> recommendation rec-20260701-002
no matching recommendation: [roughTaskStatuses] "BLOCKED"
```

With `--json`, the same outcomes are emitted as a single JSON array (one
object per line above) with `frictionKey`, `frictionBucket`, `outcome`, and
— where applicable — `recommendationId`, `evidenceId`, `error`.

If no recurring friction is found at all — including when `.cadence/phases/`
has no retro artifacts, or every friction key is one-off — it prints "No
recurring friction found." (terminal) or `[]` (`--json`), and never reads
the recommendation or evidence ledgers.

**Exit codes** — exits `0` on a successful run, including the "no recurring
friction found" case and a run where every entry lands in `no-match` or
`skipped-already-recorded` (informational, same convention as bare `cadence
retro`; a per-entry `error` outcome is reported in the output but does not
by itself flip the process exit code). Exits `1` only on a genuine
unexpected failure (e.g. an unreadable or malformed ledger file).

---

### summary

```
Usage: cadence summary [options] [command]

Render a settled phase SUMMARY.json for humans (read-only)
```

**Subcommands**

| Subcommand | Synopsis |
|---|---|
| `render <phase> <num>` | Print a deterministic, human-readable rendering of gate outcomes and per-AC status, suitable for pasting into a PR |

**Behavior** — reads the settled phase's `<id>-SUMMARY.json` from
`.cadence/phases/<phase>/`, validates it against the `SummaryZ` schema, and
prints a deterministic Markdown rendering to stdout: acceptance-criteria
pass/fail with evidence level, per-task terminal status, gate outcomes,
gate bypasses (if any), decisions, and deferred items. Sections with no
entries (e.g. no gate bypasses, no decisions) are omitted entirely rather
than printed empty, so the output is ready to paste directly into a PR
description or comment without manual trimming. It refuses with a clear
stderr message and a non-zero exit on any problem reading or validating the
file — a missing `<id>-SUMMARY.json` (file-not-found), malformed JSON
(parse error), or JSON that doesn't conform to the `SummaryZ` schema
(validation error) are each reported distinctly; it never crashes and never
prints a partial render. `summary render` is read-only throughout: it never
writes to `.cadence/state.json`, `STATE.md`, or any phase artifact, and
never transitions the loop.

**Exit codes** — exits `0` on a successful render. Exits `1` on an invalid
phase slug, a missing `<id>-SUMMARY.json` file, invalid JSON, or a
schema-validation failure.

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
| `--command <cmd>` | `"npx @manehorizons/cadence-host-claude-code"` | Base command for the shim |
| `--cadence <cmd>` | `"npx @manehorizons/cadence-core"` | Base command the shim uses to invoke core |
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

Most installed slash commands are thin wrappers over a single `cadence`
subcommand (`/cadence-draft`, `/cadence-approve`, `/cadence-settle`, …). The
exception is **`/cadence-scout`** — a divergent→convergent ideation dialogue
that turns a fuzzy problem into ranked **Praxis recommendations** via
`cadence recommendation add`. Scout feeds the rec → milestone → SPEC ledger; it
never drives the loop, allocates a loop id, or runs a gate.

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
| `--cadence <cmd>` | `"npx @manehorizons/cadence-core"` | Base command to invoke core |
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
