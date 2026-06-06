# Phase 65 — Codex adapter spike: findings

**Date:** 2026-06-05 · **Phase:** 65-codex-spike · **Milestone:** v1.13.0 (Codex adapter)
**Question:** Is `ADAPTER_CONTRACT_VERSION = 1` sufficient for a Codex CLI `HostAdapter`,
and what is the real shape of the work? **Verdict: GO on contract v1** (one
design decision required — see §1).

---

## 1. Command / slash surface — RESOLVED (the one real decision)

**What Codex has.** Codex CLI supports user-authored slash commands as **custom
prompts**: markdown files in `$CODEX_HOME/prompts/` (default `~/.codex/prompts/`),
one file per command, `<name>.md` → `/name`. They support YAML frontmatter
(`description`, `argument-hint`) and argument placeholders (`$1`, `$ARGUMENTS`,
`$FILE`). The format is so close to Claude Code's `.claude/commands/*.md` that
users symlink one into the other.

**Two constraints that shape the adapter:**

1. **User-level only (no project install yet).** Codex scans only top-level `.md`
   files in `~/.codex/prompts/`. A **project-level** `{repo}/.codex/prompts/` is an
   open, unshipped feature request (openai/codex#4734). The Claude adapter writes
   **project-level** `.claude/commands/`; the Codex equivalent today can only write
   **global** `~/.codex/prompts/`. → `installCommands` for Codex is a *global*
   operation, not per-repo. That's a real behavioral difference an installer and
   its docs must be explicit about.
2. **Custom prompts are marked DEPRECATED** by OpenAI in favor of **"skills"** as
   the forward path for reusable instructions.

**Decision for the milestone (the one design fork):**
- **`capabilities.slashCommands = true`** (Codex does have the surface).
- **`capabilities.skillSystem`:** set to **`'prompted'`** for v1.13 — we ship the
  cadence slash commands as `~/.codex/prompts/*.md` (the working, documented path
  today), and note "skills" as the forward migration. We do **not** block the
  milestone on the not-yet-stable skills surface.
- `installCommands(root, …)` ignores `root` for the command target and writes to
  `$CODEX_HOME/prompts/` (honoring `CODEX_HOME`); it MUST warn that this is a
  global install, unlike the Claude adapter's project-scoped one. Revisit when
  codex#4734 ships project-level prompts (→ switch to project scope, possibly a
  contract-minor concern, not v2).

This is the item that most reshaped the plan — and exactly why we spiked.

## 2. `apply_patch` payload extraction — RESOLVED (contract v1 sufficient)

