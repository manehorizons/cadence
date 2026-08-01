---
cadence_handoff: 1
generated_at: 2026-08-01T17:51:16.316Z
label: phase245-shipped-arc-merge-still-pending
loop_position: IDLE
active_phase: 243-untitled
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 0f509ef6
git_ahead: 5
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-01 (phase245-shipped-arc-merge-still-pending)

## TL;DR for the next session
- Resumed from the prior session's unresolved next-action: scope the two HIGH review findings (`rec-20260801-008`/`-009`, finding-identity hash instability) before deciding the `feat/kernel-assurance-v2` → `main` merge path. That's now done — findings scoped, fixed (mostly), shipped.
- Root cause of both: `computeFindingId` hashed `anchor.kind`/`anchor.ref`/`severity` alongside `file`/`message`, but anchor legitimately changes across settles via the DRAFT-amendment/anchor-earning workflow, and severity is live LLM output under real providers — either change minted a new id for an unchanged defect, defeating phase 242's ledger dedup.
- Operator chose "fix the anchor+severity slice now as a real phase, risk-accept the message-text-drift slice" over the other options (hold the merge, or defer everything). Built subagent-driven in a fresh worktree: DRAFT 245-01 (5 ACs, 4 tasks), each task independently implemented + independently reviewed, a whole-branch review (caught real issues both times — see below), single settle commit, PR #352 against `feat/kernel-assurance-v2` (not `main` — this arc's own convention), CI green on all 3 OSes, merged with explicit operator consent as `0d6aea6d`.
- `rec-20260801-009` shipped. `rec-20260801-008` archived — its message-text-drift half isn't fixed by this phase (needs bounded near-duplicate matching, a real feature with genuine false-merge risk, not a quick fix) — superseded by narrower `rec-20260801-010`, explicitly risk-accepted rather than built speculatively. `dec-20260730-001` (the ARC's own decision record — see gotcha below on a same-id collision with main's unrelated `dec-20260730-001`) narrowed by new `dec-20260801-002`.
- **The arc→main merge decision itself is still not made** — deliberately out of scope this session, per the resumed next-action's own boundary. That's the next thing to pick up.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 5 ahead / 0 behind origin
- HEAD `0f509ef6`
- Recent commits:
```
0f509ef6 chore(cadence): stamp session handoff — arc-high-findings-scoping-next
d953055f chore(cadence): stamp session handoff — kernel-arc-phase244-shipped-verifier-activated
b168912a chore(cadence): stamp session handoff — kernel-arc-merge-decision-review-recs-filed
ef39a6fb chore(cadence): stamp session handoff — kernel-arc-phase242-merged-pr346
b16192bc chore(cadence): stamp session handoff — phase243-mock-banner-shipped-recs-filed
0df76694 docs: fix stale host-cli verifier-family scope claim in providers.md (#350)
90887434 chore(cadence): session handoff stamp + CLAUDE.md model-selection docs (#345)
db225ace fix: loud banner on every seam's credential-missing downgrade (phase 243) (#344)
```
- Uncommitted (diff --stat):
```
.claude/scheduled_tasks.lock | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```
- Loop: IDLE · phase 243-untitled · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260727-001 — Assurance manifest: persist verifier family/model for code-review + security-audit (candidate/ready-for-cadence-spec)
  - rec-20260727-002 — SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome (candidate/ready-for-cadence-spec)
  - rec-20260727-012 — cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift) (candidate/ready-for-cadence-spec)
  - rec-20260727-003 — Kernel/verifier contract + lint rule against internal imports (candidate/ready-for-cadence-spec)
  - rec-20260731-001 — cadence doctor: release-currency check (local package.json vs published npm) (candidate/ready-for-milestone)
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
  - dec-20260730-001 — Coverage phase-scoping uses a phase-qualified test token, not file-ownership scoping
