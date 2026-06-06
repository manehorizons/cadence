---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Verifier robustness (v1.15.0): make the real verifier providers dependable in a
settle gate, let the operator pick one at the command line, and make every
verifier run's token usage auditable. Provider hardening + ergonomics around
unchanged verdict logic — not a verifier rewrite.

- **Provider hardening (Phase 72).** `anthropic` gains configurable
  `verifier.timeoutMs` + `verifier.maxRetries` (threaded via a pure
  `buildAnthropicClientConfig` seam), so a transient 429/5xx/network blip in a
  settle gate retries before failing loud. `local` gains auth: a bearer
  `Authorization` header from `CADENCE_LOCAL_API_KEY` plus arbitrary
  `verifier.localHeaders`, so token-gated OpenAI-compatible proxies work. Header
  values are never logged. Three new backward-compatible `verifier.*` config
  fields.
- **Verifier selection + cost visibility (Phase 73).** `cadence settle run
  --verifier <mock|anthropic|local>` overrides the config-only provider
  selection (precedence flag > config > default `mock`; invalid values rejected
  at parse time). The override flows into the v1.14 mock-fallback banner so it
  reflects the effective provider. `VerifyResult` and the SUMMARY's
  `deepVerifyMeta` gain optional token usage (`inputTokens` / `outputTokens`),
  captured from Anthropic's `usage` and from `local` endpoints that return one.
  Dollar cost is not derived (no price table to rot).

`cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
version-alignment bumps only (the token-usage field on `deepVerifyMeta` lives in
`cadence-types`; the host adapters are unchanged).
