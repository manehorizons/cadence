---
phase: 25-plan-review
id: 25-01
tier: standard
status: PENDING
---

# 25-01 — plan-review verifier agent

## Objective

Wire a `PlanReviewVerifier` gate at `cadence draft approve`: when `'plan-review'` is in the effective gate set (strict×complex), holistically review the parsed DRAFT (objective + ACs + tasks) before the BUILD transition; `pass=false` refuses approve with exit 1 and no state change unless `--allow-plan-review-failure`.

## Acceptance Criteria

### AC-1: Verifier interface + mock + anthropic + factory
Given the codebase under `packages/core/src/verify/`
When the consumer imports from `verify/plan-review.ts`
Then it sees `PlanReviewVerifier` (`name`, `verify(input: PlanReviewInput): Promise<PlanReviewResult>`), `PlanReviewInput = { draft: Draft }`, `PlanReviewFinding = { severity: 'high'|'medium'|'low', message: string, suggestedEdit?: string }`, `PlanReviewResult = { pass: boolean, findings: PlanReviewFinding[], provider: string, model?: string }`, `MockPlanReviewVerifier`, `AnthropicPlanReviewVerifier`, and `selectPlanReviewVerifier(cfg, opts)` factory (mock fallback on missing API key with stderr warn)

### AC-2: Mock provider — deterministic completeness rule
Given `MockPlanReviewVerifier` with an input
When `draft.acceptanceCriteria.length >= 1` AND every AC has non-empty trimmed `given`/`when`/`then`
Then `pass: true` with empty findings; otherwise `pass: false` with one HIGH finding per defect (zero ACs -> `'plan has no acceptance criteria'`; per AC with a blank GWT field -> `'AC-N has empty <field>'`); deterministic, no other heuristics

### AC-3: Anthropic provider — holistic Zod-typed plan review
Given `AnthropicPlanReviewVerifier` and `ANTHROPIC_API_KEY`
When `verify()` runs
Then it calls `messages.parse` once with a `cache_control: 'ephemeral'` system prompt focused on plan review, Zod schema `{ pass: boolean, findings: { severity, message, suggestedEdit? }[] }`, default model `claude-sonnet-4-6`; null parsed_output throws; `Anthropic.APIError` re-thrown wrapped; provider+model stamped into result

### AC-4: Gate-aware draft approve wiring + refuse
Given `effectiveGateSet(...).gates.includes('plan-review')` is true
When the user runs `cadence draft approve <phase> <num>`
Then after the manual-approve gate and before the BUILD state transition, the verifier runs against the parsed draft; on `pass=false` the command exits 1 with stderr listing each finding (`plan-review: <severity> — <message>` plus a suggested-edit line when present) and a guidance line referencing `--allow-plan-review-failure`, and STATE is unchanged (loopPosition stays DRAFT); on `pass=true` approve proceeds silently; gate skipped when `'plan-review'` not in gateSet

### AC-5: `--allow-plan-review-failure` bypass
Given the gate produced `pass=false`
When the user re-runs with `--allow-plan-review-failure`
Then approve proceeds to BUILD, a stderr trace `plan-review: --allow-plan-review-failure set; proceeding past N finding(s)` is emitted, and the findings are still printed to stderr for visibility

## Tasks

### T1: PlanReviewVerifier + mock + anthropic + factory
- files: `packages/core/src/verify/plan-review.ts`, `packages/core/src/verify/plan-review-factory.ts`
- action: Define `PlanReviewVerifier`, `PlanReviewInput = { draft: Draft }`, `PlanReviewFinding = { severity: high|medium|low, message: string, suggestedEdit?: string }`, `PlanReviewResult = { pass: boolean, findings: PlanReviewFinding[], provider: string, model?: string }`. `MockPlanReviewVerifier` applies the AC-completeness rule (AC-2). `AnthropicPlanReviewVerifier` mirrors `AnthropicCodeReviewVerifier` shape: injected `client`, prompt-cached system prompt, Zod schema `{ pass, findings: { severity, message, suggestedEdit? }[] }`, default `claude-sonnet-4-6`, `DEFAULT_MAX_TOKENS = 4000`, formats the draft (objective + ACs + tasks + boundaries) into the user message. `selectPlanReviewVerifier` mirrors `selectCodeReviewVerifier` (mock fallback + stderr warn).
- verify: unit tests on mock (complete draft / zero ACs / AC with blank then) + anthropic (injected client returns canned result / null throws / API error wrapped) + factory branches.
- done: AC-1, AC-2, AC-3

