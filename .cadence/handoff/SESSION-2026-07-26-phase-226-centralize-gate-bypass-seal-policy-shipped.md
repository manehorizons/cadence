---
cadence_handoff: 1
generated_at: 2026-07-26T22:31:53.132Z
label: phase-226-centralize-gate-bypass-seal-policy-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 9d8bfa13
git_ahead: 3
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-26 (phase-226-centralize-gate-bypass-seal-policy-shipped)

## TL;DR for the next session
- Phase 226 ("Centralize gate bypass and seal policy in the settle driver", `rec-20260725-006`) shipped: fixed `gates.sealed` doc drift (all 3 gates now named), declared a bypass-flag naming policy, extended bypass-provenance recording to `build-test-must-pass`/`boundary-scan` — merged as PR #313 (squash `a58cac16`).
- Every task (T1/T2/T3) plus the final whole-branch review each caught and fixed a real, independently-verified issue — see "What landed" for specifics. This was a clean run of the full `phase-build` pipeline (worktree isolation, per-task implementer + independent reviewer, whole-branch review, single settle commit, PR, CI, consent-gated merge).
- Filed two follow-up recs from findings out of this phase's scope: `rec-20260726-005` (a pre-existing `coverage.ts` provenance false-negative for force-only bypasses) and `rec-20260726-006` (`boundary-scan` missing from the gate-universe doc matrix).
- Local `main` is 3 ahead / 0 behind origin (2 pre-existing handoff-stamp commits + this session's ledger-sync commit) — not pushed, per standing preference (confirmed explicitly this session).
- No active phase/draft — loop is IDLE. Next unit of work should come from `cadence recommend` (top candidates below); nothing is blocking.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 3 ahead / 0 behind origin
- HEAD `9d8bfa13`
- Recent commits:
```
9d8bfa13 chore: sync main ledger after phase 226 merge, close its milestone (ref PR #313)
8db97674 chore(cadence): stamp session handoff — 2026-07-26 (phase 225 convergent-review-runner shipped)
b4d16c18 chore(cadence): stamp session handoff — 2026-07-26 (phase 224 ledger-remote-collision-doctor shipped)
a58cac16 feat: centralize gate bypass and seal policy documentation + provenance (phase 226) (#313)
6b06c029 chore: promote rec-20260725-008 to shipped + close its milestone (ref PR #311) (#312)
0e854cdd refactor: extract shared runConvergentReview primitive (phase 225-convergent-review-runner) (rec-20260725-008) (#311)
00aca320 chore: sync rec-20260726-004 + promote rec-20260726-003 to shipped (#310)
92ae02eb feat: cadence doctor detects cross-session ledger id collisions before push (phase 224-ledger-remote-collision-doctor) (rec-20260726-003) (#309)
```
- Uncommitted (diff --stat):
```
.claude/scheduled_tasks.lock | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260725-007 — Split the settleService god function (candidate/ready-for-milestone)
  - rec-20260726-002 — Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it (candidate/ready-for-milestone)
  - rec-20260726-004 — README's architecture mermaid diagram has no doc-content test verifying it against code truth (candidate/ready-for-milestone)
  - rec-20260724-004 — Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger (candidate/needs-decision)
  - rec-20260726-005 — coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode (candidate/needs-decision)
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
  - `packages/core/src/services/settle.ts` — affected by rec-20260725-007 Split the settleService god function
  - `packages/core/src/cli/commands/init.ts` — affected by rec-20260726-002 Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it
  - `packages/core/src/state/simple.ts` — affected by rec-20260726-002 Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it
  - `packages/core/tests/docs/` — affected by rec-20260726-004 README's architecture mermaid diagram has no doc-content test verifying it against code truth
  - `.cadence/ROADMAP.md` — affected by rec-20260724-004 Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260726-005 coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode
  - `packages/core/src/gates/registry.ts` — affected by rec-20260726-005 coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode

## What landed this session
- Phase 226 fully built and merged: SPEC → DRAFT (3 tasks, T1/T2/T3) → BUILD (worktree-isolated wave dispatch: T1+T3 in parallel wave 1, T2 in wave 2 after T1 since both touch `docs/concepts.md`) → whole-branch review → settle → PR #313.
- **T1** (doc fix): new `packages/core/tests/docs/gates-sealed-doc-sync.test.ts` derives the sealed-gate set from real `isGateSealed` call sites (not hardcoded); fixed `docs/reference/config.md` + `docs/concepts.md` to name all 3 gates (`test-coverage`/`build-test-must-pass`/`boundary-scan`) and add the 2 missing bypass-table rows. Reviewer caught and fixed one real issue: a stale "these two entries" cross-reference left over after the table grew from 2 to 3 rows.
- **T2** (naming policy): declared a bypass-flag naming policy in `docs/concepts.md`, auditing all ~16 flags in the "Gate bypass reference summary" table. Reviewer caught 3 real gaps, all fixed with git-log-verified dates: `structural-verifier`/`--allow-open-tasks` was entirely missing from the table and the `--force` gate list; a wrong claim that `--allow-failing-build` pre-dates the `--allow-<gate>-failure` convention (it actually ships in Phase 39.2, *two weeks after* the convention started); `--allow-per-task-failure` was never given an exception note.
- **T3** (provenance parity): `build-test-must-pass.ts`/`boundary-scan.ts` now set `flags.*Bypassed` on a genuine unsealed bypass; `registry.ts` records a matching skip reason. Reviewer found the new flags had zero direct gate-level test coverage (only synthetic registry stubs, unlike `coverage.ts`'s precedent) — fixed with direct assertions in `build-test-must-pass.test.ts`/`boundary-scan.test.ts`.
- **Whole-branch review** caught 2 more issues, both fixed: a *repeat* instance of the wrong-historical-claim defect class (the naming convention's real first instance is `--allow-per-task-failure`/Phase 24.2, not `--allow-code-review-failure`/Phase 24.3 as T2's fixed text still said), and a provenance-message ambiguity — `build-test-must-pass`/`boundary-scan`'s bypass skip-reason always named the gate's own dedicated flag even when the bypass was actually via bare `--force`. Fixed in `registry.ts` by checking `ctx.opts` to name whichever flag actually fired; added dedicated `--force`-only test cases proving it.
- Filed `rec-20260726-005` (coverage.ts's `coverageBypassed` is a false-negative for a force-only bypass in assertion mode — pre-existing, not introduced by this phase) and `rec-20260726-006` (`boundary-scan` absent from `docs/concepts.md`'s main gate-universe matrix) for findings outside this phase's scope.
- Landed via the `pr-land` skill: full monorepo `pnpm turbo run lint typecheck test build` green (24/24 tasks), pushed, PR #313, full CI matrix green (13 checks incl. `ci-success`), merged by explicit operator consent (squash `a58cac16`), worktree removed, remote branch deleted.
- Post-merge ledger sync in the primary checkout: rebased 2 pre-existing unpushed handoff-stamp commits onto the new `origin/main` (clean, no overlap). A stash from pre-worktree `cadence milestone propose/accept/export` commands (run in the primary checkout before this session entered phase 226's worktree) had one real conflict in `recommendations.json`/`RECOMMENDATIONS.md` between the stale pre-worktree state and the now-authoritative shipped state — resolved by keeping origin's side. Closed milestone `mil-rec-rec-20260725-006` (ref PR #313), which had been stuck in `exported` status.

## Carry-forward gotchas
- Local `main` is 3 ahead of origin (unpushed): 2 pre-existing handoff-stamp chores from before this session + this session's `chore: sync main ledger after phase 226 merge, close its milestone (ref PR #313)` commit. Left unpushed per standing preference — confirmed explicitly with the operator this session (default answer to "push?" is no).
- `.claude/scheduled_tasks.lock` has a genuine, expected machine-local diff (session id/pid changed) — correctly left uncommitted; do not stage or commit it.
- The pre-worktree `cadence milestone propose/accept/export` commands run directly in the primary checkout (before `EnterWorktree`) caused a real stash conflict when syncing `main` back after phase 226 merged — another live instance of the standing "state-mutating `cadence` commands belong inside the worktree, never before `EnterWorktree`" lesson. No data was lost (origin's authoritative post-merge ledger state was kept over the stale pre-worktree stub), but it cost a manual conflict-resolution pass on `recommendations.json`/`RECOMMENDATIONS.md`.
- `rec-20260726-005` and `rec-20260726-006` are freshly filed this session, unreviewed by the operator — surface them the next time `cadence recommend`/`cadence milestone propose` runs.
- No stash is currently outstanding from this session — the one used during the ledger sync was fully resolved and dropped (`820e0f18…`).
- The global `cadence` on PATH is still v1.49.0, this repo is at v1.51.1 (unreleased) — use `node packages/core/bin/cadence.cjs <subcommand>` (after `pnpm build` if source has changed) for any dogfooding of new engine/gate logic, not the global binary.

## Next action
**Action:** Run `cadence recommend` and pick the next phase with the operator. As of this handoff the top-ranked candidates are `rec-20260725-007` (split the settleService god function), `rec-20260726-002` (fresh-worktree `.cadence/` present but no `state.json` — `cadence init` refuses to bootstrap it; hit live in multiple recent phase builds, a strong candidate to finally fix), `rec-20260726-004` (README architecture-mermaid doc-test gap), and `rec-20260726-005` (this session's `coverage.ts` force-only bypass provenance finding). Neither is a hard blocker; loop is IDLE with nothing in flight.
**Verify:** `cadence progress` shows loop position IDLE with no active phase/draft, and `git status --short --branch` on `main` shows `3 ahead / 0 behind origin` (expected/unpushed) with only `.claude/scheduled_tasks.lock` dirty.
**If it fails:** if `cadence progress` shows an unexpected active phase/draft, or `main` shows unpushed commits beyond the 3 listed in "State on handoff", STOP and investigate before starting new work — something changed between this handoff and the next session that this doc doesn't know about (re-run the origin-freshness check, don't assume).
