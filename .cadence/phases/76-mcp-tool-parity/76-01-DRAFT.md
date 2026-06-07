---
phase: 76-mcp-tool-parity
id: 76-01
tier: standard
status: PENDING
---

# 76-01 — MCP tool parity (handoff/resume/recommendation/doctor)

## Objective

Widen the `cadence mcp serve` tool set with the proven-out excluded commands —

## Acceptance Criteria

### AC-1: The five new tools are advertised
Given a `cadence mcp serve` server in an initialized repo
When the client calls `tools/list`
Then it advertises the original phase-58 tools plus `cadence_handoff`, `cadence_resume`,

### AC-2: handoff writes a SESSION doc
Given the connected server
When the client calls `cadence_handoff` (optionally with a `label`)
Then a `.cadence/handoff/SESSION-*.md` is written and the tool result's `structuredContent`

### AC-3: resume replays the freshest handoff (read-only)
Given a repo that has a handoff doc
When the client calls `cadence_resume`
Then the result returns the replayed narrative and `structuredContent` carries `found: true`, the

### AC-4: recommendation add then promote round-trips
Given the connected server
When the client calls `cadence_recommendation_add` with a title/readiness and then
Then the recommendation is appended to the ledger and its status/readiness advance — observable via

### AC-5: doctor returns a structured health report
Given the connected server
When the client calls `cadence_doctor`
Then the result's `structuredContent` is the doctor report (`checks[]` + `ok`), and the report is

### AC-6: graceful failure
Given a tool invocation that fails (e.g. promoting an unknown recommendation id)
When the client calls it
Then the server returns an MCP error result carrying the message and keeps serving subsequent

## Tasks

### T1: Service adapters for handoff / resume / doctor
- files: `packages/core/src/services/handoff.ts`, `packages/core/src/services/resume.ts`, `packages/core/src/services/doctor.ts`
- action: Thin `*Service(repoRoot, args, io): Promise<CommandResult>` wrappers over `runHandoff`,
  `runResume`, `runDoctor`. Each writes a concise human line to `io` and returns
  `{ exitCode, data }` (data = the run result / report). handoff maps "already exists" to a
  non-zero exit; doctor exit = `report.ok ? 0 : 1`; resume is read-only.
- verify: unit calls against a testkit repo return expected `data` shape + exit code.
- done: AC-2, AC-3, AC-5

### T2: Service adapters for recommendation add / promote
- files: `packages/core/src/services/recommendation-add.ts`, `packages/core/src/services/recommendation-promote.ts`
- action: Wrap `addRecommendation` (build `AddRecommendationInput` from args; defaults priority
  `medium`, readiness `raw-idea`) and `runRecommendationPromotion` (status/readiness changes).
  Return `{ exitCode, data }`; a failed promotion (unknown id / illegal transition) → exitCode 1
  with the message on `io.err`.
- verify: add then promote against a testkit repo mutates the ledger as expected.
- done: AC-4

### T3: Register the five MCP tools
- files: `packages/core/src/mcp/tools.ts`
- action: Add `cadence_handoff`, `cadence_resume`, `cadence_recommendation_add`,
  `cadence_recommendation_promote`, `cadence_doctor` to `TOOLS`, each wired to its service with a
  hand-written zod inputSchema + description. No tool imports the MCP SDK.
- verify: `tools/list` advertises 15 tools; each routes to its service.
- done: AC-1

### T4: Integration tests (in-memory transport, TDD)
- files: `packages/core/tests/mcp/tool-parity.test.ts`
- action: Connect a client over `InMemoryTransport` to a `cadence-testkit` repo. Assert the tool
  list (AC-1), handoff write + duplicate→error (AC-2), resume structuredContent + read-only (AC-3),
  add→promote round-trip visible via the recommendations resource (AC-4), doctor report shape (AC-5),
  and a failing promotion → error result with server still serving (AC-6). Each test references its
  `AC-N` token.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/mcp/tool-parity.test.ts` green.
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

## Boundaries

- DO NOT refactor the existing CLI command actions (handoff/resume/doctor/recommendation) — no
  CLI-output regression; services are additive MCP adapters over shared core `run*` functions.
- DO NOT import the MCP SDK from any service or `tools.ts` entry (hot-path stays SDK-free).
- DO NOT duplicate core logic — call `runHandoff`/`runResume`/`runDoctor`/`addRecommendation`/
  `runRecommendationPromotion`.
- DO NOT change phase-58 tools, the phase-75 resources, transport, or `.cadence/` live state /
  `cadence.cjs` mode.
