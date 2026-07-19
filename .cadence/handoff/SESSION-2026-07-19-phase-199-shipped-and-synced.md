---
cadence_handoff: 1
generated_at: 2026-07-19T22:41:43.013Z
label: phase-199-shipped-and-synced
loop_position: BUILD
active_phase: 198-bound-filter-regex-complexity-to-prevent-redos
active_draft: 198-01
tier: standard
git_branch: main
git_dirty: true
git_head: bd8be24
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-19 (phase-199-shipped-and-synced)

## TL;DR for the next session
- Phase 199 (`cadence recommendation evidence add <recId> --note <text>`, closing `rec-20260719-001`) is fully shipped: PR #254 merged, then the two stray handoff-stamp commits it left behind were batched and landed via PR #255. `main` is fully synced with origin (0 ahead / 0 behind) — this is a clean stopping point, no unpushed local work.
- PR #255 hit two Windows/Node22 CI flakes in a row (a `dispatcher.test.ts` 60s timeout, then a silent `pnpm typecheck` crash mid-`host-codex` with zero `tsc` error output) on a doc-only diff that couldn't plausibly cause either. A third run went fully green, confirming environmental flakiness rather than a real defect — no code changed to "fix" this, just re-ran with the operator's explicit sign-off each time.
- The primary checkout's own local `.cadence/intelligence/*` ledger dirt (from the 2026-07-19 milestone-walkback session, held for "bundle into next feature commit") was reconciled: verified byte-for-byte lossless against what phase 199's feature commit had already shipped, then synced via targeted `git checkout origin/main -- <files>` rather than re-committed. No content was lost, nothing new needs committing there.
- Primary checkout's local `.cadence/state.json` (gitignored) is **still stale**, now spanning 4+ sessions: shows `loopPosition: BUILD`, `activePhase: 198-...`, `activeDraft: 198-01` — phase 198 shipped and merged long ago (#252). Cosmetic only, do not "fix" with `cadence settle run --auto` in the primary checkout.
- No blockers, no open PRs, nothing in flight. Next unit of work is unclaimed — pick from the carry-forward list below.

## What landed this session

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `bd8be24`
- Recent commits:
```
bd8be24 chore(cadence): land session handoff stamps (2026-07-19) (#255)
7cc606d feat: add cadence recommendation evidence add CLI writer (phase 199) (#254)
cb339a4 chore(cadence): land stuck session-handoff commits (phases 194-198) (#253)
7a9098a fix: bound --filter-regex length to prevent ReDoS (phase 198) (#252)
9dd68f8 fix: cadence onboard bootstraps missing state.json for fresh worktrees/clones (phase 197) (#250)
ac6722c fix: untrack per-worktree state.json/STATE.md to stop cross-worktree merge conflicts (issue #177) (phase 196) (#247)
14c7336 fix: settle refuses bare TN: DONE with no verify evidence (phase 195) (#245)
1923f6b chore(release): v1.47.0 -- dispatch-packet action-class boilerplate, worktree isolation recommendation, telemetry revision-conflict fix (#243)
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
- Phase 199 (`199-recommendation-evidence-add-cli-writer`): drafted, approved, built subagent-driven in an isolated worktree (5 tasks, each independently reviewed, plus a clean whole-branch review), settled, and merged as PR #254.
- `addEvidenceToRecommendation` store fn (`packages/core/src/intelligence/store/recommendations.ts`) + `cadence recommendation evidence add <recId> --note <text>` CLI subcommand (`packages/core/src/cli/commands/recommendation.ts`), with tests and `docs/reference/commands.md` coverage.
- `.changeset/recommendation-evidence-add.md` (minor bump) merged with the feature.
- `rec-20260719-001` converted → `settle-pending` (awaiting the usual shipped-confirmation at the next release cut, per `cadence doctor`'s `recommendation-shipped-drift` check).
- PR #255: batched and landed the previous session's stuck handoff-stamp commit plus this session's own (the recurring "`git push origin main` always rejected, even for chore commits" pattern — same as PR #253 before it).
- This handoff doc supersedes `SESSION-2026-07-19-phase-199-recommendation-evidence-add-shipped.md`, written earlier in the same session before PR #255 landed and `main` was synced; that doc is retained on disk as history but is stale (it predates the sync).

## Carry-forward gotchas
- **Primary checkout's local `.cadence/state.json` is still stale** (4+ sessions running) — shows phase 198 active though it shipped in PR #252. Gitignored, cosmetic only, never fix with `cadence settle run --auto` in the primary checkout.
- **`gh pr merge --squash --delete-branch`'s local post-merge checkout step keeps failing here** — both PR #254 and #255 threw a local git error (`'main' is already used by worktree...` / diverged-branches fast-forward error) even though the remote merge always succeeded. Verify via `gh pr view <n> --json state,mergedAt,mergeCommit` rather than trusting the CLI's own exit code; then manually `git checkout main && git reset --hard origin/main` to sync (safe post-squash-merge — local pre-squash commits are fully captured in the new squash commit).
- **`draft add-task` still has no `--depends` flag** — hand-authoring a DRAFT.md without `- depends: TN` lines makes `cadence dispatch plan` put every task in one wave with no real ordering. Caught this again in phase 199; add `depends:` lines by hand immediately after drafting, before running `dispatch plan`.
- **A `gitleaks:allow` suppression comment added in a follow-up commit does NOT clear a gitleaks finding from an earlier commit in the same PR** — gitleaks scans `git log -p` per-commit, not final HEAD state, so the raw secret-shaped string still shows in the original commit's diff forever. If this recurs, the durable fix is a `.gitleaks.toml` allowlist entry, not a per-line suppression comment after the fact. (Non-blocking either way — `secret-scan` isn't part of the required `ci-success` check, confirmed by reading `.github/workflows/ci.yml`.)
- `rec-20260619-008` (Team rollout kit) is still parked at `needs-decision`, untouched again this session.
- GitHub issues `#248` and `#251` are still open and untriaged — 3+ sessions now.
- Untracked, unaddressed for 4+ sessions: `docs/cc-insights-ingestion-handoff.md`, `docs/handoff-v147-recommendations.md`, `audit-reports/`, `packages/core/.gitignore`. Not phase artifacts — worth the operator looking at directly.
- `rec-20260714-001` (the sibling CLI-writer gap to `rec-20260719-001`, broadened to cover all 3 pre-mortem operator fields) is still open — only its sibling was picked up this session.

## Next action
**Action:** No phase is active and nothing is in flight. Pick the next unit of work — `rec-20260714-001` (small, well-scoped CLI-writer gap, sibling of what shipped this session), GitHub issues `#248`/`#251` (untriaged, 3+ sessions old), or the next-ranked `cadence recommend` candidate — and scaffold it as a phase. Follow the worktree-first draft-authoring order: `EnterWorktree` **before** any `cadence draft new`/`check`/`approve`. If hand-authoring the DRAFT (rather than using `add-task`), remember to hand-add `- depends: TN` lines so `cadence dispatch plan` produces real wave ordering.
**Verify:** `cadence progress` (from inside the worktree) shows a new active draft once scaffolded.
**If it fails:** if `cadence draft new --from-rec` collides on a phase number, re-check `cadence progress`/`cadence doctor` for the current free number (was 199 this session). If working in a fresh worktree, remember the state.json bootstrap gotcha — build from source (`pnpm --filter @manehorizons/cadence-types build && pnpm --filter @manehorizons/cadence-testkit build && pnpm --filter @manehorizons/cadence-core build`) then use `node packages/core/bin/cadence.cjs onboard`, since the global npm-installed `cadence` binary lags unreleased local fixes.
