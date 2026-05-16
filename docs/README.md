# CADENCE User Guide

**CADENCE** is a plan/build/settle framework for AI-assisted development that brings GSD-grade discipline to iterative work with configurable quality gates at each phase.

## Two-surface model

The **`cadence` CLI** is the engine — it implements the DRAFT→BUILD→SETTLE loop and all quality gates. You run it in a terminal; a human operator or an AI agent can drive it. It is completely host-agnostic and model-agnostic.

The **`cadence-host-claude-code install`** adapter is a thin wiring layer that plugs the same engine into Claude Code via lifecycle hooks and nine slash commands. This is not two separate tools — it's one engine with two surfaces: the CLI for terminals, the adapter for Claude Code.

---

## Documentation

Read in this order:

- **[Quickstart](quickstart.md)** — Run one complete DRAFT→BUILD→SETTLE loop end-to-end in about ten minutes.
- **[Concepts](concepts.md)** — Understand the loop, gates, profiles, and two-commit convention that everything else builds on.
- **[CLI guide](cli.md)** — Master the `cadence` command-line tool: all subcommands, flags, and workflows.
- **[Claude Code integration](claude-code.md)** — Set up and use the nine Claude Code slash commands and understand how the adapter bridges the CLI engine.
- **[Providers](providers.md)** — Integrate with your model provider (OpenAI, Claude, custom LLMs, local models).
- **[Command reference](reference/commands.md)** — Exhaustive reference for all CLI subcommands and their options.
- **[Config reference](reference/config.md)** — Full `.cadence/` config schema and all settable fields.

---

## First time here?

Start with [Quickstart](quickstart.md) to see the loop in action, then move to [Concepts](concepts.md) to understand *why* each phase exists.
