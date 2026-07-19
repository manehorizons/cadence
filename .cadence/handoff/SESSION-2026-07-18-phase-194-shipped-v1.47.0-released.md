---
cadence_handoff: 1
generated_at: 2026-07-18T21:21:20.614Z
label: phase-194-shipped-v1.47.0-released
loop_position: IDLE
active_phase: 194-settle-telemetry-revision-conflict
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 1923f6b
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-18 (phase-194-shipped-v1.47.0-released)

## TL;DR for the next session
- Resumed from the prior handoff (phases 192/193 shipped, issue #234 flagged), triaged issue #234 (labeled `bug` — the repo's `docs/agents/triage-labels.md` custom labels don't actually exist on this GitHub tracker, `bug` matches real precedent), and shipped it as **phase 194**, subagent-driven in an isolated worktree: exempt `session.subagentSpawns` from the revision-guarded `commit()` path that made `cadence settle run` deterministically fail under `host-cli` verifier gates.
- Landed as PR #242, merged. Then, on operator request, cut and published **v1.47.0** — bundling phases 192/193/194 — as PR #243, merged, Release workflow fired, **all four packages independently verified live on npm at 1.47.0**, tag `v1.47.0` and GitHub Release confirmed.
- Loop is IDLE. Next free phase number is **195**. `main` is clean and fully synced with origin at `1923f6b`.
- Remaining backlog from the 2026-07-18 dispatched-agent scope-control incident (same one that produced phases 192/193): **rec-20260718-003** (stop-conditions framing), **rec-20260718-004** (per-task boundary anomaly surfacing), **rec-20260718-005** (document the invisible-background-subagent-`AskUserQuestion` gap) — all still `raw-idea`/`candidate`, untouched this session too.
- No blockers. The routine `.cadence`/loose-file drift noted in the prior two handoffs (see gotchas) is still sitting untouched — deliberately left for the operator.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `1923f6b`
- Recent commits:
```
1923f6b chore(release): v1.47.0 -- dispatch-packet action-class boilerplate, worktree isolation recommendation, telemetry revision-conflict fix (#243)
57eb46b fix: exempt telemetry-only session counters from revision-guarded commits (phase 194) (#242)
a5500dc chore(cadence): mark rec-20260718-002 shipped (PR #240) (#241)
a786395 feat: recommend worktree isolation for mutation-scoped dispatch tasks (phase 193) (#240)
2766dc1 chore(cadence): mark rec-20260718-001 shipped (PR #238) (#239)
3b03250 feat: mandatory action-class prohibition boilerplate for dispatch packets (phase 192) (#238)
d8c608c chore(cadence): record rec-20260718-001..005 (dispatched-agent scope-control incident) (#237)
883824a chore(cadence): mark rec-20260710-004 shipped (retroactive, no dedicated phase) (#233)
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
- Loop: IDLE · phase 194-settle-telemetry-revision-conflict · tier (none)

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
- Triaged GitHub issue #234, labeled `bug`.
- Phase 194 built subagent-driven in `.claude/worktrees/194-settle-telemetry-revision-conflict` (branch `feat/194-settle-telemetry-revision-conflict`): 2 parallel implementer tasks (T1 regression test, T2 `StateBackend.bumpSessionCounter()` + `handleSubagentResult()` rewire) → independent adversarial review (caught a test not exercising the real fix path) → fix round → T3 (structural-conflict regression test) → independent whole-branch review (caught a fabricated doc-comment citation I'd introduced myself, a misleading test title, a missing direct unit test for the new method, a missing changeset) → all fixed and re-verified by me directly (full `pnpm turbo run lint typecheck test build`, 328 files / 2837 tests) → two-commit settle (all 4 ACs PASS) → PR #242 → merged (all CI green, incl. full 6-leg OS/Node matrix).
- Cut release v1.47.0 (`release-cut` skill): inventoried phases 192-194 since v1.46.0, confirmed all three carried changesets already, version-bumped (core 1.46.0→1.47.0 minor). Hit the same lockstep-cascade gap documented in the v1.45.0/v1.46.0 cut commit messages — `host-claude-code`/`host-codex` only cascaded to a patch bump (1.46.1) and `types` had no changeset at all — manually aligned all three to 1.47.0 (package.json + CHANGELOG.md headers). Doc-sync grep sweep caught the same recurring `DESIGN.md` "Current architecture (as of vX.Y.Z)" slip as v1.43.0/v1.45.0; fixed. PR #243 → merged (all CI green) → Release workflow fired → red on `Create GitHub Release and verify registry` (npm-CDN propagation race, the known flake — did NOT rerun) → independently verified via `npm view` ×4, `git ls-remote --tags`, `gh release view`: all live and correct.
- Also rebased and landed a leftover local-only handoff-pointer-stamp commit (from the *prior* session, sitting unpushed on `main` since before this session started) — it rode along inside the v1.47.0 release PR after a direct push to `main` was correctly rejected by branch protection.

## Carry-forward gotchas
- **New this session — a direct push to `main` is always rejected, even a fast-forward with a locally-green pre-push hook.** GitHub's branch protection requires the `ci-success` status check to exist *on the exact pushed commit*; a direct push (even of a rebased, locally-fully-tested commit) never gets one. Hit this twice — once syncing a leftover local commit before deciding to cut a release instead, once again when `gh pr merge --squash` internally attempted to fast-forward local `main` post-merge and failed the same way, silently leaving the local checkout on the stale pre-merge commit. **After any `gh pr merge`, don't trust the local checkout's branch/HEAD — always `git fetch` + compare against `origin/main` before assuming it's in sync**; if diverged and local's extra commit(s) are now redundant (already squashed into origin), `git stash push -u` → `git reset --hard origin/main` → `git stash pop` is the right recipe, not a rebase (rebasing would try to reapply already-squashed content and likely conflict pointlessly).
- **New this session — the documented triage labels in `docs/agents/triage-labels.md` (`needs-triage`, `ready-for-agent`, etc.) don't exist on this repo's actual GitHub tracker.** `gh label list` only has the GitHub defaults + `dependencies`/`github_actions`/`javascript`. Real precedent (issues #177/#178/#206) just uses `bug`. Don't blindly apply the documented label vocabulary without checking `gh label list` first — the doc is aspirational, not current.
- **Reconfirmed this session — worktree DRAFT authoring order.** Started phase 194's `draft new`/`draft approve` in the primary checkout *before* `EnterWorktree` (a mistake flagged in a prior session's memory too) — caught it before building, hand-reverted the primary checkout's `state.json`/`STATE.md` to their exact pre-mutation values (not a blind `git checkout --`, since unrelated pre-existing drift was already sitting there), deleted the stray untracked DRAFT dir, then redid `draft new`/`draft approve` correctly inside the worktree. Worth remembering as a checklist item at the *start* of `phase-build`, not just as a recovery move.
- **Reconfirmed this session — a conflicted `git stash pop` stages the cleanly-merged files, not just the conflicted ones.** Hit it twice more (once after the phase-194 rebase, once after the v1.47.0 release reset). Both times caught correctly this round by reading `git status --short`'s index column literally before doing anything else — no accidental commit sweep this time.
- Untouched loose ends, still sitting locally, still not committed (deliberately left for the operator to triage, unchanged from the last two handoffs): routine `.cadence` telemetry drift (`RECOMMEND.md`/`recommend.json` revision counters), untracked `audit-reports/` (a local-only generated HTML audit report, not referenced anywhere in the repo) and `packages/core/.gitignore` (plausibly from local `deja` dedup-oracle use), `website/.gitignore`'s `.deja/` entry, and a `packages/core/bin/cadence.cjs` file-mode flip (644↔755, no content change — this flips back and forth across `pnpm install`/`build` runs, seemingly an environment quirk, not something to fix).
- The stale `171-installer-settings-parse-failure-recovery` worktree still claims a wide phantom phase-number range in `cadence doctor`'s `worktree-phases` check — same non-urgent cleanup item noted in prior handoffs, still unresolved, still not blocking (`cadence doctor`/`cadence progress` both correctly report 195 as the next genuinely free number).

## Next action
**Action:** No urgent follow-up from this session's work — v1.47.0 is fully live and verified. Pick up the next unit of work from `cadence recommend` (top candidates: rec-20260619-008 team rollout kit, rec-20260709-003 `cadence init --ci`, or the remaining 2026-07-18 incident backlog rec-20260718-003/004/005) or from `gh issue list` for any new untriaged issues, and scaffold it as phase 195 (`cadence draft new 195-<slug> --template <bugfix|feature|refactor> --from-rec <recId>` if sourced from a rec).
**Verify:** `cadence progress` shows a new active draft once phase 195 is scaffolded.
**If it fails:** if `cadence draft new` collides on a phase number, re-check `cadence doctor` for the current genuinely-free number (195 as of this handoff) rather than trusting it blindly in a future session — the stale 171-installer worktree's phantom range warning is cosmetic but always re-verify.
