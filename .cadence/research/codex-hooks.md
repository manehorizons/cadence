# Codex CLI hook research (Phase 2.3 / T1)

Date: 2026-05-13. Sources: developers.openai.com/codex (docs current as of 2026-04),
openai/codex GitHub issues #16732 #18491.

## Hook event inventory

Codex CLI fires these hook events. Mapping to KEEL abstract events:

| Codex event | KEEL abstract event | Notes |
|---|---|---|
| `SessionStart` | `session-start` | `source` field: `startup` \| `resume` \| `clear` |
| `UserPromptSubmit` | `user-prompt` | carries `prompt: string` |
| `PreToolUse` | `pre-tool-edit` | **see limitation below** |
| `PostToolUse` | `post-tool-edit` | **see limitation below** |
| `Stop` | `session-stop` | carries `last_assistant_message`, `stop_hook_active` |
| `PermissionRequest` | _(unmapped)_ | Codex-only; no KEEL equivalent yet |
| _(none)_ | `subagent-result` | Codex has no SubagentStop; emit a no-op or skip |

No SubagentStop in Codex. KEEL's `subagent-result` is Claude Code–specific;
the Codex adapter leaves it unimplemented (returns null from `mapEvent`).

## stdin payload shapes

Every hook receives one JSON object on stdin. Shared fields on all events:

```
session_id: string
transcript_path: string | null
cwd: string
hook_event_name: string
model: string
```

Per-event additions:

```
SessionStart       + source: "startup"|"resume"|"clear"
UserPromptSubmit   + turn_id, prompt: string
PreToolUse         + turn_id, tool_name, tool_use_id, tool_input: JSON
PermissionRequest  + turn_id, tool_name, tool_input (+ tool_input.description)
PostToolUse        + turn_id, tool_name, tool_use_id, tool_input, tool_response
Stop               + turn_id, stop_hook_active: bool, last_assistant_message
```

`tool_name` values: `Bash`, `apply_patch`, or an MCP tool name (e.g.
`mcp__filesystem__read`). `tool_input.command` carries the shell command for
`Bash` and `apply_patch`.

## File-edit payload extraction

**Critical wire-format difference vs Claude Code:**

| Host | Edit event | Edit tool | Payload field |
|---|---|---|---|
| Claude Code | `PreToolUse` / `PostToolUse` | `Edit` \| `Write` \| `MultiEdit` \| `NotebookEdit` | `tool_input.file_path: string` |
| Codex CLI | `PreToolUse` / `PostToolUse` | `apply_patch` | `tool_input.command: string` (patch text) |

Codex represents file edits as `apply_patch` invocations whose `tool_input.command`
contains the raw patch payload (begin-of-patch markers, `*** Add File`, `*** Update
File`, `*** Delete File` directives). To populate KEEL's `files: string[]`, the
Codex adapter must **parse the patch envelope** and extract target paths.

## Known limitation (upstream issue #16732)

> PreToolUse and PostToolUse hooks registered via hooks.json **never fire for
> file writes made through apply_patch** — they fire only for Bash tool calls.

Implications for KEEL:

- `pre-tool-edit` / `post-tool-edit` for `apply_patch` will not deliver until
  upstream lands the fix. Track #16732.
- Workaround tier 1: register a `Bash` matcher and inspect `tool_input.command`
  for inline `apply_patch <<'PATCH'…PATCH` heredocs (some workflows route edits
  through Bash). Brittle.
- Workaround tier 2: emit a warning at install-time documenting the gap; ship
  `apply_patch` matchers anyway so behavior auto-activates once upstream fixes.
- Recommended: ship matchers, document the gap in adapter README + install
  output. Do not implement a Bash-command scraper in this phase.

## Exit-code semantics

| Code | Codex behavior |
|---|---|
| 0 | Success. Stdout parsed as optional JSON output (see below). |
| 2 | Block / deny action. Stderr is read as the reason. |
| other | Soft failure. Hook treated as errored, action proceeds. |

This **matches Claude Code's convention** (exit 2 = block, stderr-as-context).
KEEL's existing `keel hook` exit codes (0 ok, 1 dispatch error, 2 intentional
block) already satisfy Codex; no core change needed.

## Output JSON (stdout) shapes

Optional. SessionStart, UserPromptSubmit, Stop accept:

```json
{ "continue": true, "stopReason": "...", "systemMessage": "...", "suppressOutput": false }
```

Event-specific:

```jsonc
// PreToolUse: deny
{ "hookSpecificOutput": { "hookEventName": "PreToolUse",
                          "permissionDecision": "deny",
                          "permissionDecisionReason": "..." } }

// PermissionRequest: allow
{ "hookSpecificOutput": { "hookEventName": "PermissionRequest",
                          "decision": { "behavior": "allow" } } }

// PostToolUse: block + add context
{ "decision": "block", "reason": "...",
  "hookSpecificOutput": { "hookEventName": "PostToolUse",
                          "additionalContext": "..." } }

// Stop: continue another turn
{ "decision": "block", "reason": "Run another test pass." }
```

`PreToolUse` / `PermissionRequest` support `systemMessage` only (no `continue: false`).

