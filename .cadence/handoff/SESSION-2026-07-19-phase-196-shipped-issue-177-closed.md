---
cadence_handoff: 1
generated_at: 2026-07-19T02:25:13.841Z
label: phase-196-shipped-issue-177-closed
loop_position: IDLE
active_phase: 195-settle-refuses-bare-tn-done-with-no-verify-evidence
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: e586733
git_ahead: 2
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-19 (phase-196-shipped-issue-177-closed)

## TL;DR for the next session
- Brainstormed (with a Fable-model creative pass on the design tradeoffs) and shipped phase 196, closing GitHub issue #177: `.cadence/state.json`/`STATE.md` were tracked files holding per-worktree ephemeral loop state, guaranteeing a real git merge conflict whenever two worktrees on different phases synced. Landed as PR #247, squash-merged, `ci-success` green.
- The fix: `state.json`/`STATE.md`/`mcp-trust.json`/`intelligence/context/` are now gitignored by default (new `cadence init` step + `cadence doctor` `state-tracked` check + `untrack-state` auto-fix for existing repos). The audit-trail value tracked `state.json` used to carry incidentally now lives in a new `stateAtSettle` field on `SUMMARY.json`/`.md`. `cadence doctor` also diagnoses an unresolved git conflict in `state.json` with a field-by-field local/incoming diff, and `cadence doctor --fix --resolve-state-conflict=local|incoming` resolves it. Any command hitting a corrupted `state.json` now points at `cadence doctor --fix`.
- **This repo self-migrated as part of the same phase** — `main`'s own `.cadence/state.json`/`STATE.md` are gitignored now, not tracked. Confirmed live: `git ls-files .cadence/state.json .cadence/STATE.md` returns nothing, files still exist on disk, `cadence progress` still works.
- Loop is IDLE. Next free phase number is **197**. CodeQL found 3 pre-existing high-severity regex-injection findings (ReDoS-shaped, `--filter-regex` compiled directly into `new RegExp()`) in `assumption.ts`/`decision.ts`/`recommendation.ts` — completely unrelated to this phase's diff, filed as **issue #249** for future triage, not blocking (not part of the required `ci-success` check).
- No blockers. `main` is 2 ahead of origin (routine pre-existing handoff-stamp commits from prior sessions, rebased cleanly onto the phase 196 merge — see gotchas) and has the same routine `.cadence` telemetry drift as every prior handoff.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 2 ahead / 0 behind origin
- HEAD `e586733`
- Recent commits:
```
e586733 chore(cadence): stamp session handoff — phase-195-shipped-issue-206-closed
44706d4 chore(cadence): stamp session handoff — phase-194-shipped-v1.47.0-released
ac6722c fix: untrack per-worktree state.json/STATE.md to stop cross-worktree merge conflicts (issue #177) (phase 196) (#247)
14c7336 fix: settle refuses bare TN: DONE with no verify evidence (phase 195) (#245)
1923f6b chore(release): v1.47.0 -- dispatch-packet action-class boilerplate, worktree isolation recommendation, telemetry revision-conflict fix (#243)
57eb46b fix: exempt telemetry-only session counters from revision-guarded commits (phase 194) (#242)
a5500dc chore(cadence): mark rec-20260718-002 shipped (PR #240) (#241)
a786395 feat: recommend worktree isolation for mutation-scoped dispatch tasks (phase 193) (#240)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/RECOMMEND.md   |  33 +++++++---
 .cadence/intelligence/recommend.json | 123 +++++++++++++++++++++++++++++------
 packages/core/bin/cadence.cjs        |   0
 website/.gitignore                   |   1 +
 4 files changed, 126 insertions(+), 31 deletions(-)
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
- Brainstormed via `superpowers:brainstorming`, with a dedicated Fable-model subagent pass generating 5 named remediation proposals for issue #177 before converging on a design (untrack-by-default + `stateAtSettle` audit-trail replacement + conflict-marker diagnosis/repair), written to `docs/superpowers/specs/2026-07-18-worktree-state-tracking-design.md` (local-only, gitignored in this repo by convention).
- Per this repo's CLAUDE.md ("process is locked to CADENCE"), skipped `writing-plans`'s generic plan-doc + `subagent-driven-development` handoff and instead translated the spec directly into a CADENCE DRAFT (`cadence draft new` + hand-authored Objective/7 ACs/7 Tasks/Boundaries) for phase 196.
- Executed via the `phase-build` skill in an isolated worktree (`.claude/worktrees/196-worktree-safe-state-tracking`, now removed): 7 tasks (T1–T7), each with an independent implementer subagent + independent adversarial reviewer, main-thread re-verification before every `cadence build task ... --status=DONE`, then a whole-branch review before settle.
- Two mid-build design corrections, both caught by review rather than assumed correct:
  - **T6 rescoped.** Original design (a branch in `cli/index.ts`'s top-level error catch) was dead code — every command that can throw `StateCorruptError` already catches it one layer down in its own service function. DRAFT amended in place; fixed the real 9 service-layer catch sites via a new shared `packages/core/src/services/format-command-error.ts`.
  - **Whole-branch review caught 3 real issues** before settle: `docs/concepts.md`'s two-commit-convention table still listed `state.json`/`STATE.md` as settle-commit contents (contradicting the very section this phase edited 20 lines away), `docs/reference/commands.md`'s doctor tables didn't mention the new `state-tracked` check/`untrack-state` fix, and no `.changeset/*.md` existed. All fixed before the settle commit.
- Settled (`cadence settle run --auto`, all 7 ACs `PASS`), two-commit convention (`fix:` feature commit `103e358` → `chore: settle` commit `e0f8aea` in the worktree), pushed, PR #247 opened, `ci-success` green (all 6 OS/Node legs + build/audit/sbom/secret-scan/analyze), merged with operator consent, worktree + both branches cleaned up.
- Filed **issue #249** for 3 pre-existing CodeQL regex-injection findings surfaced (but not introduced) by this PR — unrelated files this phase never touched.
- Wrote this handoff.

## Carry-forward gotchas
- **New this session — `state.json`/`STATE.md` are now gitignored on `main`, which changes rebase mechanics.** Post-merge sync (`git pull --rebase origin main`) hit a real `modify/delete` conflict for both files on each of the 2 pre-existing local handoff-stamp commits (they modified state.json/STATE.md; the new base deletes them from tracking). Resolution used both times: `git rm --cached .cadence/state.json .cadence/STATE.md` (accepts the deletion, keeps the on-disk content — do NOT `git add` them back). Any future session with unpushed local commits older than this phase's merge will hit the same pattern when syncing.
- **The `/handoff` skill's own step 6 instruction is now stale.** It says `git add .cadence/handoff/ .cadence/state.json .cadence/STATE.md && git commit` for the handoff chore commit — but those two files are gitignored now, so `git add` on them is a no-op (or a warning). This session's handoff commit only stages `.cadence/handoff/`. Worth fixing the skill itself in a future session (not done here — out of scope, and editing a shared skill file didn't feel like the right call mid-phase-landing).
- **`cadence` on PATH is still the global npm install, not this checkout's source** (phase 196 hasn't been released to npm yet). Any future session dogfooding new engine/gate/parser logic in a worktree must use `node packages/core/bin/cadence.cjs <cmd>` from the worktree root, not bare `cadence` — reconfirmed working correctly this session. `cadence handoff` itself (used to write this doc) is fine via the global binary since it doesn't touch phase-196-specific logic.
- **Issue #249 (CodeQL regex-injection, `assumption.ts`/`decision.ts`/`recommendation.ts`) is untriaged.** Real findings, pre-existing (untouched by any recent phase), narrow-but-real ReDoS threat model for a local CLI. Not urgent, but don't let it sit indefinitely — it's a security finding, not a style nit.
- **`cadence doctor --fix` now has a new `state-tracked` check + auto-fix, and `--resolve-state-conflict=local|incoming`.** If you ever see a corrupted `state.json` with git conflict markers (from an unresolved worktree-sync merge — the exact failure this phase fixed the root cause of, but pre-existing corrupted files elsewhere could still hit it), `cadence doctor` now names the conflicting fields and `cadence doctor --fix --resolve-state-conflict=<side>` resolves it. Labeled `local`/`incoming` by conflict-marker position, deliberately never `ours`/`theirs` (that flips between merge/rebase).
- Reconfirmed — the stale `171-installer-settings-parse-failure-recovery` worktree still claims a wide phantom phase-number range in `cadence doctor`'s `worktree-phases` check. Same non-urgent cleanup item noted in prior handoffs, still unresolved, still not blocking.
- Untouched loose ends, same as every recent handoff, still deliberately left for the operator: routine `.cadence` telemetry drift (`RECOMMEND.md`/`recommend.json` revision counters), untracked `audit-reports/` (local-only generated HTML), `packages/core/.gitignore` (plausibly from local `deja` dedup-oracle use), and the recurring `packages/core/bin/cadence.cjs` file-mode flip (644↔755, zero content diff).
- `main` is 2 commits ahead of origin — the phase-194 and phase-195 handoff-stamp commits, both pre-existing before this session, rebased cleanly onto the phase-196 merge. Left unpushed for the operator, same as every recent handoff; not blocking (`cadence progress` correctly reports 197 as the next free phase number regardless).

## Next action
**Action:** No urgent follow-up from this session's work — phase 196 is merged and CI-green on main. Pick up the next unit of work from `cadence recommend` (top candidates unchanged from prior handoffs: rec-20260619-008 team rollout kit, rec-20260709-003 `cadence init --ci`, or the remaining 2026-07-18 incident backlog), from `gh issue list` for untriaged issues (including the new #249 CodeQL regex-injection findings from this session, and #178 dispatch-plan wave-computation blindness — both still open, both still untriaged), and scaffold it as phase 197.
**Verify:** `cadence progress` shows a new active draft once phase 197 is scaffolded.
**If it fails:** if `cadence draft new` collides on a phase number, re-check `cadence doctor` for the current genuinely-free number (197 as of this handoff) rather than trusting it blindly — the stale 171-installer worktree's phantom range warning is cosmetic but always re-verify. If the phase touches gate/engine/parser code, remember the dogfooding gotcha above: rebuild and invoke `node packages/core/bin/cadence.cjs` locally, never the bare `cadence` command, when exercising new logic inside the phase's worktree.
