---
"@thomas-powers-jr/cadence-core": minor
---

Fix: a settle whose only real-provider verification signal is a `providerSelection: 'empty-diff'` gate (phase 263 — a real, non-mock verifier call whose diff was empty, so it structurally could not judge anything) can no longer earn `assurance.overall: 'strong'` on that signal alone.

`deriveAssuranceRecord`'s `hasRealVerifier` previously read only `gates[].provider !== 'mock'`, never `providerSelection` — so a code-review/security-audit gate that ran a real provider against an empty diff (touched files already committed at settle time, or otherwise no working-tree delta) still counted as "real verification happened," even though nothing was actually judged. `hasRealVerifier` now also excludes gates tagged `'empty-diff'`. A mixed settle — one `empty-diff` gate alongside one genuinely `'configured'` (or untagged) non-mock gate — is unaffected and can still reach `'strong'` on the configured gate's own evidence. `verifierRollup` and `hasAnyVerifier` are untouched: the persisted record still shows that the gate ran; only the `'strong'` grade's own eligibility check changed.

Measured against the full historical corpus (298 `SUMMARY.json` records) this changes 0 grades — no real settle has hit `providerSelection: 'empty-diff'` yet — but the gap was real and directly provable via a fixture, and (found while building this fix) was already silently masking one pre-existing test's grade.

Closes `rec-20260806-004`.
