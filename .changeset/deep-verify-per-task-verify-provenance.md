---
"@thomas-powers-jr/cadence-core": patch
"@thomas-powers-jr/cadence-types": patch
---

`deep-verify` and `per-task-verify` now persist the provider/model identity that actually ran them into a settle's `gates[]` array — previously neither gate recorded any identity there at all (unlike `code-review`/`security-audit`), so an operator reading `SUMMARY.json` had no way to tell whether either had run under a real verifier or the `mock` placeholder.

The new fields — `observedProvider`, `observedModel`, and (for `per-task-verify`) `taskId` — are structurally separate from the existing `provider`/`model` fields on `GateProvenanceZ`, so `deriveAssuranceRecord`'s assurance rollup, which folds `gates[].provider`/`.model` by field name, stays completely blind to them. This is deliberate: this repo's own verifiers already run as `host-cli` (non-mock), so naively feeding `deep-verify`'s and `per-task-verify`'s identity into the existing rollup fields would silently inflate `assurance.overall` toward `strong` on ordinary settles where no review gate actually ran. The safety property is proven by tests on the existing fold code, not by adding a new exclusion branch to it.

`per-task-verify` never previously appeared in `gates[]` at all — it runs during BUILD, not settle. Settle now synthesizes one entry per task carrying a persisted `PerTaskVerifyRecord`, prepended to the front of the array (per-task-verify's work completed before this settle's own gate loop starts, and prepending preserves the existing convention — used throughout this repo's test suite — that the *last* entry in `gates[]` is the gate that most recently ran or refused during this settle).

All three new fields are additive and `.optional()` with no default and no `schemaVersion` bump — absent on every historical `SUMMARY.json`, and `computeSummaryContentHash` is unaffected.
