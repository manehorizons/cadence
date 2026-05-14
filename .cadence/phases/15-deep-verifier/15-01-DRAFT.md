---
phase: 15-deep-verifier
id: 15-01
tier: standard
status: PENDING
---

# 15-01 — --deep independent verifier agent

## Objective

Land the second layer of the DESIGN.md Section 3.2 hybrid: an independent verifier that reads each AC's plain-English text alongside the relevant diff + test references and returns a per-AC pass/fail verdict with reasoning. Defaults to a deterministic mock provider so the gate is testable offline; an Anthropic provider plugs in via config + env var when network + API key are available.

## Acceptance Criteria

### AC-1: Verifier interface + mock provider
Given a typed `Verifier` interface with signature `verify(input: VerifyInput): Promise<VerifyResult>` where input carries `{ acs, diff, tests, files }` and result carries `{ verdicts: Record<AcId, { pass: boolean; reason: string }> }`
When the mock provider runs against any input
Then it returns a deterministic verdict per AC based on a transparent rule: `pass = true` if the AC has ≥1 linked test in `input.tests`, else `pass = false` with reason `"no linked test found"`. Mock provider has no I/O — pure function for testability.

### AC-2: Anthropic provider (opt-in)
Given `ANTHROPIC_API_KEY` is set in the environment AND `.cadence/config.json` `verifier.provider === 'anthropic'`
When the Anthropic provider runs
Then it sends a single prompt per `verify()` call containing the ACs + summarized diff + test ids; parses a JSON response into per-AC verdicts; reports the model used + token counts on stderr. Default model is `claude-sonnet-4-6`; overridable via `verifier.model`. Without the env var or with `provider === 'mock'`, the Anthropic code path is never reached.

### AC-3: settle `--deep` flag fires the verifier
Given `cadence settle run --auto --deep` runs in a phase
When the verifier completes
Then each AC's verdict is recorded in `SUMMARY.json` under a new `deepVerify` field (per-AC `{ pass, reason, provider, model? }`); ACs the verifier marks `pass=false` are recorded as `pass: false` in `acResults` with note `auto: deep-verify failed — <reason>`; settle exits 1 unless `--force` is passed. The flag is also auto-enabled when the effective gate set contains `'deep-verify'` (per the matrix, `standard × complex`).

### AC-4: explicit `--ac` overrides win over `--deep`
Given the user passes `--ac AC-1=pass:manual` alongside `--auto --deep`
When settle runs
Then the verifier still runs for visibility, its result is recorded in `SUMMARY.json deepVerify` for AC-1, but the explicit verdict (`pass: true, note: 'manual'`) wins in `acResults`. No false refusal on overridden ACs.

### AC-5: graceful failure modes
Given the configured provider fails (network error, API timeout, malformed JSON response, missing key when Anthropic is selected)
When settle attempts the verify call
Then stderr names the failure, settle refuses with exit 1, and no SUMMARY is written. `--allow-verifier-failure` flag bypasses (records the failure into `SUMMARY.json deepVerify` and treats as `pass=false` per-AC with a clear reason).

### AC-6: full suite green, dogfood proof
Given Phase 15 is complete
When `pnpm turbo run test` runs across the workspace
Then all tests pass at the new count (~267 → ~290+). The mock provider is exercised in `settle-deep.test.ts`; Phase 15's own settle uses the mock (no API key required in CI) and records `deepVerify` entries for AC-1..AC-6.

## Tasks

### T1: Verifier interface + mock provider + tests
- files: `packages/core/src/verify/verifier.ts` (new), `packages/core/src/verify/mock-verifier.ts` (new), `packages/core/tests/verify/mock-verifier.test.ts` (new)
- action: Define `Verifier` interface + `VerifyInput` / `VerifyResult` types. Implement `MockVerifier` with the AC↔test-linkage rule from AC-1 (pure; reads `input.tests` only). Tests: covered AC → pass, uncovered AC → fail, mixed input, empty input.
- verify: vitest green; mock is fully deterministic + offline.
- done: AC-1

