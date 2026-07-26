---
cadence_handoff: 1
generated_at: 2026-07-26T19:14:09.525Z
label: phase-225-convergent-review-runner-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: 28c73fe9
git_ahead: 1
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-26 (phase-225-convergent-review-runner-shipped)

## TL;DR for the next session
- Phase 225 ("Deepen the convergent-review protocol", `rec-20260725-008`) shipped: extracted a shared `runConvergentReview` primitive absorbing the duplicated read-sidecar/verify/verdict/history/write-sidecar/branch sequence from all 4 call sites (`plan-review.ts`, `code-review.ts`, `spec-approve.ts` ×2) — full draft→build→settle loop, one implementer + one independent reviewer per task, a whole-branch review, merged as PR #311 (squash `0e854cdd`).
- Ledger promotion (rec → shipped, milestone → closed, both ref'd to PR #311) needed a SECOND PR (#312, squash `6b06c029`) since direct push to `main` is always rejected even for pure ledger JSON — same pattern as phase 224's PR #310.
- Along the way, hit `rec-20260726-002` live again (fresh worktree has `.cadence/` but no `state.json`; `cadence init` refuses to bootstrap it) — worked around it the documented way: hand-authored `state.json` from `packages/types`'s `emptyState()` helper, for BOTH the phase-225 worktree and the later ledger-promotion worktree. This rec is still open and will recur for every future worktree-based phase build until fixed — it's the single highest-value fix available for smoothing this workflow.
- No active phase/draft — loop is IDLE. Next unit of work should come from `cadence recommend` (top candidates below); nothing is blocking.
- Local `main` is 1 ahead / 0 behind origin (just this handoff-stamp commit, not yet pushed) — standard, not pushing per standing preference unless switching machines.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 1 ahead / 0 behind origin
- HEAD `28c73fe9`
- Recent commits:
```
28c73fe9 chore(cadence): stamp session handoff — 2026-07-26 (phase 224 ledger-remote-collision-doctor shipped)
6b06c029 chore: promote rec-20260725-008 to shipped + close its milestone (ref PR #311) (#312)
0e854cdd refactor: extract shared runConvergentReview primitive (phase 225-convergent-review-runner) (rec-20260725-008) (#311)
00aca320 chore: sync rec-20260726-004 + promote rec-20260726-003 to shipped (#310)
92ae02eb feat: cadence doctor detects cross-session ledger id collisions before push (phase 224-ledger-remote-collision-doctor) (rec-20260726-003) (#309)
0fa08092 chore: sync unpushed session-handoff commits + resolve rec-id collision (#308)
d7d42399 feat: settle-time content hash + cadence summary verify (phase 223-summary-hash-attestation) (rec-20260724-006) (#307)
f835470d chore(release): v1.51.1 -- praxis ledger unify, MCP/CLI parity, shared host-toolkit (#306)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260725-006 — Centralize gate bypass and seal policy in the settle driver (candidate/ready-for-milestone)
  - rec-20260725-007 — Split the settleService god function (candidate/ready-for-milestone)
  - rec-20260726-002 — Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it (candidate/ready-for-milestone)
  - rec-20260726-004 — README's architecture mermaid diagram has no doc-content test verifying it against code truth (candidate/ready-for-milestone)
  - rec-20260724-004 — Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger (candidate/needs-decision)
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
  - `packages/core/src/gates/types.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/build-test-must-pass.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/boundary-scan.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/security-audit.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/code-review.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/structural-verifier.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/plan-review.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/per-task-verify.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `docs/reference/config.md` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/services/settle.ts` — affected by rec-20260725-007 Split the settleService god function
  - `packages/core/src/cli/commands/init.ts` — affected by rec-20260726-002 Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it
  - `packages/core/src/state/simple.ts` — affected by rec-20260726-002 Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it
  - `packages/core/tests/docs/` — affected by rec-20260726-004 README's architecture mermaid diagram has no doc-content test verifying it against code truth
  - `.cadence/ROADMAP.md` — affected by rec-20260724-004 Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger

## What landed this session
- Resumed from the phase-224 handoff (`SESSION-2026-07-26-phase-224-ledger-remote-collision-doctor-shipped.md`), env-check clean, no drift, stash left in place per operator choice.
- Picked `rec-20260725-008` with the operator from `cadence recommend`'s ranked list; ran it through `cadence milestone propose → premortem (9 operator-authored entries from code-reading, not placeholders) → accept → export` to a staged SPEC.
- Entered an isolated worktree (`225-convergent-review-runner`); hit `rec-20260726-002` immediately (fresh worktree, no `state.json`) and worked around it per the rec's own documented fix.
- Authored a fully fleshed DRAFT (6 tasks, real `files:`/`action:`/`verify:`/`depends:` per task, tier `complex`) — had to bump `profile: strict` in DRAFT frontmatter to clear the `auto × complex` soft-cap (DESIGN.md M2), since project config profile is `auto`.
- `cadence draft approve` converged plan-review clean (mock provider) → BUILD.
- Ran all 6 tasks (T1 audit/characterization → T2 extract the pure primitive → T3/T4/T5 migrate the 3 call sites in parallel → T6 full regression), each with an implementer subagent + independent adversarial reviewer, each re-verified in the main thread (diff read + tests/typecheck/lint re-run) before recording DONE — never trusted a subagent's self-report.
- Whole-branch review caught one real defect (stale JSDoc in `code-review.ts` still describing the pre-refactor `nextConvergence` design) — fixed before settle.
- `cadence settle run --auto`: all 4 ACs PASS, all gates ran (plan-review/code-review/security-audit converged clean under mock). Single settle commit staged explicitly (excluded a pre-existing unrelated untracked export dir, see gotchas) + `.changeset/convergent-review-runner.md` (patch bump — internal refactor, no behavior change).
- Full `pnpm turbo run lint typecheck test build` green (24/24 tasks) before push. PR #311 all CI green (6 OS×Node legs + CodeQL/audit/sbom/secret-scan), merged with operator consent.
- Post-merge: rebased local `main` cleanly (no file overlap with the unpushed handoff-stamp commit), then landed the ledger-promotion chore as its own PR #312.

## Carry-forward gotchas
- **`rec-20260726-002` (fresh worktree has `.cadence/` but no `state.json`) is still open and will recur every time.** Workaround used twice this session: `node -e "const { emptyState } = require('./packages/types/dist/state.js'); ...; fs.writeFileSync('.cadence/state.json', ...)"` — requires `packages/types` (and usually `packages/core`, `packages/testkit` for CLI-integration tests) built first in the fresh worktree. Worth promoting this rec soon; it's now been hit live in at least 3 separate phase builds.
- **A subagent (T3's implementer) ran a bare `git stash && ...; git stash pop` mid-task in the shared phase worktree** — the `git stash` found nothing (raced with concurrent T4/T5 agents' writes), and the unconditional `git stash pop` that followed popped and dropped an unrelated pre-existing stash (`d70e8d0…`, "On main: handoff — pre-rebase local main dirt (recommend.json/RECOMMEND.md render + scheduled_tasks.lock)" — this was the exact stash referenced by the *phase-224* handoff's own "Stashed as:" line, left alone at this session's `/resume`). Independently verified nothing was lost (the dropped commit is still reachable at `d70e8d0`; its content — pure `recommend.json`/`RECOMMEND.md`/`scheduled_tasks.lock` cache drift — is strictly staler than what still survives in the current `stash@{1}`). No action needed, but implementer-subagent prompts for future phases should explicitly forbid `git stash`/`git stash pop` in a shared worktree, not just assume the top-level session rule covers subagents too.
- **`gh pr merge --delete-branch`'s local post-merge-checkout failure signature recurred twice more this session** (PRs #311 and #312, both "'main' is already used by worktree at ...") — remote merge succeeded both times regardless; always verify via `gh pr view <n> --json state,mergedAt,mergeCommit` rather than trusting the command's exit code, then `git push origin --delete <branch>` manually since `--delete-branch` never got that far either.
- **Branching the ledger-promotion chore from `origin/main` (not local `main`) avoided the divergence trap again** — local `main` carried an unpushed handoff-stamp commit from before this session that would otherwise have ridden along into PR #312's squash. After each merge, `git rebase origin/main` in the primary checkout was clean both times (no file overlap between the unpushed handoff commit and either merged PR).
- Removing a fully-squash-merged phase worktree via `ExitWorktree(action: "remove", discard_changes: true)` is safe even though it reports "N commit(s) will be discarded" — that commit's content is already squashed into `origin/main` under a different SHA; only genuinely-unmerged work would be a real loss. Confirm via `git log --oneline -1 <origin/main>` before discarding, don't just trust the tool's warning text.
- Stray untracked `.cadence/intelligence/exports/mil-rec-rec-20260724-013/SPEC.md` is STILL sitting untriaged across yet another session boundary (now also observed reappearing inside fresh phase worktrees as a side effect of `cadence milestone propose`/similar commands regenerating all pending exports) — still safe to leave, still worth a keep/delete decision at some point.

## Next action
**Action:** Run `cadence recommend` and pick the next phase with the operator. As of this handoff the top-ranked `ready-for-milestone` candidates are `rec-20260725-006` (centralize gate bypass/seal policy in the settle driver), `rec-20260725-007` (split the settleService god function), `rec-20260726-002` (the worktree-bootstrap bug this session hit live twice — see gotchas, now a strong candidate to finally fix), and `rec-20260726-004` (README architecture-mermaid doc-test gap). Neither is a hard blocker; loop is IDLE with nothing in flight.
**Verify:** `cadence progress` shows loop position IDLE with no active phase/draft (confirms nothing was left mid-loop), and `git status --short --branch` on `main` shows `0 ahead / 0 behind origin` once this handoff commit is pushed (or `1 ahead` if not yet pushed — expected and fine).
**If it fails:** if `cadence progress` shows an unexpected active phase/draft, or `main` shows local commits not on origin beyond this handoff stamp, STOP and investigate before starting new work — something changed between this handoff and the next session that this doc doesn't know about (re-run the origin-freshness check, don't assume).
