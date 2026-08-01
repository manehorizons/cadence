---
'@manehorizons/cadence-core': patch
---

Fixed `computeFindingId` (`packages/core/src/verify/finding-identity.ts`) minting a
new identity for an unchanged finding in two real cases, either of which caused
Phase 242's ledger dedup (keyed on `Finding.id`) to miss the finding and route a
duplicate `Recommendation` for the same underlying defect. The hash previously
included `anchor.kind`, `anchor.ref`, and `severity` alongside `file` and
normalized `message` — but both anchor and severity can legitimately change
across settles for the same defect: the DRAFT-amendment workflow deliberately
re-anchors a previously-unanchored ("gap") finding once a criterion is added to
cover it (proven by `criteria-anchor-corpus.test.ts`'s own "AC-5 round trip"
test, which already asserted message/severity/line survive that transition
unchanged but never asserted `.id` did — now fixed), and `severity` is live LLM
classification under real verifier providers (`anthropic`/`local`/`host-cli`),
so a re-run can legitimately reclassify the same defect's severity. Identity is
now a pure hash over `(file, normalized message)` only; `anchor` and `severity`
are still accepted as `computeFindingId` parameters (call-site compatibility)
and remain real, unchanged fields on a stamped `Finding` — they are simply no
longer identity inputs. `computeFindingId`'s line-number exclusion (unrelated,
pre-existing, phase 236) is untouched.

`deriveRoutingCandidates` (`packages/core/src/intelligence/finding-routing.ts`)
previously assumed every occurrence of a same-id merge group agreed on
`severity` "by construction" — true before this fix (severity was a hash
input), false after. It now tracks the most severe occurrence seen across a
merge group and reports that severity/priority on the routed candidate, rather
than silently whichever occurrence happened to be encountered first.
