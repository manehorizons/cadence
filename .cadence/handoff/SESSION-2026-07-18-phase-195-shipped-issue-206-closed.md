---
cadence_handoff: 1
generated_at: 2026-07-18T23:17:48.626Z
label: phase-195-shipped-issue-206-closed
loop_position: IDLE
active_phase: 195-settle-refuses-bare-tn-done-with-no-verify-evidence
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 14e1cbc
git_ahead: 1
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-18 (phase-195-shipped-issue-206-closed)

## TL;DR for the next session
- Resumed from the prior handoff (v1.47.0 shipped, phases 192/193/194 bundled), sourced phase 195 from GitHub issue #206 (settle silently accepted bare `TN: DONE` with no verify evidence), and shipped it subagent-driven in an isolated worktree: a new `task-verify-required` settle gate that refuses when a DONE task's DRAFT `- verify:` line is empty/missing.
- Landed as PR #245 (feature commit + settle commit, squashed), all CI green (6 OS/Node legs + security/build), merged with operator consent. Remote + local branch and the phase worktree are cleaned up.
- Loop is IDLE. Next free phase number is **196**. `main` is dirty with routine `.cadence` telemetry drift (see below) and 1 ahead of origin (the phase-194 handoff-stamp commit, pre-existing before this session, still unpushed — operator's call).
- **New process discovery this session, now in memory**: `cadence` on PATH resolves to the globally-installed npm package, NOT a worktree's local source. Dogfooding a new gate/engine change inside a phase-build worktree via the bare `cadence` command silently exercises the OLD published logic — caught only because the new gate was missing from `SUMMARY.md`'s gate-provenance list. Any future phase-build touching engine/gate/parser code must dogfood via `node packages/core/bin/cadence.cjs <cmd>` from the worktree root, not bare `cadence`.
- Remaining backlog from the 2026-07-18 dispatched-agent scope-control incident (rec-20260718-003/004/005) and the standard `cadence recommend` candidates (team rollout kit, `cadence init --ci`, etc.) are all still `raw-idea`/`candidate` — untouched this session, same as the last several handoffs.
- No blockers.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 1 ahead / 0 behind origin
- HEAD `14e1cbc`
- Recent commits:
```
14e1cbc chore(cadence): stamp session handoff — phase-194-shipped-v1.47.0-released
14c7336 fix: settle refuses bare TN: DONE with no verify evidence (phase 195) (#245)
1923f6b chore(release): v1.47.0 -- dispatch-packet action-class boilerplate, worktree isolation recommendation, telemetry revision-conflict fix (#243)
57eb46b fix: exempt telemetry-only session counters from revision-guarded commits (phase 194) (#242)
a5500dc chore(cadence): mark rec-20260718-002 shipped (PR #240) (#241)
a786395 feat: recommend worktree isolation for mutation-scoped dispatch tasks (phase 193) (#240)
2766dc1 chore(cadence): mark rec-20260718-001 shipped (PR #238) (#239)
3b03250 feat: mandatory action-class prohibition boilerplate for dispatch packets (phase 192) (#238)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md                    |   2 +-
 .cadence/intelligence/RECOMMEND.md   |  33 +++++++---
 .cadence/intelligence/recommend.json | 123 +++++++++++++++++++++++++++++------
 .cadence/state.json                  |   4 +-
 packages/core/bin/cadence.cjs        |   0
 website/.gitignore                   |   1 +
 6 files changed, 129 insertions(+), 34 deletions(-)
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
- Scaffolded phase 195's DRAFT from GitHub issue #206, hand-authored real ACs/tasks/boundaries (the template's placeholder text needs replacing by hand — `add-ac`/`add-task` only append, they don't replace).
- Built in an isolated worktree: T1 (failing regression test) → T2 (`task-verify-required` gate implementation + tier-matrix wiring) → T3 (full verification) → T4 (docs/concepts.md sync). Every task's completion was independently re-verified (diff read + fresh typecheck/lint/test run) before recording DONE, and each task got a fresh independent reviewer.
- Whole-branch review caught a real gap the per-task reviews missed: `cadence explain gates` and `CLAUDE.md`'s gate-count line were left stale at "13 gates" after the new gate landed — fixed both and re-verified before merge.
- Discovered and fixed a DRAFT-authoring bug in the T2 task text itself: an inline backtick `` `- verify:` `` in prose collided with the draft-parser's line-matching regex and corrupted the dispatch packet's `Verify:` field — rewrote the sentence to avoid the collision (ironic, given the phase's own subject matter).
- Shipped PR #245 (fix commit + settle commit, squash-merged), verified all CI green, merged with operator consent, cleaned up branch + worktree (cross-checked local branch tip against the PR's `headRefOid` before force-deleting, since this repo's squash-merge history makes `git branch --merged` unreliable).
- Rebased the pre-existing local phase-194 handoff-stamp commit onto the newly-merged main (one `state.json` `revision`-counter conflict, resolved by taking the higher value); restored the pre-existing uncommitted `.cadence` telemetry drift via stash (also hit the known "conflicted stash pop stages the cleanly-merged files too" behavior — confirmed via literal `git status --short` reading before touching anything, then unstaged everything back to the original unstaged-drift shape).

## Carry-forward gotchas
- **New this session — `cadence` on PATH is the global npm install, not a worktree's local build.** `which cadence` resolves to `~/.nvm/versions/node/v20.x/lib/node_modules/@manehorizons/cadence-core/bin/cadence.cjs`, entirely disconnected from a phase-build worktree's uncommitted TypeScript changes. `draft new`/`draft approve`/`build task` are safe either way (their logic is stable across phases), but `settle run` (or any command exercising the phase's actual new logic) must be dogfooded via `node packages/core/bin/cadence.cjs <cmd>` from the worktree root after `pnpm --filter @manehorizons/cadence-core build`. First attempt at this phase's own `settle run --auto` used the bare global command, completed "successfully," but silently never exercised the new gate — only caught by noticing the gate was missing entirely (not even "skipped") from `SUMMARY.md`'s gate-provenance list. Redid the settle correctly afterward (confirm the new/changed gate shows up by name in the provenance list before trusting a dogfood run). Saved to memory (`feedback-cadence-path-binary-is-global-not-worktree`).
- **Reconfirmed this session — DRAFT prose containing a literal `- verify:`-shaped substring collides with the draft-parser's per-task regex.** Writing "the missing `` `- verify:` `` line" inside a task's `action:` prose made the parser match that occurrence instead of the real `- verify:` field below it, corrupting the dispatch packet. When writing DRAFT task text that discusses verify lines as a topic (as this phase's own subject matter required), avoid the literal `- verify:` substring in prose — rephrase around it.
- **Reconfirmed this session — a conflicted `git stash pop` restages the cleanly-merged files, not just the conflicted ones.** Hit again during post-merge sync (restoring pre-existing `.cadence` telemetry drift after rebasing a local commit onto the newly-merged main). Caught correctly by reading `git status --short`'s index column literally before acting, then unstaging everything to match the original unstaged-drift shape rather than leaving it staged.
- **Reconfirmed — `gh pr merge --squash --delete-branch`'s local post-merge checkout step fails here** (`'main' is already used by worktree at ...`) even though the remote merge always succeeds. Verify via `gh pr view <n> --json state,mergedAt` rather than trusting the CLI's own exit code, and finish branch deletion manually if `--delete-branch` didn't get there.
- **Reconfirmed — `git branch --merged` is useless in this squash-merge repo** for deciding whether a worktree/branch is safe to force-delete; cross-check `gh pr view <n> --json headRefOid` against the local branch's tip SHA first.
- Untouched loose ends, still sitting locally, still not committed (deliberately left for the operator, unchanged from prior handoffs): routine `.cadence` telemetry drift (`RECOMMEND.md`/`recommend.json` revision counters), untracked `audit-reports/` (local-only generated HTML, not referenced anywhere in the repo), `packages/core/.gitignore` (plausibly from local `deja` dedup-oracle use), `website/.gitignore`'s `.deja/` entry, and the recurring `packages/core/bin/cadence.cjs` file-mode flip (644↔755, zero content diff — an environment quirk across `pnpm install`/`build`, not a real change).
- `main` is 1 commit ahead of origin — the phase-194 handoff-stamp commit, which predates this session and is unrelated to phase 195's work. Left unpushed for the operator; not blocking anything (`cadence progress`/`cadence doctor` both correctly report 196 as the next free phase number regardless).
- The stale `171-installer-settings-parse-failure-recovery` worktree still claims a wide phantom phase-number range in `cadence doctor`'s `worktree-phases` check — same non-urgent cleanup item noted in prior handoffs, still unresolved, still not blocking.

## Next action
**Action:** No urgent follow-up from this session's work — phase 195 is merged and CI-green on main. Pick up the next unit of work from `cadence recommend` (top candidates: rec-20260619-008 team rollout kit, rec-20260709-003 `cadence init --ci`, or the remaining 2026-07-18 incident backlog rec-20260718-003/004/005) or from `gh issue list` for any new untriaged issues, and scaffold it as phase 196 (`cadence draft new --title "..." --template <bugfix|feature|refactor> --from-rec <recId>` if sourced from a rec — omit the `num` arg, it defaults correctly).
**Verify:** `cadence progress` shows a new active draft once phase 196 is scaffolded.
**If it fails:** if `cadence draft new` collides on a phase number, re-check `cadence doctor` for the current genuinely-free number (196 as of this handoff) rather than trusting it blindly in a future session — the stale 171-installer worktree's phantom range warning is cosmetic but always re-verify. If the phase touches gate/engine/parser code, remember the dogfooding gotcha above: rebuild and invoke `node packages/core/bin/cadence.cjs` locally, never the bare `cadence` command, when exercising the new logic inside the phase's worktree.
