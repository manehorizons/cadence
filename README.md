# CADENCE

[![CI](https://github.com/manehorizons/cadence/actions/workflows/ci.yml/badge.svg)](https://github.com/manehorizons/cadence/actions/workflows/ci.yml)

**Coordinated AI-Driven Engineering with Notifications and Customizable Execution** — a plan/build/settle framework for AI-assisted development with configurable quality gates.

## See it catch a bug

CADENCE's headline move: it refuses to "settle" work an AI already marked **DONE** when the declared acceptance criteria don't actually pass. Below, the always-fire `build-test-must-pass` gate blocks a plausible lost-penny bug in a bill-splitter — `$100.00` split 3 ways summing to `$99.99`:

![CADENCE refusing to settle a failing build](https://raw.githubusercontent.com/manehorizons/cadence-demo-billsplit/main/billsplit.gif)

Real git history, the full refuse → fix → pass arc, and reproduce-it-yourself steps live in the demo repo: **[cadence-demo-billsplit →](https://github.com/manehorizons/cadence-demo-billsplit)**

## Two-surface model

The **`cadence` CLI** is the engine — it implements the DRAFT→BUILD→SETTLE loop and all quality gates. You run it in a terminal; a human operator or an AI agent can drive it. It is completely host-agnostic.

The **`cadence-host-claude-code install`** adapter wires the same engine into Claude Code via lifecycle hooks and nine slash commands. One engine, two surfaces: the CLI for terminals, the adapter for Claude Code.

## Quickstart

Install the CLI globally (requires Node ≥ 20):

```sh
npm install -g @manehorizons/cadence-core
```

Then run one full loop in any project:

```sh
mkdir my-app && cd my-app
cadence init --name "my-app"
cadence draft new 01-foundation 01 --title "First phase"
# fill .cadence/phases/01-foundation/01-01-DRAFT.md
cadence draft approve 01-foundation 01
cadence build task T1 --status=DONE
cadence settle run --auto
```

Driving CADENCE from **Claude Code**? Wire the adapter into a project:

```sh
npx @manehorizons/cadence-host-claude-code install
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

`.github/workflows/ci.yml` runs `lint → typecheck → test → build` on every PR and push to `main`, across Node 20 + 22 on Ubuntu.

**Enforcing the gate.** A tracked hook `.githooks/pre-push` (wired via `git config core.hooksPath .githooks`) runs the full `pnpm turbo run lint typecheck test build` before any push that updates `main` and aborts on failure. Bypass deliberately with `git push --no-verify`.

## License

MIT
