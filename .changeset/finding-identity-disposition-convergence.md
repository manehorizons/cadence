---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

Findings now carry a stable identity (Phase 236, `rec-20260727-006`): `FindingZ`
gains additive `id`, `target: 'artifact' | 'verification'`, `disposition: 'open'
| 'accepted' | 'waived' | 'fixed' | 'superseded'`, and `waiver: { expiry }`
fields. `id` is a pure content hash over `(file, normalized message)` —
deliberately never a line number, so the same finding keeps the same `id`
across settles even after an unrelated edit shifts which line it sits on
(`packages/core/src/verify/finding-identity.ts`). `anchor`/`severity` are
accepted as parameters for call-site compatibility but do not participate in
the hash (Phase 245 narrowed the formula from an original `(file, anchor.kind,
anchor.ref, severity, normalized message)`, after independent review found
both anchor and severity can legitimately change across settles for the same
underlying defect). A
`waiver` is only valid when `disposition === 'waived'`, enforced by a
cross-field schema refine — a waiver with no expiry is a belief masquerading
as knowledge, and an orphaned waiver on a non-waived finding is never valid.
`AnchorZ.kind` widens to also accept `'invariant'`, unused by any producer yet
(a follow-on phase's scope).

The `code-review` verifier's persisted findings (`gates/code-review.ts`) now
carry this identity: `id`, `target: 'artifact'`, and a default
`disposition: 'open'`, alongside their existing §7.1 anchor tag. This required
converging code-review's previously-local 3-severity `Finding`/`FindingSeverity`
type onto the shared, persisted 4-severity `Finding` from `@manehorizons/cadence-types`
(`rec-20260727-006`'s design-doc decision D9 — "one `Finding` type,
discriminated by `target`"). `CodeReviewFinding`/`CodeReviewFindingSeverity`
remain available from `packages/core/src/contracts/index.ts` as backward-compat
aliases of the now-shared type — `CodeReviewFindingSeverity` correspondingly
widens from `'high' | 'medium' | 'low'` to the full `'critical' | 'high' |
'medium' | 'low'` union, though no code-review provider constructs `'critical'`
today.

`RecommendationSourceZ` gains a `'review'` member (`rec-20260727-011`), so a
future phase that routes code-review findings into the recommendation ledger
can carry real provenance instead of mislabeling them `manual`/`cadence`.

All schema changes are purely additive — every pre-phase-236 `SUMMARY.json`
still parses unchanged. This phase is deliberately schema-and-computation
only: findings-to-ledger auto-routing (creating `Recommendation` + `Evidence`
entries from findings during settle) is **not** implemented here — that
behavioral work is split to a follow-on phase, recorded inline in
`.cadence/ROADMAP.md`'s Phase 236 entry.
