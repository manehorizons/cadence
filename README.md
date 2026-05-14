# KEEL

**Keep Execution Aligned to Loop** — structured AI-assisted development.

KEEL is a host-agnostic plan/build/settle framework for AI-assisted development. It is inspired by GSD (Get Shit Done) and PAUL (Plan-Apply-Unify Loop) and is independently implemented in TypeScript.

> **Status:** Phases 1–11 shipped. Phase 11 archived the `@keel/host-codex` package (preserved on the `keel-codex-archive` tag) and collapsed the multi-host `HostCapabilities` abstraction; v1 ships single-host (Claude Code). See `DESIGN.md` for the broader redirection (rename to CADENCE pending, behavioral verifier on deck).

## Loop

`DRAFT → BUILD → SETTLE` — define the unit of work, execute task-by-task with per-task qualify, close the loop with a SUMMARY.

## Try it (headless, with the mock host)

```bash
mkdir /tmp/keel-demo && cd /tmp/keel-demo
npx @keel/core init --name=demo
npx @keel/core draft new 01-foundation 01 --title=Demo
# edit .keel/phases/01-foundation/01-01-DRAFT.md
npx @keel/core draft approve 01-foundation 01
npx @keel/core status                      # full phase context in one screen
npx @keel/core build task T1 --status=DONE
npx @keel/core settle run --auto                 # derive AC verdicts from task statuses
```

`settle run --auto` reads PROGRESS.json and derives each AC's verdict
the same way `keel status` does: all linked tasks DONE → pass, any
BLOCKED/NEEDS_CONTEXT → fail with `auto: <task> blocked`, anything still
PENDING → refuses with a clear error (`--force` settles anyway). Pass
explicit `--ac AC-1=fail:custom` to override the derivation for an
individual AC. The legacy `--ac`-only flow still works exactly as before.

`keel status` renders project, loop position, active draft, per-task
status, AC derivation (pass/blocked/pending), and the next-action hint.
`keel status --json` emits the same data as a single JSON document for
scripting.

## Use with Claude Code

```bash
cd your-project
npx @keel/core init --name=your-project
npx @keel/host-claude-code install
# Start a new Claude Code session; KEEL hooks are wired into .claude/settings.json
# and slash commands /keel-progress /keel-draft /keel-approve /keel-check /keel-build /keel-settle
# are available under .claude/commands/.
```

> Dogfooding a local checkout of KEEL before publishing? Build the
> workspace (`pnpm build`) then run
> `node packages/host-claude-code/bin/keel-host-claude-code.cjs install --local --settings .claude/settings.local.json`.
> `--local` writes absolute paths to the workspace builds instead of
> `npx`-style commands; pair it with `settings.local.json` so the
> machine-specific paths stay out of git.

## Codex support — archived

The `@keel/host-codex` package shipped in Phases 02 / 09 has been removed from main as of Phase 11 (DESIGN.md decision D9). The complete pre-removal state is preserved on the `keel-codex-archive` git tag; resurrection is a future v1.x/v2 phase.

## Host capabilities

Currently single-host: Claude Code only. The capabilities surface (hook coverage, blocking events, slash command support, etc.) is declared inline in `@keel/host-claude-code` as a plain typed constant. When a second host is added back, we'll re-evaluate whether a schema-validated abstraction is worth its complexity cost.

## Packages

- `@keel/core` — CLI + state engine + parsers + classifier + hook dispatcher
- `@keel/types` — Zod schemas + TS interfaces (host capabilities now a plain interface)
- `@keel/testkit` — fixture builder + MockHostAdapter for tests
- `@keel/host-claude-code` — Claude Code host adapter: hook installer + event mapping + slash command codegen

## License

MIT
