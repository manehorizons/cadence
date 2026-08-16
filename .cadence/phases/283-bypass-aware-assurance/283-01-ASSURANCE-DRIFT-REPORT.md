# 283-01 — Corpus assurance-drift report (AC-5)

Produced by task **T5** of phase `283-bypass-aware-assurance`, after T2
(`deriveAssuranceRecord`'s bypass-aware third argument) landed. Read-only:
**no `*-SUMMARY.json` on disk was modified to produce this report** — see the
`cadence summary verify-all` runs below, taken before and after this task,
which prove it mechanically (tamper detection via stored content hash), not
just by assertion.

## Method

Every `*-SUMMARY.json` under `.cadence/phases/**` was walked with the same
recursive, sorted, suffix-filtered algorithm `cadence summary verify-all`
uses internally (`walkSummaryFiles` in
`packages/core/src/cli/commands/summary.ts`), reimplemented for this scan in
`packages/core/tests/gates/assurance-record-corpus.test.ts` with one
additional explicit guard: any filename containing `snapshot` is skipped,
even though the `-SUMMARY.json` suffix filter already excludes every real
`*-SUMMARY-snapshot.json` refused-settle sibling (its filename ends in
`-snapshot.json`, not `-SUMMARY.json`) — belt-and-suspenders per this task's
own instructions, since refused-settle snapshots are a distinct artifact
class, not a normal settle record.

```
$ find .cadence/phases -name '*-SUMMARY.json' | wc -l
294
```

**294 is a point-in-time count**, taken before this phase's own `283-01`
settle exists. Once this phase settles, its own `SUMMARY.json` — which will
carry a stored `assurance` field, since T2/T3 have already wired the new
`deriveAssuranceRecord` call into `settle.ts` — joins the corpus and the live
count becomes 295. That is expected and does not change anything reported
below about the 294-record historical corpus (matching the same point-in-time
framing `282-01-COVERAGE-DRIFT-REPORT.md` used for its own 293→294 shift).

For each record, two grades are compared:

- **OLD** — the record's own **stored** `assurance.overall` field, i.e. the
  actual historical grade it was given at settle time. This is the honest
  reading of "whose grade would change": a record that never had a stored
  `assurance` field never had an old grade to begin with, so it is counted
  separately (`noStoredAssurance` below) rather than assigned a fabricated
  baseline via a reimplemented pre-283 formula. Nothing about this scan
  recomputes a hypothetical "old" grade for those records. (Most, but not
  all, no-`assurance` records genuinely predate phase 233 chronologically —
  see the breakdown under the accounting table below. Neither this scan nor
  the report attributes a single blanket cause to every record in that
  bucket; only what was actually checked is claimed.)
- **NEW** — the real, current (phase-283, T2-updated)
  `deriveAssuranceRecord(gates, acResults, { gateBypasses, deepVerify })`,
  called with each record's own `gates`/`acResults`/`gateBypasses`/
  `deepVerify` fields exactly as stored on disk (`gateBypasses`/`deepVerify`
  default to `[]`/`{}` when absent — a no-op per 283-01/AC-3, so records with
  neither field present can never drift from this change alone).

A record is a **drift** only when both an OLD value exists and OLD ≠ NEW.

## `cadence summary verify-all` — before and after this task

**Before** (captured before any of this task's files were written):

```
$ node packages/core/bin/cadence.cjs summary verify-all
...
294 checked: 57 MATCH, 237 NO_HASH, 0 failed
```

**After** (captured once this report, the corpus test, and the changeset were
all committed to the working tree):

```
$ node packages/core/bin/cadence.cjs summary verify-all
...
294 checked: 57 MATCH, 237 NO_HASH, 0 failed
```

Identical: 0 `MISMATCH`, 0 `failed`, both times. `NO_HASH` is informational
only (pre-hash-adoption records carry no `contentHash`), not a failure.
No historical `SUMMARY.json` content was altered by this task — the
tamper-detection angle corroborating the coverage-drift-report precedent
(`282-01-COVERAGE-DRIFT-REPORT.md`) and this DRAFT's own Boundaries ("DO NOT
backfill or rewrite any historical `SUMMARY.json` grade").

## Accounting — every record, no silent drops

| Bucket | Count |
|---|---:|
| Enumerated (`*-SUMMARY.json`, snapshots excluded) | **294** |
| ├─ Malformed (unparseable JSON / not an object) | **0** |
| ├─ No stored `assurance` field | **251** |
| └─ Has stored `assurance` field | **43** |

Arithmetic identity: `294 = 0 + 251 + 43`. That identity is the no-silent-
drops guarantee — every enumerated file lands in exactly one bucket.

### Breakdown of the 251 "no stored `assurance` field" records — checked, not assumed

`assurance` is written by the phase-233 settle code path, but phase 233's
**own** `233-01-SUMMARY.json` itself has no `assurance` field either
(`completedAt: 2026-07-28T02:32:11.600Z`, `schemaVersion: 1`) — a
self-referential gap: the settle that finalizes a phase cannot retroactively
apply the code that phase itself just introduced. Comparing every no-
`assurance` record's `completedAt` against phase 233's own completion
timestamp, rather than assuming "pre-233" as a blanket label:

| Sub-bucket | Count |
|---|---:|
| `completedAt` ≤ 233-01's own completion (2026-07-28T02:32:11.600Z) | **247** |
| `completedAt` > 233-01's own completion | **4** |

`247 + 4 = 251` — accounted for, not dropped. The 4 later records —
`234-kernel-verifier-consumer-boundary/234-01`,
`239-coverage-phase-scoping/239-01`,
`240-doctor-multi-seam-readiness/240-01`, and
`243-untitled/243-01` — all carry `schemaVersion: 1` despite completing
after phase 233 landed, matching the exact symptom this repo's own operator
memory documents for phases 233/234: a stale globally-installed `cadence`
binary silently shadowing the local worktree build at settle time (both
binaries report the same `--version`, so it is invisible without checking
artifact shape). That bug's detector (`foreignBinaryMismatch`) was only
added in phase 244 — after all four of these settled — so none of the four
could have recorded it even if it occurred; this is reported as a plausible,
symptom-matching explanation for those 4, not a confirmed root cause, and
no attempt is made here to explain every one of the 247 genuinely-earlier
records beyond "settled before or during phase 233's own completion."

## Records with a non-empty `gateBypasses` array — 13

Every record anywhere in the corpus whose SUMMARY carries at least one
`gateBypasses` entry, with its stored `assurance.overall` where one exists:

| Phase / id | Stored (old) grade | Notes |
|---|---|---|
| `204-cadence-init-ci-ci-gate-re-verification-for-consumer-repos/204-01` | *(no stored assurance — completed 2026-07-21, before 233)* | not comparable; also `warn`-severity only |
| `205-ui-spec-gate/205-01` | *(no stored assurance — completed 2026-07-21, before 233)* | not comparable; also `warn`-severity only |
| `206-cadence-next/206-01` | *(no stored assurance — completed 2026-07-22, before 233)* | not comparable; also `warn`-severity only |
| `239-coverage-phase-scoping/239-01` | *(no stored assurance — completed 2026-07-31, after 233; schemaVersion 1, matches the documented shadowed-binary symptom above)* | not comparable; also `warn`-severity only |
| `246-finding-identity-message-drift/246-01` | `unverified` | already at/below the D-S cap — no change |
| `249-post-gate-refusal-summaries/249-01` | `mixed` | already at/below the D-S cap — no change |
| `250-npm-scope-rename/250-01` | `mixed` | already at/below the D-S cap — no change |
| `253-dependency-override-remediation/253-01` | `mixed` | already at/below the D-S cap — no change |
| `261-historical-ac-coverage-audit-pre-phase-239/261-01` | `mixed` | already at/below the D-S cap — no change |
| `265-affirmative-provider-selection-at-init/265-01` | `mixed` | already at/below the D-S cap — no change |
| **`272-assurance-record-correctness/272-01`** | **`strong`** | **DRIFTS → `mixed`** |
| `276-pre-phase-102-recommendation-archive-backfill/276-01` | `unverified` | already at/below the D-S cap — no change |
| **`282-coverage-scanner-determinism/282-01`** | **`strong`** | **DRIFTS → `mixed`** |

`13` total, matching this phase's own recommendation
(`rec-20260816-002`, filed 2026-08-16 against a 294-record corpus) exactly.
Of these 13, exactly **2** carried a stored `strong` grade, also matching
`rec-20260816-002` exactly. Every non-`strong` bypassed record is already at
or below the `'mixed'` cap D-S imposes (`overall` capped at `'mixed'` only
when it was `'strong'` — see `assurance-record.ts`'s doc comment), so an
error-severity `gateBypasses` entry on an already-`unverified`/`mixed` record
is a no-op by construction, not an oversight of this scan.

## `deepVerify` vs `acResults` contradictions — 4

Every AC anywhere in the corpus where a non-`mock` `deepVerify` verdict
recorded `pass: false` while the corresponding `acResults[].pass` recorded
`true` (a `--force`-overridden AC, per D-R):

| Phase / id | AC |
|---|---|
| `272-assurance-record-correctness/272-01` | `AC-1` |
| `272-assurance-record-correctness/272-01` | `AC-4` |
| `282-coverage-scanner-determinism/282-01` | `AC-2` |
| `282-coverage-scanner-determinism/282-01` | `AC-4` |

`4` total, spanning exactly 2 phases — `272-assurance-record-correctness` and
`282-coverage-scanner-determinism` — again matching `rec-20260816-002`
exactly. Every one of these 4 contradictions lands on one of the same two
records that also carry the `strong`-graded `gateBypasses` entry above; no
contradiction was found on any record outside that pair.

## Grade changes (the AC-5 enumeration) — 2

The full, exhaustive list of every record in the corpus whose grade would
change under the new rule (phase id, old grade → new grade):

| Phase / id | Old grade | New grade |
|---|---|---|
| `272-assurance-record-correctness/272-01` | `strong` | `mixed` |
| `282-coverage-scanner-determinism/282-01` | `strong` | `mixed` |

**No other record in the 294-record corpus changes grade.** Both drifts are
downgrades from `strong` to `mixed`, driven by D-S (both records carry an
error-severity `gateBypasses` entry) and corroborated by D-R (both records'
`deepVerify` contains a non-mock `pass: false` verdict for an AC whose
`acResults[].pass` is `true` — see the contradiction table above). Neither
record's `acResults[].pass` values, `gates` provenance, `gateBypasses`
entries, or any other field was altered to produce this report — only the
label a fresh, read-only call to `deriveAssuranceRecord` assigns to the
*same* stored inputs changed.

Why only 2, when 13 records carry `gateBypasses` and 251 records have no
stored grade at all to compare against: the `noStoredAssurance` bucket (251
records) contributes nothing to this table by construction — there is no old
grade to diff against, so "would change" is not a well-formed question for
them. Of the 43 records that do have a stored grade, only the 2 that were
*already* graded `strong` are eligible to be capped down by D-S; every other
graded record already sits at or below `'mixed'`, where D-S is a documented
no-op (`assurance-record.ts`: "a `'weak'`/`'unverified'` result is left
alone").

## Honest summary

All 294 `*-SUMMARY.json` records were enumerated, none malformed. 251 carry
no stored `assurance` field at all, so they are excluded from grade-change
comparison rather than assigned a fabricated baseline: 247 of those 251
settled at or before phase 233's own completion (2026-07-28), and the
remaining 4 settled afterward but still carry `schemaVersion: 1`, matching
this repo's documented global-CLI-binary-shadowing symptom for phases
233/234 — a plausible explanation checked against `completedAt`/
`schemaVersion`, not assumed from phase number alone. Of the 43 that do
carry a stored grade, 13 also carry a non-empty `gateBypasses` array;
of those 13, exactly 2 were graded `strong` and both drift to `mixed` under
the new rule — `272-assurance-record-correctness/272-01` and
`282-coverage-scanner-determinism/282-01`. Both are corroborated
independently by 4 direct `deepVerify pass:false` vs `acResults pass:true`
contradictions across the same 2 records. These findings reproduce
`rec-20260816-002`'s ad-hoc 2026-08-16 scan (294 records / 13 bypassed / 2
strong / 4 contradictions across the same 2 phases) exactly. Per this
DRAFT's Boundaries, nothing was repaired or backfilled: every historical
`SUMMARY.json`'s stored `assurance.overall`, `contentHash`, `acResults`, and
every other field is untouched on disk — reported, never rewritten.