### T2: Anthropic provider (opt-in)
- files: `packages/core/src/verify/anthropic-verifier.ts` (new), `packages/core/tests/verify/anthropic-verifier.test.ts` (new), `packages/core/package.json` (deps)
- action: Add `@anthropic-ai/sdk` as a regular dep. Implement `AnthropicVerifier` that constructs a prompt (system message + user message with AC list + diff summary + test refs), calls `messages.create()`, parses the JSON response per AC, returns `VerifyResult`. Tests use the SDK's mock/fake transport (or a hand-rolled `fetch` fake) — no real network calls in CI. Cover: happy path, malformed JSON, network error, missing env var.
- verify: vitest green; no real API calls in the test run.
- done: AC-2, AC-5 (failure paths)

### T3: provider factory + config schema extension
- files: `packages/types/src/config.ts`, `packages/types/tests/config.test.ts`, `packages/core/src/verify/factory.ts` (new), `packages/core/tests/verify/factory.test.ts` (new)
- action: Extend `CadenceConfigZ` with `verifier: { provider: 'mock' | 'anthropic'; model?: string }` (default `{ provider: 'mock' }`). Implement `selectVerifier(config, env): Verifier` — returns mock when provider=mock or anthropic is requested without env API key (with stderr warning). Tests cover all four branches.
- verify: vitest green; defaults preserve offline behavior.
- done: AC-2, AC-5

### T4: settle `--deep` integration + SUMMARY field
- files: `packages/types/src/summary.ts`, `packages/core/src/cli/commands/settle.ts`, `packages/core/src/parse/summary-writer.ts`, `packages/core/tests/cli/settle-deep.test.ts` (new)
- action: Extend `SummaryZ` with optional `deepVerify?: Record<AcId, { pass: boolean; reason: string; provider: string; model?: string }>`. Wire `--deep` flag to `cadence settle run`. When flag is set OR `'deep-verify'` is in `gatesFor(tier, profile)`, build `VerifyInput` from the active phase (read DRAFT ACs, gather diff via `git diff HEAD~1..HEAD -- ${phase-touched-files}` or fall back to PROGRESS-tracked touchedFiles, collect tests via `scanTestCoverage`), invoke the selected verifier, record `deepVerify` per AC. Failed verdicts on non-overridden ACs trigger refusal unless `--force` or `--allow-verifier-failure`. Tests use MockVerifier; cover gate firing, refusal on fail, override interaction, `--allow-verifier-failure`.
- verify: vitest green; legacy settle paths unaffected when `--deep` is absent and `'deep-verify'` not in gate set.
- done: AC-3, AC-4, AC-5

### T5: docs + dogfood self-check
- files: `DESIGN.md`, `README.md`
- action: Update DESIGN.md Section 3.2 to mark `--deep` as shipped + reference the provider abstraction. Update Section 10 punchlist. README `## Verification` section gains a `### Deep verifier` subsection explaining: default mock, opt-in Anthropic via `ANTHROPIC_API_KEY` + config, prompt shape, failure handling. Dogfood: run `cadence settle run --auto --deep` against Phase 15's own SUMMARY (with mock provider) — every AC should pass because Phase 15's tests reference AC-1..AC-6 (the mock rule = `≥1 linked test → pass`).
- verify: visual read + dogfood settle is green.
- done: AC-3, AC-6

## Boundaries

- DO NOT implement `--interactive` here — that's Phase 16. This phase is solely about the agent path.
- DO NOT fire real Anthropic API calls in tests. The Anthropic provider tests must use a fake transport (or skip with `it.skip` if no key is configured); CI must run offline.
- DO NOT bake in OpenAI/Bedrock/etc. providers. The `Verifier` interface is extensible; new providers ship as future phases when needed.
- DO NOT implement token-budget caps or rate limiting in this phase. Defer to a later phase once we see real usage patterns. Track as F-item in DESIGN.md.
- DO NOT change the test-coverage gate from Phase 14. The deep verifier is an *additional* layer; the coverage floor still applies first.
- DO NOT auto-detect `ANTHROPIC_API_KEY` and silently switch the default provider to Anthropic. Provider selection is explicit via config — predictability over magic.
