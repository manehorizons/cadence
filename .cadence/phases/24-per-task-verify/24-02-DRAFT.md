---
phase: 24-per-task-verify
id: 24-02
tier: standard
status: PENDING
---

# 24-02 — Per-task verifier agent

## Objective

Wire a `PerTaskVerifier` gate at `cadence build task <id> --status=DONE`: when `'per-task-verify'` is in the effective gate set (strict×standard, strict×complex), run a verifier on the task's files+diff and record a `pass | concerns | refuse` verdict; `refuse` blocks the DONE recording, all verdicts persist into PROGRESS.json, and `refuse` emits a new `per-task-fail` anomaly.

## Acceptance Criteria

### AC-1: Verifier interface (Phase 15 shape)
Given the codebase under `packages/core/src/verify/`
When the consumer imports `PerTaskVerifier` from `verify/per-task.ts`
Then it sees an interface with `readonly name: string` and `verify(input: PerTaskInput): Promise<PerTaskResult>`, plus exported `PerTaskInput = { taskId, files, diff }` and `PerTaskResult = { verdict: 'pass'|'concerns'|'refuse', reason: string, provider: string, model?: string }`

### AC-2: Mock provider — deterministic floor
Given `MockPerTaskVerifier` instance and an input
When `files.length > 0 AND diff.trim().length > 0`
Then verdict is `'pass'` with reason `mock: <N> file(s), <M> diff bytes`; when `files` empty → `'refuse'` with reason `mock: no files touched`; when `diff` empty → `'concerns'` with reason `mock: no diff since last task`

