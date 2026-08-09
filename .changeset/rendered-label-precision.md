---
"@thomas-powers-jr/cadence-core": patch
"@thomas-powers-jr/cadence-types": patch
---

Rendered provider labels now precisely convey what the `mock` verifier does and does not check, and — when the underlying gate provenance carries Phase 263's `providerSelection` — whether a `mock` entry was a deliberate choice, a silent fallback, or (for any provider) an empty-diff judgment that could not evaluate anything.

Affected surfaces: `cadence summary render`, the on-disk `<id>-SUMMARY.md` sidecar, `cadence doctor`'s verification-readiness warnings, `cadence config explain`'s provider warnings, and the phase-243 fallback banners. All five now source their wording from one single-sourced formatter (`formatVerifierRollupLabel`) and a new `MOCK_VERIFIER_CAPABILITY` constant, so the wording can't drift across renderers the way the pre-existing duplicated literal previously allowed.

Display layer only: the `mock` provider identity, `provider`/`providerSelection` JSON fields, `AssuranceRecordZ`/`GateProvenanceZ` schema, `deriveAssuranceRecord`'s derivation logic, and `contentHash` verification are all unchanged. `MOCK_VERIFIER_NOTICE` (the pre-existing activation-nudge wording) is untouched — the new constant is a neutral sibling, not a replacement.
