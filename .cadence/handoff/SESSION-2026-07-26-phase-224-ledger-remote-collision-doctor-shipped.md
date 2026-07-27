---
cadence_handoff: 1
generated_at: 2026-07-26T16:27:18.594Z
label: phase-224-ledger-remote-collision-doctor-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: 00aca320
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-26 (phase-224-ledger-remote-collision-doctor-shipped)

## TL;DR for the next session
- Phase 224 (`cadence doctor` `ledger-remote-collision` check, rec-20260726-003) shipped: full draft→build→settle loop with per-task implementer+reviewer, one whole-branch review, merged as PR #309 (squash `92ae02eb`).
- The `/resume` at this session's start found the phase-223 handoff already stale — its entire "next action" (resolve the `rec-20260726-001` id collision, push local main) had already been completed by a prior/concurrent session via PR #308 before this session even started reading the doc. Confirmed via `cadence resume`'s own remote-freshness probe (0 ahead/0 behind) contradicting the doc's stale "8 ahead" narrative — worth remembering that a replayed doc can describe a state already fully superseded, not just "behind."
- Found live uncommitted ledger dirt (`rec-20260726-004`, the README-mermaid-doc-test gap) that a previous session had written but never committed — committed it standalone, then it rode along in the post-merge batch below.
- Post-merge cleanup needed a SECOND PR (#310): promoting `rec-20260726-003` to `shipped --ref "PR #309"` plus the `rec-20260726-004` record together, since direct push to `main` is always rejected (branch protection) even for pure ledger-JSON chores. Both PRs merged clean; local `main` is now 0 ahead / 0 behind origin.
- No active phase/draft — loop is IDLE. Next unit of work should come from `cadence recommend` (top candidates below); nothing is blocking.
- One untriaged loose end carried forward again (see gotchas): the stray `.cadence/intelligence/exports/mil-rec-rec-20260724-013/` export dir, and an unpopped stash from this session's own rebase.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 0 ahead / 0 behind origin
- HEAD `00aca320`
- Recent commits:
```
00aca320 chore: sync rec-20260726-004 + promote rec-20260726-003 to shipped (#310)
92ae02eb feat: cadence doctor detects cross-session ledger id collisions before push (phase 224-ledger-remote-collision-doctor) (rec-20260726-003) (#309)
0fa08092 chore: sync unpushed session-handoff commits + resolve rec-id collision (#308)
d7d42399 feat: settle-time content hash + cadence summary verify (phase 223-summary-hash-attestation) (rec-20260724-006) (#307)
f835470d chore(release): v1.51.1 -- praxis ledger unify, MCP/CLI parity, shared host-toolkit (#306)
1f70e66b feat: extract shared adapter toolkit for host-claude-code and host-codex (phase 222-shared-adapter-toolkit) (#305)
e9f6556e fix: give the MCP surface real one-engine parity with the CLI (phase 221-mcp-cli-parity) (rec-20260725-003) (#304)
655663e5 feat: unify the five Praxis intelligence ledgers onto one shared module (phase 220) (#303)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260725-008 — Deepen the convergent-review protocol (candidate/ready-for-milestone)
  - rec-20260725-006 — Centralize gate bypass and seal policy in the settle driver (candidate/ready-for-milestone)
  - rec-20260725-007 — Split the settleService god function (candidate/ready-for-milestone)
  - rec-20260726-002 — Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it (candidate/ready-for-milestone)
  - rec-20260726-004 — README's architecture mermaid diagram has no doc-content test verifying it against code truth (candidate/ready-for-milestone)
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
- Files in play:
  - `packages/core/src/verify/converge.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/plan-review.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/code-review.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/services/spec-approve.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/types.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/build-test-must-pass.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/boundary-scan.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/security-audit.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/structural-verifier.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/per-task-verify.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `docs/reference/config.md` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/services/settle.ts` — affected by rec-20260725-007 Split the settleService god function
  - `packages/core/src/cli/commands/init.ts` — affected by rec-20260726-002 Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it
  - `packages/core/src/state/simple.ts` — affected by rec-20260726-002 Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it
  - `packages/core/tests/docs/` — affected by rec-20260726-004 README's architecture mermaid diagram has no doc-content test verifying it against code truth

## What landed this session
- Resumed via `/resume`; discovered the phase-223 handoff was already superseded by PR #308 (merged before this session started); reconciled the live picture instead of acting on the stale doc.
- Committed a previously-uncommitted `rec-20260726-004` ledger entry (README mermaid diagram doc-content-test gap) found sitting live in the working tree.
- Picked `rec-20260726-003` (ledger-remote-collision doctor check) via `cadence recommend` over the tied `rec-20260725-008`, with operator sign-off.
- Ran the full loop in a worktree (`.claude/worktrees/224-ledger-remote-collision-doctor`, since removed): hand-authored DRAFT (SPEC skipped, scope was already well-defined by the rec) → coherence check → approve → BUILD.
- T1 (core doctor-check implementation in `packages/core/src/doctor/run.ts`, reusing `checkRemoteFreshness` + `gitBestEffort`) built by one implementer subagent, independently re-verified (diff read, typecheck/lint/build re-run) and reviewed by a fresh adversarial reviewer subagent (PASS, 2 non-blocking minor notes).
- T2 (14 tests in `packages/core/tests/doctor/ledger-remote-collision.test.ts`, including a real bare-origin + second-clone integration test reproducing the actual `rec-20260726-001` collision) and T3 (`docs/reference/commands.md` check-table row + manual-fix-bucket entry) built in parallel once T1 landed, both independently re-verified.
- Whole-branch review: READY TO MERGE, zero Critical/Important findings; fixed one trivial stale rec-id reference in a docstring comment before settling.
- Single-commit settle, PR #309 opened, CI green after one known-flake re-run (`windows-latest, 22` failed the build step with zero diagnosable error content on the first attempt — content-free `ELIFECYCLE` exit 1, no TS error text; confirmed a similar unrelated Windows CI crash precedent on `main`'s own history before re-running once). Merged with operator consent.
- Post-merge: promoted `rec-20260726-003` to `shipped --ref "PR #309"`; local `main` had diverged from origin (own unpushed `rec-20260726-004` commit vs. origin's new squash) — rebased with operator's implicit continuation of the working session, resolving one straightforward JSON conflict by hand.
- Landed the resulting 2 local chore commits via a second PR (#310, pure `.cadence/intelligence/*.json`), CI green (no flakes), merged with operator consent; local `main` reset to `origin/main` with explicit operator consent (safe — the 2 local commits were exactly what got squashed).
- Cleaned up: both merge branches deleted (remote + local, tip-verified against `headRefOid` before any force-delete), phase worktree removed.

## Carry-forward gotchas
- **Hand-authored DRAFTs need explicit `- depends:` lines even when the dependency is "obvious."** This phase's 3 tasks (implement/test/docs) had no declared `depends:` edges, so `cadence dispatch plan --json` parallelized all three into one wave — but T2 (tests) and T3 (docs) genuinely needed T1's real shape to exist first. Caught it before dispatching and sequenced manually (T1 alone, then T2+T3 together), but the auto-computed wave plan cannot be trusted blindly when a hand-written DRAFT skips `depends:` — this is the same gotcha `[[feedback-draft-add-task-no-depends-flag]]` already names for CLI-scaffolded drafts; it applies equally to fully hand-authored ones.
- **`gh pr merge --delete-branch`'s local post-merge step has (at least) two distinct failure signatures**, both leaving the *remote* merge fully successful — always verify via `gh pr view <n> --json state,mergedAt,mergeCommit` rather than trusting the command's exit code: (a) the already-documented "'main' is already used by worktree at ..." when `main` is checked out elsewhere (hit on PR #309), and (b) "Not possible to fast-forward" when local `main` still holds the pre-squash commits that a just-merged PR squashed from a branch created directly off local `main` (hit on PR #310) — the fix there is `git reset --hard origin/main` (safe only when the diverging local commits are exactly what got squashed; confirm with the operator first, per the destructive-git-ops rule).
- **Direct-committing chore work onto local `main` before opening its PR guarantees this exact fast-forward divergence** the moment that PR is squash-merged. Branching *before* the first commit (as the `224-...` phase branch did) avoids it; the two ledger-only chores this session committed straight to local `main` did not, and needed the reset-hard dance above. Prefer branching first even for "trivial" chore commits in this repo.
- Stray untracked `.cadence/intelligence/exports/mil-rec-rec-20260724-013/SPEC.md` is STILL sitting untriaged across yet another session boundary now — not part of any recent session's work, safe to leave, but genuinely worth a keep/delete decision at some point.
- Stashed as: stash@{0} "handoff — pre-rebase local main dirt (recommend.json/RECOMMEND.md render + scheduled_tasks.lock)" — pure ephemeral cache-render + lock-file drift from `cadence recommend`/`cadence progress` calls made in the primary checkout before this session's rebase; safe to drop or pop, no real content.

## Next action
**Action:** Run `cadence recommend` and pick the next phase with the operator. As of this handoff the top-ranked `ready-for-milestone` candidates are `rec-20260725-008` (deepen the convergent-review protocol) and `rec-20260726-002` (fresh worktree has `.cadence/` but no `state.json` — `cadence init` refuses to bootstrap it, a bug this session's own worktree setup hit directly). Neither is a hard blocker; loop is IDLE with nothing in flight.
**Verify:** `cadence progress` shows loop position IDLE with no active phase/draft (confirms nothing was left mid-loop), and `git status --short --branch` on `main` shows `0 ahead / 0 behind origin` (confirms this session's landings are fully synced).
**If it fails:** if `cadence progress` shows an unexpected active phase/draft, or `main` shows local commits not on origin, STOP and investigate before starting new work — something changed between this handoff and the next session that this doc doesn't know about (re-run the origin-freshness check, don't assume).
