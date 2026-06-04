---
phase: 58-mcp-server
id: 58-01
tier: complex
status: PENDING
---

# 58-01 — MCP server surface (cadence mcp serve)

## Objective

Add `cadence mcp serve` — a local **stdio** MCP server, in-process in `core`, that
exposes a curated read+write tool set so any MCP-capable host can drive the
DRAFT→BUILD→SETTLE loop without a bespoke adapter. A third surface on the single
engine; imperative loop only (ambient edit-time gates need host hooks).

## Acceptance Criteria

### AC-1: serve handshake + exact tool discovery
Given a repo with an initialized `.cadence/`
When an MCP client connects to `cadence mcp serve` over stdio and lists tools
Then the handshake completes and the advertised tools are **exactly** the curated set
(`cadence_progress`, `cadence_status`, `cadence_recommend`, `cadence_draft_new`,
`cadence_draft_check`, `cadence_draft_approve`, `cadence_build_task`,
`cadence_settle`, `cadence_spec_new`, `cadence_spec_approve`) — and excluded
commands (`init`, `config`, `doctor`, `install`, `handoff`, `resume`) are **not**
advertised.

### AC-2: read tools return structured loop state
Given an initialized repo with a known loop position
When the client calls `cadence_progress`, `cadence_status`, and `cadence_recommend`
Then each returns a structured result carrying the same data the corresponding CLI
command computes, and none mutates `.cadence/` state.

### AC-3: write tools drive the loop end-to-end
Given an idle initialized repo
When the client calls `cadence_draft_new` → `cadence_draft_check` →
`cadence_draft_approve` → `cadence_build_task` (status `DONE`) → `cadence_settle`
Then the loop advances IDLE→DRAFT→BUILD→SETTLE→IDLE with the same `.cadence/`
state writes (`state.json` + regenerated `STATE.md`, phase artifacts) a CLI run
would produce.

### AC-4: command-boundary gates fire over MCP
Given a draft that violates a structural-coherence rule
When the client calls `cadence_draft_check` (and, separately, `cadence_settle` on a
phase that fails a gate)
Then the tool result reports the gate failure exactly as the CLI command would —
the same command-boundary gate stack runs; it is not bypassed.

### AC-5: typed errors become MCP error results, not crashes
Given an **uninitialized** directory (no `.cadence/`)
When the client calls any write tool
Then the server returns an MCP error tool result (`isError: true`) whose message
carries the `NotInitializedError` reason plus remediation ("run `cadence init`
first"), and the server process stays up for subsequent calls.

### AC-6: `--repo` scopes the server to a target repo
Given two initialized repos A and B
When `cadence mcp serve --repo <A>` is launched from an unrelated cwd and a tool is called
Then all reads/writes target repo A's `.cadence/` (not the cwd, not B); with no
`--repo`, the server operates on its launch cwd.

### AC-7: the MCP SDK is lazy-loaded off the CLI hot path
Given the `@modelcontextprotocol/sdk` dependency on `core`
When an ordinary CLI command runs (e.g. `cadence progress`)
Then the MCP SDK module is **not** loaded — it is imported only inside the
`mcp serve` action.

## Tasks

### T1: Extract service functions for the curated commands
- files: `packages/core/src/mcp/services/*.ts` (new), existing
  `packages/core/src/cli/commands/{progress,status,recommend,draft,build,settle,spec}.ts` (refactor)
- action: For each of the 10 exposed commands, factor the logic into a pure
  `async fn(repoRoot, args): Promise<Result>` returning structured data. Refactor
  the CLI actions to call the service fn then render (no behaviour change). Where a
  command already has an underlying function, wrap/expose it; only split where
  logic is currently print-coupled. Do not touch the other ~14 commands.
- verify: `pnpm --filter @manehorizons/cadence-core test` — existing CLI tests stay
  green; new unit tests per service fn (TDD: write the failing test first).
- done: AC-2, AC-3

### T2: MCP server + tool registry
- files: `packages/core/src/mcp/server.ts`, `packages/core/src/mcp/tools.ts` (new)
- action: Build the MCP `Server` (identity `cadence`, version from package.json).
  Define the 10-tool table: name, hand-written zod→JSON-Schema input, description
  (write tools note the ambient-gate caveat). Handlers call T1 service fns and
  serialize structured results; catch typed errors → `isError: true` results with
  remediation.
- verify: unit test the tool table (exact names, schemas present); error-mapping
  unit test.
- done: AC-1, AC-4, AC-5

### T3: `cadence mcp serve` command (lazy-loaded SDK)
- files: `packages/core/src/cli/commands/mcp.ts` (new),
  `packages/core/src/cli/register.ts` (add `registerMcpCommand`),
  `packages/core/package.json` (add `@modelcontextprotocol/sdk`)
- action: Register `mcp serve [--repo <path>]` (default cwd). **Lazy-import** the
  SDK + server module inside the action only. Wire `StdioServerTransport`, resolve
  `repoRoot` from `--repo`/cwd, pass to the server.
- verify: AC-7 test asserts the SDK module is absent from the loaded module set
  after a plain `progress` run; `--repo` resolution unit test.
- done: AC-6, AC-7

### T4: MCP integration tests (in-memory transport)
- files: `packages/core/tests/mcp/*.test.ts` (new)
- action: Connect an MCP client to the server over the SDK's in-memory transport
  against a `@manehorizons/cadence-testkit` ephemeral repo. Cover: handshake +
  exact tool list (AC-1), read tools no-mutation (AC-2), full write loop (AC-3),
  draft-check + settle gate failure (AC-4), uninitialized error mapping (AC-5),
  `--repo` scoping (AC-6). Deterministic, offline, mock verifier, no subprocess.
  Each AC referenced by its `AC-N` token in test text.
- verify: `pnpm --filter @manehorizons/cadence-core test`
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

### T5: DESIGN amendment, docs, changeset
- files: `DESIGN.md` (D5 annotation), `docs/<new>-mcp.md` (+ nav),
  `docs/reference/commands.md` (`cadence mcp serve` entry), `.changeset/<new>.md`
- action: Annotate D5 (MCP = supported third surface, imperative-only, not adapter
  pluralism). Write "Driving CADENCE over MCP" page (setup snippet, tool table,
  ambient-gate caveat). Add commands-reference entry. Changeset: **minor** on
  `core` (+ `types` if new shared types land).
- verify: `pnpm build` (docs portal if applicable), `pnpm lint`; manual read.
- done: (deliverables — not gated ACs per SPEC open-question default)

## Boundaries

- DO NOT modify the other ~14 CLI commands beyond the call-then-render split for
  the 10 curated ones.
- DO NOT touch the Claude-Code host adapter (`packages/host-claude-code/`).
- DO NOT add HTTP/SSE/remote transport, auth, or multi-tenancy.
- DO NOT change the state backend, the gate engine, or gate semantics — reuse them.
- DO NOT hand-roll state writes; use the existing atomic `state.json` + `STATE.md` path.
- Keep `@modelcontextprotocol/sdk` lazy-imported — never import it at CLI module load.
