---
'@manehorizons/cadence-core': minor
---

Closed three drifts around `gates.sealed` (rec-20260725-006). Docs now name all
three gates that actually consult `isGateSealed` (`test-coverage`,
`build-test-must-pass`, `boundary-scan` — `docs/reference/config.md` and
`docs/concepts.md` previously named only the first two, stale since
`boundary-scan` shipped in Phase 156), plus the missing `--allow-failing-build`
/ `--allow-boundary-scan-failure` rows in the "Gate bypass reference summary"
table; a new doc-content test derives the sealed-gate set from the real
`isGateSealed` call sites so a future gate can't drift the same way again.
`docs/concepts.md` gains a "Bypass-flag naming policy" section explaining the
`--force` / `--allow-<gate>-failure` / `--allow-<verb>` split and auditing
every bypassable gate's flag against it. `runSettleGates`'s gate-provenance
collection now records a bypass-specific skip reason for `build-test-must-pass`
and `boundary-scan` (previously only `test-coverage`'s bypass was distinguished
from a normal "ran"), naming whichever flag actually fired (`--force` vs the
gate's own dedicated flag) rather than always naming the dedicated one. No
gate pass/refuse/seal decisions changed — this is documentation accuracy and
provenance-recording parity only.
