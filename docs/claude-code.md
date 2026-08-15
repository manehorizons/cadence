# Claude Code Host Adapter How-To

The `@thomas-powers-jr/cadence-host-claude-code` package is the **host adapter** that connects
CADENCE to Claude Code. It installs two integration surfaces into your project:

- **Hooks** — entries in `.claude/settings.json` that fire the CADENCE shim on
  each Claude Code lifecycle event
- **Slash commands** — `.md` files in `.claude/commands/` that expose the most
  common CADENCE engine commands as `/cadence-*` actions

The agent then drives the same CADENCE engine it would via the CLI — through
the same `cadence hook <event>` dispatch path — without any special API surface.

> **Adapter vs. MCP.** This adapter is the right surface for Claude Code
> specifically, and is the **reference adapter** for *ambient* edit-time gates —
> the `pre-tool-edit` boundary check and live anomaly detection that fire via
> lifecycle hooks as the agent edits (the Codex adapter also supports these via
> its own hooks). To drive the loop from a *different* MCP
> host (Claude Desktop, Cursor, other agents), use `cadence mcp serve` instead
> (see [docs/mcp.md](mcp.md)); MCP covers the imperative loop but not ambient
> gating, which has no host-hook equivalent over MCP.

> **Install:** the adapter ships as `@thomas-powers-jr/cadence-host-claude-code`. Run
> it with `npx @thomas-powers-jr/cadence-host-claude-code install` (or install it
> globally for the `cadence-host-claude-code` command used below).

---

## Table of contents

