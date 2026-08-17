---
cadence_handoff: 1
generated_at: 2026-08-17T21:10:31.256Z
label: manehorizons-to-thomas-powers-jr-rename-pending
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: e73fe6b8
git_ahead: 14
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-17 (manehorizons-to-thomas-powers-jr-rename-pending)

## TL;DR for the next session
- Prior session shipped **v1.61.0** (independently verified on npm/tag/GH release) and closed out phase 283 (bypass-aware assurance grading) plus a small `.gitignore` fix. Loop is IDLE, nothing else in flight.
- **New, not-yet-started task**: remove the `@manehorizons` → `@thomas-powers-jr` npm-scope migration callouts from the two operator-named entry points (`README.md`, `packages/core/README.md` — the latter is literally what npm renders as the package page). Operator's own words: "There's been a handful of downloads and I'm not terribly concerned with them figuring out the switch over" — i.e. drop the guidance outright, don't soften/shorten it.
- Investigated (read-only, nothing edited) so the next session doesn't have to re-discover scope: **exactly 3 files** carry this callout pattern and are explicitly allowlisted in `packages/core/tests/docs/npm-scope-sweep.test.ts`'s `ALLOWED_FILES` — `README.md` (one doc-index bullet, line ~196), `packages/core/README.md` (a 5-line blockquote callout right after the install command, lines 32-36), and **`docs/README.md`** (one doc-index bullet, line 32) — a third file the operator did NOT explicitly name. Ask before touching it or leaving it.
- **The sweep test will need updating too**, not just the two/three README files: `npm-scope-sweep.test.ts`'s `ALLOWED_FILES` array has entries + an explanatory comment block for these exact files ("T12's migration callout / doc-index link text in the three README-style entry points..."). Once the callouts are removed, remove the corresponding `ALLOWED_FILES` entries and fix the comment (it explicitly says "three" and names all three files). The test's own "not vacuous" sanity check (`250-01/AC-1 sanity`) does not depend on these two/three files specifically — plenty of other allowlisted files (CHANGELOG.md entries, `docs/migration-npm-scope.md`, the `host-hooks.ts` sentinel) carry real `@manehorizons` hits, so removing these entries should not break that check — but verify, don't assume.
- After the doc fix: cut another release (v1.61.1, almost certainly `patch`). Docs-only changes still need a real version bump to reach npm — npm's registry is immutable per-version, so there is no "republish just the README" path; a `packages/core` patch changeset is required purely to get a new version number, even though nothing functional changed. Standard `release-cut` skill flow otherwise.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 14 ahead / 0 behind origin
- HEAD `e73fe6b8`
- Recent commits:
```
e73fe6b8 chore(cadence): stamp session handoff — v1.61.0-released
8220f6cc Merge remote-tracking branch 'origin/main'
ef4e9173 chore(release): v1.61.0 -- bypass-aware assurance, coverage-scanner determinism, cadence done delegation (#439)
059a53ca Merge remote-tracking branch 'origin/main'
16d709cf chore(cadence): sync accumulated session handoff stamps (#438)
182fbf79 chore(cadence): stamp session handoff — phase283-bypass-aware-assurance-shipped
1645216d Merge remote-tracking branch 'origin/main'
59ed33bc fix: bypass-aware assurance grading (phase 283) (#437)
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

Nothing new — this is a pure handoff turn. The user asked for `/handoff` immediately after v1.61.0 shipped (previous session/turns), described the next task in the same message, and asked to start it fresh rather than continue here. No files edited this turn beyond investigation (read-only greps/reads, see TL;DR for findings) and this handoff doc itself.

## Carry-forward gotchas

- `docs/handoffs/HANDOFF-assurance-honesty.md`, `docs/handoffs/HANDOFF-dispatch-policy-contract.md`, and `docs/handoffs/HANDOFF-v1.60-dispatch-release-and-coverage-determinism.md` are **still untracked** — fourth session in a row this has been punted, not acted on again. `HANDOFF-assurance-honesty.md` still has Phases F and G open (resolve 282's two rejected ACs; boundary-scan glob-expansion, `rec-20260815-005`) — Phase G's core investigation is already answered in an earlier handoff (`.cadence/handoff/SESSION-2026-08-16-phase283-bypass-aware-assurance-shipped.md`), don't re-derive it.
- Scope check before editing: the operator said "the README and the npm readme" (2 files) but a third file, `docs/README.md`, carries the identical pattern and is on the same test allowlist. Ask which the operator means before deciding `docs/README.md`'s fate — don't silently include or silently exclude it.
- Don't just delete the two/three README blocks and stop — `packages/core/tests/docs/npm-scope-sweep.test.ts` will need its `ALLOWED_FILES` entries + explanatory comment updated to match, or the test's own documentation becomes inaccurate (not necessarily a failing assertion, but a stale allowlist in a test whose entire point is precision — same ethos as everything else in this repo). Read the full comment block (starts "T12's migration callout / doc-index link text in the three README-style entry points...") before editing it.
- `docs/migration-npm-scope.md` itself (the full migration guide) was **not** mentioned by the operator and is a separate allowlist entry with its own justification ("necessarily names the old scope to explain it to consumers moving off it") — nothing here suggests deleting or touching that file, only the shorter callouts pointing to it.
- Pre-existing local dirt (`.claude/scheduled_tasks.lock` deleted, `.claude/settings.json` modified — flywheel hook wiring) predates this session, left untouched again, still present.
- Local `main` is 14 ahead of `origin/main` (all pre-existing/prior-session sync-merge + handoff-stamp commits — this workflow's now-established steady state, not new unpushed work). Operator was asked last session whether to push; answer not yet acted on this turn — ask again, don't assume.

## Next action

**Action:** Confirm scope with the operator (2 files or 3 — is `docs/README.md` in or out), then remove the `@manehorizons` migration callout from each confirmed file (`README.md` line ~196, `packages/core/README.md` lines 32-36, optionally `docs/README.md` line 32), update `packages/core/tests/docs/npm-scope-sweep.test.ts`'s `ALLOWED_FILES` + explanatory comment to match, run the doc-content test suite, then follow the `release-cut` skill for a v1.61.1 patch release (changeset required purely to get a publishable version number, even though nothing functional changed).

**Verify:** `pnpm --filter @thomas-powers-jr/cadence-core test -- npm-scope-sweep` green; full `pnpm turbo run lint typecheck test build` green; after release, the standard independent triad (`npm view` on all 5 packages, `git ls-remote --tags`, `gh release view`).

**If it fails:** If the sweep test fails in an unexpected way (not just the allowlist needing an update), stop and read its full failure output before touching the allowlist further — it's a precision test, not a suppression list to pad.
