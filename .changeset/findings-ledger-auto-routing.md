---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

Identified code-review findings now route into the recommendation ledger at
settle time (Phase 242, `rec-20260731-003`) — the behavioral half Phase 236
deliberately deferred. Each finding that carries a stable `Finding.id` (Phase
236 identity) becomes a `Recommendation` with `source: 'review'`, linked to a
`cadence-artifact` `Evidence` entry whose `path` is that settle's
`<draftId>-SUMMARY.json` and whose `summary` names the phase id, draft id, and
SUMMARY `contentHash`. Routing is keyed on `Finding.id`, so a re-settle of an
unchanged phase never mints a duplicate entry for a finding already routed,
and one freshly-minted `scoutId` covers a whole settle's batch rather than one
per finding. Findings with no stable id (e.g. `security-audit`, which has no
identity wired in yet) are skipped, never force-routed.

`RecommendationZ` gains an optional `sourceFindingId` (the dedup key), and
`addRecommendation` gains optional `source` and a structured `cadence-artifact`
evidence override — both backward compatible; every existing caller keeps
today's `source: 'manual'`, free-text-evidence behavior unchanged. Two or more
findings that collide on identity within one settle (`rec-20260731-001`'s
known collision — same file/anchor/severity/normalized-message, no occurrence
discriminant) merge into a single `Recommendation` rather than mint one entry
with no trace of the duplicates or *N* separate entries for one id; per
`dec-20260731-001`, the identity hash itself is untouched — the merge records
the occurrence count explicitly in the entry's evidence/summary text.

A new `recommendations.autoRoute` config field (`boolean`, default `true`,
alongside the existing `autoArchive`) gates the step. Like the existing
retro-digest and auto-archive steps, routing is best-effort: a failure (e.g. a
ledger write error) never blocks or fails settle, and always prints a stderr
notice rather than failing silently. This is a settle-time writer only — no
new gate, no `GATE_ORDER` change, and no refusal semantics; every existing
gate's pass/refuse verdict is byte-for-byte unchanged. Disposition mutation
(accept / waive / fix / supersede) still has no CLI surface — that stays a
follow-on phase's scope, per Phase 236's own boundary.
