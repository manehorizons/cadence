# 282-01 — Corpus coverage-drift report (AC-4)

Produced by task **T4** of phase `282-coverage-scanner-determinism`, after T1
(dedup ordering), T2 (walk-order determinism), and T3 (`--explain` agreement)
landed.

> ## ⚠ Blocker for settle: AC-4 has no test-coverage token
>
> This phase's own config is `coverageMode: assertion`, `coverageScheme:
> phase-qualified`, `testGlobs: packages/**/*.test.ts{,x}`. T1, T2, and T3 each
> produced a test file carrying `282-01/AC-1`, `/AC-2`, `/AC-3` respectively.
> **`282-01/AC-4` appears in zero files under `packages/`:**
>
> ```
> $ grep -rn -F "282-01/AC-4" packages
> (no matches, exit 1)
> ```
>
> AC-4's deliverable is this Markdown report plus a changeset — neither is in
> the coverage gate's scan surface, so the settle-time `test-coverage` gate will
> report AC-4 uncovered and refuse. This is a structural mismatch between how
> AC-4 is written and what the coverage gate can see, not a gap in the work
> T4 did. T4 cannot close it: a test file is outside T4's declared `files:`
> (`282-01-COVERAGE-DRIFT-REPORT.md`, `.changeset/coverage-dedup-determinism.md`).
> The operator's options are a follow-up task adding a test that asserts against
> this report, a DRAFT amendment, or an explicitly recorded bypass. Flagged
> before settle rather than discovered at it.
>
> **As-built amendment (T4): resolved — this blocker is closed.** The operator
> took the DRAFT-amendment option: T4's `files:` list gained
> `packages/core/tests/docs/phase282-coverage-drift-report.test.ts`, and that
> test now carries `282-01/AC-4` inside asserting `it()` blocks that assert
> against this report's load-bearing findings (the 293/281/12/38/243 accounting
> identity, the three drifted phase ids, the attribution finding, and a
> mechanical row-count check on the twelve could-not-verify ids). The banner
> text above is retained verbatim as the record of what T4 found *before* the
> amendment — it is no longer the live situation. `282-01/AC-4` is covered, the
> settle-time `test-coverage` gate has no reason to refuse on it, and **no
> follow-up task and no gate bypass are needed.**

## Method

The DRAFT's `action:` for T4 already corrected the source plan's stale tooling
reference (`cadence summary verify-all` only re-checks each SUMMARY's stored
sha256 content hash — tamper detection, not coverage). The tool actually used
here is:

```
node packages/core/bin/cadence.cjs verify phase <phase> <num> --json --no-test-run
```

which re-derives each recorded AC's coverage against the **current working
tree** and emits `drift: boolean` per AC plus a `driftCount` per phase.
`--no-test-run` is deliberate and required by this DRAFT's Boundaries — it is
not a shortcut. It was passed on all 293 invocations, and every one of the 281
that returned a verdict carries `"testRun": null`, confirming it was honored.
(The other 12 refused before emitting JSON, so no `testRun` field exists to
observe for them — see below.)

Enumeration was scripted, not hand-listed: every `*-SUMMARY.json` under
`.cadence/phases/**` was walked, its phase directory taken as `<phase>` and the
segment after the first `-` in its filename taken as `<num>`. Live count:

```
$ find .cadence/phases -name '*-SUMMARY.json' | wc -l
293
```

`*-SUMMARY-snapshot.json` files (refused-attempt siblings under phases 256, 274,
280) are excluded by the `-SUMMARY.json` suffix itself — they are not primary
settle records. One id is irregular and was handled correctly rather than
dropped: `104-real-verification-default/104-104`.

Each invocation's stdout, stderr, and exit code were captured separately. A
phase counts as **verified** only if its stdout parsed as JSON carrying
`results[0].driftCount`; anything else is **could not verify**, recorded with
its stderr verbatim. No phase was skipped.

## `cadence summary verify-all` — the AC-4-named command, run for real (as-built supplement)

**As-built amendment (T4, post-independent-verify).** The Method section above
explains why `cadence summary verify-all` cannot answer AC-4's coverage-drift
question — it only re-checks each `SUMMARY.json`'s stored sha256 content hash
(tamper detection), not coverage. That explanation is correct and unchanged.
But AC-4's own Given/When/Then literally names `cadence summary verify-all`
and requires "it passes" — a claim the original report explained around but
never actually tested. This section closes that gap by running the named
command for real, as a supplement to (not a replacement for) the `verify
phase --no-test-run` sweep above, which remains the only tool that answers the
actual coverage-drift question.

```
$ node packages/core/bin/cadence.cjs summary verify-all
...
294 checked: 56 MATCH, 238 NO_HASH, 0 failed
$ echo $?
0
```

It passes: exit 0, 0 failed. (294, not 293 — this run was taken after this
phase's own `282-01-SUMMARY.json` first came into existence via a prior
`settle` attempt that was itself refused by `deep-verify` over this exact
gap; `summary verify-all` counts whatever `*-SUMMARY.json` files exist on
disk at invocation time, so a phase settling adds one to its own future
corpus count. This is expected and does not change anything about the
293-phase historical corpus AC-4 enumerates above.) `NO_HASH` is informational
only per the command's own `--help` text (pre-hash-adoption records carry no
`contentHash` to check) and is not a failure; `MATCH` confirms the hash still
matches for every phase that has one. Zero `MISMATCH`, zero `failed` — no
historical `SUMMARY.json` content was altered by this phase's changes,
corroborating the Boundaries' "never hand-edit... report it, never
retroactively rewrite" requirement from the tamper-detection angle, distinct
from and additional to the coverage-drift angle the rest of this report
covers.

## (a) Total phase/num pairs enumerated

**293** — exactly matching the live `*-SUMMARY.json` count, and matching the
293 the SPEC recorded at authoring time.

## (b)–(c) Accounting — every pair, no silent drops

| Bucket | Count |
|---|---:|
| Enumerated | **293** |
| ├─ Re-verified successfully (parseable verdict returned) | **281** |
| │  ├─ Coverage actually re-derived (`coverageScheme` present) | **38** |
| │  └─ Reported `indeterminate` — no `coverageScheme` recorded, predates phase 239 | **243** |
| └─ Could not verify (command refused, exit 2) | **12** |

Arithmetic identity: `293 = 281 + 12`, and `281 = 38 + 243`. That identity is
the no-silent-drops guarantee.

### The 12 that could not be verified

All twelve fail identically and for the same non-coverage reason: their
legacy `DRAFT.md` carries `status: DONE`, a value no longer in the DRAFT
schema's status enum (`PENDING | APPROVED | IN_PROGRESS | SETTLED`). The
command refuses at DRAFT-parse time, before any coverage scan is attempted.
Exit code 2 in every case. Verbatim stderr shape (paths abbreviated):

```
verify phase failed: .cadence/phases/39-code-review-gate/39-01-DRAFT.md could not be
parsed as a DRAFT: [ { "code": "invalid_value", "values": [ "PENDING", "APPROVED",
"IN_PROGRESS", "SETTLED" ], "path": [ "status" ],
"message": "Invalid option: expected one of \"PENDING\"|\"APPROVED\"|\"IN_PROGRESS\"|\"SETTLED\"" } ]
```

| # | Phase / id |
|---|---|
| 1 | `39-code-review-gate/39-01` |
| 2 | `39-draft-build-gates/39-01` |
| 3 | `39-enum-gate-coverage/39-01` |
| 4 | `39-gate-contract/39-01` |
| 5 | `39-interactive-gate/39-01` |
| 6 | `39-security-audit-gate/39-01` |
| 7 | `39-skill-audit-check/39-01` |
| 8 | `40-verifier-factory/40-01` |
| 9 | `41-backend-commit/41-01` |
| 10 | `42-emit-unconverged/42-01` |
| 11 | `43-boundary-check/43-01` |
| 12 | `44-gate-registry/44-01` |

All twelve record `schemaVersion: 1` and **no** `coverageScheme`. That matters
for the accounting: had their DRAFTs parsed, they would have landed in the
`indeterminate` bucket (phase-replay's pre-239 branch) and contributed
`driftCount: 0` regardless. So the parse refusal costs no coverage information
that was ever recoverable — but it is reported as its own category here rather
than folded into the indeterminate count, because the tool genuinely did not
reach a verdict for them.

### The 243 indeterminate

These record no `coverageScheme` at all, so their coverage evidence is not
phase-attributable and `replayPhaseCoverage` deliberately declines to compute a
verdict for them (phase 239 T8 / AC-9 — the false-drift bug that branch exists
to remove). They are reported `indeterminate: true`, `driftCount: 0`, and no
scan is run. They are counted here as *accounted for but unverifiable*, not as
"clean."

### The 38 actually re-derived

Every one of the 38 is `coverageScheme: phase-qualified`, `coverageMode:
assertion` — phases `239-01` through `281-01`. These are the only phases for
which this sweep can say anything about coverage at all.

## (d) Phases with `driftCount > 0`

**3 phases, 5 ACs, all in the same direction.**

| Phase / id | Drifting ACs | Recorded | Now | Direction |
|---|---|---|---|---|
| `252-self-application-config-correction/252-01` | AC-1 | `pass: true`, `evidence: executed` | `currentlyCovered: false` | recorded-pass → not-covered |
| `256-real-provider-certification-prep/256-01` | AC-1, AC-2 | `pass: true`, `evidence: executed` | `currentlyCovered: false` | recorded-pass → not-covered |
| `256-real-provider-certification-prep/256-02` | AC-1, AC-2 | `pass: true`, `evidence: executed` | `currentlyCovered: false` | recorded-pass → not-covered |

**Reverse direction (`recordedPass: false` → `currentlyCovered: true`): 0.**
Checked explicitly rather than assumed — note that `verify phase` computes
`drift` one-directionally (`pass === true && evidence === 'executed' &&
!currentlyCovered`), so the reverse direction would never show up in
`driftCount` and had to be derived from the raw `perAc` records. There are none.

### Attribution: none of these 5 drifts is caused by this phase's fix

The `recorded-pass → not-covered` direction is the concerning one, so it was
attributed rather than reported bare. Two independent lines of evidence, both
pointing the same way:

**1. Empirical — the tokens are simply gone.** A repo-wide grep over all `.ts`
/ `.tsx` / `.js` / `.mjs` sources (excluding `node_modules`, `dist`, `.git`)
finds **zero** occurrences of every one of the five drifting tokens:
`252-01/AC-1`, `256-01/AC-1`, `256-01/AC-2`, `256-02/AC-1`, `256-02/AC-2`.
Their drift is therefore `uncoveredAcs`'s `refs.length === 0` branch — the
tests that carried those tokens were renamed, folded, or removed at some point
after those phases settled. This is test churn, not a scanner verdict change.
The control case confirms it: `252-01/AC-2`, the one AC of phase 252 that did
*not* drift, is still present at
`packages/core/tests/docs/self-application-config.test.ts:44`.

**2. Analytical — the fix is coverage-monotone, so it cannot produce this
direction at all.** Read off the T1/T2 diff to `packages/core/src/verify/coverage.ts`:

- **T1 (dedup)**: the set of `(id, file)` slots is unchanged pre/post fix — the
  first match for a key still claims the slot, later matches still never append.
  `refs.length` per AC is therefore identical, so `uncoveredAcs` (`length === 0`)
  is untouched. The only thing that changes is that an existing slot's
  `qualifying` can flip `false → true`, guarded by `qualifying &&
  !existing.qualifying`, never the reverse. Both `weaklyLinkedAcs` and
  `skippedOnlyLinkedAcs` are gated on `refs.every(r => r.qualifying === false)`,
  a predicate that can only go true → false under that flip. The fix can only
  *promote* an AC into coverage.
- **T2 (sort)**: `listAllFiles`'s `out.sort()` changes array order only, not the
  set of files walked. Every verdict predicate (`length`, `some`, `every`) is
  order-invariant, so this is verdict-neutral by construction.

Consequently the fix can never flip an AC `recordedPass: true →
currentlyCovered: false`. Every drift found above is pre-existing test churn
that this sweep surfaced, and would have been reported identically by the
pre-fix scanner.

Per this DRAFT's Boundaries, **nothing was repaired**: no historical
`SUMMARY.json`'s `contentHash` or coverage fields were touched. Reported, never
rewritten.

### Adjacent observation (not drift, recorded for completeness)

8 ACs across 4 phases record `pass: true` with `evidence: unverified` and are
not currently covered. The tool does not classify these as drift (its `drift`
predicate requires `evidence === 'executed'`), and they are not counted in the
3/5 above — they were never claimed to have executed test evidence in the first
place. Listed so the accounting is complete:

`246-finding-identity-message-drift/246-01` AC-1 ·
`249-post-gate-refusal-summaries/249-01` AC-1 ·
`261-historical-ac-coverage-audit-pre-phase-239/261-01` AC-7 ·
`276-pre-phase-102-recommendation-archive-backfill/276-01` AC-1…AC-5

## (e) Honest summary

All 293 `*-SUMMARY.json` phase/num pairs were enumerated and accounted for:
281 returned a verdict, 12 refused at DRAFT-parse time on a legacy `status:
DONE` frontmatter value unrelated to coverage. Of the 281, only 38 carry a
`coverageScheme` and are therefore verifiable at all; the other 243 predate
phase 239 and are reported indeterminate by design rather than assigned a
verdict the replay cannot substantiate. Within those 38, three phases
(`252-01`, `256-01`, `256-02`) show five drifting ACs, every one in the
`recorded-pass → not-currently-covered` direction, and every one explained by
the AC's phase-qualified token having disappeared from the test sources
entirely since settle — not by any verdict this phase's fix produced. Both
fixes are coverage-monotone or verdict-neutral, so no settled phase can lose
coverage as a result of this change; the honest bottom line for AC-4's actual
question is **no phase's coverage verdict moved as a result of the fix**, with
five pre-existing test-churn drifts surfaced along the way and left unrepaired
as the Boundaries require.

## Notes for the settle step

Three things the orchestrator should know rather than discover at settle time.
The first is the blocker banner at the top of this report, repeated here so a
reader who jumps to the end still sees it:

0. ~~**`282-01/AC-4` has no coverage token in any test file**, so the settle-time
   `test-coverage` gate will refuse. T4 cannot fix it — a test file is outside
   T4's declared `files:`.~~ **Resolved (as-built amendment, T4)** — the DRAFT's
   T4 `files:` was amended to include
   `packages/core/tests/docs/phase282-coverage-drift-report.test.ts`, which now
   carries `282-01/AC-4` inside asserting `it()` blocks. Nothing is outstanding
   for the orchestrator here: no follow-up task, no bypass. See the amended
   banner at the top for the full record.

1. **T4's own completion record was deliberately not written by this task.**
   The DRAFT's T4 `action:` calls for `cadence build task T4 --status=DONE
   --execution dispatch --notes "..."` (the Phase-D dispatch-driven live
   exercise, `dec-20260816-004`). This task was dispatched under an explicit
   no-state-mutation instruction, so that command is left to the orchestrator.
   As the DRAFT itself anticipates, `--execution dispatch` flips
   `anyTaskDispatched` true and escalates `boundaryEnforcement` to `block`;
   with no task after T4, its only observable effect is on T4's own settle-time
   boundary scan — expected behavior, not a bug.

2. **Working-tree files outside any task's declared `files:`.** With
   `boundaryEnforcement` escalated to `block`, the settle-time boundary scan
   will see these, none of which belong to a T1–T4 `files:` declaration:
   `.cadence/intelligence/{DECISIONS.md,RECOMMENDATIONS.md,decisions.json,recommendations.json,evidence.json}`
   (modified — `evidence.json` picked up further dirt after this report was
   first written, from filing `rec-20260816-001`'s evidence note during this
   phase's own settle prep) and `.flywheel-DEGRADED` (untracked). Flagged
   here, not cleaned up — they are outside this task's file boundary too.
