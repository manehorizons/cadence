---
cadence_handoff: 1
generated_at: 2026-07-26T03:27:31.495Z
label: phase-223-summary-hash-attestation
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: a5b2705e
git_ahead: 8
git_behind: 1
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-26 (phase-223-summary-hash-attestation)

## TL;DR for the next session
- Phase 223 (settle-time SUMMARY.json content hash + `cadence summary verify`) shipped: built via draft→build→settle with per-task implementer+reviewer, one whole-branch review, merged as PR #307 (squash commit `d7d42399`) onto `origin/main`.
- **Blocker for pushing local `main`:** a genuine rec-id collision on `rec-20260726-001` — see Carry-forward gotchas. Must be resolved (re-mint the local-only rec under a new id) before local `main`'s 8 unpushed commits go up, or the push will silently clobber the merged one.
- Local `main` is 8 ahead / 1 behind `origin/main` — the "1 behind" is this session's own PR #307 merge, not yet pulled locally. Fetch/pull before touching the collision.
- Those 8 unpushed local commits (handoff stamps for v1.51.0/v1.51.1 releases, phases 219/221/222) look like leftover state from an earlier/concurrent session in this same primary checkout — never confirmed dead, just inferred complete from commit content. Treat with the Zombie Session protocol before assuming it's safe to just push everything.
- `rec-20260724-006` is `settle-pending` (converted to phase 223, settled) — promote to `shipped --ref "PR #307"` next session (deferred here since the PR wasn't merged yet at settle time).
- A stray untracked `.cadence/intelligence/exports/mil-rec-rec-20260724-013/SPEC.md` has been sitting in this checkout across multiple sessions — not part of this session's work, never triaged; safe to leave, but worth a decision eventually (keep as milestone export or delete).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 8 ahead / 1 behind origin
- HEAD `a5b2705e`
- Recent commits:
```
a5b2705e chore(cadence): stamp session handoff — 2026-07-26 (v1.51.1 release cut shipped)
52f1b4e4 chore(cadence): recover uncommitted scout-session recommendation ledger entries
c3b2b13d chore(cadence): stamp session handoff — 2026-07-26 (phase 222 shared-adapter-toolkit shipped)
bac63ac3 chore(cadence): stamp session handoff — 2026-07-25 (phase 221 mcp-cli-parity shipped)
be083d3e fix: revert accidental inclusion of ephemeral intelligence-ledger telemetry in handoff commit
5a90c260 chore(cadence): stamp session handoff — 2026-07-25 (phase 219 shipped)
67ced922 chore(cadence): stamp session handoff — 2026-07-25 (v1.51.0 and flake fix shipped)
e041e863 chore(cadence): stamp session handoff — 2026-07-25 (v1.51.0 shipped)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260725-008 — Deepen the convergent-review protocol (candidate/ready-for-milestone)
  - rec-20260725-006 — Centralize gate bypass and seal policy in the settle driver (candidate/ready-for-milestone)
  - rec-20260725-007 — Split the settleService god function (candidate/ready-for-milestone)
  - rec-20260726-001 — Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it (candidate/ready-for-milestone)
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
- Files in play:
  - `packages/core/src/verify/converge.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/plan-review.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/code-review.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/services/spec-approve.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/types.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/build-test-must-pass.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/boundary-scan.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/security-audit.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/structural-verifier.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/per-task-verify.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `docs/reference/config.md` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/services/settle.ts` — affected by rec-20260725-007 Split the settleService god function
  - `packages/core/src/cli/commands/init.ts` — affected by rec-20260726-001 Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it
  - `packages/core/src/state/simple.ts` — affected by rec-20260726-001 Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it
  - `.cadence/ROADMAP.md` — affected by rec-20260724-004 Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger

## What landed this session
- `cadence recommend` / `cadence milestone propose` surveyed the ledger; picked rec-20260724-006 (SUMMARY.json tamper-evidence) to promote.
- Discussed the "content hash vs full signing" tradeoff with the operator; decided to split scope rather than guess a trust root — recorded as `dec-20260726-001`.
- Promoted rec-20260724-006 to `accepted`/`ready-for-cadence-spec`; filed follow-on `rec-20260726-001` (full signing, `blocked`, gated on the parked threat-model rec `mil-rec-rec-20260712-016`).
- Built phase 223 in an isolated worktree (`223-summary-hash-attestation`, off `origin/main`): DRAFT authored by hand (add-ac/add-task's append-only limitation meant editing the scaffolded placeholders directly), 3 tasks (T1 schema field, T2 settle-time hash computation, T3 `cadence summary verify` CLI), each with an independent implementer + reviewer subagent pair, all APPROVE.
- Whole-branch review caught a real AC-1 gap (hash wasn't shown by `cadence summary render` itself, only the settle-time `.md` sidecar) — fixed directly and covered with 2 new tests.
- Added `.changeset/summary-hash-attestation.md` (`cadence-core`/`cadence-types` → minor).
- `cadence settle run --auto` on phase 223 itself: all 3 ACs pass; `cadence summary verify` on its own output reports `MATCH`.
- Committed, pushed, opened PR #307, confirmed `ci-success` green, merged (squash) on explicit operator request, deleted the remote branch, removed the worktree.
- Along the way: diagnosed and resolved a "CADENCE not initialized here" error in the fresh worktree via `cadence onboard --skip-host-wire` (bootstraps `state.json`, per the phase-196/issue-#177 fallout already shipped in `onboard.ts`) — this is the same failure mode the OTHER session's local-only `rec-20260726-001` describes for `cadence init` specifically; worth checking whether that rec is already substantially addressed by `onboard` before anyone reimplements it.

## Carry-forward gotchas
- **rec-id collision on `rec-20260726-001`**: local `main` (unpushed) has it as "Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it" (created 01:03:37Z, from the earlier/concurrent session). `origin/main` (via this session's PR #307) has it as "Full cryptographic signing of SUMMARY.json (blocked on threat model)" (created 01:59:31Z, mine). Per the standing rec-id-collision protocol: origin's is already public, don't touch it — re-mint the local-only one under the next free id (`rec-20260726-002` or later, check both ledgers first) before pushing local `main`. No `dec-20260726-001` collision — only I minted one, and it's already merged into origin cleanly.
- Local `main` was found mid-session sitting on `release/v1.51.1` (not `main`) with an uncommitted-looking release cut in progress — this turned out to be a legitimate, already-merged release (PR #306), not corruption. But it confirms another session was active in this exact primary checkout earlier today; its 8 unpushed commits here were never confirmed as a dead session vs. just forgotten — check for a live terminal/process before treating local `main` as safe to push wholesale.
- `draft add-ac`/`draft add-task` are append-only — they append after the template's placeholder AC-1/T1 blocks rather than replacing them. For a `--from-rec`-scaffolded DRAFT, hand-edit the placeholder blocks directly (Read + Edit) instead of fighting the append behavior.
- `cadence` on PATH (global install) is stale at v1.49.0; this repo is at v1.52.0-pending (post-phase-223, pre-changeset-version-bump it's still 1.51.1 in package.json until the release phase runs). Both the worktree and this primary checkout needed `pnpm install && pnpm --filter cadence-types build && pnpm --filter cadence-core build` before `node packages/core/bin/cadence.cjs` reflected current engine behavior — the global binary would have silently no-op'd or mis-errored on newer command surface.
- A fresh `EnterWorktree` worktree has `.cadence/` (committed) but no `state.json` (gitignored, phase 196) — every state-mutating `cadence` command throws `NotInitializedError` until `cadence onboard --skip-host-wire` bootstraps it. `cadence init` refuses instead (sees `.cadence/` already present) — that's the other session's `rec-20260726-001` (now needing a new id, see above).
- `gh pr merge --delete-branch` fails its local post-merge checkout step when `main` is checked out in another worktree/checkout (known recurring issue) — the remote merge itself still succeeds; verify with `gh pr view <n> --json state,mergedAt,mergeCommit` and clean up the remote branch manually with `git push origin --delete <branch>` if needed.

## Next action
**Action:** Resolve the `rec-20260726-001` id collision before pushing local `main`: `git fetch origin --prune`, then diff `.cadence/intelligence/recommendations.json` between local `HEAD` and `origin/main` for the `rec-20260726-001` entries, re-mint the local-only "fresh worktree init" one under the next free id via `cadence recommendation add` (copy its title/summary/evidence, then remove the stale duplicate entry), commit that fix, `git pull --rebase origin main`, then decide with the operator whether to push all 9 local commits.
**Verify:** `cadence recommendation show rec-20260726-001` and the newly-minted id both resolve to distinct, correct content; `git log origin/main..HEAD --oneline` no longer shows a ledger conflict; `git status --short --branch` shows `0 ahead` after push (if the operator approves pushing).
**If it fails:** if the diff shows more than just this one collision (e.g. `evidence.json`/`decisions.json` ids too), stop and treat it as a full ledger reconciliation, not a one-line fix — don't blanket-copy either side's ledger file wholesale (known to corrupt cross-references, per prior-session experience).
