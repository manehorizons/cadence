# CADENCE Quickstart

This guide starts with the two fastest onboarding paths:

- **30-second demo:** seed a ready-to-approve phase and close one loop without
  hand-writing a DRAFT.
- **First real phase:** scaffold an editable bugfix, feature, or refactor DRAFT
  from a template, then refine it for your actual work.

The longer manual walkthrough later on shows every artifact in detail.

For the *why* behind the loop and the gate model, read
[docs/concepts.md](concepts.md) first. For exhaustive flag references, see
[docs/cli.md](cli.md) and [docs/reference/commands.md](reference/commands.md).

### How are you driving CADENCE?

Pick your surface — the loop is the same engine either way:

- **From a terminal (CLI):** you're in the right place — start at [Prerequisites](#prerequisites) below.
- **From Claude Code:** wire the adapter, then drive the loop with slash commands — jump to [Claude Code surface](#claude-code-surface).
- **From another MCP host** (Claude Desktop, Cursor, an agent): point it at the MCP server — jump to [MCP surface](#mcp-surface).

New and not sure? Run `cadence start` for a guided menu that picks the right setup command for you.

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Fast path — 30-second demo](#fast-path--30-second-demo)
- [First real phase](#first-real-phase)
- [Step 1 — Set up a toy project manually](#step-1--set-up-a-toy-project-manually)
- [Step 2 — Draft a phase](#step-2--draft-a-phase)
- [Step 3 — Fill the DRAFT](#step-3--fill-the-draft)
- [Step 4 — Coherence-check the DRAFT](#step-4--coherence-check-the-draft)
- [Step 5 — Approve and enter BUILD](#step-5--approve-and-enter-build)
- [Step 6 — Implement and record tasks](#step-6--implement-and-record-tasks)
- [Step 7 — Settle the phase](#step-7--settle-the-phase)
- [Step 8 — Two-commit wrap-up](#step-8--two-commit-wrap-up)
- [Claude Code surface](#claude-code-surface)
- [MCP surface](#mcp-surface)

---

## Prerequisites

- **Node.js ≥ 20**
- For a zero-install first touch — one real loop, including settle refusing a
  phase the tests don't back, then closing once they do:

```sh
npx -y @manehorizons/cadence-core tutorial
```

- For daily use, install the CADENCE CLI globally:

```sh
npm install -g @manehorizons/cadence-core
```

This gives you the `cadence` command used throughout this guide.

---

## Fast path — 30-second demo

This path writes a real `.cadence/` scaffold and a ready-to-approve demo phase
in a scratch repo. There is no DRAFT hand-editing cliff.

```sh
mkdir ~/projects/my-toy-app
cd ~/projects/my-toy-app

cadence init --demo
cadence draft approve 01-demo 01
cadence done T1
cadence settle run --ac AC-1=pass
```

That is the whole loop: DRAFT → BUILD → SETTLE → IDLE.

`cadence init --demo` derives the project name and gate profile, then seeds
`.cadence/phases/01-demo/01-01-DRAFT.md` with an Objective, AC-1, and T1
already filled in. Use this when you want to feel the loop before designing
your own phase.

---

## First real phase

When you are ready to use Cadence on actual work, **preview before you commit**.
Inside your real repo, run a non-destructive fit-check first — it resolves the
project name, gate profile, layout, test globs, provider status, and the exact
files init would write, and touches nothing:

```sh
cadence init --dry-run
```

If the detected settings look right, run init for real (add the same flags you
previewed, e.g. `--gate-profile`, `--activate`):

```sh
cadence init
```

Then pick the template that matches the work:

```sh
cadence draft new --title "Fix login timeout" --template bugfix
cadence draft new --title "Add CSV export" --template feature
cadence draft new --title "Split billing service" --template refactor
```

Pick one command, then edit the generated DRAFT. Templates are scaffolds, not
proof: tune the Objective, Acceptance Criteria, Tasks, and Boundaries until they
describe your real slice. Then continue:

```sh
cadence draft check .cadence/phases/01-fix-login-timeout/01-01-DRAFT.md
cadence draft approve 01-fix-login-timeout 01
cadence done T1        # repeat for each task you complete
cadence settle run --auto
```

If you are unsure what state you are in, run `cadence start` for a guided menu
or `cadence progress` for the next exact command.

Driving CADENCE with an AI agent? Run `cadence agent-prompt --goal "<your goal>"`
(also printed at the end of `cadence init`) and paste the result to your agent —
it scaffolds the DRAFT, keeps the ACs testable, and stops for your approval.

---

## Step 1 — Set up a toy project manually

Create a scratch directory **outside** the cadence repo and initialise CADENCE
inside it:

```sh
mkdir ~/projects/my-toy-app
cd ~/projects/my-toy-app

cadence init --name "hello-cadence"
```

Output:

```
Initialized CADENCE in /home/you/projects/my-toy-app/.cadence (profile=team)

  CADENCE initialized
  ───────────────────
  project       hello-cadence
  location      …/my-toy-app/.cadence
  preset        team  (config preset — workflow defaults: solo|team|production)
  gate profile  auto  (gate strictness: strict|standard|auto)
  layout        single-package
  test globs    **/*.test.ts, **/*.test.tsx
  scaffolded    config.json, state.json, PROJECT.md,
                ROADMAP.md, MILESTONES.md,
                SPECIAL-FLOWS.md, STATE.md, CLAUDE.md
                phases/ handoff/ research/ archive/

  Your first loop
  ───────────────
  1. cadence draft new --title "Fix login timeout" --template bugfix
  2. edit the generated DRAFT — templates are scaffolds, not proof
  3. cadence draft approve 01-fix-login-timeout 01
  4. cadence done T1  (repeat for each task you complete)
  5. cadence settle run --auto
```

The gate profile is `auto` because the directory has no git history (fewer than
20 commits). `auto` is the hands-off profile — CADENCE drives; anomalies surface
automatically with no interactive prompts. This keeps the quickstart clean.
For stricter profiles (`standard`, `strict`), see
[docs/concepts.md — Profiles × tiers](concepts.md#profiles--tiers).

> **After `init`, commit `.cadence/` before starting real phase work.** The toy
> repo in this guide skips git for brevity.

---

## Step 2 — Draft a phase

A *phase* is one named unit of work. Create a DRAFT scaffold for a phase called
`01-add-greeting`, task number `01`:

```sh
cadence draft new 01-add-greeting 01 --title "Add greeting module"
```

For your first real bugfix, feature, or refactor, you can start from a richer
template instead of a blank scaffold:

```sh
cadence draft new --title "Fix login timeout" --template bugfix
cadence draft new --title "Add CSV export" --template feature
cadence draft new --title "Split billing service" --template refactor
```

Templates are editable scaffolds. They help you start with useful ACs, tasks,
and boundaries; they do not prove the work is correct.

Output:

```
Created …/.cadence/phases/01-add-greeting/01-01-DRAFT.md
```

The file contains a template you fill in. Open it now.

---

## Step 3 — Fill the DRAFT

Open `.cadence/phases/01-add-greeting/01-01-DRAFT.md` and replace the template
placeholders. A minimal, real DRAFT for this tutorial:

```markdown
---
phase: 01-add-greeting
id: 01-01
tier: quick-fix
status: PENDING
---

# 01-01 — Add greeting module

## Objective

Add a `greet()` function that returns a personalised greeting string, with a
test that covers it.

## Acceptance Criteria

### AC-1: greet() returns the expected string
Given a name string passed to `greet(name)`
When the function is called
Then it returns `"Hello, <name>!"`

### AC-2: test suite passes
Given the implementation exists
When the test runner executes
Then all tests pass with zero failures

## Tasks

### T1: Add src/greet.js
- files: `src/greet.js`
- action: export `greet(name)` returning `` `Hello, ${name}!` ``
- verify: function exists and returns correct string
- done: AC-1

### T2: Add src/greet.test.js
- files: `src/greet.test.js`
- action: write a test that calls `greet("World")` and asserts `"Hello, World!"`
- verify: test file exists and passes
- done: AC-2

## Boundaries

- DO NOT modify any file outside `src/`
```

Key fields:
- `tier: quick-fix` — one or two tasks touching one or two files
- `AC-N` — structured acceptance criteria (`Given / When / Then`)
- `tasks` — what the AI executes, what it verifies, which AC it closes
- `done: AC-N` — the mapping from task completion to AC satisfaction

For the full field reference, see
[docs/reference/commands.md — draft new](reference/commands.md).

---

## Step 4 — Coherence-check the DRAFT

Before approving, run the structural coherence check:

```sh
cadence draft check .cadence/phases/01-add-greeting/01-01-DRAFT.md
```

Output (clean DRAFT):

```
coherence: OK
```

The check validates:
- At least one AC is present and well-formed
- Task count is consistent with the declared tier
- The loop is in IDLE (so approve is possible)

Fix any reported issues before continuing.

---

## Step 5 — Approve and enter BUILD

```sh
cadence draft approve 01-add-greeting 01
```

Output:

```
Approved 01-01; loopPosition=BUILD
```

Because the gate profile is `auto` and the tier is `quick-fix`, no interactive
`approve` gate fires — the command exits immediately. For `strict` or `standard`
profiles you would see a Y/N prompt (or need `--no-approve` in non-TTY
environments).

Check the current state:

```sh
cadence status
```

Output:

```
CADENCE — hello-cadence
  loop:  BUILD
  phase: 01-add-greeting
  draft: 01-01 — Add greeting module
  tier:  quick-fix
  profile: auto

  TASKS
  ────────────────────────────────────
  T1  PENDING  Add src/greet.js       → AC-1
  T2  PENDING  Add src/greet.test.js  → AC-2

  ACS
  ────────────────────
  [ ] AC-1  pending
  [ ] AC-2  pending

NEXT: cadence build task <id> --status=<DONE|...>  OR  cadence settle run --ac AC-1=pass
  In BUILD phase. Record task outcomes, then settle.
```

---

## Step 6 — Implement and record tasks

Write the actual code (you or the AI):

```sh
mkdir -p src

cat > src/greet.js << 'EOF'
/** Returns a personalised greeting. */
function greet(name) {
  return `Hello, ${name}!`;
}

module.exports = { greet };
EOF

cat > src/greet.test.js << 'EOF'
const { greet } = require('./greet');

test('greet returns the expected string', () => {
  expect(greet('World')).toBe('Hello, World!');
});
EOF
```

Then record each task outcome with CADENCE:

```sh
cadence build task T1 --status=DONE
```

```
Recorded T1: DONE
```

```sh
cadence build task T2 --status=DONE --notes "test asserts greet('World') === 'Hello, World!'"
```

```
Recorded T2: DONE
```

Valid `--status` values: `DONE` | `DONE_WITH_CONCERNS` | `NEEDS_CONTEXT` |
`BLOCKED`. Use `cadence done T1` as a shortcut for `build task T1
--status=DONE`.

After both tasks are recorded, `status` shows the ACs satisfied:

```sh
cadence status
```

```
CADENCE — hello-cadence
  loop:  BUILD
  …
  TASKS
  ───────────────────────────────────
  T1  DONE    Add src/greet.js       → AC-1
  T2  DONE    Add src/greet.test.js  → AC-2

  ACS
  ────────────────────
  [x] AC-1  pass
  [x] AC-2  pass
```

---

## Step 7 — Settle the phase

Close the loop. `--auto` derives AC verdicts from task statuses (both `DONE` →
both ACs pass):

```sh
cadence settle run --auto
```

```
Settled 01-01
```

`settle` writes three phase artifacts:

| Artifact | Purpose |
|---|---|
| `01-01-SUMMARY.md` | Human-readable record of AC verdicts, task outcomes, decisions |
| `01-01-SUMMARY.json` | Machine-readable full record |
| `01-01-PROGRESS.json` | Task progress log |

The loop is now IDLE:

```sh
cadence status
```

```
CADENCE — hello-cadence
  loop:  IDLE
  phase: 01-add-greeting
  profile: auto

NEXT: cadence draft new <phase> <num> --title=…
  No active draft. Start the loop by drafting a new unit of work.
```

---

## Step 8 — Two-commit wrap-up

A completed phase produces exactly **two commits**, in order:

```sh
# Commit 1 — your code change
git add src/greet.js src/greet.test.js
git commit -m "feat: add greeting module"

# Commit 2 — phase artifacts
git add .cadence/
git commit -m "chore: settle 01-01 — add greeting module"
```

Why two commits? Source changes stay clean and blame-friendly; settle artifacts
(SUMMARY, PROGRESS, state files) land in a single, atomic audit record. See
[docs/concepts.md — Two-commit convention](concepts.md#two-commit-convention)
for the full rationale.

---

## Claude Code surface

If you use Claude Code as your AI editor, install the host adapter to get hooks
and slash commands:

> **Published on npm.** `npx @manehorizons/cadence-host-claude-code install` works directly; or use the local build for dogfood/monorepo work:

```sh
cadence-host-claude-code install --local
```

Output:

```
Installed CADENCE hooks → …/my-toy-app/.claude/settings.json
Installed CADENCE slash commands → …/my-toy-app/.claude/commands/
Start a new Claude Code session to activate.
warning: --local wrote machine-absolute paths into .claude/settings.json.
Do NOT commit it — add it to .gitignore; other clones/machines cannot
resolve these paths. Re-run install per machine instead.
```

The `--local` flag resolves the absolute paths of your local workspace builds.
**Do not commit `.claude/settings.json`** when using `--local` — the paths are
machine-specific.

`install` writes 13 slash commands into `.claude/commands/`:

| Command | What it does |
|---|---|
| `/cadence-progress` | Show CADENCE's next suggested action |
| `/cadence-draft` | Scaffold a new DRAFT.md |
| `/cadence-check` | Run coherence check on a draft |
| `/cadence-approve` | Approve a draft and enter BUILD |
| `/cadence-done` | Mark a task DONE |
| `/cadence-build` | Record any task outcome |
| `/cadence-block` | Mark a task BLOCKED |
| `/cadence-needs-context` | Mark a task NEEDS\_CONTEXT |
| `/cadence-settle` | Close the loop and write SUMMARY |
| `/cadence-handoff` | Scaffold a SESSION handoff doc with machine facts pre-filled |
| `/cadence-resume` | Replay the freshest session handoff + live context (read-only) |
| `/cadence-recommend` | Rank actionable strategic recommendations and advise the next move (top 5) |
| `/cadence-scout` | Divergent→convergent ideation dialogue that lands survivors as Praxis recommendations |

### Typical Claude Code session

Start a new Claude Code session after `install`. The agent sees the same loop
state the CLI sees — both talk to the same `.cadence/` directory:

1. At session start, CADENCE hooks surface the current phase and next action.
2. Type `/cadence-draft 01-add-greeting 01 --title "Add greeting module"` to
   scaffold a DRAFT (same as `cadence draft new …` on the CLI).
3. The agent fills the DRAFT, runs `/cadence-check`, and calls
   `/cadence-approve` when ready.
4. During implementation, the agent calls `/cadence-done T1`, `/cadence-done
   T2`, etc. as it completes each task.
5. When all tasks are done, the agent calls `/cadence-settle --auto` to close
   the loop.
6. At session stop, the CADENCE hook confirms loop state is consistent.

For full hook mechanics, the gate-vs-profile matrix, and how the agent drives
CADENCE, see [docs/claude-code.md](claude-code.md).

---

## MCP surface

Not on Claude Code? Any MCP-capable host (Claude Desktop, Cursor, other agents)
can drive the same loop over [MCP](https://modelcontextprotocol.io) — no bespoke
adapter. It's a local subprocess, not a service: the host launches
`cadence mcp serve` over stdio, scoped to your repo.

Point your host at the command (for a global install, `command: "cadence"`):

```jsonc
// .mcp.json (Claude Code) or your host's MCP config
{ "mcpServers": { "cadence": { "command": "cadence", "args": ["mcp", "serve"] } } }
```

The host then has 10 tools — `cadence_progress`/`status`/`recommend` (read) and
`cadence_draft_new`/`draft_check`/`draft_approve`/`build_task`/`settle`/
`spec_new`/`spec_approve` (write) — that run the exact same loop you ran by hand
above. Command-boundary gates (coherence, the settle gate stack, spec-review)
run just as on the CLI; **ambient edit-time gates require host hooks and are not
available over MCP** — for those, use the Claude Code adapter. Full setup and the
tool table: [docs/mcp.md](mcp.md).

---

## What's next

| Topic | Where to go |
|---|---|
| Concepts: the loop, profiles, tiers, gate matrix | [docs/concepts.md](concepts.md) |
| Every CLI command and flag | [docs/cli.md](cli.md) |
| Claude Code host adapter in depth | [docs/claude-code.md](claude-code.md) |
| Drive the loop from any MCP host | [docs/mcp.md](mcp.md) |
| LLM provider setup (for `--deep` verify) | [docs/providers.md](providers.md) |
| Config file reference | [docs/reference/config.md](reference/config.md) |
| Command reference (all flags) | [docs/reference/commands.md](reference/commands.md) |
