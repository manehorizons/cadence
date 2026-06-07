# Driving CADENCE over MCP

CADENCE can run as a local [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) server, so any MCP-capable host — Claude Desktop, Cursor, or another agent
— can drive the DRAFT→BUILD→SETTLE loop **without** a bespoke host adapter.

This is a **third surface** on the single engine:

| Surface | How you drive it | Ambient edit-time gates? |
|---|---|---|
| **CLI** (`cadence …`) | terminal, host-agnostic | n/a (you run commands) |
| **Claude Code hooks** | `cadence-host-claude-code install` wires lifecycle hooks | ✅ yes (boundary checks, anomaly emission as you edit) |
| **MCP** (`cadence mcp serve`) | any MCP host calls tools | ❌ no — see [Gate semantics](#gate-semantics) |

## It's a local subprocess, not a service

There is **no infrastructure to deploy**. The MCP transport is **stdio**: the
host launches `cadence mcp serve` as a child process, scoped to one repository,
and talks to it over stdin/stdout. No daemon, no URL, no network, no auth — the
same deployment story as the CLI itself.

Setup is "install the package, then point your host at the command."

```bash
npm i -g @manehorizons/cadence-core   # puts `cadence` on PATH
```

### Easiest: `cadence mcp install`

From your repo root, let CADENCE write the config for you:

```bash
cadence mcp install                   # write/merge .mcp.json (Claude Code) in this repo
cadence mcp install --print           # just print the snippet (for Claude Desktop / Cursor)
cadence mcp install --client cursor   # print + a path hint for that host
```

The default merge is **non-destructive and idempotent**: it preserves any
existing `mcpServers` and only adds/updates the `cadence` entry, and it refuses
to overwrite a malformed `.mcp.json`. Only Claude Code's `.mcp.json` is written;
for other hosts `--print` gives you a snippet to paste. The manual setup for each
host is below.

### Claude Code

Add an `.mcp.json` at the repo root (or run `cadence mcp install`):

```json
{
  "mcpServers": {
    "cadence": { "command": "cadence", "args": ["mcp", "serve"] }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json` (use `--repo` since the desktop app has no
project cwd):

```json
{
  "mcpServers": {
    "cadence": {
      "command": "cadence",
      "args": ["mcp", "serve", "--repo", "/absolute/path/to/your/repo"]
    }
  }
}
```

### Cursor / other MCP hosts

Any host that speaks MCP over stdio works — point it at `cadence mcp serve` with
the repo as the working directory (or pass `--repo <path>`).

## Tools

The server advertises 15 tools that wrap the same engine the CLI uses. Each
returns both human-readable text and structured content.

| Tool | Wraps | Kind |
|---|---|---|
| `cadence_progress` | `cadence progress` | read — next suggested action |
| `cadence_status` | `cadence status` | read — loop position, active phase/draft, AC results |
| `cadence_recommend` | `cadence recommend` | read — ranked recommendations |
| `cadence_doctor` | `cadence doctor` | read — project setup health |
| `cadence_resume` | `cadence resume` | read — replay the freshest handoff |
| `cadence_draft_new` | `cadence draft new` | write — scaffold a DRAFT (IDLE→DRAFT) |
| `cadence_draft_check` | `cadence draft check` | write — coherence check (gate) |
| `cadence_draft_approve` | `cadence draft approve` | write — DRAFT→BUILD |
| `cadence_build_task` | `cadence build task` | write — record a task outcome |
| `cadence_settle` | `cadence settle run` | write — close the loop, run gates, write SUMMARY |
| `cadence_spec_new` | `cadence spec new` | write — scaffold a SPEC (IDLE→SPEC) |
| `cadence_spec_approve` | `cadence spec approve` | write — spec-review gate, SPEC→IDLE |
| `cadence_handoff` | `cadence handoff` | write — scaffold a SESSION handoff doc |
| `cadence_recommendation_add` | `cadence recommendation add` | write — add a recommendation |
| `cadence_recommendation_promote` | `cadence recommendation promote` | write — advance a recommendation |

Together `cadence_recommendation_add` + `cadence_recommendation_promote` let a
host run the full scout → recommendation → promote path over MCP. The CLI
commands `init`, `config`, and `install` are intentionally **not** exposed as
tools.

## Resources

The server exposes `.cadence/` artifacts as **read-on-demand** MCP resources
under a `cadence://` scheme, so a host can pull loop context as data without
spending a tool call. There are no subscriptions / change notifications — the
host re-reads when it wants fresh data.

| Resource URI | Content |
|---|---|
| `cadence://state` | `.cadence/STATE.md` (human view) |
| `cadence://state.json` | `.cadence/state.json` (machine state) |
| `cadence://roadmap` | `.cadence/ROADMAP.md` |
| `cadence://project` | `.cadence/PROJECT.md` |
| `cadence://recommendations` | the `cadence recommend --json` payload |
| `cadence://phase/{phase}/draft` | a phase's `*-DRAFT.md` (templated) |
| `cadence://phase/{phase}/summary` | a phase's `*-SUMMARY.md` (templated) |

A read for a missing artifact returns a clean MCP error result; the server keeps
serving.

## Prompts

The server exposes guided workflows as MCP **prompts**, sourced from the same
canonical guidance the Claude Code slash commands use:

| Prompt | Args | Role |
|---|---|---|
| `cadence_scout` | `topic` | the divergent→convergent ideation dialogue |
| `cadence_next` | — | orient on the loop and take the next step |
| `cadence_draft` | `phase`, `num` | guided drafting workflow |
| `cadence_settle` | — | guided settle workflow |

Prompts orient the conversation; the tools perform the actions.

## Gate semantics

CADENCE has two kinds of gates, and the MCP surface covers one of them:

- **Command-boundary gates run unchanged.** `cadence_draft_check` runs the
  structural coherence check; `cadence_draft_approve` runs the coherence →
  soft-cap → plan-review ladder; `cadence_settle` runs the full settle gate
  stack (test-coverage, structural verifier, code-review, etc.);
  `cadence_spec_approve` runs the convergent spec-review gate. A gate failure
  comes back as an MCP **error result** — the surface degrades gracefully, it
  does not run ungated.
- **Ambient edit-time gates are not available.** The `pre-tool-edit` boundary
  check and live anomaly emission fire on a host's *editing lifecycle*. MCP
  servers are request/response — they aren't invoked as you edit — so these
  require host-native hooks (the Claude Code adapter). If you need ambient
  gating, use `cadence-host-claude-code install`, not MCP.

Two interactive gates are handled automatically for a programmatic caller: the
manual approve prompt is bypassed (calling `cadence_draft_approve` **is** the
approval), and the interactive settle verdict walker is disabled (supply AC
verdicts via the tool's `ac` argument or use `auto`).

## Errors

A typed engine error (e.g. running a write tool in an uninitialized directory)
comes back as an MCP error result (`isError: true`) carrying the reason **and**
remediation — e.g. *"CADENCE not initialized here — run `cadence init` to get
started."* The server stays up and keeps serving subsequent calls; a tool
failure never crashes the transport.

## Scope

stdio only; resources are read-on-demand (no subscriptions / file-watching). A
remote/shared CADENCE over HTTP transport is a possible additive follow-up but
reopens auth and multi-tenancy questions deliberately out of scope here. See
`DESIGN.md` decision **D11**.
