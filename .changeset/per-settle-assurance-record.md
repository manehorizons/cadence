---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

Every settle now derives and reports one whole-run **assurance record** —
a durable answer to "how strongly was this settle actually verified?"
(Phase 233, `rec-20260728-001`). Composed from the per-gate verifier identity
persisted in Phase 232 plus the existing per-AC evidence-class ladder
(`ai-verified > executed > assertion > mention > unverified`), it makes a
settle whose gates all ran under `mock` visibly different, in the durable
record, from one verified for real.

`SummaryZ` gains an optional `assurance` field: `verifierRollup` (one entry
per distinct `(provider, model)` pair observed across gate provenance),
`evidenceTally` (an exhaustive count over all five evidence classes), and
`overall` (`'strong' | 'mixed' | 'weak' | 'unverified'`, a single
deterministic label). The derivation (`deriveAssuranceRecord`) is a pure
function of the gate-provenance array and the AC-evidence array only — no
gate-specific special-casing was needed to express it, clearing this phase's
binding tripwire and leaving the door open for further kernel/verifier/
consumer boundary work.

`assurance` is reported only: it adds no gate, no refusal path, and no
bypass flag, and settle's pass/refuse outcome is byte-for-byte unchanged.
It is covered by Phase 223's settle-time content hash, so a post-settle
hand-edit to it is caught by `cadence summary verify` exactly like any other
field, and it is surfaced as an `## Assurance` section in both
`cadence summary render` and the `SUMMARY.md` sidecar.
