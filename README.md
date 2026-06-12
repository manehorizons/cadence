# CADENCE

[![CI](https://github.com/manehorizons/cadence/actions/workflows/ci.yml/badge.svg)](https://github.com/manehorizons/cadence/actions/workflows/ci.yml)

**Cadence stops AI agents from shipping work they only *claim* is done** — a DRAFT→BUILD→SETTLE loop whose quality gates re-check your acceptance criteria and refuse to settle when they don't pass.

![CADENCE refusing to settle a failing build](https://raw.githubusercontent.com/manehorizons/cadence-demo-billsplit/main/billsplit.gif)

Above, the always-fire `build-test-must-pass` gate blocks a plausible lost-penny bug in a bill-splitter — `$100.00` split 3 ways summing to `$99.99`. The AI marked the task **DONE**; the gate didn't agree, and refused to close the loop. The demo repo carries the story past the block — the fix, then a clean **settle** once `$100.00` actually splits to `$100.00` — with real git history and reproduce-it-yourself steps: **[cadence-demo-billsplit →](https://github.com/manehorizons/cadence-demo-billsplit)**

## Why this exists

Cadence grew out of working with **GSD (Get Shit Done)** — a planning framework that produces genuinely disciplined work, but at a real cost in tokens, wall-clock time, and constant back-and-forth. I wanted that discipline without that cost.

So Cadence isn't GSD-lite. It keeps the quality gates — they re-check your acceptance criteria and refuse to settle unverified work — but lets you choose which gates fire for a given change. A complex, risky change gets the full battery; a one-line fix doesn't pay for it. Same rigor, far less drag.

## Three-surface model

One engine, three ways to drive it:

- The **`cadence` CLI** is the engine — it implements the DRAFT→BUILD→SETTLE loop and all quality gates. You run it in a terminal; a human operator or an AI agent can drive it. Completely host-agnostic.
- The **`cadence-host-claude-code install`** adapter wires the same engine into Claude Code via lifecycle hooks and eleven slash commands — the only surface that adds *ambient* edit-time gates (boundary checks, anomaly detection as you edit).
- **`cadence mcp serve`** exposes the engine as a local [MCP](https://modelcontextprotocol.io) server over stdio, so any MCP-capable host (Claude Desktop, Cursor, other agents) can drive the loop with no bespoke adapter. It covers the imperative loop (command-boundary gates run; ambient edit-time gates need host hooks). See **[MCP server](./docs/mcp.md)**.

## How it compares

Cadence is a verification layer, not an agent and not a CI service. The point of difference is *what* it checks: the specific acceptance criteria you declared for a unit of work, re-derived from real task state — not just "did the build stay green."

| | What it checks | Where Cadence differs |
|---|---|---|
| **CI / a test runner** | The suite passes on a branch, after you push. | CI has no idea what *this task* promised. Cadence re-checks each declared acceptance criterion before it will even close the loop, and runs the suite as one of several gates. |
| **A linter / pre-commit hook** | Style and static rules on the diff. | Those never ask "was the work actually accomplished?" Cadence gates the *claim of done* against the criteria, not formatting. |
| **An agent harness / framework** | Orchestrates the agent *doing* the work. | Cadence is adversarial to the agent's self-report. It's host-agnostic — a CLI that sits behind any agent (or none) and refuses to accept an unverified "done." |
| **A heavyweight planning framework (e.g. GSD)** | Runs a full, fixed discipline on every change. | Cadence keeps the rigor but makes the gate set configurable per change (profile × tier) — you pay only for the gates a change actually needs. GSD's discipline without GSD's wall-clock cost. |

The core primitive nothing else has: **refusal-to-settle on re-verified declared criteria.** 

The agent isn't believed; the state is.

> **Heads-up on the default verifier.** Out of the box every gate uses `mock`, a
> deterministic offline **placeholder** that only checks each acceptance criterion
> links to a test — it is **not real verification**. Run [`cadence activate`](./docs/providers.md)
> to turn on a real AI verifier (Anthropic or a local model); `cadence doctor`
> tells you whether real verification is actually wired.

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
# ^ Cadence refuses: AC-1 has no test. That's the point — it won't settle
#   unverified work. As the operator, you can verdict the criterion yourself:
cadence settle run --ac AC-1=pass
```

Driving CADENCE from **Claude Code**? Wire the adapter into a project:

```sh
npx @manehorizons/cadence-host-claude-code install
```

Driving it from **another MCP host** (Claude Desktop, Cursor, an agent)? Point the host at the MCP server — no adapter needed:

```jsonc
// .mcp.json
{ "mcpServers": { "cadence": { "command": "cadence", "args": ["mcp", "serve"] } } }
```

> **Heads-up — gate profiles and `approve`:** `cadence init` suggests a gate profile from repo maturity — a repo with **≥20 commits** gets `standard`, a younger repo gets `auto` (override with `--gate-profile`). The profile sets how strict `draft approve` is:
> - **`auto`** — `approve` runs non-interactively (good for solo and agent loops).
> - **`standard` / `strict`** — `approve` is gated behind an **interactive prompt**. In non-TTY contexts (CI, agents) it **refuses** unless you pass `--no-approve`.

> **`--local` writes machine-absolute paths — do not commit it.** `cadence-host-claude-code install --local` bakes absolute paths to *this machine's* workspace into the settings file. Add the settings file (e.g. `.claude/settings.local.json`) to `.gitignore`; other clones/machines cannot resolve those paths.

## Full user guide

See **[docs/README.md](./docs/README.md)** for the complete user guide:

- [Quickstart](./docs/quickstart.md) — one complete loop in ~10 minutes
- [Concepts](./docs/concepts.md) — the loop, gates, profiles, and two-commit convention
- [CLI guide](./docs/cli.md) — all subcommands and flags
- [Claude Code integration](./docs/claude-code.md) — hooks and slash commands
- [MCP server](./docs/mcp.md) — drive the loop from any MCP host (`cadence mcp serve`)
- [Providers](./docs/providers.md) — OpenAI, Claude, Ollama, and custom LLMs
- [Command reference](./docs/reference/commands.md) — exhaustive CLI reference
- [Config reference](./docs/reference/config.md) — full `.cadence/` config schema

## Continuous integration

`.github/workflows/ci.yml` runs `lint → typecheck → test → build` on every PR and push to `main`, across Node 20 + 22 on Ubuntu.

**Enforcing the gate.** A tracked hook `.githooks/pre-push` (wired via `git config core.hooksPath .githooks`) runs the full `pnpm turbo run lint typecheck test build` before any push that updates `main` and aborts on failure. Bypass deliberately with `git push --no-verify`.

## About the name

**CADENCE** is named for the rhythm of its core loop — the steady DRAFT → BUILD → SETTLE cadence it keeps on every phase of work. Earlier drafts carried a backronym; it's been retired as a forced fit. The word — the rhythm — is the keeper.

## License

MIT
