---
phase: 73-verifier-selection
id: 73-01
tier: standard
status: PENDING
---

# 73-01 — Verifier selection + cost visibility

## Objective

Let the operator pick the deep-verify provider at the command line
(`settle run --verifier <mock|anthropic|local>`, precedence flag > config > default
`mock`) and make every real verifier run's token usage auditable in the SUMMARY — no
price table, just the tokens the provider reports.

## Acceptance Criteria

### AC-1: `--verifier` overrides the configured deep-verify provider
Given `.cadence/config.json` selects (or omits) a `verifier.provider`
When `settle run --deep --verifier anthropic` is invoked
Then the deep-verify gate builds the `anthropic` provider regardless of config, and with
no flag the configured provider (else `mock`) is used — i.e. precedence is
`flag > config > default mock`, threaded as the `override` opt the shared
`selectVerifier(config, { override })` factory already accepts.

### AC-2: the override is honest about the mock-fallback banner
Given the v1.14 mock-fallback banner fires when the *effective* deep-verify provider is
`mock` and the gate will run
When `--verifier mock` is passed (or `--verifier anthropic` with no `ANTHROPIC_API_KEY`)
Then the banner decision uses the post-override effective provider — an explicit
`--verifier mock` still shows the banner (results are not real), and `--verifier anthropic`
suppresses it only when the provider can actually be built; the existing
`resolveEffectiveProvider` banner check at the settle service is passed the same override.

### AC-3: an invalid `--verifier` value is rejected, not silently downgraded
Given `settle run --verifier bogus`
When the CLI parses the flag
Then it exits non-zero with a clear message naming the three valid values
(`mock | anthropic | local`) — it does NOT fall through to mock or ignore the flag.

### AC-4: `VerifyResult` carries optional token usage from real providers
Given the deep verifier runs against the `anthropic` (or token-returning `local`) provider
When `verify()` resolves
Then `VerifyResult` includes an optional `usage: { inputTokens, outputTokens }` populated
from the provider response (Anthropic's `.usage.input_tokens`/`.output_tokens`; `local`
only when the endpoint returns usage), and the `mock` provider omits it — proven via the
injected `client`/`transport` seams, no live network.

### AC-5: token usage surfaces on `deepVerifyMeta` and lands in the SUMMARY
Given a `--deep` settle ran against a usage-reporting provider
When the SUMMARY is written
Then `deepVerifyMeta` (extended in `cadence-types`) carries optional `inputTokens` /
`outputTokens` threaded from `VerifyResult.usage` through the deep-verify gate's `meta()`
helper, and a v1.14-shaped `deepVerifyMeta` (no usage) still validates unchanged.

## Tasks

### T1: add the `--verifier` flag to the settle surface (with validation)
- files: `packages/core/src/cli/commands/settle.ts`
- action: add `.option('--verifier <provider>', 'override config.verifier.provider for the
  deep-verify gate (mock | anthropic | local); precedence flag > config > default mock', parseVerifier)`
  to `settle run`, where `parseVerifier` is a commander arg-parser that throws
  `InvalidArgumentError` on anything outside the three values. Settle-only — there is no
  standalone `verify` command.
- verify: CLI test — valid value reaches `SettleArgs.verifier`; `bogus` exits non-zero with
  the three-value message.
- done: AC-1, AC-3

### T2: thread the override through the settle service
- files: `packages/core/src/services/settle.ts`
- action: add `verifier?: VerifierProvider` to `SettleArgs`; pass `{ override: opts.verifier }`
  into the memoized `selectVerifier(cadenceConfig, …)` deep binding; pass the same override
  into the `resolveEffectiveProvider(cadenceConfig?.verifier, { override })` banner check so
  the mock-fallback banner reflects the effective provider.
- verify: service test — override picks the provider; banner fires/suppresses on the
  effective provider (explicit `mock` still warns).
- done: AC-1, AC-2

### T3: extend `VerifyResult` with optional token usage + capture it in real providers
- files: `packages/core/src/verify/verifier.ts`, `packages/core/src/verify/anthropic-verifier.ts`,
  `packages/core/src/verify/local-client.ts` (+ `LocalVerifier`)
- action: add `usage?: { inputTokens: number; outputTokens: number }` to `VerifyResult`;
  populate it in `AnthropicVerifier` from the response `.usage`; populate in `LocalVerifier`
  only when the endpoint returns a usage block; `MockVerifier` omits it. Never log token
  payloads alongside secrets.
- verify: anthropic/local seam tests assert usage captured when present, omitted otherwise;
  mock omits.
- done: AC-4

### T4: surface token usage on `deepVerifyMeta` and into the SUMMARY
- files: `packages/types/src/summary.ts`, `packages/core/src/gates/deep-verify.ts`
- action: add optional `inputTokens` / `outputTokens` (`z.number().int().nonnegative().optional()`)
  to `DeepVerifyMetaZ`; extend the gate's `meta(provider, model, usage?)` helper to fold
  `result.usage` into the meta on the pass/refuse paths (failure path has no usage). Keep
  fields optional so a v1.14-shaped meta still validates.
- verify: Zod parse test (old meta still valid; usage accepted); gate test asserts usage
  reaches `deepVerifyMeta` in the SUMMARY patch.
- done: AC-5

## Boundaries

- DO NOT hardcode a price/cost ($) table or derive dollar cost — tokens only (v1.15 scope guard).
- DO NOT change verdict logic, the system prompt, or the diff-feeding (Phase 70) behavior.
- DO NOT add `--verifier` to any surface other than `settle run` — no standalone `verify`
  command exists.
- DO NOT regress the v1.14 mock-fallback banner firing condition (`--deep` OR gate-set
  membership); only make it respect the `--verifier` override.
- DO NOT make live network calls in tests — use the injected `client` (anthropic) and
  `transport` (local) seams only.
- DO NOT log or echo API keys / auth header values; usage logging must not leak secrets.
- DO NOT add a DESIGN.md D-number here — that decision is deferred to Phase 74/release.
