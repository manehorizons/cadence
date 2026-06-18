# CLI How-To Guide

This page shows worked, copy-pasteable invocations for the core
DRAFT→BUILD→SETTLE loop commands. It assumes the loop, gates, profiles, and
tiers are already familiar — if not, read [docs/concepts.md](concepts.md)
first.

The SPEC stage and the strategic-intelligence commands
(`recommendation` / `assumption` / `decision` / `intelligence` / `inspect` /
`recommend` / `milestone`, plus `spec` and `context`) are documented in
[docs/reference/commands.md](reference/commands.md), which also carries the
exhaustive option lists (every flag and its default).

> **Install:** `npm install -g @manehorizons/cadence-core` provides the
> `cadence` command used in every example below (requires Node ≥ 20).
> On Windows PowerShell, if npm's `.ps1` shim is blocked by execution policy,
> use the `.cmd` shims instead: `cadence.cmd`, `npx.cmd`, and `npm.cmd`.

---

## Table of contents

- [init — set up a project](#init--set-up-a-project)
- [Draft workflow](#draft-workflow)
  - [draft new — scaffold a DRAFT](#draft-new--scaffold-a-draft)
  - [draft check — coherence-check before approve](#draft-check--coherence-check-before-approve)
  - [draft approve — enter BUILD](#draft-approve--enter-build)
- [build task — record task outcomes](#build-task--record-task-outcomes)
  - [Shortcut commands: done / block / needs-context](#shortcut-commands-done--block--needs-context)
- [settle run — close the loop](#settle-run--close-the-loop)
  - [Mode flags](#mode-flags)
  - [Bypass flags](#bypass-flags)
- [status — inspect loop state](#status--inspect-loop-state)
- [progress — next recommended action](#progress--next-recommended-action)
- [config — read and write config](#config--read-and-write-config)
- [Two-commit convention in practice](#two-commit-convention-in-practice)

---

## init — set up a project

Scaffold a `.cadence/` directory in the current repo root:

```sh
cadence init --name "my-project" --preset team --gate-profile standard
```

Options used above:

| Option | Purpose |
|---|---|
| `--name <project>` | Project name embedded in `PROJECT.md` |
| `--preset <preset>` | `solo` / `team` / `production` - sets the starting config preset |
| `--profile <preset>` | Deprecated alias for `--preset`; kept for back-compat |
| `--gate-profile <p>` | `strict` / `standard` / `auto` — overrides the gate profile CADENCE would suggest from git history |

To regenerate only the managed `CLAUDE.md` block (e.g. after updating
CADENCE) on an already-initialized repo:

```sh
cadence init --claude-md
```

After `init`, commit `.cadence/` before starting any phase work.

---

## Draft workflow

A phase begins in IDLE and advances to BUILD only after a DRAFT is approved.

### draft new — scaffold a DRAFT

```sh
cadence draft new 01-retry 1 --title "Add retry logic" --brief "Retry failed HTTP requests once before returning an error"
```

Arguments: `<phase> <task-num>`. The draft id is derived as the first two
characters of the phase plus the zero-padded task number, so this creates:

```
.cadence/phases/01-retry/01-01-DRAFT.md
```

`--brief` seeds an editable Objective, AC-1, T1, and Boundaries. Omit it when
you want the older empty template. Open the file and refine:
- Frontmatter: `phase` / `id` / `tier` (`quick-fix` / `standard` / `complex`) / `status`
- `## Objective` — one-sentence description
- `## Acceptance Criteria` — at least one `### AC-N` block with `Given` / `When` / `Then`
- `## Tasks` — `### T1` blocks with `files` / `action` / `verify` / `done: AC-N`
- `## Boundaries` — what the AI must not change

For a complex phase with an explicit tier:

```sh
cadence draft new 02-auth 3 --title "Refactor auth" --tier complex
```

### draft check — coherence-check before approve

Run the structural coherence check before committing to approve:

```sh
cadence draft check .cadence/phases/01-retry/01-01-DRAFT.md
```

The check validates tier vs task/file counts, AC format, and loop position.
Address any issues reported before proceeding to approve.

### draft approve — enter BUILD

```sh
cadence draft approve 01-retry 1
```

What happens at approve (depending on the gate set):
- `approve` gate: interactive Y/N prompt in a TTY; non-TTY auto-passes loudly by default since v1.29
- `plan-review` gate: AI plan-review agent runs; `pass=false` refuses approve

For non-TTY environments (CI, hooks) that need strict refusal instead of the
default auto-pass, set `CADENCE_REQUIRE_TTY=1`. To skip only the manual approve
gate explicitly:

```sh
cadence draft approve 01-retry 1 --no-approve
```

To proceed past a failing plan-review (findings are still printed):

```sh
cadence draft approve 01-retry 1 --allow-plan-review-failure
```

To override the `auto × complex` soft cap:

```sh
cadence draft approve 01-retry 1 --allow-auto-complex
```

After approve, the loop is in BUILD and task recording can begin.

---

## build task — record task outcomes

```sh
cadence build task T1 --status=DONE
```

```sh
cadence build task T2 --status=DONE --notes "Added retry with exponential backoff"
```

Valid `--status` values: `DONE` | `DONE_WITH_CONCERNS` | `NEEDS_CONTEXT` | `BLOCKED`

When the `per-task-verify` gate is active (e.g. `strict × standard`), the
verifier runs on `--status=DONE` before accepting the status write. A `refuse`
verdict blocks the record unless bypassed:

```sh
cadence build task T1 --status=DONE --allow-per-task-failure
```

### Shortcut commands: done / block / needs-context

Three convenience shortcuts reduce typing for the most common statuses:

```sh
# Mark DONE
cadence done T1
cadence done T1 --notes "implemented with caching"

# Mark BLOCKED
cadence block T2 --notes "waiting for API spec"

# Mark NEEDS_CONTEXT
cadence needs-context T3 --notes "unclear which endpoint to use"
```

> **Carry-forward:** `done`, `block`, and `needs-context` accept any string as
> `<id>` without validating it against the list of tasks declared in the active
> DRAFT. If you pass a misspelled or non-existent task id, the engine writes
> the record under that id and settle's structural gate will detect the
> inconsistency. Double-check task ids against the DRAFT before running these
> shortcuts.

---

## settle run — close the loop

`settle run` closes the phase, runs the gate set, writes `SUMMARY.md` +
`SUMMARY.json`, and returns the loop to IDLE.

### Mode flags

**Manual AC verdicts** (always available):

```sh
cadence settle run --ac AC-1=pass --ac AC-2=pass
cadence settle run --ac AC-1=pass --ac AC-2=fail:tests-missing
```

**Auto mode** — derive AC verdicts from task statuses:

```sh
cadence settle run --auto
```

Blocks on incomplete or failed ACs. To settle past them anyway:

```sh
cadence settle run --auto --force
```

**Deep verify** — run the independent AI verifier against each AC:

```sh
cadence settle run --deep
```

The provider comes from `config.verifier`. See
[docs/providers.md](providers.md) for setup.

**Interactive** — walk each AC and enter a verdict at the prompt:

```sh
cadence settle run --interactive
```

Requires a TTY. In non-TTY environments, use `--no-interactive` to skip the
gate when the active profile would normally enforce it.

### Bypass flags

| Flag | Gate bypassed | When to use |
|---|---|---|
| `--auto` | — | Derive verdicts from task statuses instead of providing them manually |
| `--force` | `deep-verify`, `interactive-verdict`, `code-review`, `security-audit` (all) | Force settle past any gate failure |
| `--allow-stale-draft` | `draft-read` | DRAFT.md was edited after approve |
| `--allow-open-tasks` | `structural-verifier` | A task is still PENDING / IN_PROGRESS |
| `--allow-failing-build` | `verification.testCommand` exit | Settle past a non-zero build/test exit |
| `--allow-missing-coverage` | `test-coverage` | AC token not found in any test file |
| `--allow-verifier-failure` | `deep-verify` transport errors | Record failure but don't refuse |
| `--allow-code-review-failure` | `code-review` HIGH-severity findings | Record findings but settle anyway |
| `--allow-security-audit-failure` | `security-audit` CRITICAL findings | Record findings but settle anyway |
| `--allow-skill-audit-miss` | `skill-audit` | Required skills were not invoked; emit a warn anomaly and settle anyway |
| `--no-interactive` | `interactive-verdict` | Opt out of the interactive gate (profile-level bypass) |
| `--allow-auto-complex` | `auto × complex` soft cap | Override the soft cap |

For a full explanation of which gates fire in which profile × tier cell, see
[docs/concepts.md — Gate matrix](concepts.md#the-gate-universe).

---

## status — inspect loop state

Show full loop context: phase, draft, tasks, ACs, and next recommended action:

```sh
cadence status
```

Machine-readable JSON output (useful in scripts):

```sh
cadence status --json
```

List recorded anomaly events:

```sh
cadence status anomalies
```

---

## progress — next recommended action

Print a single recommended next action for the current loop position:

```sh
cadence progress
```

Useful as a quick orientation command after picking up a session. The host
adapter's `/cadence-progress` slash command calls this under the hood.

---

## config — read and write config

Print a config value by dotted path:

```sh
cadence config get verifier.provider
cadence config get perTaskVerifier.model
```

Update a config value (validated against the schema):

```sh
cadence config set verifier.provider anthropic
cadence config set codeReview.provider local
```

Diagnose config conflicts (e.g. provider set without required env vars):

```sh
cadence config doctor
```

The full list of config fields and presets is in
[docs/reference/config.md](reference/config.md).

---

## mcp serve — drive the loop from an MCP host

Run the engine as a local [MCP](https://modelcontextprotocol.io) server over
stdio, so any MCP-capable host (Claude Desktop, Cursor, agents) can call the loop
as tools:

```sh
cadence mcp serve            # operate on the current working directory
cadence mcp serve --repo /path/to/project
```

It's a local subprocess, not a network service — the host launches it and talks
over stdin/stdout. It advertises 10 tools wrapping the same commands documented
above (`cadence_progress`/`status`/`recommend` read; `cadence_draft_new`/
`draft_check`/`draft_approve`/`build_task`/`settle`/`spec_new`/`spec_approve`
write). Command-boundary gates run exactly as on the CLI; ambient edit-time gates
require host hooks and are not available over MCP. Setup and the full tool table:
[docs/mcp.md](mcp.md).

---

## Two-commit convention in practice

A completed phase produces exactly two commits. Here is what that looks like
for a phase called `P05 / T2`:

```sh
# 1. Do the work. Record task outcomes as you go.
cadence done T1
cadence done T2 --notes "added edge-case test"

# 2. Settle the loop. This writes SUMMARY.* and resets state to IDLE.
cadence settle run --auto

# 3. Feature commit: source changes only. Stage your source files.
git add src/ tests/ docs/  # (not .cadence/)
git commit -m "feat: add retry logic with exponential backoff"

# 4. Settle commit: phase artifacts only.
git add .cadence/
git commit -m "chore: settle P05/T2 — add retry logic"
```

**Why two commits?** Source history stays clean: `git log --no-merges` shows
only meaningful changes; blame on source files is uncontaminated by mechanical
state writes. The settle commit is the single atomic record of gate outcomes
and AC verdicts, making audit straightforward.

For the conceptual rationale, see
[docs/concepts.md — Two-commit convention](concepts.md#two-commit-convention).

---

*See also: [docs/concepts.md](concepts.md) — loop, gates, profiles, tiers |
[docs/reference/commands.md](reference/commands.md) — exhaustive option lists |
[docs/claude-code.md](claude-code.md) — Claude Code host adapter how-to |
[docs/mcp.md](mcp.md) — drive the loop from any MCP host |
[docs/providers.md](providers.md) — provider setup*
