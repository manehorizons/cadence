---
cadence_handoff: 1
generated_at: 2026-07-18T19:37:03.956Z
label: phases-192-193-shipped-issue-234-flagged
loop_position: IDLE
active_phase: 193-dispatch-isolation-recommendation
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: a5500dc
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-18 (phases-192-193-shipped-issue-234-flagged)

## TL;DR for the next session
- Session resumed via `/resume`; the replayed handoff (phase-189-shipped) was stale — phases 190/191 plus a v1.46.0 release had already landed without a fresh handoff being written. Found and reconciled a dirty working tree carrying 5 finished-but-uncommitted Praxis recommendations (rec-20260718-001..005) documenting a real incident in a sibling `deja` project: a dispatched fork agent overran its scope, committed 4x directly to `main`, and self-authorized via a side-channel `AskUserQuestion` the orchestrator never saw.
- Picked the top two of those recs off `cadence recommend` and shipped both as full phases, subagent-driven in isolated worktrees, each with per-task independent review + a whole-branch review before settling: **phase 192** (mandatory action-class prohibition boilerplate in `cadence dispatch plan`'s rendered packet — no more self-recording via `cadence build task`, an explicit stop-and-report-to-orchestrator instruction instead) and **phase 193** (`recommendedIsolation: 'worktree'|'none'` heuristic surfaced in both the packet text and `--json` output, computed purely from `task.files.length`, no schema change).
- Both recs are now `status: shipped`; `cadence doctor`'s `recommendation-shipped-drift` check is clean. Remaining backlog from the same incident: **rec-20260718-003** (frame dispatched task boundaries as stop-conditions, not file-scope lists), **rec-20260718-004** (surface files-outside-boundary anomalies per-task at `cadence build task` time, not only at settle), **rec-20260718-005** (document the invisible-background-subagent-`AskUserQuestion` gap in host-adapter guidance) — all still `raw-idea`/`candidate`, untouched.
- **New this session — GitHub issue #234** (filed today, untriaged, no labels): `cadence settle run` deterministically fails with `StateConflictError` whenever any verifier gate is configured `provider: "host-cli"` — a real regression from phase 191/v1.46.0 (PR #223, the same release that wired real `host-cli` builders for all 5 remaining verifier families). Root cause is already traced in the issue body: `host-cli` gates can each take up to 3 minutes, settle runs its 5 gates sequentially, and any *other* subagent's `SubagentStop` firing during that stretched read→commit window bumps `state.json`'s `revision` via an independent commit, invalidating settle's snapshot. Never converges on retry. This is a real bug worth triaging/fixing, not part of the 192/193 work.
- Loop is IDLE, `main` clean and synced at `a5500dc`. Next free phase number is 194. A pile of untouched loose ends (see gotchas) has been sitting in the working tree the whole session — none blocking, none touched.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `a5500dc`
- Recent commits:
```
a5500dc chore(cadence): mark rec-20260718-002 shipped (PR #240) (#241)
a786395 feat: recommend worktree isolation for mutation-scoped dispatch tasks (phase 193) (#240)
2766dc1 chore(cadence): mark rec-20260718-001 shipped (PR #238) (#239)
3b03250 feat: mandatory action-class prohibition boilerplate for dispatch packets (phase 192) (#238)
d8c608c chore(cadence): record rec-20260718-001..005 (dispatched-agent scope-control incident) (#237)
883824a chore(cadence): mark rec-20260710-004 shipped (retroactive, no dedicated phase) (#233)
58b0007 chore(cadence): mark rec-20260709-002 shipped (#222 / v1.46.0) (#231)
3f8d7f0 chore(release): v1.46.0 -- host-cli builders for all 6 verifier gates, retro rollup, init --full, onboard, doctor-fix handoff-retention, gate-bypass audit fix (#230)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md                    |   2 +-
 .cadence/intelligence/RECOMMEND.md   |  74 ++-------
 .cadence/intelligence/recommend.json | 302 +++--------------------------------
 .cadence/state.json                  |   4 +-
 packages/core/bin/cadence.cjs        |   0
 website/.gitignore                   |   1 +
 6 files changed, 45 insertions(+), 338 deletions(-)
```
- Loop: IDLE · phase 193-dispatch-isolation-recommendation · tier (none)

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
- PR #237 — recorded rec-20260718-001..005 (deja-incident recommendations), merged.
- PR #238 — phase 192: mandatory action-class prohibition boilerplate for dispatch packets (`packages/core/src/dispatch/packet.ts`), merged. `.changeset` (patch, cadence-core). One re-run needed for the known `settle-code-review.test.ts`/`settle-codereview-convergence.test.ts` 20s-timeout flake on `macos-latest, 20`.
- PR #239 — mark rec-20260718-001 shipped, merged.
- PR #240 — phase 193: `recommendedIsolation` heuristic threaded into `renderPacket` text + `dispatch plan --json` output (`packages/core/src/dispatch/packet.ts`, `packages/core/src/services/dispatch.ts`), merged. `.changeset` (minor, cadence-core). All CI green first try, no flake.
- PR #241 — mark rec-20260718-002 shipped, merged.
- Confirmed via `gh issue list --search "host-cli"` that issue #234 exists and is untriaged; read and understood in full (see TL;DR) but not yet acted on.

## Carry-forward gotchas
- **GitHub issue #234 needs triage.** No labels, filed today. It's a real, well-diagnosed bug (root cause already traced to `packages/core/src/state/simple.ts`'s `commit()`, `services/settle.ts`'s single-read-then-commit shape, and `hooks/handlers.ts`'s independent `subagent-result` commit path) — not a duplicate of anything shipped this session. Worth converting to a phase once triaged; the issue body already suggests concrete directions (bounded retry-on-conflict re-checking whether anything settle-relevant actually changed, or moving telemetry-only counters like `subagentSpawns` outside the revision-guarded state).
- **New this session — a conflicted `git stash pop` leaves cleanly-merged files STAGED, not just working-tree-modified.** After resolving a `.cadence/state.json` merge conflict from a stash pop (during the PR #240 main-sync), `git status --short` showed the other stash-restored files as `M ` (index column) rather than ` M` (worktree column) — I misread this as ordinary unstaged dirt for the rest of the session. A later plain `git commit` (intended to carry only 2 freshly-`git add`-ed files) swept in all 5 already-staged unrelated files (telemetry drift + the `cadence.cjs` mode flip + `website/.gitignore`) into what was meant to be a clean "mark rec shipped" commit. Caught before pushing via `git show --stat HEAD`; fixed with `git reset --soft HEAD~1` + `git restore --staged <the 5 files>` + re-commit. **Lesson: after any conflicted stash pop, run `git status --short` and read the index column literally (`M ` = staged) before trusting a later `git add <specific files> && git commit` to scope cleanly — don't assume everything sitting in "modified" is unstaged.**
- Same `gh pr merge --delete-branch` local-checkout-failure pattern hit twice more this session (PRs #237, #240, #241) — always the remote squash-merge succeeding while the local post-merge branch-delete/checkout step fails (once because the Bash tool's cwd was stuck inside a just-removed worktree, twice because the local branch was still checked out in a worktree). Pattern confirmed via `gh pr view <n> --json state,mergedAt,mergeCommit` each time; reconciled primary `main` manually per the established recipe (stash loose ends → `git reset --hard origin/main` or `git pull --ff-only` depending on whether local had a redundant pre-squash commit → stash pop → resolve any `state.json`/`STATE.md` conflict by taking origin's side).
- **Untouched loose ends, still sitting locally, still not committed (deliberately left for the operator to triage):** routine `.cadence` telemetry drift (`state.json`/`STATE.md`/`RECOMMEND.md`/`recommend.json` revision counters), an untracked `audit-reports/cadence-repo-audit-2026-07-18.html` (1386 lines, looks like a local-only generated audit report, not referenced anywhere in the repo), `.deja/` added to `website/.gitignore` and a new untracked `packages/core/.gitignore` (plausibly from local use of the `deja` dedup-oracle tool), and a `packages/core/bin/cadence.cjs` file-mode flip (644→755, no content change, looks like an incidental local `chmod`).
- The stale `171-installer-settings-parse-failure-recovery` worktree still claims a wide phantom phase-number range in `cadence doctor`'s `worktree-phases` check — same non-urgent cleanup item noted in prior handoffs, still unresolved, still not blocking (`cadence doctor` correctly reports the next genuinely free number, 194, despite the warning).

## Next action
**Action:** Triage GitHub issue #234 first (it's a real regression from the same v1.46.0/phase-191 release, and blocks any project using `host-cli` verifier gates from ever settling) — apply appropriate labels, then decide whether to convert it directly into phase 194 (`cadence recommendation` doesn't apply here since it's an issue, not a Praxis rec; go straight to `cadence draft new 194-<slug> --template bugfix`) or discuss the fix approach first given the issue lists multiple plausible directions. Alternatively, if the operator prefers to keep working the incident backlog instead, `rec-20260718-003` (stop-conditions framing) is next on `cadence recommend`.
**Verify:** `cadence progress` shows a new active draft once phase 194 is scaffolded; for issue #234 specifically, a fix should be verified by reproducing the failure first (host-cli-configured gates + concurrent subagent activity during a multi-minute settle) before confirming the fix converges.
**If it fails:** if `cadence draft new` collides on a phase number, re-check `cadence doctor` for the current genuinely-free number (194 as of this handoff, but the stale 171-installer worktree's phantom range means always re-verify rather than trusting this number blindly in a future session).
