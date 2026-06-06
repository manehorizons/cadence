---
phase: 72-provider-hardening
id: 72-01
tier: standard
status: PENDING
---

# 72-01 — Provider hardening: anthropic timeout+maxRetries, local auth headers

## Objective

Make the real verifier providers dependable in a settle gate: give `anthropic` a
configurable request timeout + retry budget, and let `local` send an
`Authorization`/custom headers so token-gated OpenAI-compatible endpoints work — all
config/env-driven, no live network in tests.

## Acceptance Criteria

### AC-1: anthropic timeout + maxRetries are configurable and reach the client
Given `verifier.timeoutMs` and `verifier.maxRetries` are set in `.cadence/config.json`
When an `AnthropicVerifier` is constructed without an injected client
Then those values are passed into the `Anthropic` client config (a pure
`buildAnthropicClientConfig(opts)` seam returns `{ apiKey, timeout, maxRetries }`),
and omitting them falls back to the SDK defaults — proven by a unit test on the seam,
not a live call.

### AC-2: the `local` provider sends auth + custom headers when configured
Given a local API key (`CADENCE_LOCAL_API_KEY`) and/or `verifier.localHeaders` are set
When `localChatJSON` issues its request
Then the outgoing `fetch` carries `Authorization: Bearer <key>` plus any custom headers
merged over the existing `content-type` — and when none are configured, only
`content-type` is sent (no empty/`Bearer undefined` header) — both proven via the
existing `transport` test seam.

### AC-3: the new config fields validate, default safely, and stay backward-compatible
Given an existing config with only the v1.14 `verifier` slice (`provider`,
`diffCapBytes`)
When it is parsed by the Zod `verifier` schema
Then it still validates unchanged; `timeoutMs` (positive int, optional) and
`maxRetries` (non-negative int, default preserving current SDK behavior) and
`localHeaders` (optional record) are accepted when present and absent otherwise — no
existing config breaks.

## Tasks

### T1: add the new config fields
- files: `packages/types/src/config.ts`
- action: extend the `verifier` Zod object with `timeoutMs` (`z.number().int().positive().optional()`),
  `maxRetries` (`z.number().int().nonnegative()` with a default matching today's SDK
  behavior), and `localHeaders` (`z.record(z.string(), z.string()).optional()`); keep
  the existing `.default(...)` backward-compatible.
- verify: Zod parse test — a v1.14-shaped config still validates; new fields accepted.
- done: AC-3

### T2: thread timeout+maxRetries into AnthropicVerifier
- files: `packages/core/src/verify/anthropic-verifier.ts`
- action: add `timeout?`/`maxRetries?` to `AnthropicVerifierOptions`; extract a pure
  `buildAnthropicClientConfig(opts)` returning `{ apiKey, timeout, maxRetries }` (omit
  keys when undefined so SDK defaults hold); use it in the non-injected branch.
- verify: unit test on `buildAnthropicClientConfig` (present → threaded; absent → omitted).
- done: AC-1

### T3: add auth/custom headers to the local client
- files: `packages/core/src/verify/local-client.ts`
- action: add `headers?: Record<string,string>` to `LocalChatJSONOptions`; merge over
  the base `content-type` in `callOnce`; never log header values.
- verify: transport-seam test asserts `Authorization` present when configured, absent otherwise.
- done: AC-2

### T4: wire the factory to read config + env and pass to providers
- files: `packages/core/src/verify/verifier-factory.ts` (+ the `verifier`/deep-verify binding)
- action: thread `timeoutMs`/`maxRetries` into the `anthropic(...)` build path and
  `Authorization` (from `CADENCE_LOCAL_API_KEY`) + `verifier.localHeaders` into the
  `local(...)` build path. Scope to the top-level `verifier` slice (deep-verify family)
  for this phase; other families inherit the seam but are wired only if trivial.
- verify: selection test — built providers receive the hardening opts.
- done: AC-1, AC-2

## Boundaries

- DO NOT change verdict logic, the system prompt, or `VerifyResult` shape (token/cost
  surfacing is Phase 73, not here).
- DO NOT add the `--verifier` CLI flag (Phase 73).
- DO NOT log or echo API keys / auth header values anywhere.
- DO NOT make live network calls in tests — use the injected `client` (anthropic) and
  `transport` (local) seams only.
- DO NOT hardcode a price/cost table (out of scope for v1.15).
