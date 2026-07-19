---
cadence_handoff: 1
generated_at: 2026-07-19T04:15:25.898Z
label: phase-197-shipped-issue-177-onboard-fallout
loop_position: IDLE
active_phase: 195-settle-refuses-bare-tn-done-with-no-verify-evidence
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 8cc4b2d
git_ahead: 3
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-19 (phase-197-shipped-issue-177-onboard-fallout)

## TL;DR for the next session
- Shipped phase 197 (issue #177 fallout from phase 196): `cadence onboard` now bootstraps a fresh `state.json` when one is missing instead of silently no-op'ing, and `cadence doctor`'s advice for that case now names the real fix. Landed as PR #250, squash-merged, `ci-success` green (13/13 checks).
- Discovered this bug **live**, while trying to scaffold phase 197 itself: a fresh worktree created post-phase-196 has no `state.json` (gitignored, not copied by git), `cadence init` refuses since `.cadence/` already exists, and `cadence onboard` — built for exactly this case — silently no-op'd instead of creating one. Had to hand-bootstrap a temporary `state.json` once just to unblock the CLI enough to author the fix through it (see gotcha below).
- Deferred: **issue #249** (ReDoS-shaped regex injection via `--filter-regex` in `assumption.ts`/`decision.ts`/`recommendation.ts`) was the originally-planned phase 197 candidate; swapped out because the onboard-bootstrap bug was actively blocking this session's own worktree, not just a narrow theoretical CLI threat. Still open, untriaged — good phase 198 candidate.
- Loop is genuinely IDLE; `cadence progress` reports **198** as the next free phase number. The frontmatter `active_phase` above still shows the old `195-...` — stale bookkeeping in the primary checkout (never touched by this session, which built phase 197 entirely inside a now-deleted worktree), not a blocker.
- No blockers.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 3 ahead / 0 behind origin
- HEAD `8cc4b2d`
- Recent commits:
```
8cc4b2d chore(cadence): stamp session handoff — phase-196-shipped-issue-177-closed
a2f3e8b chore(cadence): stamp session handoff — phase-195-shipped-issue-206-closed
bb6259e chore(cadence): stamp session handoff — phase-194-shipped-v1.47.0-released
9dd68f8 fix: cadence onboard bootstraps missing state.json for fresh worktrees/clones (phase 197) (#250)
ac6722c fix: untrack per-worktree state.json/STATE.md to stop cross-worktree merge conflicts (issue #177) (phase 196) (#247)
14c7336 fix: settle refuses bare TN: DONE with no verify evidence (phase 195) (#245)
1923f6b chore(release): v1.47.0 -- dispatch-packet action-class boilerplate, worktree isolation recommendation, telemetry revision-conflict fix (#243)
57eb46b fix: exempt telemetry-only session counters from revision-guarded commits (phase 194) (#242)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/RECOMMEND.md   |  33 +++++++---
 .cadence/intelligence/recommend.json | 123 +++++++++++++++++++++++++++++------
 .claude/scheduled_tasks.lock         |   2 +-
 packages/core/bin/cadence.cjs        |   0
 website/.gitignore                   |   1 +
 5 files changed, 127 insertions(+), 32 deletions(-)
```
- Loop: IDLE · phase 195-settle-refuses-bare-tn-done-with-no-verify-evidence · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260619-008 — Team rollout kit (candidate/raw-idea)
  - rec-20260709-003 — cadence init --ci: generate + enforce a CI gate workflow for consumer repos (candidate/raw-idea)
  - rec-20260710-001 — Clarify Claude Code auth vs ANTHROPIC_API_KEY confusion in provider docs + fallback warning (candidate/raw-idea)
  - rec-20260711-004 — Cadence-native UI-spec gate between SPEC and DRAFT (when applicable) (candidate/raw-idea)
  - rec-20260712-003 — Retro friction feeds back into Praxis recommendation scoring (candidate/raw-idea)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
- Files in play:
  - `README.md` — affected by rec-20260619-008 Team rollout kit
  - `docs/README.md` — affected by rec-20260619-008 Team rollout kit
  - `.github` — affected by rec-20260619-008 Team rollout kit

## What landed this session
- Phase 197: `cadence onboard` bootstraps a missing `state.json` (`loopPosition: IDLE`, no active phase/draft, `revision: 0`), deriving the project name from `.cadence/PROJECT.md`'s `# <name>` header (not `package.json`, which disagrees with the recorded name in this very monorepo). An existing `state.json` is left byte-for-byte untouched.
- `cadence doctor`'s missing-`state.json` diagnostic now names `cadence onboard` instead of advice that no longer worked ("run any cadence command" / "or `cadence init`", neither of which resolves the case).
- `docs/reference/commands.md`'s `onboard` behavior section rewritten to describe both the bootstrap and pass-through paths; `.changeset/onboard-bootstraps-missing-state.md` added (patch bump).
- 4 DRAFT tasks (T1 regression test, T3 doctor message, T2 the actual onboard fix, T4 full verification), each independently re-verified in the main thread (diff read + real test re-run) before recording DONE — never trusted a subagent's self-report.
- Two rounds of whole-branch review: first pass came back NOT READY (stale doc describing pre-fix behavior, missing changeset, two tests with unfilled `AC-?` placeholder / stale "EXPECTED TO FAIL" phrasing left over from before T2 landed) — all three fixed directly, second independent pass came back READY TO MERGE.
- PR #250 merged via squash; all 13 CI checks green (6-leg test matrix + build/lint/CodeQL/audit/sbom/secret-scan). `gh pr merge --delete-branch`'s local post-merge-checkout step failed again (known recurring pattern — "main already used by worktree"); this time the *remote* branch also survived, so it needed a manual `gh api -X DELETE .../git/refs/heads/<branch>`. Primary checkout rebased cleanly onto the new `main`; phase worktree removed.

## Carry-forward gotchas
- **This fix hasn't been released to npm yet.** The global `cadence` binary (whatever's on PATH) still has the old broken `onboard.ts` until the next release ships. Any future session working in a **fresh worktree** created before that release must either (a) build from source after pulling this merge — `pnpm --filter @manehorizons/cadence-types build && pnpm --filter @manehorizons/cadence-testkit build && pnpm --filter @manehorizons/cadence-core build`, then invoke `node packages/core/bin/cadence.cjs` (matches the existing "cadence on PATH is global, not worktree" dogfooding gotcha) — or (b) hand-bootstrap a temporary `state.json` in the worktree root (mirror the primary checkout's shape: `schemaVersion:1, revision:0, activePhase:null, activeDraft:null, loopPosition:"IDLE", ...`) if using the global binary before the next release. This session did (b) once, purely to unblock `cadence draft new` enough to author the DRAFT for the real fix through proper structured writers instead of hand-editing.
- `gh pr merge --delete-branch` still fails its local post-merge-checkout step every time it's tried from a primary checkout that also has `main` in a worktree elsewhere — same known pattern, but this time the *remote* branch delete also silently no-op'd (previous sessions only saw the local step fail). Always verify with `gh pr view <n> --json state,mergedAt,mergeCommit` and `git ls-remote --heads origin <branch>` before assuming cleanup finished.
- Primary checkout has two untracked docs I didn't recognize and left untouched: `docs/cc-insights-ingestion-handoff.md`, `docs/handoff-v147-recommendations.md` (both timestamped ~22:04–22:06, before this session's worktree work began — not concurrent activity, just pre-existing local files). Worth the operator checking what these are; not investigated or acted on.
- Deferred to next phase: **issue #249** (ReDoS-shaped regex injection via `--filter-regex`) — was the original candidate for this phase, set aside because the onboard-bootstrap bug was actively blocking. Still open, untriaged, narrow-but-real threat model (local CLI, `--filter-regex` is operator-typed — confirmed not reachable via any MCP tool).
- Routine `.cadence` telemetry drift (`RECOMMEND.md`/`recommend.json` revision counters) and the recurring `packages/core/bin/cadence.cjs` file-mode flip (644↔755, zero content diff) are present again, same as every recent handoff — left for the operator.
- `main` is 3 commits ahead of origin (the phase-194/195/196 handoff-stamp commits, pre-existing before this session, rebased cleanly onto the phase-197 merge) — left unpushed for the operator, same pattern as every recent handoff.

## Next action
**Action:** Pick up issue #249 (ReDoS-shaped regex injection via `--filter-regex` in `assumption.ts`/`decision.ts`/`recommendation.ts`) as phase 198 — `gh issue view 249` for full context, then `cadence draft new` to scaffold. Alternatively, `cadence recommend` still has several raw-idea candidates (rec-20260619-008 team rollout kit, rec-20260709-003 `cadence init --ci`, etc.) that need `cadence milestone propose` before they're phase-ready.
**Verify:** `cadence progress` shows a new active draft once phase 198 is scaffolded.
**If it fails:** if working in a fresh worktree, hit the state.json bootstrap gotcha above first — build from source (`pnpm --filter @manehorizons/cadence-types build && pnpm --filter @manehorizons/cadence-testkit build && pnpm --filter @manehorizons/cadence-core build`) to get the fixed `cadence onboard`, or hand-bootstrap `state.json` if stuck on the pre-release global binary. If `cadence draft new` collides on a phase number, re-check `cadence doctor` for the current genuinely-free number rather than trusting it blindly — the stale `171-installer` worktree's phantom phase-range warning is cosmetic but always re-verify.
