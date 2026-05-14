# KEEL

**Keep Execution Aligned to Loop** — structured AI-assisted development.

KEEL is a host-agnostic plan/build/settle framework for AI-assisted development. It is inspired by GSD (Get Shit Done) and PAUL (Plan-Apply-Unify Loop) and is independently implemented in TypeScript.

> **Status:** Phase 1 (foundation) shipped — `@keel/core`, `@keel/types`, `@keel/testkit`. Phase 2 — both host adapters shipped: `@keel/host-claude-code` and `@keel/host-codex`.

## Loop

`DRAFT → BUILD → SETTLE` — define the unit of work, execute task-by-task with per-task qualify, close the loop with a SUMMARY.

## Try it (headless, with the mock host)

```bash
mkdir /tmp/keel-demo && cd /tmp/keel-demo
npx @keel/core init --name=demo
npx @keel/core draft new 01-foundation 01 --title=Demo
# edit .keel/phases/01-foundation/01-01-DRAFT.md
npx @keel/core draft approve 01-foundation 01
npx @keel/core build task T1 --status=DONE
npx @keel/core settle run --ac AC-1=pass
```

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

## Use with Codex CLI

```bash
cd your-project
npx @keel/core init --name=your-project
npx @keel/host-codex install
# Start a new Codex session; KEEL hooks are wired into .codex/hooks.json
# and Agent Skills $keel-progress / $keel-draft / $keel-approve / $keel-check /
# $keel-build / $keel-settle are available under .agents/skills/.
```

> Note: PreToolUse/PostToolUse hooks do not yet fire for `apply_patch`
> ([openai/codex#16732](https://github.com/openai/codex/issues/16732)). The
> adapter installs the matchers so it activates automatically once upstream
> lands the fix; SessionStart, UserPromptSubmit, and Stop hooks work today.
>
> The same `--local --settings .codex/hooks.local.json` flow works for
> Codex when dogfooding from a local checkout.

## Packages

- `@keel/core` — CLI + state engine + parsers + classifier + hook dispatcher
- `@keel/types` — Zod schemas + TS interfaces
- `@keel/testkit` — fixture builder + MockHostAdapter for tests
- `@keel/host-claude-code` — Claude Code host adapter: hook installer + event mapping + slash command codegen
- `@keel/host-codex` — Codex CLI host adapter: hook installer + apply_patch payload translation + Agent Skill codegen

## License

MIT
