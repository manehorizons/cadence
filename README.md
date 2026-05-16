# CADENCE

[![CI](https://github.com/manehorizons/cadence/actions/workflows/ci.yml/badge.svg)](https://github.com/manehorizons/cadence/actions/workflows/ci.yml)

**Coordinated AI-Driven Engineering with Notifications and Customizable Execution** — a plan/build/settle framework for AI-assisted development with configurable quality gates.

## Two-surface model

The **`cadence` CLI** is the engine — it implements the DRAFT→BUILD→SETTLE loop and all quality gates. You run it in a terminal; a human operator or an AI agent can drive it. It is completely host-agnostic.

The **`cadence-host-claude-code install`** adapter wires the same engine into Claude Code via lifecycle hooks and nine slash commands. One engine, two surfaces: the CLI for terminals, the adapter for Claude Code.

## Quickstart (local install)

> **Not yet published — local install for now.** `@cadence/core` is not on npm; `npx @cadence/core` is not yet available. Use the local-dogfood invocation below. Build first with `pnpm -C packages/core build`. The publish path is proven and reversible (Phase 33.1: verdaccio + dry-run); the actual public release is a tracked **v1.2 "Public release"** milestone (see `.cadence/ROADMAP.md`).

```sh
# Adapt this path to your CADENCE checkout:
CADENCE=~/projects/cadence

mkdir ~/projects/my-app && cd ~/projects/my-app
node $CADENCE/packages/core/bin/cadence.cjs init --name "my-app"
node $CADENCE/packages/core/bin/cadence.cjs draft new 01-foundation 01 --title "First phase"
# fill .cadence/phases/01-foundation/01-01-DRAFT.md
node $CADENCE/packages/core/bin/cadence.cjs draft approve 01-foundation 01
node $CADENCE/packages/core/bin/cadence.cjs build task T1 --status=DONE
node $CADENCE/packages/core/bin/cadence.cjs settle run --auto
```

> **Heads-up (mature repos):** on a repo with ≥20 commits the suggested gate profile is `standard`, which puts `draft approve` behind an interactive prompt. In non-TTY contexts (CI, agents) `cadence draft approve` then **refuses** unless you pass `--no-approve`.

> **`--local` writes machine-absolute paths — do not commit it.** `cadence-host-claude-code install --local` bakes absolute paths to *this machine's* workspace into the settings file. Add the settings file (e.g. `.claude/settings.local.json`) to `.gitignore`; other clones/machines cannot resolve those paths.

## Full user guide

See **[docs/README.md](./docs/README.md)** for the complete user guide:

- [Quickstart](./docs/quickstart.md) — one complete loop in ~10 minutes
- [Concepts](./docs/concepts.md) — the loop, gates, profiles, and two-commit convention
- [CLI guide](./docs/cli.md) — all subcommands and flags
- [Claude Code integration](./docs/claude-code.md) — hooks and slash commands
- [Providers](./docs/providers.md) — OpenAI, Claude, Ollama, and custom LLMs
- [Command reference](./docs/reference/commands.md) — exhaustive CLI reference
- [Config reference](./docs/reference/config.md) — full `.cadence/` config schema

## Continuous integration

`.github/workflows/ci.yml` runs `lint → typecheck → test → build` on every PR and push to `main`, across Node 20 + 22 on Ubuntu, Windows, and macOS.

**Enforcing the gate.** A tracked hook `.githooks/pre-push` (wired via `git config core.hooksPath .githooks`) runs the full `pnpm turbo run lint typecheck test build` before any push that updates `main` and aborts on failure. Bypass deliberately with `git push --no-verify`.

## License

MIT
