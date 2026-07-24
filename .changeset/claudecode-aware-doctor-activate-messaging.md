---
'@manehorizons/cadence-core': patch
---

`cadence doctor`'s verification-readiness check and `cadence activate`'s key-missing message are now CLAUDECODE-aware: when the `anthropic` provider is selected, `ANTHROPIC_API_KEY` is missing, and the process is running inside a live Claude Code session (`CLAUDECODE=1`), both surfaces now name the Claude-Code-login-doesn't-satisfy-this confusion directly and proactively suggest `cadence activate --provider host-cli` as the way to reuse that session's own auth instead of a separate API key. Outside a Claude Code session (or for other providers), both surfaces are unchanged. Closes rec-20260723-003, sibling to the phase 209/210 work on the same underlying confusion.
