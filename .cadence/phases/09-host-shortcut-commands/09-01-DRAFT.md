---
phase: 09-host-shortcut-commands
id: 09-01
tier: standard
status: PENDING
---

# 09-01 — expose done/block/needs-context in host codegen

## Objective

Surface the three shortcut verbs (`keel done`, `keel block`, `keel needs-context`) as slash commands in `@keel/host-claude-code` and as Agent Skills in `@keel/host-codex`, so AI hosts can record task outcomes without spelling `build task <id> --status=...`.

## Acceptance Criteria

### AC-1: Claude Code installs 9 slash commands
Given a fresh repo
When `installCommands(root)` from `@keel/host-claude-code` runs
Then `.claude/commands/` contains 9 files: the existing 6 plus `keel-done.md`, `keel-block.md`, `keel-needs-context.md`, each with the standard frontmatter, managed-by marker, and a `!keel <verb> $ARGUMENTS` body.

### AC-2: Codex installs 9 Agent Skills
Given a fresh repo
When `installCommands(root)` from `@keel/host-codex` runs
Then `.agents/skills/` contains 9 directories: the existing 6 plus `keel-done`, `keel-block`, `keel-needs-context`, each with a `SKILL.md` carrying name/description frontmatter, a `keel <verb> $ARGUMENTS` body, and the default `agents/openai.yaml` disabling implicit invocation.

### AC-3: idempotency + user-override semantics unchanged
Given pre-existing user customizations (no managed marker)
When `installCommands` re-runs
Then user files for the new verbs are preserved exactly like the existing six, and keel-managed files for the new verbs are overwritten on re-install.

### AC-4: description copy is verb-specific
Given the rendered slash command / SKILL.md
When the body and frontmatter are inspected
Then the description for each new verb names the verb (`done`/`block`/`needs-context`) and the status it records, so users can discover the right command from intent.

## Tasks

### T1: Claude Code — add 3 COMMANDS entries
- files: `packages/host-claude-code/src/install-commands.ts`
- action: Append 3 `CommandSpec` entries for `keel-done`, `keel-block`, `keel-needs-context`. Each uses `<verb> $ARGUMENTS` as the cli suffix, argument-hint `<task-id> [--notes=<n>]`, and a verb-specific description.
- verify: existing install-commands.test.ts continues to pass after asserting the new count of 9.
- done: AC-1, AC-4

### T2: Codex — add 3 SKILLS entries
- files: `packages/host-codex/src/install-commands.ts`
- action: Append 3 `SkillSpec` entries mirroring T1, with descriptions tuned for Codex intent matching (mention "mark task as done/blocked/needs context").
- verify: existing install-commands.test.ts continues to pass after asserting the new count.
- done: AC-2, AC-4

### T3: extend tests in both host packages
- files: `packages/host-claude-code/tests/install-commands.test.ts`, `packages/host-codex/tests/install-commands.test.ts`
- action: Bump the count assertions from 6 to 9. Add focused assertions for the 3 new entries: file/dir exists, body invokes the correct verb with `$ARGUMENTS`, description references the verb name, managed marker present, idempotency preserved for user-customized variants.
- verify: vitest green across both host packages.
- done: AC-1, AC-2, AC-3, AC-4

## Boundaries

- DO NOT touch core `recordTaskOutcome` or the CLI verb implementations — they shipped in phase 7 + 8.
- DO NOT add aliases (e.g. `keel-bl`, `keel-nc`) or argument validation in the slash bodies; just delegate to the CLI.
- DO NOT change `installHooks` or the capabilities files — slash/skill codegen only.
- DO NOT rename or reorder existing 6 entries.
