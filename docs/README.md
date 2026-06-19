# CADENCE User Guide

**CADENCE** is a draft/build/settle framework for AI-assisted development that brings GSD-grade discipline to iterative work with configurable quality gates at each phase.

## Three-surface model

One engine, four entry points - not separate tools:

- The **`cadence` CLI** is the engine — it implements the DRAFT→BUILD→SETTLE loop and all quality gates. You run it in a terminal; a human operator or an AI agent can drive it. Completely host-agnostic and model-agnostic.
- The **`cadence-host-claude-code install`** adapter is a thin wiring layer that plugs the same engine into Claude Code via lifecycle hooks and eleven slash commands. It is the only surface that adds *ambient* edit-time gates (boundary checks and anomaly detection as you edit).
- The **`cadence-host-codex install`** adapter plugs the same engine into the OpenAI Codex CLI via lifecycle hooks and global prompt commands. It is the second shipped conformance consumer of the host-adapter contract.
- **`cadence mcp serve`** runs the engine as a local [MCP](https://modelcontextprotocol.io) server over stdio, so any MCP-capable host (Claude Desktop, Cursor, other agents) can drive the loop with no bespoke adapter. It exposes the imperative loop only — command-boundary gates run; ambient edit-time gates require host hooks.

---

## Documentation

Read in this order:

- **[Quickstart](quickstart.md)** — Try the no-install demo, start a real phase from a template, or walk the full loop end-to-end.
- **[Concepts](concepts.md)** — Understand the loop, gates, profiles, and two-commit convention that everything else builds on.
- **[CLI guide](cli.md)** — Master the `cadence` command-line tool: all subcommands, flags, and workflows.
- **[Claude Code integration](claude-code.md)** — Set up and use the Claude Code slash commands and understand how the adapter bridges the CLI engine.
- **[Host adapters](host-adapters.md)** - Understand the shared adapter contract used by Claude Code and Codex.
- **[MCP server](mcp.md)** — Drive the loop from any MCP host (Claude Desktop, Cursor, agents) via `cadence mcp serve`.
- **[Providers](providers.md)** — Integrate with your model provider (OpenAI, Claude, custom LLMs, local models).
- **[Command reference](reference/commands.md)** — Exhaustive reference for all CLI subcommands and their options.
- **[Config reference](reference/config.md)** — Full `.cadence/` config schema and all settable fields.

---

## First time here?

Start with [Quickstart](quickstart.md) to see the loop in action, then move to [Concepts](concepts.md) to understand *why* each phase exists.
