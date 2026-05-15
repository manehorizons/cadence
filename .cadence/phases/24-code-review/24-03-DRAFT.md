---
phase: 24-code-review
id: 24-03
tier: standard
status: PENDING
---

# 24-03 — Code-review verifier agent

## Objective

Wire a `CodeReviewVerifier` gate at `cadence settle run`: when `'code-review'` is in the effective gate set (strict×standard, strict×complex, standard×complex), review the phase diff per-file and record `Finding[]` keyed by path into `SUMMARY.codeReview`; HIGH-severity findings refuse settle unless `--force` / `--allow-code-review-failure` and emit a new `code-review-high` anomaly per finding.

## Acceptance Criteria

### AC-1: Verifier interface + mock + anthropic + factory
Given the codebase under `packages/core/src/verify/`
When the consumer imports `CodeReviewVerifier` from `verify/code-review.ts`
Then it sees `CodeReviewVerifier` (`name`, `verify(input: CodeReviewInput): Promise<CodeReviewResult>`), `Finding = { severity: 'high'|'medium'|'low', message: string, line?: number }`, `MockCodeReviewVerifier`, `AnthropicCodeReviewVerifier`, and `selectCodeReviewVerifier(cfg, opts)` factory (mock fallback on missing API key)

### AC-2: Mock provider — deterministic heuristic
Given `MockCodeReviewVerifier` with an input
When the diff contains `+` lines with `console.log(` against any file
Then that file's findings include one `{ severity: 'high', message: 'console.log left in source' }` per matching line; empty diff or no matches → empty findings (pass); other regex-free heuristics stay out of scope (deterministic floor only)

### AC-3: Anthropic provider — per-file Zod-typed review
Given `AnthropicCodeReviewVerifier` and `ANTHROPIC_API_KEY`
When `verify()` runs
Then it calls `messages.parse` once with a `cache_control: 'ephemeral'` system prompt focused on code review, Zod schema `{ findings: { file, severity, message, line? }[] }`, default model `claude-sonnet-4-6`; null parsed_output throws; API errors throw; provider+model stamped into result

### AC-4: Gate-aware settle wiring + HIGH refuse
Given `effectiveGateSet(...).gates.includes('code-review')` is true
When the user runs `cadence settle run --auto`
Then the verifier runs against `git diff HEAD` for the touched files; on any HIGH finding (across any file), the command exits 1 with stderr listing each HIGH (`code-review: <file>:<line>? high — <message>`) and a guidance line referencing both bypass flags; on zero HIGH findings, settle proceeds; gate skipped when `'code-review'` ∉ gateSet

### AC-5: `--allow-code-review-failure` + `--force` bypass
Given the gate produced HIGH findings
When the user re-runs with `--allow-code-review-failure` OR `--force`
Then settle proceeds, SUMMARY.codeReview records all findings unchanged, a stderr trace `code-review: --allow-code-review-failure set; proceeding past N HIGH finding(s)` (or the `--force` variant) is emitted, and the anomaly path still fires for each HIGH (AC-6)

### AC-6: `code-review-high` anomaly + SUMMARY shape
Given HIGH findings present (bypassed or refused) and `'anomaly-notify'` in the gate set
When the gate runs
Then exactly one `code-review-high` anomaly per HIGH finding dispatches via `selectNotifier(cfg)` with `severity: 'error'`, `context: { file, line?, message, provider, bypassed }`; `AnomalyTypeZ` schema bump (new member); SUMMARY.codeReview shape is `Record<file, Finding[]>` and persists for `pass` / `concerns` / refused-bypassed alike

## Tasks

### T1: CodeReviewVerifier + mock + anthropic + factory
- files: `packages/core/src/verify/code-review.ts`, `packages/core/src/verify/code-review-factory.ts`
- action: Define `CodeReviewVerifier`, `CodeReviewInput = { files: string[], diff: string }`, `Finding`, `CodeReviewResult = { findings: Record<file, Finding[]>, provider, model? }`. `MockCodeReviewVerifier` scans `diff` for `^\+.*console\.log\(` lines, attributes by parsing the `+++ b/<file>` header, returns one HIGH finding per match. `AnthropicCodeReviewVerifier` mirrors AnthropicVerifier shape with code-review system prompt and Zod `{ findings: array of { file, severity, message, line? } }` schema. `selectCodeReviewVerifier` mirrors `selectVerifier` (mock fallback with stderr warn).
- verify: unit tests on mock (no diff / console.log present / multi-file diff) + anthropic (injected client returning canned findings).
- done: AC-1, AC-2, AC-3

