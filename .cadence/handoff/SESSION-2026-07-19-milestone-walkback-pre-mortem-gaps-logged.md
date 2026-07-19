---
cadence_handoff: 1
generated_at: 2026-07-19T19:34:38.132Z
label: milestone-walkback-pre-mortem-gaps-logged
loop_position: BUILD
active_phase: 198-bound-filter-regex-complexity-to-prevent-redos
active_draft: 198-01
tier: standard
git_branch: main
git_dirty: true
git_head: cb339a4
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-19 (milestone-walkback-pre-mortem-gaps-logged)

## TL;DR for the next session
- Shipped phase 198 (closes issue #249, ReDoS-shaped `--filter-regex` injection) via PR #252, then cleared a multi-session backlog of stuck handoff-stamp commits (phases 194-197) via PR #253 — discovered `git push origin main` is **structurally always rejected** by branch protection here, even when the local pre-push hook passes; must always branch+PR, even for pure chore commits.
- Walked `rec-20260619-008` (Team rollout kit) live through the full milestone lifecycle: raw-idea → accepted/ready-for-milestone → proposed → accepted → had Opus independently pre-mortem it → walked back to `needs-decision` after the review surfaced real problems (undecided build-vs-docs scope fork, ambiguous `.github` file target, maintenance-burden and audience/traction risk, thin evidence). Milestone `mil-rec-rec-20260619-008` deferred.
- That exercise surfaced two genuine CADENCE tooling gaps, both logged: broadened the existing `rec-20260714-001` (was scoped to just `outOfScope`, actually covers all 3 pre-mortem operator fields) and created new `rec-20260719-001` (no CLI writer to attach evidence to an *existing* recommendation — `intelligence reconcile` silently doesn't help, it never reads the evidence ledger).
- All `.cadence/intelligence/*` ledger changes from this work are **intentionally left uncommitted** — the operator wants them bundled into the next feature/bugfix release commit, not committed standalone. Do not commit them separately.
- No blockers. `main` is fully synced with origin (0 ahead / 0 behind) — first time in several sessions.
- The primary checkout's own local `state.json` (gitignored) is still stale from a prior-session mistake — see gotcha below, now carrying into a second handoff untouched.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `cb339a4`
- Recent commits:
```
cb339a4 chore(cadence): land stuck session-handoff commits (phases 194-198) (#253)
7a9098a fix: bound --filter-regex length to prevent ReDoS (phase 198) (#252)
9dd68f8 fix: cadence onboard bootstraps missing state.json for fresh worktrees/clones (phase 197) (#250)
ac6722c fix: untrack per-worktree state.json/STATE.md to stop cross-worktree merge conflicts (issue #177) (phase 196) (#247)
14c7336 fix: settle refuses bare TN: DONE with no verify evidence (phase 195) (#245)
1923f6b chore(release): v1.47.0 -- dispatch-packet action-class boilerplate, worktree isolation recommendation, telemetry revision-conflict fix (#243)
57eb46b fix: exempt telemetry-only session counters from revision-guarded commits (phase 194) (#242)
a5500dc chore(cadence): mark rec-20260718-002 shipped (PR #240) (#241)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/MILESTONES.md        |   1 +
 .cadence/intelligence/RECOMMEND.md         |  36 +++++---
 .cadence/intelligence/RECOMMENDATIONS.md   |  26 +++++-
 .cadence/intelligence/evidence.json        |  21 +++++
 .cadence/intelligence/milestones.json      |  20 +++++
 .cadence/intelligence/recommend.json       | 128 +++++++++++++++++++++++------
 .cadence/intelligence/recommendations.json |  52 +++++++++---
 7 files changed, 236 insertions(+), 48 deletions(-)
```
- Loop: BUILD · phase 198-bound-filter-regex-complexity-to-prevent-redos · tier standard

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260619-008 — Team rollout kit (accepted/needs-decision)
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
- `fix: bound --filter-regex length to prevent ReDoS (phase 198)` — closes #249. PR #252, merged, `ci-success` green (14/14 checks).
- `chore(cadence): land stuck session-handoff commits (phases 194-198)` — PR #253, merged; unstuck a backlog of local-only handoff-stamp commits that had been silently failing direct push across phases 194-197.
- `rec-20260619-008` (Team rollout kit): promoted raw-idea → accepted/ready-for-milestone, proposed (`mil-rec-rec-20260619-008`), accepted, independently pre-mortem'd by Opus, then walked back to `needs-decision` with a corroborating evidence note (`ev-20260719-001`) capturing the open question and every risk the review surfaced.
- `rec-20260714-001`: retitled + evidence added (`ev-20260719-002`) — broadened from "no writer for `outOfScope`" to "no writer for any of the 3 operator-authored pre-mortem fields."
- `rec-20260719-001` (new): "No CLI writer to attach evidence to an existing recommendation" — documents the exact mechanism (evidence.json + recommendations.json's `evidenceIds` must be hand-edited in lockstep; `intelligence reconcile` doesn't help).
- All ledger writes done via a mix of the real CLI (`recommendation promote`, `milestone propose/accept/defer/premortem`, `recommendation add`) and direct hand-edits where no CLI writer exists yet (both gaps now tracked as recommendations themselves).

## Carry-forward gotchas
- **DO NOT commit `.cadence/intelligence/*` right now.** The operator explicitly wants this ledger dirt (`MILESTONES.md`, `RECOMMEND.md`, `RECOMMENDATIONS.md`, `ASSUMPTIONS.md`, `evidence.json`, `milestones.json`, `recommend.json`, `recommendations.json`) bundled into the **next feature/bugfix release commit**, not a standalone chore commit. Leave it uncommitted until that phase's feature commit lands.
- Primary checkout's local `.cadence/state.json` (gitignored) is **still stale as of this handoff too** (now spans 2 sessions): shows `loopPosition: BUILD`, `activePhase: 198-bound-filter-regex-complexity-to-prevent-redos`, `activeDraft: 198-01` — leftover from a prior-session mistake (draft authored before entering a worktree). Phase 198 is fully shipped and merged; this is cosmetic-only. Do **not** run `cadence settle run --auto` in the primary checkout to "fix" it — see the phase-198 handoff for the full explanation.
- `git push origin main` is **structurally always rejected** here — GitHub branch protection requires `ci-success` recorded against the exact pushed commit SHA, which only exists for commits that went through Actions via a PR. The local pre-push hook passing is necessary but never sufficient. Always branch + PR, even for pure chore/handoff-stamp commits.
- `git reset --hard <ref>` wipes **uncommitted working-tree changes too**, not just commits, and it's not recoverable via reflog. Lost some routine dirt this session (a `website/.gitignore` edit, a `.claude/scheduled_tasks.lock` deletion state) because the consent question only named the commit count, not the working-tree scope. Always run `git status --short` first and name every uncommitted file explicitly in the consent ask, or stash before resetting.
- `cadence milestone premortem <id>` is **not** an operator-input command — it only refreshes deterministic heuristic signal (low-confidence inputs, decayed/eroded members, shared-file overlaps, a doc-drift heuristic). There is currently no CLI path to hand-author `likelyFailureModes`/`hiddenDependencies`/`outOfScope` — only a raw hand-edit of `milestones.json` (tracked as `rec-20260714-001`).
- `cadence intelligence reconcile` does **not** re-derive a recommendation's `evidenceIds` from `evidence.json` — `deriveRecommendationLinks` (`packages/core/src/intelligence/store/recommendations.ts:82-102`) only takes the assumption/decision ledgers as input, never the evidence ledger. A hand-added `evidence.json` entry silently won't show in `cadence recommendation show` until `evidenceIds` is *also* hand-edited in `recommendations.json` (tracked as `rec-20260719-001`).
- `rec-20260619-008` (Team rollout kit) is parked at `needs-decision`. Open question per Opus's review: resolve "CI/PR-template guidance" vs. "`cadence ci install`" (two genuinely different commitment levels — no `cadence ci` command exists today) before re-promoting, and clarify what `files: .github` actually means (this repo's own CI config, which is branch-protection-sensitive, vs. template artifacts for other teams to copy).
- Two untracked docs still unrecognized across 3+ sessions now: `docs/cc-insights-ingestion-handoff.md`, `docs/handoff-v147-recommendations.md`. Also `audit-reports/` and `packages/core/.gitignore`, still untouched. Worth the operator taking a look eventually.
- `main` is fully synced with `origin` (0 ahead / 0 behind) as of this handoff — worth noting since it's the first time in several sessions.

## Next action
**Action:** No phase is active. Pick the next unit of work — either `gh issue view 248`/`gh issue view 251` (open, untriaged bugs flagged last handoff), one of the ranked `cadence recommend` candidates, or `rec-20260714-001`/`rec-20260719-001` themselves (the two CLI-writer gaps just logged, both small and well-scoped) — and scaffold it as the next phase. Follow the worktree-first draft-authoring order: `EnterWorktree` **before** any `cadence draft new`/`check`/`approve` (a prior session got this wrong and had to recover). The held `.cadence/intelligence/*` ledger dirt should ride along in that phase's feature commit, per the operator's explicit instruction — do not commit it standalone first.
**Verify:** `cadence progress` (from inside the worktree) shows a new active draft once the phase is scaffolded; `git status --short .cadence/intelligence/` still shows the ledger dirt present (confirms it wasn't accidentally committed early).
**If it fails:** if working in a fresh worktree, hit the `state.json` bootstrap gotcha — build from source (`pnpm --filter @manehorizons/cadence-types build && pnpm --filter @manehorizons/cadence-testkit build && pnpm --filter @manehorizons/cadence-core build`) then use `node packages/core/bin/cadence.cjs`, or hand-bootstrap `state.json`. If `cadence draft new` collides on a phase number, re-check `cadence progress`/`cadence doctor` for the current genuinely-free number.
