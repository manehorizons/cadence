# KEEL

**Keep Execution Aligned to Loop** — structured AI-assisted development.

KEEL is a host-agnostic plan/build/settle framework for AI-assisted development. It is inspired by GSD (Get Shit Done) and PAUL (Plan-Apply-Unify Loop) and is independently implemented in TypeScript.

> **Status:** Phase 1 (foundation) shipped — `@keel/core`, `@keel/types`, `@keel/testkit`. Phase 2 in progress — first host adapter `@keel/host-claude-code` shipped; Codex CLI adapter next.

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
# Start a new Claude Code session; KEEL hooks are now wired into .claude/settings.json
```

## Packages

- `@keel/core` — CLI + state engine + parsers + classifier + hook dispatcher
- `@keel/types` — Zod schemas + TS interfaces
- `@keel/testkit` — fixture builder + MockHostAdapter for tests
- `@keel/host-claude-code` — Claude Code host adapter: hook installer + event mapping

## License

MIT
