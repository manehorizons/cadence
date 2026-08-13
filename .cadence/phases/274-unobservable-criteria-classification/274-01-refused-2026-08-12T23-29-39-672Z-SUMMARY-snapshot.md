# SETTLE Summary — 274-01

**Completed:** 2026-08-12T23:29:39.672Z
**Content hash (sha256):** e4ce2607744c3333234478bbe15c1c842ea843a1a04000ff0a7d4a2c2b159dc9

## Acceptance Criteria


## Tasks

- T1: DONE — New file packages/core/src/verify/criteria-observability.ts: pure classifyAcObservability(ac, coverage) function, case-sensitive SUMMARY-token detection + 3 narrow signals (self-reference, pasted-into, written-verbatim-capture), quote-scope + negation-scope guards. Independent adversarial review round 1: FAIL -- found a critical false-positive on this phase's own AC-1 (quoted example text) + unverified hardcoded stat in docstring, both verified independently by me. Fix round dispatched, addressed both. Independent re-review round 2: PASS -- validated against full 1310-AC real corpus, zero false positives, exactly the 5 genuine hits found. Remaining minor findings are safe-direction (false negatives) or synthetic-only, non-blocking. Main-thread re-verify: guards present and wired in, hardcoded stat removed, typecheck/lint clean, diff scope correct.
- T2: DONE — New file packages/core/tests/verify/criteria-observability.test.ts: 10 fixtures (5 synthetic canonical shapes + real-text replays of phase 272's AC-1/AC-4/AC-7 and phase 29-shakedown's AC-1/AC-2, extracted via parseDraftMd, never paraphrased). Process adaptation: T1 was already built+reviewed when T2 ran, so a literal red-before-green run wasn't achievable; expectations were pre-declared before the first run instead (documented in the test file header). T2 independently found+fixed a real coverage-gate bug: AC tokens in describe()/header comments were being silently dropped by scanTestCoverage's first-occurrence-wins dedup; fixed by keeping tokens only inside asserting it() titles, verified against the real scanner. Independent review: PASS, 13/13 tests confirmed, verbatim-text and oracle-only-not-classifier-input requirements both verified directly. Found (not blocking, filed as rec-20260812-002): a synthetic adversarial construction exposes a negation-clause-boundary gap in T1's classifier -- zero real-corpus manifestation, follow-up filed rather than blocking this phase per D-G's own staged-rollout rationale.
- T3: DONE — Extended DeepVerdictZ additively (unobservable: z.boolean().optional()). deep-verify.ts calls classifyAcObservability before building offenders, using the required [given,when,then].join('\n') production join; unobservable-marked ACs get pass:false+unobservable:true (conservative override, regardless of verifier's own verdict) and are excluded from offenders via unobservable!==true. Added computeSummaryContentHash test re-hashing the real historical 272-01-SUMMARY.json to prove the additive field doesn't perturb history. Independent review: PASS -- confirmed offenders exclusion keyed solely on unobservable marker (pass override has zero effect on blocking), judged the pass-override design correct (establishes no consumer can trust pass:true on an unobservable verdict), noted 2 minor non-blocking items: raw verifier boolean discarded on override (relevant to rec-20260812-002 future measurement) and the --allow-verifier-failure catch branch never sets the unobservable marker (a note for T4/T6, not a T3 defect). Main-thread re-verify: diff matches report exactly, 43/43 tests pass (deep-verify.test.ts + summary-hash.test.ts + criteria-observability.test.ts).
- T4: DONE — notify/collect.ts's deep: bucket filter changed to v.pass === false && v.unobservable !== true; structural: bucket untouched. Grep sweep (DeepVerdict|.pass\b) dispositioned every hit -- all other sites already properly handled by T3/T5/T6. End-to-end replay test uses real committed text from 272-01-DRAFT.md and 29-01-DRAFT.md via parseDraftMd, running the actual classifier (never hardcoded). Corpus-wide verify-all regression test added (274-01/AC-4). Independent review: PASS. Reviewer independently reproduced the grep sweep, the replay test, and the corpus regression; confirmed collect.ts's own scope is correct. Reviewer also found a real, empirically-reproduced evidence-floor refusal gap in deep-verify.ts's --allow-verifier-failure catch branch (catch-branch verdicts never carry unobservable:true, so an explicit --ac override on a zero-coverage AC during a verifier-transport-failure run can still hit the evidence floor and refuse). Confirmed via advisor consult + direct settle.ts read that this is real and reachable, not synthetic. Scoped as a T5 amendment (deriveEvidenceAndCheckFloor's pre-filter, not collect.ts or deep-verify.ts) since T5 owns evidence-floor exclusion and hadn't been reviewed yet -- avoids two review passes on the same concern. Dispatched as a T5 fix-and-extend round; collect.ts itself needs no further changes. Main-thread re-verify: diff scoped to collect.ts/collect.test.ts/summary-verify-sweep.test.ts as claimed; 197/197 tests in the 10 claimed files, 424 files/4093 tests full suite, typecheck+lint clean.
- T5: DONE — isUnobservableAc predicate added to ac-evidence.ts (single source of truth); deriveAcEvidence returns AcEvidence | undefined, short-circuiting BEFORE the ai-verified branch for classifier-marked-unobservable ACs; checkEvidenceFloor's result shape gained an unobservable? belt-and-braces skip. settle.ts's deriveEvidenceAndCheckFloor filters the floor-check array on pass && !isUnobservableAc. Resolved the DRAFT's open question with primary-source evidence: acResults[].pass comes from task-linkage/terminal-status OR an explicit human --ac override -- only the latter can set pass:true independent of coverage on a zero-ref AC, making the exclusion genuinely load-bearing there (not merely defensive). Proved via real revert-and-confirm-red (exit 1) then restore (green). Handed off a known gap (deriveAssuranceRecord not unobservable-aware) rather than silently fixing or ignoring it, pinned with a deliberately-tokenless test (asserts a known gap, not a satisfied AC). Independent review of T4 (adjacent, shared hazard class) surfaced a second, empirically-reproduced gap: catch-branch (--allow-verifier-failure) verdicts never carry the unobservable marker, so an explicit --ac override on a genuinely-unobservable zero-coverage AC during a verifier-transport-failure run could still hit the evidence floor. Confirmed real via advisor consult + direct settle.ts read (deriveEvidenceAndCheckFloor runs downstream of the catch branch's 'pass' gate outcome, not refused by it). Fixed with a second, narrower exclusion inside deriveEvidenceAndCheckFloor: when acc.flags.verifierFailure is set, classify each surviving PASS AC directly via classifyAcObservability (not the marker) and exclude if unobservable, with a loud stderr notice per exclusion (no other trace exists since deepVerify/acResults are untouched on this path). Deliberately did NOT touch deep-verify.ts's catch branch or notify/collect.ts (would have conflated an AC-level claim with a run-level one). New regression test (274-01/AC-4) drives the real settleService pipeline end-to-end (mocked verifier throws, allowVerifierFailure:true, explicit --ac pass override, evidenceFloor:assertion) and was itself proven load-bearing via revert-and-confirm-red. Added a producer-side pin in deep-verify.test.ts confirming catch-branch verdicts never carry unobservable:true. Main-thread re-verify: diff read directly, matches report exactly; 96/96 in the 3 touched files, 424 files/4093 tests full suite, typecheck+lint clean.
- T6: DONE — New file packages/core/src/services/ac-observability-label.ts (formatUnobservableNote, shared formatter). Wired into both Markdown renderers (summary-writer.ts's renderSummaryMd and summary-render.ts's renderSummaryForReview) as a distinct sibling line after each AC's PASS/FAIL badge, never containing PASS/FAIL text, carrying the classifier's reason. JSON surface needed no changes (traced the real write path: atomicWriteJSON is a bare JSON.stringify, no field whitelist -- unobservable flows through automatically). CLI/stderr surface already distinct via T3's own ctx.io.err wording. Independent review: PASS -- verified all claims directly (not trusted), including compiling+calling the formatter with adversarial inputs and tracing the JSON path itself. Found one pre-existing, non-blocking gap (unsanitized free text in renderSummaryMd, affects 4+ other fields already, not introduced by T6) -- filed as rec-20260812-003. Main-thread re-verify: diffs match report exactly (6 lines across 2 files + 1 new file), 64/64 tests pass.
- T7: DONE — Added 274-01: DELTAS standard × complex reachability block to packages/core/tests/gates/engine.test.ts (2 tests, both 274-01/AC-6 tokens inside asserting it() blocks). Proves standard×complex includes code-review+deep-verify via gatesFor() + ALWAYS-exclusion, and this phase's own DRAFT frontmatter is tier:complex/profile:standard -- anchored on source/DRAFT truth, not this phase's own SUMMARY. engine.ts untouched (read-only proof). Independent review: PASS, no findings. Main-thread re-verify: 37/37 tests pass, diff matches report.
- T8: DONE — New file packages/core/tests/docs/phase274-decision-citation.test.ts: 3 tests (274-01/AC-5 tokens), reads DRAFT.md text + decisions.json directly (no CLI shell-out). Confirms dec-20260812-004/dec-20260812-002 both cited + status:active in the ledger. Independent review: PASS (1 minor note re: future-supersession fragility, inherited from AC-5's own wording, not a defect). Main-thread re-verify: 3/3 tests pass.

## Findings

### Code review

#### packages/core/src/services/settle.ts

- HIGH: With --allow-verifier-failure, classified ACs are only removed from floorInput. They retain 'unverified' evidence and enter assurance, violating off-ladder reporting. (line 1180) [id: e79063b1820e3f3a1e0e8e58cbecea8153f0e0fd18c754a1eb0cdb7814e84f06; target: artifact; anchor: kind=ac, ref=AC-4, tier=executable; disposition: open]

#### packages/types/src/summary.ts

- MEDIUM: z.boolean().optional() accepts false although presence is documented as the signal. Consumers check === true, so persisted false silently acts as a normal verdict. (line 23) [id: aa7fc0f316d45cc7886d4017839b41c4db7c9767ea1fef2cf2d1c4f7137cee2b; target: artifact; anchor: kind=ac, ref=AC-1, tier=executable; disposition: open]

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- task-verify-required: ran
- build-test-must-pass: ran
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: ran
- code-review: refused

## Assurance

- overall: mixed
- evidence tally: ai-verified=0, executed=0, assertion=0, mention=0, unverified=0
- verifier: host-cli (1 gate(s)) (configured)

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