- [install — write hooks and slash commands](#install--write-hooks-and-slash-commands)
  - [Options reference](#options-reference)
  - [The --local warning](#the---local-warning)
- [Hook groups written by install](#hook-groups-written-by-install)
- [The 15 slash commands](#the-15-slash-commands)
- [How the agent drives CADENCE](#how-the-agent-drives-cadence)
- [Gitignore guidance](#gitignore-guidance)

---

## install — write hooks and slash commands

The `install` command writes all CADENCE integration into the project in one
step:

```sh
node packages/host-claude-code/dist/cli.js install --local
```

After install, start a new Claude Code session to activate the hooks.

The `--local` flag is the recommended approach for monorepo / dogfood setups: it
resolves the absolute paths of the local workspace builds and writes them into
**both** the settings file and the slash-command files so that Claude Code can
find the shim and core CLI without them being on `PATH`.

> ⚠️ **`--local` output is machine-local — never commit it.** It bakes absolute
> paths into `.claude/settings.json` *and* `.claude/commands/cadence-*.md`; both
> break on any other clone or machine. The form that belongs in version control
> is the **portable default** (`cadence …`), written when you run `install`
> **without** `--local`. See [The --local warning](#the---local-warning).

### Options reference

```
Usage: cadence-host-claude-code install [options]

Write Claude Code hook entries and slash commands into the project

Options:
  --cwd <dir>        project root (default: current working directory)
  --command <cmd>    base command for the shim
                     (default: "npx @thomas-powers-jr/cadence-host-claude-code")
  --cadence <cmd>    base command the shim uses to invoke core
                     (default: "npx @thomas-powers-jr/cadence-core")
  --settings <path>  settings file path relative to cwd
                     (default: ".claude/settings.json")
  --no-hooks         skip writing hooks to settings.json
  --no-commands      skip writing slash commands to .claude/commands/
  --local            use absolute paths to the local workspace builds
                     (monorepo dogfood)
```

**Skip hooks only** (keep existing slash commands):

```sh
node packages/host-claude-code/dist/cli.js install --local --no-hooks
```

**Skip commands only** (update hooks, keep custom slash commands):

```sh
node packages/host-claude-code/dist/cli.js install --local --no-commands
```

**Point at a non-default settings file:**

```sh
node packages/host-claude-code/dist/cli.js install --local --settings .claude/settings.local.json
```

**Use a published shim + specific core path:**

```sh
node packages/host-claude-code/dist/cli.js install \
  --command "npx @thomas-powers-jr/cadence-host-claude-code" \
  --cadence "node /absolute/path/to/cadence.cjs"
```

### The --local warning

When `--local` is passed, `install` emits a stderr warning naming **every
surface it wrote** machine-absolute paths into — both the settings file and the
slash-command files (each is listed only when actually written, so `--no-hooks`
/ `--no-commands` narrow the list):

```
warning: --local wrote machine-absolute paths into .claude/settings.json and
.claude/commands/cadence-*.md. Do NOT commit them — they cannot be resolved on
other clones or machines. Add them to .gitignore and re-run `install --local`
per machine, or run plain `install` (no --local) to write the portable
`cadence` form that is safe to commit.
```

Machine-absolute paths are not portable: every developer (and CI runner) must
run `install --local` themselves after cloning — *or* the repo commits the
portable default form (plain `install`) and nobody runs `--local` at all. The
slash-command files are the easy-to-miss surface here: the warning used to name
only `settings.json`, which is how machine-absolute `cadence-*.md` files once
got committed and broke `/cadence-*` on every other machine. See
[Gitignore guidance](#gitignore-guidance) below.

---

## Hook groups written by install

`install` merges exactly **6 Claude Code hook groups** into `settings.json`.
Each entry is tagged `_managedBy: "cadence"` so re-running install safely
replaces them without touching user-customized entries.

Source of truth: `packages/host-claude-code/src/install.ts` (`desired` object)
and `packages/host-claude-code/src/event-map.ts` (matcher constants).

| Claude Code event | Matcher | Abstract event dispatched |
|---|---|---|
| `SessionStart` | (none — fires on all) | `session-start` |
| `UserPromptSubmit` | (none — fires on all) | `user-prompt` |
| `PreToolUse` | `Edit\|Write\|MultiEdit\|NotebookEdit` | `pre-tool-edit` |
| `PostToolUse` | `Edit\|Write\|MultiEdit\|NotebookEdit` | `post-tool-edit` |
| `PostToolUse` | `Skill` | `skill-invoke` |
| `Stop` | (none — fires on all) | `session-stop` |
| `SubagentStop` | (none — fires on all) | `subagent-result` |

> **Count note:** `PostToolUse` gets **two** managed entries (one for edit
> tools, one for the Skill tool), so the `desired` object has entries under
> 6 Claude Code event names, but the settings file ends up with 7 hook entries
> in total across those 6 groups. The table above shows all 7.

The matcher for edit tools (`Edit|Write|MultiEdit|NotebookEdit`) comes from the
`EDIT_TOOL_MATCHER` constant in `event-map.ts`. The Skill matcher (`Skill`)
comes from `SKILL_TOOL_MATCHER`.

All hooks route to the same shim command. The shim reads `hook_event_name` and
`tool_name` from stdin to decide which abstract event to dispatch to the core
engine.

---

## The 15 slash commands

`install` writes **15 slash commands** into `.claude/commands/`. Each file is
tagged with `<!-- managed-by: cadence -->` so re-running install replaces them.
If you remove that marker, install leaves the file untouched (treating it as
user-customized).

Source of truth: the `COMMANDS` array in
`packages/host-claude-code/src/install-commands.ts` (the authoritative count —
keep this section in sync with it).

| Slash command | Engine command invoked | Purpose |
|---|---|---|
| `/cadence-progress` | `cadence progress` | Show CADENCE's next suggested action |
| `/cadence-next` | `cadence next` | Show ranked legal next moves at the current loop position |
| `/cadence-draft` | `cadence draft new $ARGUMENTS` | Scaffold a new DRAFT.md for a phase task |
| `/cadence-approve` | `cadence draft approve $ARGUMENTS` | Approve a draft and enter BUILD |
| `/cadence-check` | `cadence draft check $ARGUMENTS` | Run structural coherence check on a draft |
| `/cadence-build` | `cadence build task $ARGUMENTS` | Record outcome of a build task |
| `/cadence-settle` | `cadence settle run $ARGUMENTS` | Close the loop and write SUMMARY |
| `/cadence-done` | `cadence done $ARGUMENTS` | Mark a task DONE |
| `/cadence-block` | `cadence block $ARGUMENTS` | Mark a task BLOCKED |
| `/cadence-needs-context` | `cadence needs-context $ARGUMENTS` | Mark a task NEEDS_CONTEXT |
| `/cadence-handoff` | `cadence handoff $ARGUMENTS` | Scaffold a SESSION handoff doc with machine facts pre-filled |
| `/cadence-resume` | `cadence resume` | Replay the freshest session handoff + live context (read-only) |
| `/cadence-recommend` | `cadence recommend --top 5` | Rank actionable strategic recommendations and advise the next move (top 5) |
| `/cadence-scout` | `cadence recommend` | Divergent→convergent ideation dialogue that lands survivors as Praxis recommendations |
| `/cadence-dispatch` | `cadence dispatch plan --json` | Compute the next wave-based subagent dispatch plan from the active BUILD draft |

Each command file's frontmatter sets `allowed-tools: Bash(cadence:*), Read`,
limiting tool use to CADENCE-namespaced bash invocations and file reads. The
run-line is the portable `!cadence <subcommand>` form (resolved via `PATH`);
under `--local` it becomes an absolute `!node /abs/.../cli/index.js <subcommand>`
that must not be committed (see [The --local warning](#the---local-warning)).

**Example usage in Claude Code:**

```
/cadence-draft P03 2 --title "Add caching layer"
/cadence-check .cadence/phases/P03/T2-DRAFT.md
/cadence-approve P03 2
/cadence-done T1
/cadence-done T2 --notes "added integration test"
/cadence-settle --auto
```

---

## How the agent drives CADENCE

When you invoke a slash command or the hooks fire, the flow is:

1. **Claude Code** fires a lifecycle event (e.g. `Stop`, `PostToolUse`).
2. **Shim** (`cadence-host-claude-code hook`) reads the raw JSON payload from
   stdin, maps the Claude Code event + tool name to an abstract CADENCE event,
   and spawns the core CLI: `cadence hook <abstract-event>`.
3. **Core engine** (`cadence hook`) processes the event — updating state,
   running gate checks, emitting anomalies — then exits.
4. Claude Code reads the shim's exit code and any stdout/stderr, then
   continues or blocks the action (for blocking hooks like `PreToolUse` and
   `Stop`).

The agent itself does not need to know CADENCE internals. It calls the same
engine commands an engineer would type manually — the integration surfaces
(hooks + slash commands) are thin wrappers around `cadence <cmd>`.

To bootstrap the first phase, run `cadence agent-prompt --goal "<your goal>"` and
paste the output to your agent — it produces a DRAFT with testable acceptance
criteria and stops at approval, the same loop the slash commands drive.

> **A dispatched subagent's prompt can land on a different terminal than
> yours.** This host's native subagent spawn (see `Subagent spawn` below) runs
> a background agent whose transcript is not guaranteed to appear in the
> orchestrating session's window — if that agent pauses to ask something
> interactive via `AskUserQuestion`, a human can end up answering it in a
> different terminal/session entirely, leaving the orchestrator with no record
> of the exchange, only the agent's eventual report (`rec-20260718-005`). This
> is why CADENCE's dispatch packets forbid a dispatched agent from invoking
> `AskUserQuestion` at runtime: any human approval for a scope change mid-
> dispatch must come back through the orchestrating session, not a side
> channel it never sees.

Hook capabilities declared for this host:

| Capability | Value |
|---|---|
| Hooks available | `session-start`, `user-prompt`, `pre-tool-edit`, `post-tool-edit`, `session-stop`, `subagent-result` |
| Blocking hooks | `pre-tool-edit`, `session-stop` |
| Slash commands | Yes |
| Skill system | Native |
| Subagent spawn | Native |
| Streaming output | Yes |

Source: `packages/host-claude-code/src/capabilities.ts`.

---

## Gitignore guidance

When using `--local`, **two** surfaces get machine-absolute paths that are not
portable: the settings file (`settings.json`, or `settings.local.json` if you
used `--settings`) **and** the slash-command files
(`.claude/commands/cadence-*.md`). Both must be kept out of version control in
that form.

Recommended `.gitignore` entries for local-mode installs:

```gitignore
# CADENCE host adapter — machine-local settings (--local install)
.claude/settings.local.json
```

For the slash commands, prefer **not** taking the `--local` form into git at
all: commit the portable default (plain `install`, run-line `!cadence …`) and
let each machine rely on `cadence` being on `PATH`. Only gitignore
`.claude/commands/` if your repo genuinely needs per-machine command files
(unusual — the portable form works for everyone with the CLI installed).

> This repo (CADENCE dogfooding itself) commits the **portable** `.claude/commands/`
> on purpose. They are regenerated with plain `install` — never `--local`. If you
> ever see an absolute path in a committed `cadence-*.md`, it was a stray
> `--local` run: regenerate with `node packages/host-claude-code/dist/cli.js
> install --no-hooks` to restore the portable form.

If you used the default `--settings .claude/settings.json` path but your team
members each need their own local paths, consider switching to
`--settings .claude/settings.local.json` so the committed `settings.json`
remains portable (or empty) and local overrides stay gitignored.

Each developer and each CI machine that opts into `--local` must run:

```sh
node packages/host-claude-code/dist/cli.js install --local
```

after cloning, to regenerate the machine-absolute paths for that environment.
Teams that commit the portable default form skip this entirely.

---

*See also: [docs/cli.md](cli.md) — cadence engine how-to |
[docs/providers.md](providers.md) — provider setup |
[docs/concepts.md](concepts.md) — loop, gates, profiles |
[docs/reference/commands.md](reference/commands.md) — full option lists*
