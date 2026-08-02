# CADENCE

[![CI](https://github.com/thomas-powers-jr/cadence/actions/workflows/ci.yml/badge.svg)](https://github.com/thomas-powers-jr/cadence/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40thomas-powers-jr%2Fcadence-core)](https://www.npmjs.com/package/@thomas-powers-jr/cadence-core)

**Cadence stops AI agents from shipping work they only *claim* is done** — a DRAFT→BUILD→SETTLE loop whose quality gates re-check your acceptance criteria and refuse to settle when they don't pass.

> **"Your CI is green. Cadence still said no."**

![An agent guts a failing test to make the suite green; Cadence's settle gate still refuses, then accepts once the bug is actually fixed](https://raw.githubusercontent.com/thomas-powers-jr/cadence/main/examples/demo-test-gutting/gutting.svg)

An agent hits a failing test, guts the assertion, and leaves a plausible excuse (`// flaky rounding on some platforms? disabling for now`). The suite goes green, tasks get marked DONE. Then `cadence settle run --auto` refuses anyway — naming the specific AC and the specific dodge, exit 1. Fix the bug for real, restore the assertion, and it settles clean. Real output, offline, mock verifier, zero npm deps — run it yourself: **[docs/DEMO.md →](https://github.com/thomas-powers-jr/cadence/blob/main/docs/DEMO.md)** (full 4-beat narrative) or [`examples/demo-test-gutting/run-demo.sh`](https://github.com/thomas-powers-jr/cadence/tree/main/examples/demo-test-gutting) (replay it locally).

## Try it in 30 seconds — no install, no repo writes

Watch one real loop run, including the moment settle refuses to close a phase the tests don't back, then closes once they do:

```sh
npx -y @thomas-powers-jr/cadence-core tutorial
```

## Install

Requires Node ≥ 22.

```sh
npm install -g @thomas-powers-jr/cadence-core
```

New to CADENCE? Run `cadence start` — a guided menu that picks the right setup command for what you're doing. (Once you're set up, `cadence quickstart` is the read-only map of where you are and your next moves.)

## Quickstart

The fastest way to *see* a loop run in your own repo — `--demo` seeds a ready-to-approve phase so there's nothing to hand-edit:

```sh
mkdir my-app && cd my-app
cadence init --demo        # zero prompts: name + gate profile are derived
cadence draft approve 01-demo 01
cadence done T1
cadence settle run --ac AC-1=pass
```

`cadence init` asks nothing — it derives the project name (from `package.json` or the directory) and the gate profile (from git history). Already have an `ANTHROPIC_API_KEY`? Add `--activate` to turn on real verification in the same step (the key is never stored). Or run `cadence init --full` for host wiring + demo + activation in one command.

To drive a real phase yourself instead of the demo:

```sh
cadence init
cadence draft new --title "Fix login timeout" --template bugfix
# edit the generated DRAFT: templates are scaffolds, not proof
cadence draft approve 01-fix-login-timeout 01
cadence build task T1 --status=DONE
cadence settle run --auto
# ^ Cadence refuses: AC-1 has no test. That's the point — it won't settle
#   unverified work. As the operator, you can verdict the criterion yourself:
cadence settle run --ac AC-1=pass
```

> **Heads-up on the default verifier.** Out of the box every gate uses `mock`, a deterministic offline **placeholder** that only checks each acceptance criterion links to a test — it is **not real verification**. Run [`cadence activate`](https://github.com/thomas-powers-jr/cadence/blob/main/docs/providers.md) to turn on a real AI verifier (Anthropic or a local model); `cadence doctor` tells you whether real verification is actually wired.

## Why this exists

Cadence grew out of working with **GSD (Get Shit Done)** — a planning framework that produces genuinely disciplined work, but at a real cost in tokens, wall-clock time, and constant back-and-forth. I wanted that discipline without that cost.

But the cost wasn't the real trigger — it was what happened at the *end* of the loop. GSD and Superpowers both build in real discipline: planning up front, TDD cycles, checkpoints along the way. Both also ask the agent to verify its own work before calling it done. Neither, though, re-derives "done" from the actual state of the repo, independent of what the agent says it saw. An agent that's convinced itself the tests pass — or quietly gutted the one that didn't — still gets to mark the task complete, and nothing downstream catches it.

That's the gap Cadence closes. It isn't GSD-lite: it keeps the quality gates that re-check your acceptance criteria, but adds a settle step that never takes the agent's self-report as proof — it re-derives each AC's PASS from real evidence (task state, test results, diffs) and refuses to close the loop when the evidence doesn't back the claim. The gate set is configurable per change too, so a complex, risky change gets the full battery and a one-line fix doesn't pay for it. Same rigor GSD has, plus the verification neither GSD nor Superpowers do, minus the drag.

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

## One engine, every surface

This package is the engine — the `cadence` CLI implements the DRAFT→BUILD→SETTLE loop and all quality gates, completely host-agnostic. A human operator or an AI agent can drive it. The same engine is exposed through every other surface, so loop and gate logic stay authoritative everywhere:

| Surface | How | Package / command |
|---|---|---|
| **Terminal / any agent** | The `cadence` CLI (this package) | `npm i -g @thomas-powers-jr/cadence-core` |
| **Claude Code** | Lifecycle hooks + 15 slash commands, incl. *ambient* edit-time gates (boundary checks, anomaly detection as you edit) | [`@thomas-powers-jr/cadence-host-claude-code`](https://www.npmjs.com/package/@thomas-powers-jr/cadence-host-claude-code) — `npx @thomas-powers-jr/cadence-host-claude-code install` |
| **OpenAI Codex CLI** | Lifecycle hooks + global prompt commands | [`@thomas-powers-jr/cadence-host-codex`](https://www.npmjs.com/package/@thomas-powers-jr/cadence-host-codex) — or `cadence init --host codex` |
| **Any MCP host** (Claude Desktop, Cursor, agents) | Local [MCP](https://modelcontextprotocol.io) server over stdio — imperative loop, no bespoke adapter needed | `cadence mcp serve` |

```jsonc
// .mcp.json — wire any MCP host
{ "mcpServers": { "cadence": { "command": "cadence", "args": ["mcp", "serve"] } } }
```

## Gate profiles

`cadence init` suggests a gate profile from repo maturity — a repo with **≥20 commits** gets `standard`, a younger repo gets `auto` (override with `--gate-profile`). The profile sets how strict `draft approve` is:

- **`auto`** — `approve` runs non-interactively (good for solo and agent loops).
- **`standard` / `strict`** — `approve` is gated behind an **interactive prompt**. In non-TTY contexts (CI, agents) it **refuses** unless you pass `--no-approve`.

## Full user guide

- [Quickstart](https://github.com/thomas-powers-jr/cadence/blob/main/docs/quickstart.md) — no-install demo, first real template, and full loop walkthrough
- [Concepts](https://github.com/thomas-powers-jr/cadence/blob/main/docs/concepts.md) — the loop, gates, profiles, and single-commit convention
- [CLI guide](https://github.com/thomas-powers-jr/cadence/blob/main/docs/cli.md) — all subcommands and flags
- [Claude Code integration](https://github.com/thomas-powers-jr/cadence/blob/main/docs/claude-code.md) — hooks and slash commands
- [MCP server](https://github.com/thomas-powers-jr/cadence/blob/main/docs/mcp.md) — drive the loop from any MCP host
- [Providers](https://github.com/thomas-powers-jr/cadence/blob/main/docs/providers.md) — Anthropic, local models, and host-CLI verification
- [Command reference](https://github.com/thomas-powers-jr/cadence/blob/main/docs/reference/commands.md) — exhaustive CLI reference
- [Config reference](https://github.com/thomas-powers-jr/cadence/blob/main/docs/reference/config.md) — full `.cadence/` config schema

## About the name

**CADENCE** is named for the rhythm of its core loop — the steady DRAFT → BUILD → SETTLE cadence it keeps on every phase of work.

## License

MIT — [thomas-powers-jr/cadence](https://github.com/thomas-powers-jr/cadence)
