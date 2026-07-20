---
cadence_handoff: 1
generated_at: 2026-07-20T01:13:38.920Z
label: v1-48-0-release-merged-npm-publish-pending
loop_position: BUILD
active_phase: 198-bound-filter-regex-complexity-to-prevent-redos
active_draft: 198-01
tier: standard
git_branch: main
git_dirty: true
git_head: 87e176c
git_ahead: 1
git_behind: 3
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-20 (v1-48-0-release-merged-npm-publish-pending)

## TL;DR for the next session
- Three phases shipped and merged this session: 200 (fixes #248, recommendation-ID collision with archived recs), 201 (`cadence milestone premortem` CLI writer for operator-authored fields, closes rec-20260714-001), and a release cut bundling phases 195-201 into **v1.48.0** (PR #259, merged into `main`).
- **v1.48.0 is merged but NOT yet published to npm** — npm still shows 1.47.0 live. `gh workflow run Release` failed repeatedly on GitHub Actions API 503s (~15+ min of retries); the operator said stop retrying and pick this up later. This is the single most important carry-forward item.
- Primary checkout's local `main` is diverged from origin: 1 ahead (a concurrent session's unpushed commit `87e176c`, left untouched per operator instruction), 3 behind (this session's own merged PRs #257/#258/#259). Do not `reset --hard`/rebase it away — investigate/ask first (see gotchas).
- Loop position shown in this doc's frontmatter (`BUILD`/phase 198) is **stale, not real** — phase 198 shipped in PR #252 long ago. This has persisted across 5+ sessions now; cosmetic only in the primary checkout.
- No blockers on the shipped work itself — both phase 200 and 201 went through full TDD + two rounds of independent adversarial review (one review caught and a fix round resolved a real newline-normalization bug in phase 201) + whole-branch review, all green.
- Next action: once GitHub's API is stable, trigger `gh workflow run Release` for v1.48.0 and independently verify (never trust the workflow's own report) via `npm view` × 4 packages, `git ls-remote --tags`, `gh release view v1.48.0`.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 1 ahead / 3 behind origin
- HEAD `87e176c`
- Recent commits:
```
87e176c chore(intelligence): ingest roadmap scout batch scout-20260715-claude-roadmap (1 rec)
7852352 chore(cadence): stamp session handoff — phase-199-shipped-and-synced (#256)
bd8be24 chore(cadence): land session handoff stamps (2026-07-19) (#255)
7cc606d feat: add cadence recommendation evidence add CLI writer (phase 199) (#254)
cb339a4 chore(cadence): land stuck session-handoff commits (phases 194-198) (#253)
7a9098a fix: bound --filter-regex length to prevent ReDoS (phase 198) (#252)
9dd68f8 fix: cadence onboard bootstraps missing state.json for fresh worktrees/clones (phase 197) (#250)
ac6722c fix: untrack per-worktree state.json/STATE.md to stop cross-worktree merge conflicts (issue #177) (phase 196) (#247)
```
- Uncommitted (diff --stat):
```
.claude/scheduled_tasks.lock | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```
- Loop: BUILD · phase 198-bound-filter-regex-complexity-to-prevent-redos · tier standard

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260619-008 — Team rollout kit (accepted/needs-decision)
  - rec-20260719-001 — Impact-gated verification via Phenyx (radius-aware settle gate) (candidate/needs-decision)
  - rec-20260709-003 — cadence init --ci: generate + enforce a CI gate workflow for consumer repos (candidate/raw-idea)
  - rec-20260710-001 — Clarify Claude Code auth vs ANTHROPIC_API_KEY confusion in provider docs + fallback warning (candidate/raw-idea)
  - rec-20260711-004 — Cadence-native UI-spec gate between SPEC and DRAFT (when applicable) (candidate/raw-idea)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
- Files in play:
  - `README.md` — affected by rec-20260619-008 Team rollout kit
  - `docs/README.md` — affected by rec-20260619-008 Team rollout kit
  - `.github` — affected by rec-20260619-008 Team rollout kit

## What landed this session
- Resumed from the prior session's clean stopping point; landed a stray unpushed handoff-stamp commit via PR #256 (same recurring "direct commit on main, blocked by branch protection" pattern as phases 194-198).
- Triaged GitHub issue #248 to `ready-for-agent` (created the missing `ready-for-agent` label — it didn't exist in this repo's label set despite `docs/agents/triage-labels.md` documenting it — and posted an agent brief).
- Phase 200 (worktree `200-recommendation-id-collision-fix`): fixed `nextRecommendationId` in `packages/core/src/intelligence/store/ids.ts` to scan both `ledger.recommendations` and `ledger.archived` for the max same-day sequence number, closing #248. PR #257, merged.
- Phase 201 (worktree `201-milestone-premortem-cli-writer`): added `--add-out-of-scope`/`--add-likely-failure-mode`/`--add-hidden-dependency` to `cadence milestone premortem <id>`, plus made operator-authored `likelyFailureModes`/`hiddenDependencies` entries survive later refreshes (marker-prefix pass-through, mirroring how `outOfScope` already worked). Closes rec-20260714-001. PR #258, merged. A per-task review round caught a real bug (operator text wasn't newline-normalized, would've corrupted `MILESTONES.md`'s bullet rendering) — fixed and re-verified before the whole-branch review passed.
- Release cut: inventoried 7 unreleased changesets (phases 195-201), bumped to v1.48.0. Hit and manually fixed the **known recurring lockstep gap**: `changeset version` only bumped `cadence-core` (has changesets) to 1.48.0 and cascaded `host-claude-code`/`host-codex` to 1.47.1 via `updateInternalDependencies="patch"`, leaving `cadence-types` at 1.47.0 untouched — same gap documented as already hit at v1.45.0, v1.46.0, and v1.47.0. Manually aligned all four to 1.48.0. Doc-sync grep caught the also-recurring `DESIGN.md` "Current architecture (as of vX.Y.Z)" stale-version line (slipped at v1.43.0/v1.45.0/v1.46.0/v1.47.0 too) — fixed. PR #259, merged.
- Release workflow trigger (npm publish) blocked by GitHub API instability — not completed this session (see TL;DR).

