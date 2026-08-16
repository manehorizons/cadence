---
"@thomas-powers-jr/cadence-core": patch
---

Fix: assurance grading no longer reports `'strong'` when a settle's gates were bypassed or a real verifier's AC failure was overridden.

`deriveAssuranceRecord` previously derived `overall` from `gates`/`acResults` alone — by settle time, a `--force`-overridden AC already records `pass: true` in `acResults`, so a forced settle over real verifier failures graded identically to a genuinely clean one. It now accepts an optional third argument, `{ gateBypasses, deepVerify }`:

- An error-severity `gateBypasses` entry caps `overall` at `'mixed'` — it can never grade `'strong'`, regardless of the underlying gate/evidence math. A `'weak'`/`'unverified'` result is left alone (already at or below the cap), and an all-`'warn'` `gateBypasses` array never triggers this.
- A `deepVerify` verdict with `pass: false` from a non-mock provider excludes that AC from `strongRatio`'s numerator, even when its own `acResults[].evidence` is `'ai-verified'`/`'executed'` — a real verifier's objection to a `--force`-overridden AC no longer reads as strong evidence.

Both rules are additive and gate-agnostic (never branch on `gateBypasses[].gate` or `GateProvenance.gate`, matching `dec-20260728-001`), and neither ever mutates `acResults[].pass` — it still records the true settle outcome. Omitting the third argument (or passing `{}`) is a no-op, so every existing caller and every clean settle is byte-identical to before this change.

`cadence summary render` (and the equivalent `SUMMARY.md` writer) now also surfaces the bypass state next to the overall assurance grade line for a settle whose `SUMMARY.json` carries a non-empty `gateBypasses` array — sourced from the existing `gateBypasses` field, no schema change — so a reader sees the caveat in the same place they see the grade, not only in the raw JSON.

**Historical phases:** a full read-only re-derivation across the entire historical `.cadence/phases/**` corpus (294 `*-SUMMARY.json` records) is enumerated in `.cadence/phases/283-bypass-aware-assurance/283-01-ASSURANCE-DRIFT-REPORT.md`. Exactly 2 records — `272-assurance-record-correctness/272-01` and `282-coverage-scanner-determinism/282-01` — drift from a stored `strong` grade to `mixed` under the new rule; no historical `SUMMARY.json` was modified to produce that report.
