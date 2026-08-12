---
cadence_handoff: 1
generated_at: 2026-08-12T05:11:45.278Z
label: phase274-build-wave2-t3-review-pending
loop_position: BUILD
active_phase: 274-unobservable-criteria-classification
active_draft: 274-01
tier: complex
git_branch: worktree-274-unobservable-criteria-classification
git_dirty: true
git_head: d4563603
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-12 (phase274-build-wave2-t3-review-pending)

## TL;DR for the next session
- v1.57's Phase T (274-unobservable-criteria-classification) is mid-BUILD in this worktree. The DRAFT (274-01) implements D-G/D-H (`dec-20260812-004`/`dec-20260812-002`): a settle-time classifier that recognizes ACs deep-verify structurally cannot observe, so they stop producing false `fail`s and false `--force` bypasses.
- **Wave 1 fully done and independently reviewed**: T1 (the pure classifier), T2 (its fixture corpus), T7 (DELTAS reachability test), T8 (decision-citation test). T1 went through a real fix cycle — first review caught a critical false-positive bug (the phase's own AC-1 misclassified because it quotes example phrases), fixed, re-reviewed clean against the full 1,310-AC real corpus (zero false positives).
- **Wave 2 (T3, wiring into `deep-verify.ts`) is implemented, full suite green (424/424, 4071/4071), and its independent adversarial review returned PASS** (arrived literally while this handoff was being written — see full detail in Carry-forward gotchas). **T3 has NOT yet been recorded as DONE via `cadence build task T3`** — the session was told to pause before that bookkeeping step and before any main-thread re-verification of the review's own claims, so it's deliberately left undone rather than rushed through. That's the very next thing to do.
- **Wave 3 (T4 consumer sweep, T5 evidence-floor exclusion fix, T6 SUMMARY rendering) has not been dispatched at all** — all three depend on T3 per the DRAFT's `depends:` lines, and T3 isn't formally closed yet (see above).
- Nothing in this worktree is committed. Single-commit settle convention applies at the end — don't commit per-task.
- Blocker: none structural. Clean resumption point: close out T3's bookkeeping, then dispatch wave 3.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `worktree-274-unobservable-criteria-classification` (dirty), 0 ahead / 0 behind origin
- HEAD `d4563603`
- Recent commits:
```
d4563603 chore(cadence): track v1.57 criteria-honesty handoff doc (#404)
4901a003 fix: resume warns on dangling lastHandoff pointer (phase 273) (#403)
d121d1bc chore(cadence): file rec-20260811-009 (resume falls back past dangling lastHandoff pointer) (#402)
01c09b37 chore(release): v1.56.0 -- verifier honesty + pre-release integrity closeout (#400)
2d290db8 fix: assurance-record.ts correctness pass (phase 272) (#399)
9f15e480 chore(cadence): file rec-20260811-006 (macOS CI timeout flake, demo-gutting-coverage-scheme.test.ts) (#398)
e4d1058c chore: pre-release record integrity -- roadmap/milestone currency (phase 271) (#397)
573e20e9 fix: demo-test-gutting coverage-scheme regression (phase 270) (#396)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/DECISIONS.md                |  28 ++++
 .cadence/intelligence/RECOMMENDATIONS.md          |  21 ++-
 .cadence/intelligence/decisions.json              |  38 +++++
 .cadence/intelligence/evidence.json               |   7 +
 .cadence/intelligence/recommendations.json        |  47 ++++++-
 packages/core/src/gates/deep-verify.ts            |  36 ++++-
 packages/core/tests/gates/deep-verify.test.ts     | 160 +++++++++++++++++++++-
 packages/core/tests/gates/engine.test.ts          |  33 +++++
 packages/core/tests/services/summary-hash.test.ts |  58 ++++++++
 packages/types/src/summary.ts                     |  14 ++
 10 files changed, 429 insertions(+), 13 deletions(-)
```
- Loop: BUILD · phase 274-unobservable-criteria-classification · tier complex

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260809-001 — scanTestCoverage dedups AC-token occurrences per-file by first match only, dropping later qualifying refs (candidate/ready-for-cadence-spec)
  - rec-20260801-001 — docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8 (candidate/ready-for-cadence-spec)
  - rec-20260809-003 — vitest.shared.ts's Windows-timeout comment cites the now-fixed dispatcher cap test (candidate/ready-for-cadence-spec)
  - rec-20260811-005 — ROADMAP.md missing ### Phase N entries for phases 239-241 (exist on disk, never landed under those headings) (candidate/ready-for-cadence-spec)
  - rec-20260730-001 — phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode (candidate/needs-decision)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
  - dec-20260721-001 — cadence next extends nextAction(), does not subsume quickstart or reimplement
  - dec-20260721-002 — Shared legal-moves computation also powers empty-state footers (rec-20260721-001)
  - dec-20260721-003 — cadence next --json includes schemaVersion: 1
  - dec-20260721-004 — Ship /cadence-next slash command alongside the CLI command
  - dec-20260724-001 — Enforce ledger-diff at audit close, not a standing rule
  - dec-20260724-002 — Scope rec-20260724-003 to a CHANGELOG-currency gate only, defer auto-generation
  - dec-20260726-001 — Split SUMMARY.json attestation: content-hash now, full signing deferred to threat model
  - dec-20260730-001 — Coverage phase-scoping uses a phase-qualified test token, not file-ownership scoping
  - dec-20260728-001 — Phase 233 AC-3 tripwire cleared: assurance-record derivation is gate-agnostic
  - dec-20260729-001 — Phase 234 AC-1 narrowed: contracts/ is the type-naming surface, not the resolution surface
  - dec-20260729-002 — Uniform opts? on VerifierPort is what makes zero-special-cases true
  - dec-20260729-003 — Phase 235 scope: criteria-anchoring is code-review only, not spec-review/ui-spec-review/plan-review
  - dec-20260729-004 — Anchor executable tier: non-empty verify + build-test-must-pass ran, no prose heuristic
  - dec-20260729-005 — Criteria-gap refusal reuses code-review's existing HIGH-severity refuse path, not gates.evidenceFloor
  - dec-20260729-006 — D3 unconditional declaration binds the floor outcome, not the empty-gap case
  - dec-20260731-001 — Findings-to-ledger routing merges same-identity findings by design; the identity hash itself is not changed
  - dec-20260801-001 — Add a settle-time guard for global-CLI-shadowing-branch-build; interim rule is settle via the local build
  - dec-20260801-002 — Finding identity narrowed to (file, normalized message); anchor/severity dropped as identity inputs
  - dec-20260801-003 — Defer finding-identity message-drift dedup: wait for real-provider data, offline analyzer first
  - dec-20260802-001 — Refused gate-loop settles thread acc's findings into the SUMMARY, with a conditional contentHash
  - dec-20260802-002 — Attempt preservation via timestamp-slugged sibling artifact, invisible to all current SUMMARY consumers by construction
  - dec-20260802-003 — Ledger routing stays finalize-only on refusal; Slice 3's revisit trigger amended to name its precondition
  - dec-20260803-001 — Conduction stays operator-initiated: guard and gate set retained; mock-provider default is a separate ordinary config decision
  - dec-20260804-001 — Defer baseline profile change to v1.56 Phase P
  - dec-20260806-001 — 256-01's assurance:strong record is void -- empty-diff false pass, not a real certification result
  - dec-20260808-001 — D-A: Do not rename the mock provider identity
  - dec-20260808-002 — D-B: Do not require a real verifier provider at cadence init
  - dec-20260808-003 — v1.56 Phase O sequenced after Phase P, not before (amends HANDOFF-v1.56 §5 priority table)
  - dec-20260808-004 — J.1 (overall: strong structurally unreachable) resolved for the profile-override path; still true for the default auto-profile path
  - dec-20260808-005 — Phase L's providerSelection field widens to a third state covering empty-diff false-pass, not just configured/fallback
  - dec-20260808-007 — providerSelection field: optional enum, no default, no schemaVersion bump (corrected citation)
  - dec-20260808-008 — Phase 263 (v1.56 Phase L): narrow providerSelection persistence to 5 seams, exclude deep-verify/per-task-verify
  - dec-20260808-009 — Phase M: render-time join over AssuranceRecordZ schema change for providerSelection
  - dec-20260808-010 — Phase M: umbrella mock-capability label, not per-verifier-family variants
  - dec-20260809-001 — Bundle rec-20260806-010 + rec-20260809-002 into one CI-timeout-remediation phase
  - dec-20260809-002 — Phase P (267): mock abstains on review gates rather than passing them
  - dec-20260809-004 — Phase 267 (P.1, corrected): mock abstention is identity-at-recording, not no-dispatch
  - dec-20260809-005 — Phase 267 (P.1, mechanism correction): plan-review/spec-review/ui-spec-review abstain via converge.ts's shared sidecar, not registry.ts
  - dec-20260810-001 — Phase 267 (T6): repo profile flipped auto -> standard, closing dec-20260804-001's revisit trigger
  - dec-20260810-002 — Phase 267 (fix round): converge.ts sidecar persists verdict:'abstained'+pass:false/converged:false for mockAbstained entries, not pass:true+sibling flag
  - dec-20260810-003 — Phase 267 (fix round 3): code-review.ts's own CODE-REVIEW.json sidecar also abstains under mock, independent of registry.ts's SUMMARY-level relabel
  - dec-20260810-004 — Phase O (268): build the drift counter now, defer O.3's measured threshold
  - dec-20260810-005 — Phase O (268): add an indeterminate rung to DoctorSeverity, resolving v1.55 J.2
  - dec-20260811-001 — D-E: security-audit stays unreachable through v1.56 (option 2, matrix change, deferred to v1.57)
  - dec-20260811-002 — Reaffirm deep-verify/per-task-verify provenance exclusion through v1.56.0, defer to v1.57
  - dec-20260812-002 — D-H: 'unobservable' evidence class sits off-ladder, orthogonal to AcEvidenceZ
  - dec-20260812-003 — D-I: reaffirm security-audit deferral at profile=standard, do not reopen the DELTAS matrix in v1.57
  - dec-20260812-004 — D-G (corrected measurement): unobservable-AC criteria get a new settle-time verdict class, DRAFT-time refusal deferred to v1.58
- Files in play:
  - `packages/core/src/verify/coverage.ts` — affected by rec-20260809-001 scanTestCoverage dedups AC-token occurrences per-file by first match only, dropping later qualifying refs
  - `docs/reference/commands.md` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/config-edit/fields.ts` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `vitest.shared.ts` — affected by rec-20260809-003 vitest.shared.ts's Windows-timeout comment cites the now-fixed dispatcher cap test
  - `.cadence/ROADMAP.md` — affected by rec-20260811-005 ROADMAP.md missing ### Phase N entries for phases 239-241 (exist on disk, never landed under those headings)
  - `packages/core/src/verify/phase-replay.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode
  - `packages/core/src/services/verify.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode
  - `packages/types/src/summary.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode

## What landed this session
- Merged PR #404 (tracked `docs/handoffs/HANDOFF-v1.57-criteria-honesty.md` to `origin/main`) so the phase 274 worktree could branch from a base that has it.
- Recorded decisions D-G (`dec-20260812-001`, then corrected as `dec-20260812-004` after finding the handoff's own CMD-B measurement regex was buggy — see below), D-H (`dec-20260812-002`), D-I (`dec-20260812-003`), superseding `dec-20260812-001` with `dec-20260812-004`.
- Promoted `rec-20260811-008` to `accepted`/`ready-for-cadence-spec`.
- Corrected a real bug in the v1.57 handoff's own CMD-B shell script (a regex lookahead's bare `$` under the `m` flag truncated every AC body capture to its first line, so the handoff's cited 10-hits/8-phases/0.8% figure never actually inspected any Then-clause). Re-measured properly: true population is 4-5 genuine instances (see the DRAFT's Evidence note + its own later as-built amendment, which found a 5th real instance — phase 261's AC-7 — that even the corrected sweep missed).
- Authored and approved `274-01-DRAFT.md` (tier `complex`, profile `standard`). Went through 3 rounds of advisor review before dispatch, each catching real defects: AC-1's original red/green claim reproduced the exact defect the phase fixes; AC-2 was classifying the wrong input shape (a verifier `reason` that doesn't exist at classify-time); AC-3's originally-proposed fixture (10 CMD-B hits) turned out to be heading-name coincidences, not real signal; AC-4/AC-5 had no task producing their anchoring tests; most importantly, `checkEvidenceFloor` defaults absent evidence to `'unverified'` and this repo's floor is `'assertion'`, so an unobservable AC with zero coverage refs would refuse settle unless explicitly excluded (T5's whole reason for existing).
- Built T1 (`packages/core/src/verify/criteria-observability.ts`, new): pure `classifyAcObservability(ac, coverage)`. First review: FAIL — found (and I independently reproduced) a critical false positive on the phase's own AC-1. Fixed with quote-scope + negation-scope guards. Re-review: PASS, validated against the full real corpus (1,310 ACs), zero false positives.
- Built T2 (`packages/core/tests/verify/criteria-observability.test.ts`, new): 10 fixtures (5 synthetic + real-text replays of phase 272's AC-1/AC-4/AC-7 and phase 29-shakedown's AC-1/AC-2). Found and fixed its own bug along the way: AC tokens in `describe()`/header-comment text were being silently dropped by `scanTestCoverage`'s first-occurrence-wins dedup — fixed by keeping tokens only inside asserting `it()` titles. Review: PASS.
- Built T7 (`packages/core/tests/gates/engine.test.ts`, additive block): proves `DELTAS.standard.complex` includes `code-review`+`deep-verify` without touching `engine.ts`. Review: PASS.
- Built T8 (`packages/core/tests/docs/phase274-decision-citation.test.ts`, new): asserts the DRAFT cites `dec-20260812-004`/`dec-20260812-002` and both are `active` in the ledger, reading files directly (no CLI shell-out). Review: PASS.
- Built T3 (`packages/core/src/gates/deep-verify.ts` + `packages/types/src/summary.ts`'s `DeepVerdictZ` + new tests in `deep-verify.test.ts` and `summary-hash.test.ts`): additive `unobservable: z.boolean().optional()` field; classifier called before the `offenders` filter; unobservable-marked ACs excluded from offenders and forced to `pass:false`+`unobservable:true` regardless of the verifier's own verdict; stderr notice on exclusion. Full package suite green (424/4071). **Independent review returned PASS** (arrived mid-handoff-write, not yet acted on — see Carry-forward gotchas and Next action). The reviewer specifically confirmed the `offenders` exclusion is keyed only on `unobservable !== true` (the `pass` override has zero effect on whether settle blocks), and judged the pass-override design itself correct: it establishes "no consumer can ever read `pass === true` for a verdict the system doesn't trust," at the cost of discarding the raw verifier boolean (folded into the merged `reason` string instead) — flagged as a minor, non-blocking fidelity loss relevant to future `rec-20260812-002` measurement. Also flagged one out-of-scope-for-T3 completeness gap: the `catch`/`--allow-verifier-failure` branch bypasses classification entirely (every AC gets generic `pass:false`, no `unobservable` marker) — a note for whoever builds T4/T6, not a T3 defect.
- Filed `rec-20260812-002` (medium priority, `needs-evidence`): T1's negation-clause-boundary logic has two known synthetic-only edge cases (a `;`/em-dash gap, and a contrived filename-period case) found by two independent reviewers — zero real-corpus manifestation, deliberately deferred rather than triggering a third T1 fix round.

## Carry-forward gotchas
- **T3's independent review returned PASS, but T3 has NOT been recorded DONE yet.** The review arrived while this handoff doc was being written (this session was told to pause before that point, so the bookkeeping step — main-thread re-verification + `cadence build task T3 --status DONE` — was deliberately left undone rather than rushed). The reviewer's own commands were real (not just claims): ran `deep-verify.test.ts`+`criteria-observability.test.ts`+`summary-hash.test.ts` directly (43/43 pass), the full package suite (424/424 files, 4071/4071 tests), typecheck/lint clean, confirmed the additive-schema claim by reading the actual diff, confirmed the content-hash test re-hashes a real pre-existing `272-01-SUMMARY.json` value (not a tautology), and confirmed `git status --short` scope matches T3's declared files exactly. Given the thoroughness, a quick main-thread spot-check (not a full from-scratch re-review) should be enough before recording DONE — but do the spot-check, don't skip it (never record DONE from a report alone, per this repo's own standing rule).
- **The pass-override design judgment call is resolved, not open.** The reviewer concluded T3's implementer chose correctly: forcing `pass:false`+`unobservable:true` regardless of the verifier's real verdict costs only the raw boolean (recoverable as free text in the merged `reason` string) and doesn't weaken the offenders-exclusion safety property (which is governed solely by `unobservable !== true`, independent of `pass`'s value). No fix round needed for this.
- **Wave 3 (T4, T5, T6) has not started.** All three `depends: T3` in the DRAFT — dispatch only after T3's bookkeeping above is actually closed. T5 is the highest-risk of the three: `checkEvidenceFloor` defaults absent evidence to `'unverified'`, this repo's `evidenceFloor` is `'assertion'`, and `deriveAcEvidence` only reaches `'unverified'` at zero coverage refs — exactly the shape the classifier exists to handle. If T5 gets this wrong, a future unobservable AC with no linked task will incorrectly refuse settle. T5's DRAFT task block has an explicit open question its implementer must resolve and its reviewer must confirm (not accept on faith): whether `acResults[].pass` is already `false` for an unobservable AC before it even reaches the floor check, which decides whether T5's exclusion filter is load-bearing or defensive-but-inert. T4/T6 should also pick up T3's reviewer's minor note: the `catch`/`--allow-verifier-failure` branch in `deep-verify.ts` never sets the `unobservable` marker at all (bypasses classification entirely on verifier-transport failure) — worth a deliberate decision (in scope or explicitly out) rather than an oversight.
- **`rec-20260812-002` is intentionally not being acted on this phase.** Do not reopen T1 for it — it's a deliberate, documented deferral (two synthetic-only findings, zero real-corpus manifestation), matching D-G's own staged-rollout rationale.
- **Nothing is committed.** All of T1/T2/T3/T7/T8 plus the DRAFT and this worktree's private decision/rec ledger entries are uncommitted working-tree changes. Single-commit settle convention: source + tests + docs + phase artifacts land together only once `cadence settle run --auto` passes clean.
- **`.flywheel-DEGRADED`** (untracked) is a separate local tool's artifact, not a CADENCE artifact — never stage or commit it.
- **This worktree's `.cadence/` is fully private** — `dec-20260812-*` and `rec-20260812-002` exist only here until the phase settles and merges to `main`.
- **Hard bar, not a gradable AC**: per the DRAFT's Boundaries, if any remaining task needs `--force` to settle, that means the fix is incomplete — stop and report, don't force past it. This is deliberately NOT encoded as a testable AC (would reproduce the exact "process claim" defect this phase fixes) — it's an operator-verified bar only.
- The primary checkout (`/home/thomas/projects/cadence`) has its own separate, unrelated dirt (`.claude/scheduled_tasks.lock`, `.claude/settings.json`, `.codex/`) — pre-existing, local-only, leave alone; not related to this phase.

## Next action

**Action:** T3's independent review already returned PASS (full detail in Carry-forward gotchas) — do a quick main-thread spot-check (read the `deep-verify.ts`/`summary.ts` diff yourself, re-run `deep-verify.test.ts`+`summary-hash.test.ts`+`criteria-observability.test.ts`) and, if it holds up as expected, record `cadence build task T3 --status DONE --notes "..."` summarizing the review. Then dispatch wave 3 (T4, T5, T6 — each `depends: T3`) following the exact pattern used all session: one implementer subagent per task with the full DRAFT text + `files:` boundary + `verify:` line in the prompt, one independent adversarial reviewer per completed task, main-thread re-verification, then `cadence build task <T> --status DONE`. Do T5 with extra care — see its open question in Carry-forward gotchas. After T4/T5/T6 all close, run the whole-branch review, then `cadence settle run --auto`, then land via the `pr-land` skill.

**Verify:** `cadence progress` should report loop `BUILD`, phase `274-unobservable-criteria-classification`, draft `274-01`. `git status --short` in this worktree should still show the files listed in "State on handoff" above (6 modified + `.cadence/handoff/*` + 6 untracked under `.cadence/phases/274-*`, `packages/core/src/verify/criteria-observability.ts`, `packages/core/tests/verify/criteria-observability.test.ts`, `packages/core/tests/docs/phase274-decision-citation.test.ts`, `.flywheel-DEGRADED`). `cat .cadence/phases/274-unobservable-criteria-classification/274-01-PROGRESS.json` should show DONE entries for T1, T2, T7, T8 only (T3 not yet recorded — that's the first thing to add).

**If it fails:** if `cadence progress` or the live DRAFT/PROGRESS.json don't match what's described here, STOP and investigate the drift before dispatching any more subagents — don't assume this doc is still accurate, re-read the live state first (this doc's own frontmatter facts are pre-filled and could be stale by the time you read them). If your own spot-check of T3 turns up something the independent reviewer missed, don't record DONE — dispatch a fix round instead, same as was done for T1 earlier this session.
