---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Add `host-cli`, a 4th verifier provider that shells out to your already-authenticated `claude`/`codex` CLI in headless mode instead of requiring a separate `ANTHROPIC_API_KEY`.

- New provider value `'host-cli'` on every provider config slice (`verifier`, `perTaskVerifier`, `codeReview`, `planReview`, `securityAudit`, `specReview`), plus `cadence activate --provider host-cli` and `cadence settle run --verifier host-cli`. Binary discovery defaults to `claude` on PATH, overridable via `CADENCE_HOST_CLI_BIN`.
- If the configured binary is missing or the CLI reports an auth/exit failure, verification for that call transparently falls back to `mock` with a loud stderr warning — never silent, never a hang waiting on interactive auth.
- **Current scope**: only the per-task-verify family (the BUILD-phase task verifier) has a real `host-cli`-backed implementation in this release. The other verifier families (deep-verify, code-review, spec-review, plan-review, security-audit) accept the config value but currently fall back to mock with a warning until they're wired in a follow-up. `cadence doctor`/`cadence activate` report `host-cli` readiness from config well-formedness alone (no required credential, by design) — not a live probe of the binary; that's only discovered lazily on the first real verification call. See `docs/providers.md` for the full picture, including a known no-spawn-timeout gap.
- The JSON-extraction + schema-repair-retry logic previously private to the `local` provider is now a shared, transport-agnostic module (`json-repair.ts`) reused by both `local` and `host-cli`.
