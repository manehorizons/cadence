---
'@manehorizons/cadence-core': patch
---

Follow-up to #331 (rec-20260731-002): `createVerifierFactory`'s three
selection-time credential/prerequisite-missing degrade branches — an explicit
`anthropic` request with no `ANTHROPIC_API_KEY`, an explicit `local` request
with no `CADENCE_LOCAL_BASE_URL`/model, and a `host-cli` request for a family
that hasn't wired a builder — previously emitted only a bare single-line
stderr warning for all 7 verifier seams (`specReview`, `uiSpecReview`,
`verifier`/deep-verify, `perTaskVerifier`, `codeReview`, `planReview`,
`securityAudit`), unlike the loud `MOCK_FALLBACK_BANNER` deep-verify already
gets from `settle.ts` when its *configured* provider resolves to mock.

All three branches now emit the same loud, multi-line banner (reusing
`MOCK_VERIFIER_NOTICE`'s "not real verification" wording), naming the seam and
the specific missing prerequisite. The silent default-mock fallthrough (no
provider configured, or explicit `mock`) is untouched, as is
`wrapWithFallback`'s separate per-call runtime warning for a host-cli binary
that fails mid-call (different, higher-frequency event — not in scope here).
`settle.ts`'s own deep-verify pre-check and this new factory-level banner are
disjoint by construction (they branch on mutually exclusive resolved-provider
values), so deep-verify never double-warns.
