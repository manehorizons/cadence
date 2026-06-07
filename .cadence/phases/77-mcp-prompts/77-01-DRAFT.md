---
phase: 77-mcp-prompts
id: 77-01
tier: standard
status: PENDING
---

# 77-01 — Shared guidance extraction + MCP Prompts

## Objective

Extract the canonical command-guidance prose + the `cadence-scout` dialogue into a shared module,

## Acceptance Criteria

### AC-1: Guidance is shared without changing the host slash commands
Given the guidance prose (descriptions, trailing steps, scout dialogue) moved into a shared module
When `cadence-host-claude-code install` renders its `.claude/commands/cadence-*.md` files
Then the rendered files are byte-identical to before the extraction (regression-guarded by a test).

### AC-2: Prompts are advertised
Given a `cadence mcp serve` server in an initialized repo
When the client calls `prompts/list`
Then it advertises `cadence_scout`, `cadence_next`, `cadence_draft`, and `cadence_settle`, and the

### AC-3: The scout prompt interpolates its topic
Given the connected server
When the client calls `prompts/get` for `cadence_scout` with a `topic` argument
Then the returned message text is the shared scout dialogue with the topic substituted for the

### AC-4: Workflow prompts return their guidance
Given the connected server
When the client calls `prompts/get` for `cadence_next`, `cadence_draft` (with phase/num), and
Then each returns a user-facing message built from the shared guidance (no MCP SDK imported by the

## Tasks

### T1: Shared guidance module in cadence-types
- files: `packages/types/src/guidance.ts`, `packages/types/src/index.ts`
- action: Add `SCOUT_DIALOGUE` (the exact multi-line scout body, `$ARGUMENTS` placeholder retained)
  and `COMMAND_GUIDANCE` (a record keyed by command name → `{ description, trailing? }`) holding the
  exact strings currently inline in host-claude-code's `install-commands.ts`. Export both from the
  types barrel. Pure data — no logic, no I/O, no MCP SDK.
- verify: types builds; constants exported.
- done: AC-1

### T2: Re-source host slash commands from the shared module
- files: `packages/host-claude-code/src/install-commands.ts`
- action: Replace the inline `description`/`trailing`/`body` string literals in the `COMMANDS`
  array with references to `COMMAND_GUIDANCE[...]` / `SCOUT_DIALOGUE`. Keep `cli`/`argumentHint`
  (host-specific) local. No change to `renderFile`.
- verify: byte-identical parity test (T5) passes.
- done: AC-1

### T3: MCP prompts module
- files: `packages/core/src/mcp/prompts.ts`
- action: Define a prompt table and `registerPrompts(server, repoRoot)`. Prompts: `cadence_scout`
  (`topic` arg → `SCOUT_DIALOGUE` with `$ARGUMENTS` replaced), `cadence_next`, `cadence_draft`
  (`phase`,`num` args), `cadence_settle` — each returns a `GetPromptResult` message built from
  `COMMAND_GUIDANCE`. No loop mutation.
- verify: unit/integration prompt reads return expected text.
- done: AC-3, AC-4

### T4: Register prompts on the server
- files: `packages/core/src/mcp/server.ts`
- action: Call `registerPrompts(server, repoRoot)` in `buildCadenceMcpServer`; export `PROMPT_NAMES`.
- verify: `prompts/list` advertises the set; `prompts` capability declared.
- done: AC-2

### T5: Tests (parity + prompts, TDD)
- files: `packages/host-claude-code/tests/install-commands-parity.test.ts`,
  `packages/core/tests/mcp/prompts.test.ts`
- action: Parity test renders the command files (pre-extraction snapshot embedded as expected
  strings) and asserts byte-identical output (AC-1). Prompt tests via in-memory transport assert
  list (AC-2), scout topic interpolation (AC-3), and workflow prompt text (AC-4). Each AC referenced
  by its `AC-N` token.
- verify: `pnpm turbo run test` green for both packages.
- done: AC-1, AC-2, AC-3, AC-4

## Boundaries

- DO NOT change the rendered `.claude/commands/cadence-*.md` bytes — only the string *source*.
- DO NOT add a host→core dependency; the shared module lives in `cadence-types`.
- DO NOT import the MCP SDK from the shared guidance module.
- DO NOT change phase-58 tools, phase-75 resources, phase-76 parity tools, transport, or
  `.cadence/` live state / `cadence.cjs` mode.