- Files in play:
  - `packages/core/src/gates/types.ts` — affected by rec-20260727-001 Assurance manifest: persist verifier family/model for code-review + security-audit
  - `packages/types/src/summary.ts` — affected by rec-20260727-001 Assurance manifest: persist verifier family/model for code-review + security-audit
  - `packages/core/src/cli/commands/summary.ts` — affected by rec-20260727-002 SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome
  - `packages/core/src/verify/phase-replay.ts` — affected by rec-20260727-002 SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome
  - `.cadence/ROADMAP.md` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/checks/roadmap-currency.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/registry.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/gates/engine.ts` — affected by rec-20260727-003 Kernel/verifier contract + lint rule against internal imports
  - `packages/core/src/doctor/run.ts` — affected by rec-20260731-001 cadence doctor: release-currency check (local package.json vs published npm)
  - `.githooks/pre-push` — affected by rec-20260731-001 cadence doctor: release-currency check (local package.json vs published npm)

## What landed this session
- **Scoping**: read both HIGH-finding recs off the arc's ledger, `packages/core/src/verify/finding-identity.ts`, `finding-routing.ts`, and the relevant tests directly (not from memory). Consulted the advisor before committing to a fix plan — it caught two things I'd missed: (a) a same-id merge group's `severity` invariant would break too, not just anchor (folded into the fix as AC-5/T4), (b) the blast-radius asymmetry (both findings fail toward harmless duplicate ledger noise, never toward data loss or a wrong gate verdict) is the real argument for "fix the deterministic half now, risk-accept the fuzzy-matching half" — that framing is what the operator then picked.
- **Phase 245** (`.claude/worktrees/kernel-arc-phase245-identity-stability`, now removed post-merge; branch `kernel-arc-phase245-identity-stability`, now deleted post-merge): T1 narrowed `computeFindingId`'s hash to `(file, normalizedMessage)`; T2 rewrote `finding-identity.test.ts`'s anchor/severity assertions (inverted, plus a 4th assertion T1's implementer found that my original task text hadn't enumerated); T3 added the missing `expect(beforeFinding.id).toBe(afterFinding.id)` to `criteria-anchor-corpus.test.ts`'s existing AC-5 round-trip test; T4 added `SEVERITY_RANK` to `finding-routing.ts`'s merge logic (most-severe-wins, not first-wins) plus fixed stale comments there and in `docs/concepts.md`.
- Every task: independent implementer subagent → my own re-verification (diff read + typecheck/lint/full-suite re-run, never trusted the subagent's self-report) → independent reviewer subagent. All 4 tasks came back APPROVE.
- **Whole-branch review, round 1**: found one real blocking issue neither per-task review caught — `packages/types/src/summary.ts`'s `FindingZ.id` docstring still described the old 5-input formula (T4's `files:` only covered `finding-routing.ts` + `docs/concepts.md`, not the types package). Fixed (+ 2 related stale test comments), re-reviewed clean.
- **Whole-branch review, round 2**: found a real process gap — no changeset for this phase, and a pre-existing unreleased phase-236 changeset (`finding-identity-disposition-convergence.md`) that also stated the old formula. Fixed both (edited the stale one, added `finding-identity-drop-anchor-severity.md`, `patch`-level on `@manehorizons/cadence-core` only). Final confirmation pass: READY TO MERGE.
- Settled (`cadence settle run --auto`, all 5 ACs PASS), promoted `rec-20260801-009` to shipped, archived `rec-20260801-008` and filed the narrower `rec-20260801-010`, recorded `dec-20260801-002` narrowing the arc's `dec-20260730-001`, single commit `75a460e4`, PR #352 → `feat/kernel-assurance-v2`, CI green (ubuntu/macos/windows), merged with explicit operator consent.

## Carry-forward gotchas
- **`dec-20260730-001` is a same-id collision across branches** — the arc's own ledger has a `dec-20260730-001` about finding-identity's anchor-derived hash (the one narrowed by this session's `dec-20260801-002`); `main`'s ledger (see "CADENCE context" above, pulled from this checkout) has an *unrelated* `dec-20260730-001` about coverage phase-scoping. Two independent decision-id sequences on diverged branches, same pattern already seen with rec ids (see `cadence-rec-id-collision-on-rebase` memory). Not a bug, just don't confuse the two when reading `dec-20260730-001` out of context — check which branch/ledger you're actually looking at.
- **`gh pr merge --delete-branch`'s local checkout step failed again** (3rd+ time this pattern has been hit on this repo) — this time because the sibling worktree `.claude/worktrees/kernel-arc-docs-review` still holds `feat/kernel-assurance-v2` checked out, so the merge command's post-merge local branch-switch collided with it. The remote merge itself always succeeds regardless — verified via `gh pr view 352 --json state,mergedAt,mergeCommit` (state: MERGED) before doing anything else. Cleaned up the now-orphaned remote branch manually (`git push origin --delete kernel-arc-phase245-identity-stability`) and the local one too (`git branch -D`, safe after independently confirming the squash-merge via `gh pr view` — `git branch -d`'s "not fully merged" complaint is expected/harmless in this squash-merge repo, not a real warning).
- **The `kernel-arc-docs-review` worktree is now stale** (was already 9 commits behind `origin/feat/kernel-assurance-v2` before this session; now 10+ behind after PR #352). Its own handoff doc (`.cadence/handoff/SESSION-2026-07-29-phase235-shipped-coverage-audit-next.md` inside that worktree) is from 2026-07-29, well before phases 242/244/245's work — it wasn't touched this session and its purpose/owner is unclear. Worth a look before the next arc session: is it still needed, or should it be re-synced or removed?
- **This arc's `shippedRef` convention never gets corrected from "PR pending" to the real PR number** once the PR lands — confirmed via `git log` that phases 236/242/208 all still show "PR pending" in their ledger `shippedRef` today, well after merging. `rec-20260801-009`'s `shippedRef` was left the same way (intentionally, matching precedent) — don't "fix" this on a future pass, it's the established norm here.
- Primary checkout (`main`) is still 5 ahead of `origin/main`, same pre-existing handoff-stamp chores multiple prior handoffs have already noted (not this session's work) — still unpushed per the standing "ask before pushing, default no" preference; wasn't touched this session.
- The scratch-worktree merge-safety test (branch off `main`/`origin/<ref>`, merge, full pipeline, clean up) has NOT been re-run since PR #352 landed — the reusable procedure is noted in prior handoffs. Re-run it before any real arc→main merge decision; the arc has now moved twice more (PRs #351, #352) since the last time it was run.

## Next action
**Action:** Decide the `feat/kernel-assurance-v2` → `main` merge path (cherry-pick individual phases / merge-whole / continue holding). First re-run the scratch-worktree merge-safety test (branch a scratch dir off `main`, merge in `origin/feat/kernel-assurance-v2`, `pnpm install && pnpm turbo run lint typecheck test build`, clean up) since the arc has moved twice more (PRs #351, #352) since it was last run. Also worth a quick look at whether `kernel-arc-docs-review` (the stale sibling worktree, see gotchas) needs attention first.
**Verify:** A concrete merge-path decision recorded (as a `dec-*` entry or in the handoff), and the scratch merge test's outcome (clean or listing real conflicts) known before acting on it.
**If it fails:** If the scratch merge surfaces real conflicts or test failures, don't resolve them unilaterally as part of "just checking" — report findings back to the operator before deciding cherry-pick vs. merge-whole vs. hold, per this repo's "don't decide unilaterally which risk to accept" convention.
