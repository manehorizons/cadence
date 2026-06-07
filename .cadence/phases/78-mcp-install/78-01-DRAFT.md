---
phase: 78-mcp-install
id: 78-01
tier: standard
status: PENDING
---

# 78-01 — cadence mcp install (zero-config .mcp.json)

## Objective

Add `cadence mcp install [--print] [--client <c>]` so wiring the MCP server into a host is

## Acceptance Criteria

### AC-1: Default writes/merges project .mcp.json
Given a repo with no `.mcp.json`
When the user runs `cadence mcp install`
Then a `.mcp.json` is created with `mcpServers.cadence = { command: "cadence", args: ["mcp","serve"] }`,

### AC-2: Merge is non-destructive and idempotent
Given a `.mcp.json` that already defines other `mcpServers`
When the user runs `cadence mcp install` (twice)
Then the existing servers are preserved, only the `cadence` key is added/updated, and a second run

### AC-3: Malformed config aborts without writing
Given a `.mcp.json` that is not valid JSON (or not a JSON object)
When the user runs `cadence mcp install`
Then the command exits non-zero with an actionable message and does NOT overwrite the file.

### AC-4: --print writes nothing
Given any repo
When the user runs `cadence mcp install --print` (or `--client claude-desktop`/`cursor`)
Then the paste-ready snippet is written to stdout, no file is created/modified, and a path hint for

## Tasks

### T1: Pure merge/snippet helpers
- files: `packages/core/src/mcp/install.ts`
- action: `CADENCE_MCP_ENTRY` constant; `mergeMcpConfig(existing: string | null): string` (parse,
  validate object, preserve unknown keys + existing mcpServers, set/overwrite `cadence`, emit
  2-space JSON + trailing newline; throw on malformed/non-object); `mcpSnippet()` and
  `clientHint(client)` for the print path. No MCP SDK, no fs in the pure helpers.
- verify: unit tests — create-from-empty, merge-preserves-others, idempotent, malformed throws.
- done: AC-2

### T2: Install service (file I/O)
- files: `packages/core/src/mcp/install.ts`
- action: `installMcpConfig(repoRoot, opts: { print?, client? }, io): Promise<CommandResult>` —
  on print/non-claude-code client, write the snippet + hint to io (no file). Otherwise read
  `.mcp.json` (if any), `mergeMcpConfig`, write it, report created/updated path. Malformed file →
  exitCode 1, no write.
- verify: against a testkit repo — created, merged, idempotent, --print writes nothing, malformed aborts.
- done: AC-1, AC-3, AC-4

### T3: Register `cadence mcp install`
- files: `packages/core/src/cli/commands/mcp.ts`
- action: Add the `install` subcommand with `--print` and `--client <claude-code|claude-desktop|cursor>`
  (default claude-code) → calls `installMcpConfig` with `processIO()`. Top-level import must not pull
  the MCP SDK (install.ts is SDK-free; serve keeps its lazy import).
- verify: `cadence mcp install --print` prints snippet; default writes `.mcp.json`.
- done: AC-1, AC-4

### T4: Tests (TDD)
- files: `packages/core/tests/mcp/install.test.ts`
- action: Unit tests for `mergeMcpConfig`/`mcpSnippet`; install service tests against a
  `cadence-testkit` repo (AC-1 create, AC-2 merge+idempotent, AC-3 malformed aborts, AC-4 --print
  no-write). Each AC referenced by its `AC-N` token.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/mcp/install.test.ts` green.
- done: AC-1, AC-2, AC-3, AC-4

## Boundaries

- DO NOT load `@modelcontextprotocol/sdk` from the `mcp install` path (only `mcp serve` lazy-loads it).
- DO NOT write any host's native config except Claude Code's `.mcp.json`; others are `--print`.
- DO NOT clobber a malformed `.mcp.json` or drop unknown top-level keys / other mcpServers.
- DO NOT change phase 75/76/77 surfaces, transport, or `.cadence/` live state / `cadence.cjs` mode.
