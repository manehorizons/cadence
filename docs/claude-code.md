# Claude Code Host Adapter How-To

The `@cadence/host-claude-code` package is the **host adapter** that connects
CADENCE to Claude Code. It installs two integration surfaces into your project:

- **Hooks** — entries in `.claude/settings.json` that fire the CADENCE shim on
  each Claude Code lifecycle event
- **Slash commands** — `.md` files in `.claude/commands/` that expose the most
  common CADENCE engine commands as `/cadence-*` actions

The agent then drives the same CADENCE engine it would via the CLI — through
the same `cadence hook <event>` dispatch path — without any special API surface.

> **Dogfood note:** `@cadence/host-claude-code` is not yet published to npm.
> All examples below use the local build:
> `node packages/host-claude-code/dist/cli.js <cmd>` (after building the
> package). The `--local` flag automates the path resolution for this case.

---

## Table of contents

- [install — write hooks and slash commands](#install--write-hooks-and-slash-commands)
  - [Options reference](#options-reference)
  - [The --local warning](#the---local-warning)
- [Hook groups written by install](#hook-groups-written-by-install)
- [The 9 slash commands](#the-9-slash-commands)
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
the settings and command files so that Claude Code can find the shim and core
CLI without them being on `PATH`.

### Options reference

```
Usage: cadence-host-claude-code install [options]

Write Claude Code hook entries and slash commands into the project

Options:
  --cwd <dir>        project root (default: current working directory)
  --command <cmd>    base command for the shim
                     (default: "npx @cadence/host-claude-code")
  --cadence <cmd>    base command the shim uses to invoke core
                     (default: "npx @cadence/core")
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
  --command "npx @cadence/host-claude-code" \
  --cadence "node /absolute/path/to/cadence.cjs"
```

### The --local warning

When `--local` is passed, `install` emits a stderr warning:

```
warning: --local wrote machine-absolute paths into .claude/settings.json.
Do NOT commit it — add it to .gitignore; other clones/machines cannot resolve
these paths. Re-run install per machine instead.
```

This is a current-behavior carry-forward. Machine-absolute paths embedded in
`settings.json` are not portable: every developer (and CI runner) must run
`install --local` themselves after cloning. See
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

## The 9 slash commands

`install` writes **9 slash commands** into `.claude/commands/`. Each file is
tagged with `<!-- managed-by: cadence -->` so re-running install replaces them.
If you remove that marker, install leaves the file untouched (treating it as
user-customized).

Source of truth: the `COMMANDS` array in
`packages/host-claude-code/src/install-commands.ts`.

| Slash command | Engine command invoked | Purpose |
|---|---|---|
| `/cadence-progress` | `cadence progress` | Show CADENCE's next suggested action |
| `/cadence-draft` | `cadence draft new $ARGUMENTS` | Scaffold a new DRAFT.md for a phase task |
| `/cadence-approve` | `cadence draft approve $ARGUMENTS` | Approve a draft and enter BUILD |
| `/cadence-check` | `cadence draft check $ARGUMENTS` | Run structural coherence check on a draft |
| `/cadence-build` | `cadence build task $ARGUMENTS` | Record outcome of a build task |
| `/cadence-settle` | `cadence settle run $ARGUMENTS` | Close the loop and write SUMMARY |
| `/cadence-done` | `cadence done $ARGUMENTS` | Mark a task DONE |
| `/cadence-block` | `cadence block $ARGUMENTS` | Mark a task BLOCKED |
| `/cadence-needs-context` | `cadence needs-context $ARGUMENTS` | Mark a task NEEDS_CONTEXT |

Each command file's frontmatter sets `allowed-tools: Bash(cadence:*), Read`,
limiting tool use to CADENCE-namespaced bash invocations and file reads.

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

When using `--local`, the generated `settings.json` (or `settings.local.json`
if you used `--settings`) contains machine-absolute paths that are not portable.

Recommended `.gitignore` entries for local-mode installs:

```gitignore
# CADENCE host adapter — machine-local settings (--local install)
.claude/settings.local.json
```

If you used the default `--settings .claude/settings.json` path but your team
members each need their own local paths, consider switching to
`--settings .claude/settings.local.json` so the committed `settings.json`
remains portable (or empty) and local overrides stay gitignored.

Each developer and each CI machine must run:

```sh
node packages/host-claude-code/dist/cli.js install --local
```

after cloning, to regenerate the machine-absolute paths for that environment.

---

*See also: [docs/cli.md](cli.md) — cadence engine how-to |
[docs/providers.md](providers.md) — provider setup |
[docs/concepts.md](concepts.md) — loop, gates, profiles |
[docs/reference/commands.md](reference/commands.md) — full option lists*
