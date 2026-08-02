---
'@manehorizons/cadence-core': minor
---

Fixed a provenance-honesty gap: when a `code-review` or `security-audit`
verifier **throw** (the call itself never returned — revoked key, network
blip) was bypassed via `--force`, `--allow-code-review-failure`, or
`--allow-security-audit-failure`, the persisted `SUMMARY.gates[]` entry
read `{ gate: 'code-review', status: 'ran' }` — indistinguishable from a
clean real-provider pass, since only the absence of the phase-232
`provider`/`model` fields hinted anything was wrong.

Both gates' catch blocks now set a new, distinct `GateFlags.reviewVerifierFailure`
field on a bypassed throw (deliberately not the pre-existing `verifierFailure`
field, which is reserved for `deep-verify` and feeds `notify/collect.ts`'s
anomaly emission — reusing it would have fabricated a false `deep-verify`
entry in `SUMMARY.gateBypasses`). `packages/core/src/gates/registry.ts`'s
`runSettleGates` dispatch loop turns this into an honest
`status: 'skipped'` entry with a `skipReason` naming the flag that
triggered the bypass, the underlying failure message, and the configured
provider — with no fabricated `provider`/`model` structured field, so the
entry correctly stays excluded from `deriveAssuranceRecord`'s
`verifierRollup`. The bypass also now prints a loud stderr notice, matching
this repo's no-quiet-fallback convention. A verifier throw with no bypass
flag set continues to refuse identically to before (exit code, exact
stderr reason text, and no `flags` on the refusal — all unchanged).

Out of scope, unchanged: the pre-existing findings-based bypass path (real
HIGH/CRITICAL findings waved through on a review call that *did* return)
still correctly records `status: 'ran'` with a real `verifierIdentity`.
`deep-verify.ts`'s own identical registry-side gap (its bypassed throw also
still records `status: 'ran'` with empty identity today) is a separate,
unscoped concern — tracked as a follow-up recommendation.
