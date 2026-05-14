# CADENCE

**Coordinated AI-Driven Engineering with Notifications and Customizable Execution** — structured AI-assisted development.

CADENCE is a customizable plan/build/settle framework for AI-assisted development. Inspired by GSD (Get Shit Done) and PAUL (Plan-Apply-Unify Loop); independently implemented in TypeScript. The product center is a tunable quality regime: three user-involvement profiles (`strict` / `standard` / `auto`) × three phase tiers (`quick-fix` / `standard` / `complex`) decide which gates fire — see `DESIGN.md` for the full matrix.

> **Status:** Phase 12 renamed the project KEEL → CADENCE (`v0.2.0-rc.1`). Earlier history shipped Phases 1–11 under the KEEL name; the `keel-codex-archive` tag preserves the dual-host implementation removed in Phase 11. Behavioral verifier (hybrid: structural + test-coverage default, `--deep` for agent, `--interactive` for human) is the next major implementation phase per `DESIGN.md`.

## Loop

`DRAFT → BUILD → SETTLE` — define the unit of work, execute task-by-task with per-task qualify, close the loop with a SUMMARY.

## Try it (headless, with the mock host)

```bash
mkdir /tmp/cadence-demo && cd /tmp/cadence-demo
npx @cadence/core init --name=demo
npx @cadence/core draft new 01-foundation 01 --title=Demo
# edit .cadence/phases/01-foundation/01-01-DRAFT.md
npx @cadence/core draft approve 01-foundation 01
npx @cadence/core status                      # full phase context in one screen
npx @cadence/core build task T1 --status=DONE
npx @cadence/core settle run --auto           # derive AC verdicts from task statuses
```

`settle run --auto` reads PROGRESS.json and derives each AC's verdict the same way `cadence status` does: all linked tasks DONE → pass, any BLOCKED → fail with `auto: <task> blocked`, NEEDS_CONTEXT → fail with `auto: <task> needs context`, anything still PENDING → refuses with a clear error (`--force` settles anyway). Pass explicit `--ac AC-1=fail:custom` to override the derivation for an individual AC. The legacy `--ac`-only flow still works exactly as before.

`cadence status` renders project, loop position, active draft, per-task status, AC derivation (pass/blocked/needs-context/pending), and the next-action hint. `cadence status --json` emits the same data as a single JSON document for scripting.

## Use with Claude Code

```bash
cd your-project
npx @cadence/core init --name=your-project
npx @cadence/host-claude-code install
# Start a new Claude Code session; CADENCE hooks are wired into .claude/settings.json
# and slash commands /cadence-progress /cadence-draft /cadence-approve /cadence-check
# /cadence-build /cadence-settle /cadence-done /cadence-block /cadence-needs-context
# are available under .claude/commands/.
```

> Dogfooding a local checkout of CADENCE before publishing? Build the workspace (`pnpm build`) then run `node packages/host-claude-code/bin/cadence-host-claude-code.cjs install --local --settings .claude/settings.local.json`. `--local` writes absolute paths to the workspace builds instead of `npx`-style commands; pair it with `settings.local.json` so the machine-specific paths stay out of git.

## Codex support — archived

Codex CLI host adapter shipped earlier as `@keel/host-codex` (Phases 02 / 09). Phase 11 removed it from main; the complete pre-removal state is preserved on the `keel-codex-archive` git tag. Resurrection is a future v1.x/v2 phase.

## Host capabilities

Currently single-host: Claude Code only. The capabilities surface (hook coverage, blocking events, slash command support) is declared inline in `@cadence/host-claude-code` as a plain typed constant. If a second host returns, we'll re-evaluate whether a schema-validated abstraction is worth its complexity cost.

## Packages

- `@cadence/core` — CLI + state engine + parsers + classifier + hook dispatcher
- `@cadence/types` — Zod schemas + TS interfaces
- `@cadence/testkit` — fixture builder + MockHostAdapter for tests
- `@cadence/host-claude-code` — Claude Code host adapter: hook installer + event mapping + slash command codegen

## License

MIT