## Carry-forward gotchas
- **v1.48.0 is merged but unpublished** (see TL;DR) — do not re-attempt the release PR/version bump; only the `gh workflow run Release` publish step remains. If `gh` CLI keeps 503ing, try the GitHub web UI's Actions tab instead. Never `gh run rerun --failed` on the Release workflow if a run does go through and comes back red/ambiguous — independently check `npm view`/tag/GH-release first (a red release-integrity step is often just npm CDN propagation lag, not a real failure).
- **Primary checkout's local `main` has a concurrent session's unpushed commit** (`87e176c`, "ingest roadmap scout batch..."). Left untouched deliberately — do not `reset --hard`/rebase/force-push over it. If it's still there next session, check whether the other session is still active before touching it; if not, it likely just needs a normal branch+PR to land (same pattern as the stray handoff-stamp commits from phases 194-198).
- **Primary checkout's local `.cadence/state.json` is stale** (5+ sessions running now) — shows phase 198 active though it shipped in PR #252. Gitignored, cosmetic only, never "fix" with `cadence settle run --auto` in the primary checkout.
- **`gh pr merge --squash --delete-branch`'s local post-merge checkout step keeps failing** in this checkout (`'main' is already used by worktree...`) — hit again on PRs #256, #257, #258, #259. Remote merge always succeeds regardless; verify via `gh pr view <n> --json state,mergedAt,mergeCommit` rather than trusting the CLI's exit code.
- **GitHub API instability this session**: `secret-scan` failed on PRs #257, #258, and #259 — confirmed each time (job logs + manual grep of the diff) as GitHub API 503s cascading through `gitleaks-action`'s pre-scan PR-commit-list fetch or its license-check fallback, never an actual finding. Not part of the required `ci-success` check. If it recurs, verify the same way (read the job log, grep the diff) before treating it as real.
- **Untracked docs sitting in the primary checkout, unaddressed for 5+ sessions now**: `docs/cc-insights-ingestion-handoff.md` and `docs/handoff-v147-recommendations.md` are self-contained *ingestion task briefs* (instructions to record external assessment findings as Praxis recommendations — not implementation work, not docs needing a "sync"), `audit-reports/cadence-repo-audit-2026-07-18.html` is a generated audit report, `packages/core/.gitignore` (adding `.deja/`) is a local addition. None were touched this session (confirmed not release-relevant); worth the operator's direct attention or an explicit "ignore these" decision.
- `rec-20260619-008` (Team rollout kit) is still parked at `needs-decision`, untouched again this session — 2+ sessions now.
- GitHub issue `#251` (recommendation lifecycle views can drift from source-of-truth state) is still open and untriaged.
- The sibling-worktree handoff at `.claude/worktrees/171-installer-settings-parse-failure-recovery` (phase 166, generated 2026-07-11) is old/stale — likely abandoned; worth the operator deciding whether to clean it up.
- rec-20260714-001's sibling gap — recorded evidence in that rec already noted the CLI-writer gap extends to `likelyFailureModes`/`hiddenDependencies`, which phase 201 addressed fully; no follow-up needed there.

## Next action
**Action:** Trigger the npm publish for v1.48.0: `gh workflow run Release` (from the primary checkout is fine — this needs no worktree, it's a GitHub Actions dispatch, not a code change). If it 503s again, wait a few minutes and retry, or use the GitHub web UI's Actions → Release → "Run workflow" button as a fallback.
**Verify:** Once the workflow completes (or even if its own report is red/ambiguous), independently confirm — never trust the workflow's self-report: `npm view @manehorizons/cadence-core version`, `npm view @manehorizons/cadence-types version`, `npm view @manehorizons/cadence-host-claude-code version`, `npm view @manehorizons/cadence-host-codex version` (all should show `1.48.0`), `git ls-remote --tags origin | grep v1.48.0`, `gh release view v1.48.0`.
**If it fails:** Use the decision table from the `release-cut` skill's step 6 — all four on npm + tag + release page present → the run's red was cosmetic, done. Packages on npm but tag/release missing → create only the missing artifact by hand. Some packages missing on npm → wait out CDN propagation (minutes), re-check before touching anything; only then consider a targeted republish. **Never `gh run rerun --failed`** on the Release workflow — it re-runs `pnpm -r publish` and fails hard on already-published versions.

After a confirmed-live publish: promote the shipped recommendations (`cadence recommendation promote rec-20260714-001 --status=shipped --ref "v1.48.0"` plus phase 200/201's underlying issues are already closed via PR auto-close) and settle the loop bookkeeping if anything's left pending in `cadence doctor`.
