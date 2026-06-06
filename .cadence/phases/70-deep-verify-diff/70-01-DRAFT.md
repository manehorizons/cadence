---
phase: 70-deep-verify-diff
id: 70-01
tier: standard
status: PENDING
---

# 70-01 — deep-verify sees the diff: ctx.diff() memo + capDiff + deepVerifyMeta provenance

## Objective

Make the `deep-verify` gate send the real (capped) `git diff` to the AI verifier
instead of `diff: ''`, and record what the verifier actually saw — so "deep
verification" judges the implementation, not just test-linkage.

## Acceptance Criteria

### AC-1: deep-verify sends the real diff to the verifier
Given a phase settled with the `deep-verify` gate active and a non-empty working diff
When the gate builds its `VerifyInput`
Then `VerifyInput.diff` is populated from `git diff HEAD -- <touchedFiles>` (the
capped diff), not the empty string, and the verifier receives it.

### AC-2: an oversized diff is truncated with an honest marker
Given a raw diff larger than the configured `diffCapBytes`
When `capDiff(raw, capBytes)` runs
Then it returns the diff truncated to the cap with a literal trailing marker
`\n[diff truncated: <kept> of <original> bytes]`, and `{ truncated: true,
originalBytes: <original> }`; a diff at or under the cap passes through unchanged
with `truncated: false`.

### AC-3: diffCapBytes is a validated config field
Given `.cadence/config.json` with `verifier.diffCapBytes` set, absent, or invalid
When the config is loaded
Then the value parses as a positive integer defaulting to `262144` (256KB), and a
non-positive / non-integer value is rejected by the Zod schema.

### AC-4: deepVerifyMeta provenance is recorded on the summary
Given a completed `deep-verify` run
When the gate returns its `summaryPatch`
Then it includes a run-level `deepVerifyMeta` of shape `{ diffProvided: boolean,
diffBytes: number, truncated: boolean, filesCount: number, provider: string,
model?: string }` reflecting what the verifier was given.

## Tasks

### T1: capDiff pure helper
- files: `packages/core/src/verify/cap-diff.ts`, `packages/core/tests/verify/cap-diff.test.ts`
- action: Implement `capDiff(raw: string, capBytes: number): { diff: string; truncated: boolean; originalBytes: number }`. Byte-accurate (UTF-8) cap; append `\n[diff truncated: <kept> of <original> bytes]` when truncating; passthrough otherwise. Pure, no I/O.
- verify: `pnpm --filter @manehorizons/cadence-core test -- cap-diff` — passthrough, exact-boundary, over-cap marker + byte accounting (AC-2).
- done: AC-2

### T2: diffCapBytes config field
- files: `packages/types/src/config.ts`, `packages/types/tests/config.test.ts` (or existing config test)
- action: Add `diffCapBytes: z.number().int().positive().default(262144)` to the `verifier` object in `CadenceConfigZ`. Keep `exactOptionalPropertyTypes` discipline.
- verify: schema parses default when absent, accepts a positive int, rejects 0 / negative / non-integer (AC-3).
- done: AC-3

### T3: deepVerifyMeta type
- files: `packages/types/src/summary.ts` (alongside `DeepVerdict`), export through the package barrel as needed
- action: Add `DeepVerifyMeta` type `{ diffProvided: boolean; diffBytes: number; truncated: boolean; filesCount: number; provider: string; model?: string }` (Zod + inferred), and thread it onto the settle-summary shape as an optional run-level field.
- verify: type compiles; summary round-trips with and without the field (AC-4).
- done: AC-4

### T4: ctx.diff() memo on the gate context, shared with code-review
- files: `packages/core/src/gates/types.ts` (GateContext), `packages/core/src/services/settle.ts`
- action: Add a lazy `diff(): Promise<string>` memo to the gate context, mirroring the existing `coverage()` memo — runs `git diff HEAD -- <touchedFiles>` once (reuse `collectDiffForCodeReview`'s collection), memoized so a second caller gets the cached result. Route `code-review` through the same memo so git is invoked at most once per settle.
- verify: memo returns the diff and is computed once when both gates consult it (spy/transport counts a single invocation) (AC-1).
- done: AC-1

### T5: wire the capped diff into deep-verify + stamp deepVerifyMeta
- files: `packages/core/src/gates/deep-verify.ts`, `packages/core/tests/gates/deep-verify.test.ts`
- action: Replace `diff: ''` (line 28) with `capDiff(await ctx.diff(), ctx.config.verifier.diffCapBytes).diff`. Compute `deepVerifyMeta` from the cap result + `ctx.touchedFiles` + the verify result's provider/model, and include it in every `summaryPatch` (pass, refuse, and verifier-failure paths).
- verify: gate test asserts the (mock) verifier now receives a non-empty diff; truncation path passes a marked diff; `deepVerifyMeta` is stamped on pass and refuse. All offline via the mock verifier (AC-1, AC-4).
- done: AC-1, AC-4

## Boundaries

- DO NOT add Anthropic repair-retries / request timeouts, `local` auth headers, a
  CLI `--verifier` flag, or token/cost instrumentation — those are a later
  robustness milestone, explicitly out of scope.
- DO NOT modify the `mock` / `anthropic` / `local` provider implementations
  themselves; this is wiring + a pure helper + a config/type addition.
- DO NOT touch the mock-fallback banner — that is phase 71.
- Tests MUST stay offline/deterministic: use the `mock` verifier and injected
  diffs; never call `anthropic` or `local`.
- `per-task` verifier empty-diff blind spot: only fold in here if it reuses
  `ctx.diff()` trivially; otherwise leave a note for a follow-up phase.
