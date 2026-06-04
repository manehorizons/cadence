---
"@manehorizons/cadence-core": minor
"@manehorizons/cadence-types": minor
"@manehorizons/cadence-host-claude-code": minor
---

Add `cadence mcp serve` — an MCP server surface (phase 58).

CADENCE can now run as a local Model Context Protocol server over stdio, so any
MCP-capable host (Claude Desktop, Cursor, other agents) can drive the
DRAFT→BUILD→SETTLE loop with no bespoke adapter. It's a third surface on the
single engine (CLI · Claude-Code hooks · MCP), not multi-host adapter pluralism
(DESIGN.md D11).

The server exposes 10 curated tools wrapping the same engine the CLI uses —
`cadence_progress`/`status`/`recommend` (read) and `draft_new`/`draft_check`/
`draft_approve`/`build_task`/`settle`/`spec_new`/`spec_approve` (write). The
curated command logic was factored into shared `*Service(repoRoot, args, io)`
functions so the CLI and MCP call one implementation (CLI output unchanged).
Command-boundary gates (coherence, the settle gate stack, spec-review) run
exactly as on the CLI; ambient edit-time gates require host hooks and are not
available over MCP. The `@modelcontextprotocol/sdk` dependency is lazy-loaded,
so ordinary CLI commands never pay its load cost. stdio only — no
HTTP/remote/auth. See `docs/mcp.md`.
