---
phase: 04-host-capabilities
id: 04-01
tier: standard
status: PENDING
---

# 04-01 — Lift HostCapabilities into @keel/types + portability test

## Objective

Replace the three duplicated `HostCapabilities` interfaces (host-claude-
code, host-codex, testkit) with a single canonical type in `@keel/types`,
add a Zod schema to validate it, and assert every shipped adapter's
capabilities conform via a portability test.

## Acceptance Criteria

### AC-1: HostCapabilities defined once in @keel/types
Given the workspace
When a developer searches for `interface HostCapabilities`
Then it appears only in `packages/types/src/host.ts` and is re-exported
from `@keel/types`. No duplicate interface declarations remain in
adapters or testkit.

### AC-2: Zod schema validates the shape
Given `@keel/types`
When `HostCapabilitiesZ.safeParse(value)` runs on a well-formed adapter
capabilities object
Then it returns `success: true`. Mal-formed values (missing fields,
wrong union literal) return `success: false` with a useful issue list.

### AC-3: Adapters and testkit import the canonical type
Given `@keel/host-claude-code`, `@keel/host-codex`, and `@keel/testkit`
When they declare a `HostCapabilities` value or type
Then they import the interface from `@keel/types` rather than re-
defining it locally. Existing exports remain stable
(`claudeCodeCapabilities`, `codexCapabilities`, `MockHostAdapter.capabilities`).

### AC-4: Portability test asserts every adapter conforms
Given the test suite
When the portability test runs
Then it parses each shipped capabilities object (`claudeCodeCapabilities`,
`codexCapabilities`, and the testkit `MockHostAdapter` defaults) through
`HostCapabilitiesZ` and asserts success, plus host-specific assertions
(e.g. Codex must not list `subagent-result`).

### AC-5: No regression
Given the existing test suite
When all packages run their tests post-migration
Then every test still passes, build is green, lint is green.

## Tasks

### T1: define canonical HostCapabilities in @keel/types
- files: `packages/types/src/host.ts`, `packages/types/src/index.ts`,
  test `packages/types/tests/host.test.ts`
- action: TDD `HostCapabilitiesZ` zod schema + inferred `HostCapabilities`
  type. Fields: `hooks: AbstractEvent[]`, `slashCommands: boolean`,
  `skillSystem: 'native'|'prompted'|'none'`, `blockingHooks: AbstractEvent[]`,
  `subagentSpawn: 'native'|'shell-out'|'none'`, `streamingOutput: boolean`.
  Export both from `@keel/types`.
- verify: schema test covers a happy-path object plus three malformed
  variants (missing field, wrong literal, wrong array element).
- done: AC-1, AC-2

### T2: migrate @keel/host-claude-code
- files: `packages/host-claude-code/src/capabilities.ts`,
  `packages/host-claude-code/src/index.ts`
- action: delete the local `HostCapabilities` interface; import the type
  from `@keel/types`. Keep the value export `claudeCodeCapabilities`
  unchanged. Update the type re-export from `index.ts` to come from
  `@keel/types`.
- verify: `pnpm --filter @keel/host-claude-code test` and typecheck pass.
- done: AC-1, AC-3

### T3: migrate @keel/host-codex
- files: `packages/host-codex/src/capabilities.ts`,
  `packages/host-codex/src/index.ts`
- action: same as T2 for the Codex adapter.
- verify: `pnpm --filter @keel/host-codex test` and typecheck pass.
- done: AC-1, AC-3

### T4: migrate @keel/testkit MockHostAdapter
- files: `packages/testkit/src/mock-host.ts`,
  `packages/testkit/src/index.ts`
- action: delete the local `HostCapabilities` interface; import from
  `@keel/types`. `MockHostOptions.capabilities: Partial<HostCapabilities>`
  signature unchanged.
- verify: `pnpm --filter @keel/testkit test` (or upstream consumers)
  passes. Existing host-codex / host-claude-code shim-integration tests
  still green because testkit is in their dep graph.
- done: AC-1, AC-3

### T5: portability test
- files: `packages/testkit/tests/portability.test.ts` (testkit owns it
  to avoid `@keel/types` → adapter circular dep)
- action: import `claudeCodeCapabilities` from `@keel/host-claude-code`,
  `codexCapabilities` from `@keel/host-codex`, and a fresh MockHostAdapter
  default, then assert each one parses cleanly via
  `HostCapabilitiesZ.safeParse`. Add host-specific guards: Codex MUST
  NOT list `subagent-result`; Claude Code MUST list all 6 abstract
  events; both adapters MUST mark `pre-tool-edit` blocking.
- verify: test file passes; deliberately breaking either adapter's
  capabilities (e.g. removing a field) causes the portability test to
  fail (manual sanity check during development).
- done: AC-4

### T6: README + memory update
- files: `README.md`, memory `project_keel.md`
- action: add a short architecture note that `HostCapabilities` in
  `@keel/types` is the contract every new host adapter must satisfy, and
  that the portability test enforces it. Memory: close the architectural
  question.
- verify: README mentions the contract; memory's open-questions list
  removes the HostCapabilities entry.
- done: AC-5

## Boundaries

- DO NOT change the *shape* of `HostCapabilities` in this phase. The
  goal is to centralize the existing interface verbatim, not to
  redesign it.
- DO NOT introduce circular deps. If putting the portability test in
  `@keel/types` would require it to import adapters, host the test in
  `@keel/testkit` instead — testkit already depends on `@keel/types`.
- DO NOT touch core hook handlers or abstract event schema.
