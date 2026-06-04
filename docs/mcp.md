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

### Claude Code

Add an `.mcp.json` at the repo root:

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

The server advertises 10 tools that wrap the same engine the CLI uses. Each
returns both human-readable text and structured content.

| Tool | Wraps | Kind |
|---|---|---|
| `cadence_progress` | `cadence progress` | read — next suggested action |
| `cadence_status` | `cadence status` | read — loop position, active phase/draft, AC results |
| `cadence_recommend` | `cadence recommend` | read — ranked recommendations |
| `cadence_draft_new` | `cadence draft new` | write — scaffold a DRAFT (IDLE→DRAFT) |
| `cadence_draft_check` | `cadence draft check` | write — coherence check (gate) |
| `cadence_draft_approve` | `cadence draft approve` | write — DRAFT→BUILD |
| `cadence_build_task` | `cadence build task` | write — record a task outcome |
| `cadence_settle` | `cadence settle run` | write — close the loop, run gates, write SUMMARY |
| `cadence_spec_new` | `cadence spec new` | write — scaffold a SPEC (IDLE→SPEC) |
| `cadence_spec_approve` | `cadence spec approve` | write — spec-review gate, SPEC→IDLE |

The CLI commands `init`, `config`, `doctor`, `install`, `handoff`, and `resume`
are intentionally **not** exposed as tools.

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

## Scope (v1)

stdio only. A remote/shared CADENCE over HTTP transport is a possible additive
follow-up but reopens auth and multi-tenancy questions deliberately out of scope
here. See `DESIGN.md` decision **D11**.
