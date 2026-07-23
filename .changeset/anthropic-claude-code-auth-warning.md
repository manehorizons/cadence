---
'@manehorizons/cadence-core': patch
---

Clarifies the anthropic-provider mock-fallback warning (`verifier-factory.ts`) and its `cadence config explain` counterpart (`config-explain/build.ts`): both now state that being logged into Claude Code (or another IDE/host CLI session) does not satisfy the `anthropic` provider's `ANTHROPIC_API_KEY` requirement — it's a direct Anthropic SDK call needing a separately API-billed key, with no visibility into a host session's own credential store. Closes rec-20260723-001, surfaced by a real external consumer hitting silent mock-fallback with no obvious cause.

`docs/providers.md`'s quoted warning sample is updated to match.
