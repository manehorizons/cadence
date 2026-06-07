---
phase: 80-logger-foundation
id: 80-01
tier: standard
status: PENDING
---

# 80-01 — Structured logger foundation

## Objective

Add a zero-dependency, additive, default-off structured logger (`LogLevel`/`LogRecord`

## Acceptance Criteria

### AC-1: Log types live in cadence-types
Given the `cadence-types` package
When the logging module is added
Then `LogLevel` (`'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace'`) and a `LogRecord`

### AC-2: Pure formatters render records
Given a `LogRecord`
When `formatPretty(record)` or `formatJson(record)` is called
Then each returns a deterministic string for that record (JSON is valid parseable JSON; pretty

### AC-3: Level gating suppresses below-threshold records
Given a logger configured at level `warn`
When `.info(...)`, `.debug(...)`, `.trace(...)`, `.warn(...)`, and `.error(...)` are each called
Then only the `warn` and `error` records are emitted and the lower-severity calls emit nothing;

### AC-4: Child loggers bind seam context
Given a root logger
When `logger.child({ seam: 'gate' })` is created and used
Then every record it emits carries `seam: 'gate'` merged into its fields, without mutating the

### AC-5: Control precedence is env > config > default
Given various combinations of `config.logging.level` and the `CADENCE_LOG_LEVEL` env var
When the effective level is resolved
Then env wins over config wins over the `silent` default (env+config set → env value; config only

### AC-6: Logger never writes to stdout
Given any log level and any number of emitted records
When the logger writes
Then output goes only to **stderr** and stdout receives nothing — guarding the `cadence mcp

### AC-7: Config schema accepts the logging block
Given `CadenceConfigZ`
When a config includes `logging: { level, format }`
Then it validates; and when `logging` is omitted the config still validates (block is optional

## Tasks

### T1: Logging types in cadence-types
- files: `packages/types/src/logging.ts`, `packages/types/src/index.ts`, `packages/types/tests/logging.test.ts`
- action: Add `LogLevel` (`'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace'`) and a
  `LogRecord` type (`{ level, seam, msg, fields?, time }`). Export both from the package index.
  Pure data only — no I/O. Include an ordered `LOG_LEVELS`/severity map usable by the gate logic.
- verify: `pnpm --filter @manehorizons/cadence-types test`; types importable from package root.
- done: AC-1

### T2: Pure formatters in cadence-core
- files: `packages/core/src/logging/format.ts`, `packages/core/tests/logging/format.test.ts`
- action: `formatPretty(record): string` (single-line human readable) and `formatJson(record): string`
  (valid JSON). Deterministic, no side effects. Test feeds fixed records (fixed `time`) and asserts output.
- verify: `pnpm --filter @manehorizons/cadence-core test -- logging/format`; `JSON.parse(formatJson(r))` round-trips.
- done: AC-2

### T3: Logger runtime (gating, child, stderr-only)
- files: `packages/core/src/logging/logger.ts`, `packages/core/tests/logging/logger.test.ts`
- action: A logger with `.error/.warn/.info/.debug/.trace(msg, fields?)`, level gating against the
  configured level, `.child({ seam })` that merges bound context without mutating the parent, and a
  writer that emits formatted records to **stderr only**. Default level `silent` emits nothing.
  Inject the write sink + clock for testability (no real `Date.now()` coupling in tests).
- verify: tests assert below-threshold calls emit nothing, warn/error emit at level `warn`, child binds
  `seam`, and a stdout spy stays empty while a stderr spy receives output.
- done: AC-3, AC-4, AC-6

### T4: Effective level/format resolution (env > config > default)
- files: `packages/core/src/logging/resolve.ts`, `packages/core/tests/logging/resolve.test.ts`
  (+ wire into `logger.ts` construction)
- action: Pure `resolveLogLevel({ env, config })` and `resolveLogFormat({ env, config, isTTY })`:
  env (`CADENCE_LOG_LEVEL`/`CADENCE_LOG_FORMAT`) > config (`logging.level`/`logging.format`) >
  default (`silent`; format `pretty` on TTY else `json`). Invalid env values rejected/ignored safely.
- verify: table-driven test over env/config/tty combinations asserting the resolved value.
- done: AC-5

### T5: config.logging block in CadenceConfigZ
- files: `packages/types/src/config.ts`, `packages/types/tests/config.test.ts` (or existing config test)
- action: Add optional `logging: z.object({ level: <LogLevel enum>, format: z.enum(['pretty','json']) })`
  — fully optional with defaults so existing configs without the block still validate.
- verify: `pnpm --filter @manehorizons/cadence-types test`; config with and without `logging` both parse.
- done: AC-7

## Boundaries

- DO NOT migrate any existing `console.*` call-site, and DO NOT wire the logger into gates/dispatcher/
  verifier in this phase — that is phase 81. Foundation only.
- DO NOT alter any user-facing stdout output; golden fixtures (MCP prompts / slash commands) must stay
  byte-identical.
- DO NOT add a runtime dependency (no `pino`, no `debug`).
- Keep `cadence-types` pure: types + enums/severity map only, no I/O. All writing lives in `cadence-core`.