### T2: Schema bumps — config + AnomalyType + Summary
- files: `packages/types/src/config.ts`, `packages/types/src/anomaly.ts`, `packages/types/src/summary.ts`
- action: Add `codeReview: { provider: 'mock'|'anthropic'; model?: string }.default({ provider: 'mock' })` to `CadenceConfigZ`. Extend `AnomalyTypeZ` with `'code-review-high'`. Add `codeReview?: Record<string, Finding[]>` to `SummaryZ` (with `FindingZ = { severity: enum, message: string, line?: number }`). Update `defaultConfig`.
- verify: existing config + anomaly + summary tests stay green.
- done: AC-1, AC-6

### T3: settle.ts gate wiring + anomaly emission + SUMMARY
- files: `packages/core/src/cli/commands/settle.ts`, `packages/core/src/notify/code-review.ts`
- action: After deep-verify and before anomaly-notify section, gate-check `gateSet.gates.includes('code-review')`. When fired: gather `files = unique(draft.tasks.flatMap(t => t.files))`, `diff = execSync('git diff --no-color HEAD -- <files>')`, call `selectCodeReviewVerifier(cfg).verify(input)`, count HIGH findings. On HIGH > 0 AND neither `--force` nor `--allow-code-review-failure`: stderr per HIGH + guidance line + exit 1. On HIGH > 0 WITH bypass: stderr trace + emit one `code-review-high` anomaly per HIGH (gated on `'anomaly-notify'`). On HIGH === 0: silent. Always attach `codeReview` to the SUMMARY when the gate ran. New `notify/code-review.ts` exposes `emitCodeReviewHigh(notifier, findings, ctx)` helper for clean separation.
- verify: new tests/cli/settle-code-review.test.ts.
- done: AC-4, AC-5, AC-6

### T4: Tests
- files: `packages/core/tests/verify/code-review.test.ts`, `packages/core/tests/cli/settle-code-review.test.ts`
- action: Unit tests for `MockCodeReviewVerifier` (no findings / console.log-in-diff / multi-file diff attribution) + `AnthropicCodeReviewVerifier` (injected client returns canned findings / null throws / API error propagates / factory selection branches). CLI integration test via spawned-CLI + real git workdir (mirrors build-per-task.test.ts): strict profile, draft new + approve --no-approve + done T1 + write file with console.log + git add, then `settle run --auto --allow-missing-coverage` and assert (a) refuses with HIGH listed; (b) `--allow-code-review-failure` proceeds + SUMMARY.codeReview populated; (c) clean diff settles; (d) auto profile (gate not in set) skips.
- verify: `pnpm --filter @cadence/core test` green.
- done: AC-1..AC-6

### T5: Docs + punchlist tick
- files: `DESIGN.md`, `CHANGELOG.md`, `README.md`
- action: DESIGN §4.1 — note `code-review` shipped Phase 24.3. DESIGN §3.3 anomaly table — add `code-review-high` row. DESIGN §10 punchlist — tick 24.3. CHANGELOG `[Unreleased]` Added + Changed entries (schema bump). README — new "Code-review verifier" subsection under Verification.
- verify: `pnpm turbo run typecheck test build` green.
- done: AC-1, AC-6

## Boundaries

- DO NOT widen `MockCodeReviewVerifier` heuristics past `console.log` — production findings belong to the Anthropic provider; mock is a deterministic floor.
- DO NOT compute diff via JS implementations of git — shell out via `execSync` matching Phase 24.2.
- DO NOT block on MEDIUM/LOW findings — only HIGH gates the settle.
- DO NOT introduce real network calls in tests — Anthropic provider tests must use an injected mock `client`.
- DO NOT couple `code-review-high` emission to the per-task verifier — they are independent gates with independent anomaly types.
