---
cadence_handoff: 1
generated_at: 2026-08-16T20:19:28.352Z
label: phase283-bypass-aware-assurance-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 1645216d
git_ahead: 10
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-16 (phase283-bypass-aware-assurance-shipped)

## TL;DR for the next session
- Resumed from `.cadence/handoff/SESSION-2026-08-16-phase282-merged-worktree-cleaned-main-synced.md`; user then asked to gitignore flywheel session-capture tooling (PR #436, merged) and to read+apply `docs/handoffs/HANDOFF-assurance-honesty.md`.
- That handoff described a real defect: `deriveAssuranceRecord` ignored `gateBypasses`/`deepVerify`, so a force-settled phase over real verifier failures could still grade `assurance.overall: 'strong'` — proven on two historical phases (272, 282). It named a 3-phase arc: **E** (the fix, this session), **F** (resolve 282's two rejected ACs), **G** (boundary-scan glob-expansion bug).
- **Phase E shipped**: PR #437, phase `283-bypass-aware-assurance`. `deriveAssuranceRecord` gained an optional third argument capping `overall` at `'mixed'` on an error-severity bypass and excluding non-mock `deepVerify` failures from `strongRatio`. Corpus re-derivation (`283-01-ASSURANCE-DRIFT-REPORT.md`) found exactly 2 historical records (272-01, 282-01) drift `strong→mixed`; no `SUMMARY.json` was touched. Zero `--force`/bypass used anywhere in this phase's own build or settle.
- Per user's explicit choice (advisor-recommended), **only Phase E ran this session** — F and G are deliberately deferred, not forgotten.
- **Phase G's investigation is already answered**, worth carrying forward without redoing it: `.flywheel-DEGRADED` (phase 282's boundary-scan bypass offender) was confirmed a **genuine untracked-and-ungitignored file** (`git status --porcelain` catches it), NOT a glob-expansion victim like `.changeset/*.md` — that's `rec-20260815-005`'s real, separate bug. Phase G should cite this finding rather than re-derive it.
- No blockers. Loop is IDLE. Local `main` is 10 ahead / 0 behind `origin/main` (mostly pre-existing unpushed handoff-stamp commits from before this session).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 10 ahead / 0 behind origin
- HEAD `1645216d`
- Recent commits:
```
1645216d Merge remote-tracking branch 'origin/main'
59ed33bc fix: bypass-aware assurance grading (phase 283) (#437)
b6f3f194 Merge remote-tracking branch 'origin/main'
d4dcf794 chore: gitignore flywheel session-capture tooling and broaden .codex ignore (#436)
489d7e7c chore(cadence): stamp session handoff — phase282-merged-worktree-cleaned-main-synced
a0ea3b7b Merge remote-tracking branch 'origin/main'
23378888 fix: coverage scanner dedup ordering + walk-order determinism (phase 282) (#435)
e9d007f8 chore(cadence): stamp session handoff — v1.60.0-released-dependabot-batch
```
- Uncommitted (diff --stat):
```
.claude/scheduled_tasks.lock |  1 -
 .claude/settings.json        | 60 ++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 60 insertions(+), 1 deletion(-)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260807-005 — Make phase-qualified the default AC coverage scheme (bare still ships collision bug) (candidate/ready-for-cadence-spec)
  - rec-20260816-001 — verify coverage --explain silently double-qualifies an already-qualified token (candidate/ready-for-cadence-spec)
  - rec-20260801-001 — docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8 (candidate/ready-for-cadence-spec)
  - rec-20260809-003 — vitest.shared.ts's Windows-timeout comment cites the now-fixed dispatcher cap test (candidate/ready-for-cadence-spec)
  - rec-20260811-005 — ROADMAP.md missing ### Phase N entries for phases 239-241 (exist on disk, never landed under those headings) (candidate/ready-for-cadence-spec)
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
  - dec-20260813-001 — W.0: rec-20260812-004 is a duplicate of rec-20260809-001 -- reconciled into the earlier filing
  - dec-20260813-002 — Phase U (v1.57 arc): skipped -- D-I already reaffirmed security-audit deferral
  - dec-20260813-003 — W.2: reaffirm dec-20260810-004's deferral of O.3's measured threshold -- corrected real-data measurement recorded, no new number invented
  - dec-20260813-004 — W.3: reaffirm documented-blocker posture -- no CLI path exists to close a milestone whose sole rec shipped out-of-band; building one is out of scope for a decisions-only phase
  - dec-20260813-005 — W.4: split the default -- existing-project upgrade default stays 'bare', but recommend fresh cadence init default to 'phase-qualified' in a future phase
  - dec-20260814-001 — D-M: accept archiveReason=manual for the pre-phase-102 archive backfill
  - dec-20260815-001 — D-DQ1: Task execution class -- declared field wins, heuristic cross-checks via coherence warn
  - dec-20260815-002 — D-DQ2: boundaryEnforcement escalates to block, dispatch-scoped, once DP-B lands
  - dec-20260815-003 — D-DQ3: contextBudgetThreshold stays inert this arc -- tokenUtilization is a fake signal
  - dec-20260815-004 — D-DQ4: stop-condition coherence severity is warn, not a blocker, for now
  - dec-20260815-005 — D-N: cadence done becomes a true alias for build task --status=DONE
  - dec-20260815-006 — D-N2: done inherits buildTaskService's unknown-task-id guard too, a third pre-existing gate
  - dec-20260815-007 — D-N3: buildTaskService gains an additive optional anomalySource param for the LoopViolation tag
  - dec-20260816-001 — Fix demo-gutting-coverage-scheme.test.ts flake via per-test timeout, not global bump
  - dec-20260816-002 — D-P amendment: four coverage-dedup filings exist, not three; primary chosen on decision-carrying not chronology
  - dec-20260816-003 — D-O: fix coverage dedup via prefer-qualifying (option 1), not drop-dedup or align-explain-down
  - dec-20260816-004 — Phase D folds into Phase C itself, not a future phase
  - dec-20260816-005 — D-R: bypass/deepVerify honesty enters via a new third argument to deriveAssuranceRecord, acResults untouched
  - dec-20260816-006 — D-S: cap overall at mixed on error-severity bypass, no AssuranceRecordZ schema change
  - dec-20260816-007 — D-T: dec-20260728-001's gate-agnostic invariant is honored, not relitigated
  - dec-20260816-008 — D-U: report-only, no backfill of historical SUMMARY.json grades
- Files in play:
  - `packages/types/src/config.ts` — affected by rec-20260807-005 Make phase-qualified the default AC coverage scheme (bare still ships collision bug)
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260807-005 Make phase-qualified the default AC coverage scheme (bare still ships collision bug)
  - `packages/core/src/verify/coverage.ts` — affected by rec-20260807-005 Make phase-qualified the default AC coverage scheme (bare still ships collision bug)
  - `packages/core/src/cli/verify-coverage.ts` — affected by rec-20260816-001 verify coverage --explain silently double-qualifies an already-qualified token
  - `docs/reference/commands.md` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/config-edit/fields.ts` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `vitest.shared.ts` — affected by rec-20260809-003 vitest.shared.ts's Windows-timeout comment cites the now-fixed dispatcher cap test
  - `.cadence/ROADMAP.md` — affected by rec-20260811-005 ROADMAP.md missing ### Phase N entries for phases 239-241 (exist on disk, never landed under those headings)

## What landed this session

1. **PR #436** — `.gitignore` fix: `.flywheel/`, `.flywheel-DEGRADED` (any dir), `.claude/settings.json.pre-flywheel-*`, plus broadened `.codex/` ignore. Landed first as a blocking prerequisite (confirmed empirically: a fresh worktree off `origin/main` recreated `.flywheel-DEGRADED` as untracked before this merged).
2. **PR #437** — phase `283-bypass-aware-assurance` (`283-01`), full CADENCE loop: recommendation `rec-20260816-002` (now `shipped`, ref "PR #437") → decisions `dec-20260816-005..008` (D-R/D-S/D-T/D-U, each made after an Opus advisor consult) → DRAFT with 6 ACs / 5 tasks, coherence-checked → approved, subagent-dispatched BUILD (5 tasks, each implementer + independent adversarial reviewer + main-thread re-verification) → whole-branch review (found 1 Important finding: `docs/concepts.md`'s phase-233 paragraph was now stale — fixed in place) → clean `settle run --auto` (no `--force`, graded itself an honest `'mixed'` since no `--deep` ran) → single commit + PR → one known Windows CI flake (`init-provider-selection.test.ts`'s 5000ms wall-clock assertion, unrelated to this diff) re-ran clean → squash-merged.
3. Both worktrees (`flywheel-gitignore`, `phase-e-bypass-aware-assurance`) removed after their squash-merges captured the work; primary checkout's local `main` merged with `origin/main`, clean, no conflicts.

Full report-back detail (per `HANDOFF-assurance-honesty.md` §9): all of CMD-A–E's measured numbers matched the doc exactly (294-record corpus, 13 bypassed, 2 strong, 4 contradictions); dedup preflight found no prior filing for Phase E's gap; AC-3's clean-settle byte-identity held (proven against a machine-captured fixture, independently re-derived by a reviewer); Phase F not attempted this session; Phase G's `.flywheel-DEGRADED` question answered above.

## Carry-forward gotchas

- `docs/handoffs/HANDOFF-assurance-honesty.md`, `docs/handoffs/HANDOFF-dispatch-policy-contract.md`, and `docs/handoffs/HANDOFF-v1.60-dispatch-release-and-coverage-determinism.md` are **still untracked** in the working tree, unchanged this session (the first two predate this session per the prior handoff; `HANDOFF-assurance-honesty.md` is the live plan doc that drove this session's Phase E work). Phase E is done; F and G are still open in that doc. Not committed/archived — the next session should decide what to do with these three files, same open item the prior handoff also punted on.
- Phase F (resolve 282's two rejected ACs, AC-2/AC-4) and Phase G (boundary-scan glob-expansion, `rec-20260815-005`) were **not attempted** this session — deliberately, per explicit user choice this session, not an oversight. Phase G already has its investigation answered (see TL;DR) — start there, don't re-derive.
- `PROGRESS.json`'s per-task `touchedFiles` field is misattributed in phase 283's own record (T4's entry absorbed T3's and T5's actual files due to out-of-order `cadence build task` recording during parallel dispatch; T3/T5 show `[]`). Confirmed harmless (boundary-scan's allow-set is union-based across all tasks, not per-task-attributed; each task's own `notes` field is accurate) — not a phase-283 defect, but worth its own filing if this recurs.
- The pre-existing local dirt (`.claude/scheduled_tasks.lock` deleted, `.claude/settings.json` modified — the flywheel hook wiring) predates this session and was again left untouched.
- Local `main` is 10 ahead of `origin/main` (mostly pre-existing local-only handoff-stamp commits from before this session, plus this session's two settle-work commits already squash-merged and one sync merge) — none pushed. Direct push to `main` always fails here; would need its own branch+PR if ever landed.
- Both `pr-land`-style merges this session hit the known `gh pr merge --delete-branch` local-checkout-step failure (fails with "'main' is already used by worktree..." even though the remote merge fully succeeds) — verified both via `gh pr view --json state,mergedAt,mergeCommit` each time, then deleted the remote branch manually. Same pattern noted in prior sessions' memory.

## Next action

**Action:** No active phase/draft — loop is IDLE. Decide whether to pick up Phase F (`docs/handoffs/HANDOFF-assurance-honesty.md` §5 — resolve phase 282's AC-2/AC-4 rejections; may reopen whether the original walk-order non-determinism is unexplained) or Phase G (§6 — `rec-20260815-005`'s boundary-scan glob-expansion bug; the `.flywheel-DEGRADED` investigation is already done, see TL;DR) next, or run `cadence recommend`/`cadence progress` for a different unit of work entirely.

**Verify:** `git status --short --branch` (confirm local `main` still ahead/0-behind with no new drift), `gh pr list` (confirm nothing else open), `cadence doctor` (clean state, only the known pre-existing noise: worktree-phases collision, release-currency reminder for the 3 pending changesets, conduction-reachability self-invocation-guard note).

**If it fails:** If `cadence doctor`/`cadence progress` disagrees with this doc's IDLE claim, trust the live output over this doc.