## Hook config locations + precedence

Codex loads from all sources and merges (no replace):

1. `~/.codex/hooks.json` (user)
2. `~/.codex/config.toml` `[hooks]` table (user)
3. `<repo>/.codex/hooks.json` (project — requires trust)
4. `<repo>/.codex/config.toml` `[hooks]` table (project)
5. Plugin manifests
6. Enterprise managed via `requirements.toml`

KEEL installer target: **`<repo>/.codex/hooks.json`** (parallel to Claude Code's
`<repo>/.claude/settings.json`). Project trust prompt may be required on first run.

## hooks.json shape (target write format)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^(apply_patch|Edit|Write)$",
        "hooks": [
          { "type": "command",
            "command": "npx @keel/host-codex hook",
            "timeout": 30 }
        ]
      }
    ],
    "PostToolUse": [ /* same matcher */ ],
    "SessionStart":     [ { "matcher": "*", "hooks": [ { "type": "command", "command": "npx @keel/host-codex hook" } ] } ],
    "UserPromptSubmit": [ { "hooks": [ { "type": "command", "command": "npx @keel/host-codex hook" } ] } ],
    "Stop":             [ { "hooks": [ { "type": "command", "command": "npx @keel/host-codex hook" } ] } ]
  }
}
```

Mark KEEL-owned entries with `_managedBy: "keel"` (same convention as Claude
Code adapter) for idempotent re-install.

## Matcher syntax

Regex. Common patterns:

- `^Bash$` — exact tool
- `apply_patch|Edit|Write` — alternation
- `mcp__filesystem__.*` — MCP namespace
- `*`, `""`, omitted — match all

For `SessionStart` the matcher filters `source` (`startup` / `resume` / `clear`)
rather than tool name. For `UserPromptSubmit` and `Stop`, matcher is ignored.

## Slash commands

Codex has **two competing surfaces**; deprecated and current.

### Custom prompts (DEPRECATED)

- Location: `~/.codex/prompts/*.md` (user-level only — not shared via repo)
- Format: Markdown + optional YAML frontmatter

  ```markdown
  ---
  description: Short description shown in slash menu
  argument-hint: KEY=<value>
  ---
  Body content sent as the prompt when /<filename> is invoked.
  ```

- Args: `$1`..`$9`, `$ARGUMENTS`, named `$FILE` etc.
- **Not suitable for KEEL** — user-level only, repo cannot ship them.

### Agent Skills (CURRENT)

- Project-level location: `<repo>/.agents/skills/<skill-name>/SKILL.md`
- Also discoverable from `$CWD/.agents/skills/`, `$HOME/.agents/skills/`, `/etc/codex/skills`
- SKILL.md frontmatter (both required):

  ```markdown
  ---
  name: keel-progress
  description: Show the next KEEL action for this loop. Use when the user asks
               "what next" / "where am I" / wants the current build/settle status.
  ---
  Run `keel progress` and report the result.
  ```

- Invocation: explicit (`$skill-name` or `/skills`) or implicit (Codex picks
  by matching description against user intent).
- Optional `agents/openai.yaml` per skill: set `allow_implicit_invocation: false`
  to require explicit triggers.

**Recommended for KEEL:** ship six skills under `<repo>/.agents/skills/keel-*/SKILL.md`
mirroring the Claude Code slash commands. Implicit invocation OFF by default
(user explicitly invokes `$keel-build` etc.) to avoid the Codex agent firing
KEEL state mutations unprompted.

## Adapter implementation notes

1. **`mapEvent`** — direct table identical to Claude Code's, minus
   `SubagentStop` (no Codex equivalent). Includes `PermissionRequest → null`.
2. **`extractPayload`** — for `tool_name === "apply_patch"`, parse `tool_input.command`
   for `*** {Add,Update,Delete} File: <path>` directives → `files: string[]`.
   For Bash tool the adapter does not extract files (out of scope for this phase).
3. **`installHooks`** — write/merge `<repo>/.codex/hooks.json`. Same idempotent
   `_managedBy: "keel"` pattern. Confirm whether Codex `hooks.json` already
   tolerates unknown sibling keys on entry objects (assume yes; test).
4. **`install-commands`** — write 6 SKILL.md files under
   `<repo>/.agents/skills/keel-*/SKILL.md` with `allow_implicit_invocation: false`.
5. **Shim** — read Codex stdin, call `mapEvent` + `extractPayload`, spawn
   `keel hook <abstract>` with normalized stdin (`{ event, raw, files? }`).
   Exit-code passthrough is already correct (0/2 align).

## Open questions to revisit before T5/T6

- Does `<repo>/.codex/hooks.json` require an explicit trust prompt on first
  session? If yes, surface this in install CLI output.
- Skill `name` field constraints — alphanumeric only? Confirm by trial.
- Does Codex restart-needed-to-pick-up-new-skills hold for hooks too? Probably
  yes (same loader). Document in install output.

## Decision: shipping apply_patch matcher despite #16732

Ship the matcher, document the gap, do not implement workarounds. Reasoning:
the matcher activates automatically once upstream fix lands; building a Bash
heredoc scraper now would be dead code on fix-day and brittle in the meantime.
