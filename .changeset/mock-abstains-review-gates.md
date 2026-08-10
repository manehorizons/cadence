---
"@thomas-powers-jr/cadence-core": minor
---

Mock no longer records a persisted `pass` for the five review-family gates (`code-review`, `security-audit`, `plan-review`, `spec-review`, `ui-spec-review`) — it abstains instead. `verify()` still dispatches exactly as before under mock (its deterministic checks — flagging an added `console.log(` as HIGH, AC↔test linkage, etc. — still run and can still refuse), but when the resolved identity is mock and the outcome is a genuinely clean pass, the persisted record is relabeled rather than left as an unqualified pass: `code-review`/`security-audit` gate provenance records `status: 'skipped'` with a `skipReason` naming the abstention (instead of `'ran'`), and `plan-review`/`spec-review`/`ui-spec-review`'s convergence sidecar (`*-PLAN-REVIEW.json`/`*-SPEC-REVIEW.json`/`*-UI-SPEC-REVIEW.json`) gains a new optional `mockAbstained: true` field on the relevant history entry. A mock-served `refuse` (a real finding was flagged) is never relabeled — a refusal is never false confidence, regardless of provider.

This closes the false-clean-pass gap where an empty diff, or a diff with no matching pattern, was recorded identically to a genuine review having run and found nothing. `deep-verify` and `per-task-verify` are unaffected — they enforce real AC↔test linkage under mock and keep their existing pass/fail semantics unchanged.

`GateProvenanceZ`/`ConvergentReviewHistoryEntry` gain no required fields and no schema-version bump — both additive, matching the phase 239/263 precedent; every historical `SUMMARY.json` and convergence sidecar still parses, and no historical review-gate pass record is reinterpreted (the new fields apply only to settles/reviews run after this change).

The repo's own `.cadence/config.json` `profile` moves off `auto` to `standard` in this same release, closing a previously-deferred baseline-profile decision — mock abstention removes the false-confidence risk that baseline change would otherwise have carried. See `docs/handoffs/HANDOFF-v1.56-verifier-honesty.md` (Phase P) for the full design history.