### AC-3: Anthropic provider — LLM with cached system prompt
Given `AnthropicPerTaskVerifier` and `ANTHROPIC_API_KEY` set
When `verify()` runs
Then it calls `messages.parse` with a `cache_control: 'ephemeral'` system prompt distinct from the Phase 15 `--deep` system prompt (focused on a single task's diff), a Zod-typed response schema `{ verdict, reason }`, default model `claude-sonnet-4-6`; transport errors throw, model verdict failures return as `'refuse'` or `'concerns'`

### AC-4: Gate-aware wiring + DONE-only
Given `effectiveGateSet(...).gates.includes('per-task-verify')` is true
When the user runs `cadence build task T1 --status=DONE`
Then the verifier runs before `recordTaskOutcome`; when it returns `'refuse'`, the command exits 1 with stderr `per-task-verify refused: <reason>` and PROGRESS.json is NOT mutated; verdicts `pass` / `concerns` record the outcome AND attach a `perTaskVerify: { verdict, reason, provider, model? }` field on the task row in PROGRESS.json. For statuses other than `DONE` (BLOCKED, NEEDS_CONTEXT, DONE_WITH_CONCERNS) the gate is skipped (explicit human escalations).

### AC-5: `--allow-per-task-failure` bypass
Given the gate refused
When the user re-runs with `--allow-per-task-failure`
Then DONE is recorded anyway, the verdict still persists in PROGRESS.json with `bypassed: true`, and a stderr trace `per-task-verify: --allow-per-task-failure set; proceeding past refuse verdict` is emitted

### AC-6: `per-task-fail` anomaly (new AnomalyType + schema bump)
Given the gate emitted `'refuse'` (with or without bypass) and `'anomaly-notify'` is in the effective gate set
When the command runs
Then exactly one `per-task-fail` anomaly is dispatched via `selectNotifier(cfg)` with `severity: 'error'`, `context: { taskId, provider, reason, bypassed }`; `AnomalyTypeZ` schema grows the new member (breaking change — documented in CHANGELOG)

## Tasks

### T1: PerTaskVerifier + mock + anthropic + factory
- files: `packages/core/src/verify/per-task.ts`, `packages/core/src/verify/per-task-factory.ts`
- action: Add `PerTaskVerifier` interface, `PerTaskInput` / `PerTaskResult` types, `MockPerTaskVerifier` (deterministic rule per AC-2), `AnthropicPerTaskVerifier` (mirrors `AnthropicVerifier` shape, distinct single-task system prompt, Zod schema `{ verdict, reason }`), `selectPerTaskVerifier(config, opts)` (mirrors `selectVerifier` factory, falls back to mock on missing API key with stderr warn).
- verify: unit tests on the mock branches; AnthropicPerTaskVerifier covered by an injected mock `client` test.
- done: AC-1, AC-2, AC-3

### T2: Schema bumps — config + AnomalyType
- files: `packages/types/src/config.ts`, `packages/types/src/anomaly.ts`
- action: Add `perTaskVerifier: { provider: 'mock'|'anthropic'; model?: string }.default({ provider: 'mock' })` to `CadenceConfigZ`. Extend `AnomalyTypeZ` to include `'per-task-fail'`. Update `defaultConfig` literal.
- verify: existing config + anomaly tests stay green; new `defaultConfig.perTaskVerifier.provider === 'mock'` assertion.
- done: AC-1, AC-6

### T3: build.ts gate wiring + PROGRESS.json verdict field + anomaly
- files: `packages/core/src/cli/commands/build.ts`, `packages/core/src/build/record.ts`
- action: In `build task`, after status parsing and before `recordTaskOutcome`: load config + state + draft to derive `effectiveGateSet`; when status === 'DONE' AND `'per-task-verify'` ∈ gates, gather `{ taskId, files: <task.files from draft>, diff: <git diff --no-color HEAD -- <files>> }`, call `selectPerTaskVerifier(cfg).verify(input)`, branch on verdict. Extend `recordTaskOutcome` to accept an optional `perTaskVerify` payload that lands on `progress.tasks[id].perTaskVerify`. On `'refuse'` without `--allow-per-task-failure`: refuse exit 1 + emit anomaly + skip `recordTaskOutcome`. On `'refuse'` with bypass: stderr trace + emit anomaly + record with `bypassed: true`. On `'concerns'` / `'pass'`: record verdict, no anomaly.
- verify: build-per-task tests cover refuse/bypass/pass/concerns paths.
- done: AC-4, AC-5, AC-6

### T4: Tests
- files: `packages/core/tests/verify/per-task.test.ts`, `packages/core/tests/cli/build-per-task.test.ts`
- action: Unit tests for `MockPerTaskVerifier` (the three deterministic branches) + `AnthropicPerTaskVerifier` (injected client returns canned `parsed_output`). CLI integration test via spawned-CLI pattern (mirrors draft-approve-gate.test.ts): seed a strict-profile config, `draft new` + `draft approve --no-approve`, write a dummy file so `git diff` has content, `build task T1 --status=DONE` and assert: (a) gate refuses with mock-no-diff fixture; (b) `--allow-per-task-failure` records with `bypassed=true`; (c) non-DONE status skips gate; (d) auto profile (no gate) skips gate.
- verify: `pnpm --filter @cadence/core test` green.
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

### T5: Docs + punchlist tick
- files: `DESIGN.md`, `CHANGELOG.md`, `README.md`
- action: DESIGN §4.1 — note `per-task-verify` shipped Phase 24.2. DESIGN §3.3 anomaly table — add `per-task-fail` row. DESIGN §10 punchlist — tick Phase 24.2. CHANGELOG Unreleased — Added entry + schema-bump note for `AnomalyTypeZ`. README — new "Per-task verifier" subsection under Verification.
- verify: `pnpm turbo run typecheck test build` green.
- done: AC-1, AC-6

## Boundaries

- DO NOT change the Phase 15 `Verifier` interface — `PerTaskVerifier` is a sibling, not a refactor.
- DO NOT widen `--allow-per-task-failure` into a config knob — per-invocation only, mirrors `--allow-auto-complex` ergonomics.
- DO NOT compute diff via JS implementations of git — shell out to `git diff` via `execSync`.
- DO NOT block non-DONE statuses — explicit human escalations bypass the gate.
- DO NOT introduce real network calls in tests — Anthropic provider tests must use an injected mock `client`.
