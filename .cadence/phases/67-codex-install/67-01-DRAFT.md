---
phase: 67-codex-install
id: 67-01
tier: complex
profile: standard
status: PENDING
---

# 67-01 — cadence-host-codex install surface — hooks.json + global prompts + CLI

## Objective

Replace the phase-66 install stubs with the real Codex install surface: project
-level hook config (`.codex/hooks.json`), global slash-command prompts
(`$CODEX_HOME/prompts/*.md`, rendered in Codex's prompt-template format), a
`cadence-host-codex install` CLI + bin, and a loud "global prompts" warning. The
shim (`hook`) is phase 68.

## Acceptance Criteria

### AC-1: installHooks writes project-level Codex hook config
Given a project `root`
When `installHooks(root, opts)` runs
Then it writes `{root}/.codex/hooks.json` in Codex's schema
(`{ hooks: { EventName: [ { matcher?, hooks: [ { type:'command', command } ] } ] } }`)
with cadence-managed entries for SessionStart / UserPromptSubmit / PreToolUse
(matcher `^apply_patch$`) / PostToolUse (`^apply_patch$`) / Stop / SubagentStop,
merging non-cadence entries and replacing prior cadence-managed ones idempotently.

### AC-2: installCommands writes global Codex prompts in prompt-template format
Given the Codex home dir (default `$CODEX_HOME` ?? `~/.codex`, overridable)
When `installCommands(root, opts)` runs
Then it writes `<home>/prompts/cadence-*.md` files with YAML frontmatter
(`description`, optional `argument-hint`) and a prompt body that instructs running
the `cadence` CLI with `$ARGUMENTS` — NOT Claude's `!`-autorun form — and leaves
user-customized (un-managed-marker) files untouched.

### AC-3: install CLI + bin wires both, warns about global scope
Given `cadence-host-codex install`
When it runs
Then it calls installHooks + installCommands (each skippable via `--no-hooks` /
`--no-commands`), honors `--cwd` / `--cadence` / `--codex-home` / `--local`, and
always prints a warning that prompts install GLOBALLY to `~/.codex/prompts/`
(affecting every project), plus the existing `--local` machine-path warning.

### AC-4: --local embeds local workspace paths via locate-self
Given `--local`
When install runs
Then hooks.json + prompts reference absolute workspace build paths
(`node <core dist cli>`) resolved by `locate-self`, and the CLI warns they must
not be committed.

## Tasks

### T1: Write failing tests
- files: `packages/host-codex/tests/install.test.ts`, `packages/host-codex/tests/install-commands.test.ts`, `packages/host-codex/tests/locate-self.test.ts`, `packages/host-codex/tests/cli.test.ts`
- action: TDD via testkit ephemeral-repo fixtures. install.test (AC-1 hooks.json shape + idempotent re-install + non-cadence merge); install-commands.test (AC-2 prompt-template format, $ARGUMENTS, managed-marker preservation, codexHome override → temp dir, never writes real ~/.codex); locate-self + cli (AC-3 global warning, --no-* flags; AC-4 --local paths). Reference each `AC-N`.
- verify: `pnpm --filter @manehorizons/cadence-host-codex test` fails on the new suites.
- done: AC-1, AC-2, AC-3, AC-4

### T2: Implement locate-self + installHooks
- files: `packages/host-codex/src/locate-self.ts`, `packages/host-codex/src/install.ts`
- action: locate-self mirrors the Claude adapter (shimCli=cli.js, coreCli=core dist). installHooks builds the `.codex/hooks.json` entries with `_managedBy:'cadence'` tagging for idempotency; `apply_patch` matcher on Pre/PostToolUse.
- verify: AC-1 + AC-4 (hooks path) tests pass.
- done: AC-1, AC-4

### T3: Implement installCommands (Codex prompt-template render)
- files: `packages/host-codex/src/install-commands.ts`
- action: a Codex-local command catalog (same cadence slash commands) rendered as Codex prompts (frontmatter + body, `$ARGUMENTS`, managed marker; no `!`-autorun, no `allowed-tools`); write to `<codexHome>/prompts/`; default home `$CODEX_HOME ?? os.homedir()/.codex`; preserve user-customized files.
- verify: AC-2 + AC-4 (prompt paths) tests pass.
- done: AC-2, AC-4

### T4: Implement the install CLI + bin
- files: `packages/host-codex/src/cli.ts`, `packages/host-codex/bin/cadence-host-codex.cjs`, `packages/host-codex/package.json`
- action: commander `install` command wiring both functions with `--cwd/--cadence/--codex-home/--no-hooks/--no-commands/--local`; always emit the global-prompts warning; `--local` machine-path warning naming each surface. Add the `bin` entry to package.json. (No `hook` subcommand yet — phase 68.)
- verify: AC-3 + AC-4 tests pass; `node packages/host-codex/bin/cadence-host-codex.cjs install --help` works.
- done: AC-3, AC-4

### T5: Drop the stub language in index.ts
- files: `packages/host-codex/src/index.ts`
- action: update the doc comment now that install is real (still no shim); keep the `satisfies HostAdapter` assembly unchanged.
- verify: conformance test still green; `pnpm --filter @manehorizons/cadence-host-codex build`.
- done: AC-1, AC-2

## Boundaries

- DO NOT implement the `hook` shim / `routeHookEvent` — phase 68.
- DO NOT modify the Claude adapter, the contract, or core.
- DO NOT publish or bump versions — release is phase 69.
- DO NOT write into the real `~/.codex/` from any test — always use a temp
  `codexHome` override; tests that would touch `$HOME` must fail loudly instead.
- DO NOT commit machine-absolute (`--local`) output.
