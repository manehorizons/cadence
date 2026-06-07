---
phase: 75-mcp-resources
id: 75-01
tier: standard
status: PENDING
---

# 75-01 — MCP Resources (cadence:// read-on-demand)

## Objective

Add MCP **Resources** to the `cadence mcp serve` surface so a host can read `.cadence/`
artifacts as data under a `cadence://` URI scheme, read-on-demand (no subscriptions).

## Acceptance Criteria

### AC-1: List advertises the curated static resources
Given a `cadence mcp serve` server connected over the in-memory transport in an initialized repo
When the client calls `resources/list`
Then it receives the curated `cadence://` set — `cadence://state`, `cadence://state.json`,
`cadence://roadmap`, `cadence://project`, `cadence://recommendations` — each with the correct
`name` and `mimeType` (`text/markdown` or `application/json`).

### AC-2: Read round-trips each static resource
Given the connected server in a repo with populated `.cadence/` artifacts
When the client calls `resources/read` for each static `cadence://` URI
Then the returned contents equal the bytes the CLI reads for that artifact (STATE.md, state.json,
ROADMAP.md, PROJECT.md), and `cadence://recommendations` returns the `recommend --json` payload as
`application/json`.

### AC-3: Templated phase resources resolve
Given a repo with a phase that has a `*-DRAFT.md` and a `*-SUMMARY.md`
When the client calls `resources/templates/list` and then reads
`cadence://phase/{phase}/draft` and `cadence://phase/{phase}/summary`
Then the templates are advertised and each read returns the corresponding phase artifact's content.

### AC-4: Missing artifact degrades gracefully
Given a repo where a requested artifact does not exist (e.g. a phase with no SUMMARY yet)
When the client reads that resource
Then the call returns a clean MCP error result carrying a remediation message — the server does
not crash and continues serving subsequent requests.

### AC-5: No regression to the existing tool surface
Given the deepened server
When the client lists tools
Then the phase-58 curated tool set is still advertised unchanged, and the server now also declares
the `resources` capability.

## Tasks

### T1: Static resource table + readers
- files: `packages/core/src/mcp/resources.ts`
- action: Define `RESOURCES: ResourceDef[]` — `{ uri, name, mimeType, read(repoRoot): Promise<string> }`
  for `cadence://state` (STATE.md), `cadence://state.json` (state.json), `cadence://roadmap`
  (ROADMAP.md), `cadence://project` (PROJECT.md), and `cadence://recommendations` (calls
  `recommendService(repoRoot, {json:true})` via a buffered io, serializing its `data`). Readers
  throw a typed/clear error when the artifact is missing.
- verify: unit-level — each reader returns expected bytes against a testkit repo; missing file throws.
- done: AC-2

### T2: Templated phase resources
- files: `packages/core/src/mcp/resources.ts`
- action: Add `ResourceTemplate`-backed entries `cadence://phase/{phase}/draft` and
  `cadence://phase/{phase}/summary` resolving the phase's `*-DRAFT.md` / `*-SUMMARY.md`.
- verify: templated read resolves a real DRAFT/SUMMARY; unknown phase/artifact → graceful error.
- done: AC-3

### T3: Register resources on the server
- files: `packages/core/src/mcp/server.ts`
- action: In `buildCadenceMcpServer`, `server.registerResource(...)` for each static entry and
  `registerResource` with a `ResourceTemplate` for the templated ones. A read error becomes an
  MCP error result (mirror the tool try/catch), not a transport crash. Export `RESOURCE_URIS`.
- verify: in-memory client `resources/list` + `resources/templates/list` advertise the set;
  tools still advertised; `resources` capability declared.
- done: AC-1, AC-4, AC-5

### T4: Integration tests (in-memory transport, TDD)
- files: `packages/core/tests/mcp/resources.test.ts`
- action: Connect a client to the server over `InMemoryTransport` against a `cadence-testkit`
  ephemeral repo. Assert list (AC-1), per-URI read round-trips incl. recommendations JSON (AC-2),
  template list + read (AC-3), missing-artifact error result + server still serving (AC-4), and a
  tool-list no-regression check (AC-5). Each test references its `AC-N` token.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/mcp/resources.test.ts` green.
- done: AC-1, AC-2, AC-3, AC-4, AC-5

## Boundaries

- DO NOT add `resources/subscribe`, notifications, or any file-watching (read-on-demand only).
- DO NOT change the existing tool set or `tools.ts` (no-regression — AC-5).
- DO NOT re-derive artifact content; reuse the existing state backend + `recommendService`.
- DO NOT touch transport (stdio) or the SDK lazy-load.
- DO NOT change `.cadence/` live state, `cadence.cjs` mode, or unrelated files.