### T2: Config schema bump — planReview provider
- files: `packages/types/src/config.ts`
- action: Add `planReview` object to `CadenceConfigZ` mirroring the `codeReview` block (`provider: enum(mock|anthropic).default(mock)`, optional `model`, `.default({ provider: mock })`) with a doc comment citing Phase 25.1 / strict×complex / `draft approve`. Add `planReview: { provider: mock as const }` to `defaultConfig`.
- verify: existing config tests stay green; `defaultConfig` typechecks.
- done: AC-1

### T3: draft.ts gate wiring + --allow-plan-review-failure
- files: `packages/core/src/cli/commands/draft.ts`
- action: On the `approve` subcommand add `.option('--allow-plan-review-failure', '...')`. After the Phase 24.1 manual-approve block and before the Phase 23.2 coherence-warn emission / state transition, gate-check `gateSet.gates.includes('plan-review')`. When fired call `selectPlanReviewVerifier(cfg).verify({ draft })`. On `pass===false` print each finding to stderr (`plan-review: <severity> — <message>` plus a suggested line when set). If not bypassed: emit guidance line referencing `--allow-plan-review-failure`, set `process.exitCode = 1`, return BEFORE any state mutation. If bypassed: stderr trace `plan-review: --allow-plan-review-failure set; proceeding past N finding(s)` and fall through. On `pass===true`: silent.
- verify: new tests/cli/draft-plan-review.test.ts.
- done: AC-4, AC-5

### T4: Tests
- files: `packages/core/tests/verify/plan-review.test.ts`, `packages/core/tests/cli/draft-plan-review.test.ts`
- action: Unit tests for `MockPlanReviewVerifier` (complete draft -> pass; zero ACs -> fail+finding; AC with empty then -> fail+finding) + `AnthropicPlanReviewVerifier` (injected client returns fail result; null parsed_output throws; `Anthropic.APIError` wrapped) + `selectPlanReviewVerifier` (default mock / anthropic w/ key / anthropic w/o key -> mock+warn). CLI integration via spawned-CLI + real git workdir + `initGitRepo` helper (mirror settle-code-review.test.ts), `{ timeout: 30_000 }` describe: strict profile + tier=complex DRAFT with at least 6 tasks; (a) blank-GWT AC draft -> `draft approve` refuses exit 1 with `plan-review:` stderr, loopPosition stays DRAFT; (b) `--allow-plan-review-failure` proceeds to BUILD with trace; (c) complete draft approves clean; (d) auto profile (gate not in set) skips entirely. Use `--no-approve` on (b)/(c)/(d) to keep the manual-approve gate out of the way (strict×complex carries `approve` too).
- verify: `pnpm --filter @cadence/core test` green.
- done: AC-1, AC-2, AC-3, AC-4, AC-5

### T5: Docs + punchlist tick
- files: `DESIGN.md`, `CHANGELOG.md`, `README.md`
- action: DESIGN §4.1 — note `plan-review` shipped Phase 25.1. DESIGN §10 punchlist — tick 25.1. CHANGELOG `[Unreleased]` Added entry (gate) + Changed entry (config schema bump). README — new "Plan-review verifier" subsection under Verification.
- verify: `pnpm turbo run typecheck test build` green.
- done: AC-1, AC-4

## Boundaries

- DO NOT widen `MockPlanReviewVerifier` past the AC-completeness rule — holistic judgment belongs to the Anthropic provider; mock is a deterministic floor.
- DO NOT run plan-review at `settle` — approve-time only (ROADMAP open Q resolved: approve-time gates BUILD entry).
- DO NOT add a `SummaryZ` field — no SUMMARY exists at approve time.
- DO NOT add an `AnomalyType` member — strict×complex carries no `anomaly-notify` gate, so emission would be dead code.
- DO NOT introduce real network calls in tests — the Anthropic provider test must use an injected mock `client`.
- DO NOT mutate STATE before the plan-review refuse check — a refused approve must leave `loopPosition=DRAFT`.
