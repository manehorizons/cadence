---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

`code-review` findings are now criteria-anchored (Phase 235, `rec-20260727-004`
/ `rec-20260727-005`): every finding is tagged with how strongly it ties back
to something the phase's DRAFT actually declared, on a four-tier ladder —
`executable` > `structured` > `declared` > `undeclared` — resolved by a new
pure `resolveAnchor` (`packages/core/src/verify/anchor.ts`). A finding whose
best anchor resolves to `undeclared` is a **criteria gap**: diff work no
acceptance criterion and no boundary covers.

`GateProvenanceZ`-adjacent `SummaryZ` gains an additive `AnchorZ` peer schema
(`{ kind: 'ac' | 'boundary' | 'none', ref?, tier }`, deliberately independent
of the existing `AcEvidenceZ` ladder — the two rank different things) and
`FindingZ` gains an optional `anchor` field. Both are purely additive: a
pre-phase-235 `SUMMARY.json` with no `anchor` on any finding still parses
unchanged.

A criteria gap adds **no new refusal path and no new bypass flag** — a gap
finding flows into the exact same finding stream `code-review` already
refuses on, so a HIGH-severity gap refuses through the pre-existing
HIGH-finding contract (`dec-20260729-005`); gap count and severity
distribution are declared to stderr unconditionally, independent of whether
the gate passes, refuses, or is bypassed (`dec-20260729-006`). `GATE_ORDER`
and every gate's pass/refuse semantics for pre-existing finding classes are
unchanged. Scope is deliberately narrow — only `code-review` is
criteria-anchored; `spec-review`, `ui-spec-review`, and `plan-review` are
untouched (`dec-20260729-003`).

Three limitations are shipped and filed rather than papered over:
`executable` is not reachable in a real settle yet because `SettleContext`
exposes no prior-gate provenance to a single gate (`rec-20260729-002`);
anchoring is resolved per-file rather than per-finding, so an uncovered
defect in an otherwise-covered file can be missed (`rec-20260729-003`); and a
boundary string that merely contains a finding's filename as a substring can
mask a real gap by granting `declared` tier too broadly (`rec-20260729-005`).
