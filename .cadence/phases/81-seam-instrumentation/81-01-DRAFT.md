---
phase: 81-seam-instrumentation
id: 81-01
tier: standard
status: PENDING
---

# 81-01 — Instrument gate/hook/verify seams

## Objective

Wire the phase-80 logger into the three success-criteria seams — settle gate decisions,

## Acceptance Criteria

### AC-1: Gate decisions are observable
Given a settle run at log level `debug`
When `runSettleGates` walks the gate order
Then it emits one `seam: 'gate'` record per gate covering skipped (not in set), ran-with-outcome

### AC-2: Hook/event dispatch is observable
Given the `HookDispatcher` at log level `debug`
When an abstract event is dispatched
Then it emits a `seam: 'hook'` record naming the routed event (`{ event }`), and emits nothing at

### AC-3: Verifier provider calls are observable
Given the `anthropic` and `local` verifier providers at log level `debug`
When a verification request is made
Then each emits `seam: 'verify'` records for the request and its result (including token usage

### AC-4: config.logging takes effect at the entrypoints
Given `config.logging.level` set to a non-silent level and no `CADENCE_LOG_LEVEL` env override
When a CLI command, a hook dispatch, or the MCP server runs
Then the process logger is configured from `config.logging` (level + format) so seam records are

### AC-5: Seams never write to stdout
Given any seam emitting at any level
When records are written
Then they go only to stderr; stdout carries only the command's normal output, leaving golden

### AC-6: Default-off preserves existing behavior
Given the default `silent` level (no env/config)
When the full test suite and existing fixtures run
Then no seam emits anything and every existing test passes unchanged — instrumentation is purely

## Tasks

### T1: configureLoggerFromConfig helper
- files: `packages/core/src/logging/logger.ts`, `packages/core/tests/logging/logger.test.ts`
- action: Add `configureLoggerFromConfig(config)` that builds a logger with `configLevel`/
  `configFormat` from `config.logging` and installs it via `setLogger` (env still overrides through
  `createLogger`). Returns the logger.
- verify: test — config level `debug` + no env → emits; `CADENCE_LOG_LEVEL=silent` env over config
  `debug` → silent.
- done: AC-4

### T2: Instrument the gate seam
- files: `packages/core/src/gates/registry.ts`, `packages/core/tests/gates/registry-logging.test.ts`
- action: In `runSettleGates`, take `getLogger().child({ seam: 'gate' })` and emit `debug` on
  skip (`{ gate }`) and on pass (`{ gate, outcome }`), `warn` on the refusing gate (`{ gate }`).
  No change to verdict/merge/halt logic.
- verify: drive `runSettleGates` with a stub registry (pass + refuse + skipped) and a capturing
  logger via `setLogger`; assert the `seam:'gate'` records; assert nothing at `silent`.
- done: AC-1

### T3: Instrument the hook seam + wire config
- files: `packages/core/src/hooks/dispatcher.ts`, `packages/core/tests/hooks/dispatcher-logging.test.ts`
- action: After `loadConfig`, call `configureLoggerFromConfig(config)`, then
  `getLogger().child({ seam: 'hook' }).debug('dispatch', { event })` before routing. Routing
  unchanged.
- verify: dispatch an event with a capturing logger + a config at `debug`; assert a `seam:'hook'`
  record naming the event; nothing at `silent`.
- done: AC-2, AC-4

### T4: Instrument the verify seam (anthropic + local)
- files: `packages/core/src/verify/anthropic-verifier.ts`, `packages/core/src/verify/local-client.ts`,
  `packages/core/tests/verify/verify-logging.test.ts`
- action: `getLogger().child({ seam: 'verify', provider, model? })`; emit `debug` for request and
  for result (verdict count + token usage when present), `warn` in the error path before the throw.
  NEVER log auth headers / API keys. Results/verdicts unchanged.
- verify: anthropic verifier with an injected fake client (success + APIError) and local client with
  a fake `transport` (ok+usage, then a non-ok / throw); assert `seam:'verify'` request/result/error
  records and that no header/key value appears; nothing at `silent`.
- done: AC-3

### T5: Wire config at MCP serve + verify stdout purity / default-off
- files: `packages/core/src/cli/commands/mcp.ts` (configure logger before connect),
  `packages/core/tests/logging/seam-stdout-purity.test.ts`
- action: Best-effort `configureLoggerFromConfig(loadConfig(repoRoot))` before `server.connect`
  (stderr-only already guaranteed by the logger). Add a regression test asserting that with a
  capturing setup, seam emission never touches stdout, and a guard that the default `silent` run of
  an instrumented seam produces zero records.
- verify: `pnpm --filter @manehorizons/cadence-core test -- logging verify gates hooks`; full
  `pnpm turbo run lint typecheck test build` green (AC-5, AC-6 — fixtures byte-identical).
- done: AC-5, AC-6

## Boundaries

- DO NOT change gate verdict logic, dispatch routing, or verifier results — add logging only.
- DO NOT migrate `cli/commands/hook.ts`'s `console.log(result.contextPayload)` — it is the
  user-facing context-payload contract and must stay on stdout.
- DO NOT log secret material (verifier auth headers, API keys, webhook URLs).
- Keep stderr-only + default-off; no new runtime dependency; `cadence-types` stays pure.
