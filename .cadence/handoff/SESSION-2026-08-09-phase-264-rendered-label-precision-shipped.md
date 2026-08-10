---
cadence_handoff: 1
generated_at: 2026-08-09T02:24:46.554Z
label: phase-264-rendered-label-precision-shipped
loop_position: IDLE
active_phase: 264-rendered-label-precision
active_draft: 
tier: 
git_branch: worktree-264-rendered-label-precision
git_dirty: true
git_head: f71b55ee
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-09 (phase-264-rendered-label-precision-shipped)

## TL;DR for the next session
- Phase 264 ("Rendered label precision", v1.56 Phase M) shipped and merged: PR #389 squash-merged to `main` as `04a38d0a`. Loop is IDLE.
- Verifier-rollup labels now carry `MOCK_VERIFIER_CAPABILITY` wording and a rendered `providerSelection` tag (`configured`/`fallback`/`mixed`) wherever a verifier rollup line is printed — SUMMARY render, SUMMARY writer, `cadence doctor`, `config explain`, and both mock-fallback banners.
- Real bug found and worked around, not fixed: `scanTestCoverage` (`packages/core/src/verify/coverage.ts`) dedups AC-token occurrences per-file by first match only, silently dropping a later qualifying `it()`-level ref when a `describe()` shares the same token as a title prefix. Filed as `rec-20260809-001`. Phase 264 worked around it by removing the AC token from 3 `describe()` titles rather than touching the scanner (out of this phase's scope).
- v1.56 "Verifier Honesty Semantics" plan: Phases L and M are now both shipped. Next up per the handoff plan is Phase N (see `docs/handoffs/HANDOFF-v1.56-verifier-honesty.md`) — not started this session.
- **Uncommitted in this worktree right now**: a small `.cadence/intelligence/*` ledger update (`rec-20260809-002` + its evidence note) filed *after* the PR merged, documenting a pre-existing, already-twice-remediated Windows CI flake (`tests/hooks/dispatcher.test.ts:96`) hit while babysitting PR #389's CI. Not yet committed or pushed — needs a decision (see Next action).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `worktree-264-rendered-label-precision` (dirty), 0 ahead / 0 behind origin
- HEAD `f71b55ee`
- Recent commits:
```
f71b55ee chore(cadence): promote rec-20260808-005 to shipped (phase 264, PR #389)
9dc6537b chore(cadence): file rec-20260809-001 -- scanTestCoverage per-file dedup drops qualifying AC refs
2f6f94f5 feat: rendered label precision for verifier provenance (phase 264)
ca610665 feat: provider selection provenance -- configured vs fallback vs empty-diff (phase 263) (#388)
fba34ab0 chore(cadence): file scout-20260804-verifier-honesty recs + D-A/D-B/sequencing decisions (#387)
688f88fd feat: cadence doctor check for release-currency (phase 262) (#386)
3e6019fc feat: historical AC-coverage audit for pre-phase-239 records (phase 261) (#385)
fb84baab chore(release): v1.55.0 -- integrity release (#384)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/RECOMMENDATIONS.md   | 17 ++++++++++++++
 .cadence/intelligence/evidence.json        | 14 +++++++++++
 .cadence/intelligence/recommendations.json | 37 ++++++++++++++++++++++++++----
 3 files changed, 64 insertions(+), 4 deletions(-)
```
- Loop: IDLE · phase 264-rendered-label-precision · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260808-003 — No standing signal for consecutive settles without real-provider conduction (candidate/ready-for-cadence-spec)
  - rec-20260808-006 — Provider selection is inherited silently at cadence init (candidate/ready-for-cadence-spec)
  - rec-20260809-001 — scanTestCoverage dedups AC-token occurrences per-file by first match only, dropping later qualifying refs (candidate/ready-for-cadence-spec)
  - rec-20260801-001 — docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8 (candidate/ready-for-cadence-spec)
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
- Files in play:
  - `packages/core/src/verify/coverage.ts` — affected by rec-20260809-001 scanTestCoverage dedups AC-token occurrences per-file by first match only, dropping later qualifying refs
  - `docs/reference/commands.md` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/config-edit/fields.ts` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/verify/phase-replay.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode
  - `packages/core/src/services/verify.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode
  - `packages/types/src/summary.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode

## What landed this session
- Phase 264 DRAFT authored (AC-1..AC-5, T1-T8) in-worktree, from `HANDOFF-v1.56-verifier-honesty.md`'s Phase M task list; escalated to the advisor before approval.
- `formatVerifierRollupLabel()` (new `packages/core/src/services/verifier-label.ts`) centralizes the rendered verifier-rollup line: provider/model/gate-count, `MOCK_VERIFIER_CAPABILITY` wording for mock, and a `providerSelection` tag (`(configured)`/`(fallback)`/`(mixed)`) derived by render-time join against matching `GateProvenance` entries — chosen over a schema change to avoid retroactive-hash risk on historical `SUMMARY.json` and to keep `contentHash` computed purely from the parsed `Summary` object, never rendered Markdown (proved in `tests/services/summary-hash.test.ts`).
- New `MOCK_VERIFIER_CAPABILITY` constant (`packages/types/src/guidance.ts`), sibling to the pre-existing `MOCK_VERIFIER_NOTICE` (left byte-unchanged).
- Capability wording threaded into every mock-related warning branch across `doctor/run.ts` (4 branches), `config-explain/build.ts` (3 branches), and both `verifier-factory.ts` banners (`MOCK_FALLBACK_BANNER` + `buildDowngradeBanner`) — a T2/T4 reviewer round caught 5 of these 7 branches being missed on the first pass.
- `docs/providers.md` gained a "Rendered, not just queryable (Phase 264)" subsection distinguishing which surfaces show the short `providerSelection` tag vs. prose-only.
- One subagent (T3 reviewer) disclosed a temporary mutation probe it added and reverted mid-review after being interrupted; independently confirmed zero residue via `git diff` byte-match and a full rebuild+test run before trusting the "done" report.
- Settle initially refused citing missing AC-4/AC-5 coverage despite `cadence verify coverage --explain` reporting SATISFIED for both — root-caused to the `scanTestCoverage` per-file dedup bug above (`rec-20260809-001`), worked around by renaming 3 `describe()` titles, then settle passed.
- PR #389: CI red 3 times running on the exact same pre-existing, unrelated test (`dispatcher.test.ts:96`, currently timing out at the *already-once-raised* 90s Windows ceiling — see `rec-20260809-002`); confirmed via 4 separate `main`-branch CI runs that this is ambient and not diff-caused before re-running (with operator consent) a 4th time, which passed. Squash-merged to `main` as `04a38d0a`.

## Carry-forward gotchas
- `.flywheel-DEGRADED` and `.flywheel/` sit untracked at the repo root (present since before this session started). Earlier in this session they were assessed as likely-inert and left alone on instruction, but a later review round in this same session traced `.flywheel` to a live daemon that raced the coverage directory mid-test-run (`ENOENT coverage/.tmp/...`). That "leave it alone" call was made on incomplete information — worth a fresh look, not touched this session.
- `scanTestCoverage`'s per-file `(id, file)` dedup bug (`rec-20260809-001`) is real and will bite the next phase that puts a qualifying AC token on both a `describe()` and a child `it()` in the same file — the scanner silently keeps only the first (often non-qualifying) occurrence. `cadence verify coverage --explain AC-N` telling you SATISFIED does not match what `settle run --auto` derives if this bug is in play; if settle refuses despite `--explain` saying SATISFIED, check this first.
- The Windows CI leg for `tests/hooks/dispatcher.test.ts:96` (`rec-20260809-002`) is now a *third* remediation cycle for the same root cause (105 serial real-disk read/write cycles under `SimpleStateBackend`): Phase 29.5 added a per-test timeout, Phase 32.1 reverted it as a Per-Test Band-Aid and raised the global win32 `TIMEOUT_MS` in `vitest.shared.ts` instead (60000 → 90000 as of 2026-07-22), and it is now timing out again at that same 90000ms ceiling. Expect this to keep costing CI re-runs on unrelated PRs until someone reduces the test's I/O (batch the 105 `dispatch()` calls) or gives it more headroom again. Do not add another per-test override — CLAUDE.md's "Per-Test Band-Aid" failure mode names this exact test's history.
- This worktree's local branch (`worktree-264-rendered-label-precision`) is stale — its remote was deleted after merge, and its own extra local commits (`f71b55ee`, `9dc6537b`) are already fully contained in `origin/main`'s squash commit (confirmed via empty `git diff origin/main HEAD` on the affected files). Safe to remove.
- Uncommitted in this worktree: `.cadence/intelligence/{RECOMMENDATIONS.md,recommendations.json,evidence.json}` carry the `rec-20260809-002` filing + its evidence note, made *after* PR #389 merged (so they're not part of that PR). Needs its own tiny branch+PR (direct push to `main` is never available, even for chore commits) before this worktree is torn down, or the update is lost.

## Next action
- Immediate (this session, before worktree teardown): land the `rec-20260809-002` ledger update via a small branch+PR from `origin/main`, then remove this worktree.
- Longer-term: start v1.56 Phase N from `docs/handoffs/HANDOFF-v1.56-verifier-honesty.md` (fresh `cadence draft new`, phase 265), or address `rec-20260809-001` (`scanTestCoverage` dedup bug) / `rec-20260809-002` (Windows CI timeout) directly if the operator wants those prioritized first.
