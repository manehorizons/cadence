---
'@manehorizons/cadence-core': patch
'@manehorizons/cadence-types': patch
---

Fix a refusing settle gate silently dropping out of `gates` provenance and a refused `settle run` writing no `SUMMARY` at all — previously the only trace of a refusal was an ephemeral stderr line. `GateProvenanceZ.status` gains a `'refused'` value plus an optional `reason` string (additive, back-compat with pre-existing `ran`/`skipped` records); all 9 settle-dispatched gates (`draft-read`, `structural-verifier`, `boundary-scan`, `build-test-must-pass`, `test-coverage`, `interactive-verdict`, `deep-verify`, `code-review`, `security-audit`) now attach `reason` matching their stderr text on refusal, and `runSettleGates` pushes the refusing gate's entry onto `gates` before halting. A refused `cadence settle run` now persists `SUMMARY.{json,md}` (populated `gates` through the refusing entry, real `taskResults`, empty `acResults`/`decisions`/`deferred`) without transitioning `loopPosition`/`activeDraft`, so the loop stays exactly where a human can retry.
