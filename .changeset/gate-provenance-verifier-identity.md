---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

Settle can now tell a `mock`-verified `code-review`/`security-audit` gate
from a real-provider one — closing CADENCE's sole surviving P0 (Phase 232,
`rec-20260727-001`). Previously `CodeReviewResult`/`SecurityAuditResult`
computed `provider`/`model` in memory but discarded both before persistence,
so a SUMMARY could record only *that* a review ran, never *what* ran it.

`GateProvenanceZ` gains optional `provider`/`model` fields, populated only
for the `code-review` and `security-audit` gate entries (every other gate's
entry is unchanged). `GateFlags` gains an internal `verifierIdentity` field
that gate implementations use to report this identity generically — the
gate registry merges it onto the persisted provenance entry by flag
presence, not by gate name, so no gate-specific special-casing was needed
to express it.

This is a SUMMARY shape change, so `SummaryZ.schemaVersion` moves from the
literal `1` to `1 | 2`: writers now emit `2`; readers still accept
pre-existing `1` records unchanged. A SUMMARY written by a genuinely newer
Cadence (an unrecognized higher `schemaVersion`) now reports a distinct
"written by a newer Cadence" diagnostic instead of a generic parse/corruption
error, mirroring Phase 223's `contentHash` "unverifiable" precedent.

No `GATE_ORDER` changes, no gate pass/refuse behavior changes, no new
refusals — this is purely provenance the record was silently dropping.
