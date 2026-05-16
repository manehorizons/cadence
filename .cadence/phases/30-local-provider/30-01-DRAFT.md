---
phase: 30-local-provider
id: 30-01
tier: complex
status: PENDING
---

# 30-01 — local LLM provider (Ollama/OpenAI-compatible)

## Objective

Add a third LLM-gate provider `local` (OpenAI-compatible `/v1/chat/completions`, e.g. Ollama) across all five gates, so the Phase 29.2 expensive-gate exercise can run at zero cloud spend.

## Context

Spec: `docs/superpowers/specs/2026-05-15-local-llm-provider-design.md`. Plan: `docs/superpowers/plans/2026-05-15-local-llm-provider.md` (authoritative task breakdown, reviewer-approved). Shared `localChatJSON` client + five `Local<Gate>Verifier` classes mirroring the Anthropic ones; defaults/presets stay `mock` so cadence's own loop is unaffected.

## Acceptance Criteria

### AC-1: localChatJSON parses model output
Given a local OpenAI-compatible endpoint returning clean or fence/prose-wrapped JSON
When `localChatJSON` is called with a Zod schema
Then it returns schema-valid data.

### AC-2: single repair retry
Given the model returns malformed/non-schema output
When `localChatJSON` runs
Then it performs exactly one repair retry; success returns data, a second failure throws a clear error naming base URL + model.

### AC-3: transport errors surface
Given a non-2xx response or a network reject
When `localChatJSON` runs
Then it throws an Error naming the base URL.

### AC-4: Local<Gate>Verifier result mapping + faithful early-return
Given each of the five gates with `provider:'local'`
When its `Local<Gate>Verifier.verify` runs
Then it maps model output into the gate's existing result type stamped `provider:'local'`, and short-circuits empty input with no network call iff its `Anthropic<Gate>Verifier` does (per-task has none — faithful mirror).

### AC-5: prompt/schema reuse
Given the five `Local<Gate>Verifier` classes
When implemented
Then each reuses its gate module's existing system prompt + Zod schema (no duplicated or re-authored prompt/schema).

### AC-6: factory selection + safe default
Given each `select<Gate>Verifier`
When `provider:'local'` with `CADENCE_LOCAL_BASE_URL`/model env present → returns the Local verifier; when env absent → returns mock with a stderr warning; defaults/presets remain `mock`.

## Tasks

### T1: provider enum gains `local`
- files: `packages/types/src/config.ts`, types config test
- action: widen 5 gate `provider` enums to include `'local'`; defaults/presets unchanged. (Plan Task 1.)
- verify: types config test green; `pnpm -C packages/types build`.
- done: AC-6

### T2: localChatJSON shared client
- files: `packages/core/src/verify/local-client.ts`, `packages/core/tests/verify/local-client.test.ts`
- action: implement per plan Task 2 (fetch POST, fence/prose-tolerant extract, Zod-validate, one repair retry, throw naming base URL/model; transport seam).
- verify: `pnpm -C packages/core test -- run verify/local-client` green (6 cases).
- done: AC-1, AC-2, AC-3

### T3: LocalVerifier (deep verifier, reference)
- files: `packages/core/src/verify/verifier.ts`, `packages/core/src/verify/anthropic-verifier.ts`, `packages/core/tests/verify/local-verifier.test.ts`
- action: per plan Task 3 — export SYSTEM_PROMPT/VerifierResponseSchema/formatUserMessage (cross-module; type-only cycle), add `LocalVerifier` reusing them, empty-ACs early-return.
- verify: `pnpm -C packages/core test -- run verify/local-verifier verify/anthropic` green.
- done: AC-4, AC-5

### T4: four remaining Local<Gate>Verifier classes
- files: `packages/core/src/verify/{code-review,per-task,plan-review,security-audit}.ts`, `packages/core/tests/verify/local-gates.test.ts`
- action: per plan Task 4 — same-module classes (no export), reuse each module's private prompt/schema, mirror each Anthropic sibling's early-return faithfully (per-task: none → no empty-input test; ~7 cases).
- verify: `pnpm -C packages/core test -- run verify` all green.
- done: AC-4, AC-5

### T5: factory local branches + override widen
- files: `packages/core/src/verify/{factory,code-review-factory,per-task-factory,plan-review-factory,security-audit-factory}.ts`, `packages/core/tests/verify/local-factories.test.ts`
- action: per plan Task 5 — widen `override?`; add uniform `local` branch (env base URL/model, warn+mock fallback).
- verify: `pnpm -C packages/core test -- run verify/local-factories` green; `pnpm -C packages/core build`.
- done: AC-6

### T6: docs + full suite
- files: `README.md`, `DESIGN.md`, `CHANGELOG.md`
- action: per plan Task 6 — document provider + env vars; DESIGN §10 entry; CHANGELOG Added; full `pnpm turbo run test` green.
- verify: full turbo suite green.
- done: AC-6

### T7: settle bookkeeping
- files: (none — loop/commit mechanics per plan Task 7)
- action: single feat commit (source+tests+docs), `settle run --auto`, settle commit; per the two-commit convention.
- verify: `progress` shows loop IDLE; feat+settle pair in log.
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

## Boundaries

- DO NOT change `defaultConfig` / presets — cadence's own loop stays `mock` (no live calls in CI).
- DO NOT add an npm dependency — Node 24 global `fetch` only.
- DO NOT re-author gate prompts/schemas — reuse the existing module symbols.
- DO NOT invent an empty-input early-return where the gate's `Anthropic<Gate>Verifier` lacks one (per-task).
- DO NOT flip the dogfood loop's committed config to `local`/`anthropic` — Phase 29.2 uses scratch/env config.
- DO NOT push — user-gated.