Codex `PreToolUse`/`PostToolUse` events deliver stdin JSON with `tool_name`
(`"Bash"`, `"apply_patch"`, or `"mcp__…"`) and `tool_input`. For `apply_patch`
the `tool_input` carries the patch envelope (OpenAI's standard format):

```
*** Begin Patch
*** Add File: path/a.ts
*** Update File: path/b.ts
*** Delete File: path/c.ts
*** End Patch
```

**Extraction:** parse the `*** Add File:` / `*** Update File:` / `*** Delete File:`
/ `*** Move to:` markers to recover the edited path list. This is genuinely *new*
work vs the Claude adapter (Claude's Edit tool hands over `file_path` directly),
but the **output fits `ExtractedPayload.files: string[]` unchanged** — the
existing core-facing shape is sufficient. **No contract bump needed for payloads.**
This is the honest "the contract is portable" proof: a differently-shaped host
input still normalizes to the same `ExtractedPayload`.

## 3. Hook install + blocking + trust/non-TTY — RESOLVED

- **Install target (project-level, matches Claude):** `{repo}/.codex/hooks.json`
  (or `[hooks]` tables in `{repo}/.codex/config.toml`). Schema:
  `{ "hooks": { "PreToolUse": [ { "matcher": "^apply_patch$", "hooks": [ { "type": "command", "command": "<shim>", "timeout": 600 } ] } ] } }`.
  So `installHooks(root, …)` IS project-scoped (unlike commands in §1) — good.
- **Blocking (same primitive as Claude):** a hook denies via **exit code `2`**
  (reason on stderr) or JSON `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}`.
  The cadence boundary check maps cleanly onto this.
- **Hook stdin** carries `session_id`, `cwd`, `hook_event_name`, `tool_name`,
  `tool_input`, `permission_mode` — a near-superset of what the Claude shim
  already parses.
- **Trust/non-TTY:** Codex requires explicit trust/review of hooks before they
  run, and hooks can be force-disabled via `requirements.toml`
  (`[features].hooks = false`). → the installer must (a) tell the user to approve
  the hooks once, and (b) fail clearly (not silently) if hooks are disabled by
  policy. No blocker, but an install-UX requirement to document.

## 4. Event map coverage — RESOLVED (near-1:1 with Claude)

Codex events → cadence `AbstractEvent` (same vocabulary the core already speaks):

| Codex event | → AbstractEvent | Notes |
|---|---|---|
| `SessionStart` | session-start | `source` ∈ startup/resume/clear/compact |
| `PreToolUse` (apply_patch) | pre-tool-edit | extract files per §2 |
| `PreToolUse` (Bash/mcp) | pre-tool-use | non-edit |
| `Stop` | stop | settle nudge |
| `SubagentStart`/`SubagentStop` | (subagent events) | `subagentSpawn: 'native'` |
| `UserPromptSubmit` | user-prompt-submit | |
| `PostToolUse`, `PreCompact`, `PostCompact`, `PermissionRequest` | map-or-`null` | `mapEvent` returns null for unmapped — allowed by contract |

`capabilities`: `hooks` = the mapped set; `blockingHooks` = [pre-tool-edit/use];
`subagentSpawn: 'native'`; `slashCommands: true`; `skillSystem: 'prompted'` (§1);
`streamingOutput: true`. `contractVersion: ADAPTER_CONTRACT_VERSION` (1).

---

## Go/no-go + recommended phase plan

**GO on `ADAPTER_CONTRACT_VERSION = 1`.** No contract change is required: the
`apply_patch` multi-file input normalizes to `ExtractedPayload.files` (§2), and
the only divergence (commands are global + a deprecated mechanism, §1) is an
adapter-install design choice, not a core-contract gap.

**Revised phase plan for v1.13:**
- **66 — package scaffold + adapter.** New `@manehorizons/cadence-host-codex`:
  `capabilities.ts` (per §4), `event-map.ts` (`mapEvent` + `extractPayload` incl.
  the §2 apply_patch parser), `codexAdapter satisfies HostAdapter`, conformance
  test mirroring the Claude one (`contractVersion === ADAPTER_CONTRACT_VERSION`).
- **67 — install surface.** `cadence-host-codex install`: `installHooks` →
  project `.codex/hooks.json` (§3); `installCommands` → global `~/.codex/prompts/`
  with a loud "global install" warning (§1); relative/`--local` path discipline as
  the Claude adapter; honor `CODEX_HOME`.
- **68 — shim wiring.** Codex stdin-JSON → core dispatcher; exit-2/`permissionDecision`
  blocking; reuse core dispatch (only adapter parsing differs).
- **69 — docs + release.** `host-adapters.md` gains Codex as the second worked
  example (calling out the project-vs-global command difference); publish the 4th
  public package. **Versioning decision deferred to release:** lockstep `1.13.0`
  vs independent `0.x` for the new package — recommend **lockstep `1.13.0`** to
  keep the "four packages, one version" story, accepting that host-codex starts
  its life at 1.13.0.

**Carry-forward risks:** (1) codex#4734 (project-level prompts) landing mid-build
would let `installCommands` go project-scoped — watch for it. (2) the "skills"
migration is the real long-term command surface; `skillSystem: 'prompted'` is a
deliberate v1.13 placeholder, not the endgame.

---

## Evidence / sources

- Codex hooks (events, stdin schema, exit-2 / `permissionDecision` blocking,
  `hooks.json`/`config.toml` install, plugin `hooks/hooks.json`,
  `CLAUDE_PLUGIN_ROOT` aliases): <https://developers.openai.com/codex/hooks>
- Codex custom prompts (`~/.codex/prompts/<name>.md`, frontmatter, `$ARGUMENTS`,
  deprecation in favor of skills): <https://developers.openai.com/codex/custom-prompts>
  and the search corpus incl. <https://github.com/openai/codex/issues/4734>
  (project-level prompts request, unshipped).
- Codex CLI features / slash commands (`/review`, `/fork`, "your own reusable
  prompts"): <https://developers.openai.com/codex/cli/features>
- Aider has no hook system (ruled out): developersdigest "Aider vs Claude Code 2026".
- Host-adapter contract under test: `packages/types/src/host.ts`
  (`HostAdapter`, `HostCapabilitiesZ`, `ExtractedPayload`, `ADAPTER_CONTRACT_VERSION = 1`).
- Reference adapter mirrored by phase 66: `packages/host-claude-code/src/index.ts`.
