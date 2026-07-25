---
cadence_handoff: 1
generated_at: 2026-07-25T02:42:01.053Z
label: v1-51-0-and-flake-fix-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: 7d16d4c0
git_ahead: 1
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-25 (v1-51-0-and-flake-fix-shipped)

## TL;DR for the next session
- **v1.51.0 is live on npm** (all four packages, tag `v1.51.0`, GitHub Release) — confirmed independently multiple times, not just trusted from the Release workflow's own report. **A known flake in that workflow is now fixed** (see below), so a future release cut should not hit the same false-red.
- This was a very long session covering: phase 216 (gate `cadence_settle` in the MCP trust envelope), a GitHub Pages demo-gif fix + 44-version `CHANGELOG.md` backfill, a real ledger-corruption investigation and repair (an earlier same-day session's bad rebase-conflict resolution — traced via an Opus forensic pass, fixed via git-history surgery on unpushed local commits, not papered over), a `brace-expansion` audit exception, phase 217 (extend the doc-sync gate to `CHANGELOG.md`), the v1.51.0 release cut itself, and phase 218 (fixed the npm-verification retry-budget flake the release cut exposed).
- **Three real bugs found and fixed in this session, none deferred**: (1) an orphaned recommendation from a bad rebase-conflict resolution (PR #298); (2) a genuine SIGPIPE/`pipefail` race in `.githooks/check-doc-sync.sh` that the `CHANGELOG.md` backfill's own size was large enough to trigger for the first time, blocking the v1.51.0 release commit itself (fixed in the same commit, PR #300); (3) `scripts/release-integrity.mjs`'s post-publish npm-verification retry budget was too short (~3s) for realistic npm CDN propagation delay — root-caused from the actual v1.51.0 release run's failure log, fixed with a much more patient budget for the post-publish check only (PR #301).
- Loop is IDLE, nothing in flight. `main` is 1 ahead / 0 behind origin — just this handoff-stamp commit, intentionally left unpushed (push only when switching machines).
- Two recommendations from earlier in this session are still `needs-evidence`, not yet actioned: `rec-20260724-012` (pnpm's `overrides` mechanism doesn't work at all under the pinned pnpm 9.12.0) and `rec-20260724-013` (`cadence recommendation add`'s id-minting only checks `recommendations.json`, not `evidence.json` — the actual root cause that let the ledger corruption happen in the first place). Neither is a blocker.
- No blockers. Next session should run `cadence recommend` fresh — nothing pre-selected this handoff.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 1 ahead / 0 behind origin
- HEAD `7d16d4c0`
- Recent commits:
```
7d16d4c0 chore(cadence): stamp session handoff — 2026-07-25 (v1.51.0 shipped)
7a72d830 fix(release): give post-publish npm verification a patient retry budget (phase 218-release-verify-retry-budget) (rec-20260725-001) (#301)
d7dedf12 chore(release): v1.51.0 -- SETTLE trust-envelope gate, evidence-floor gate, CHANGELOG-currency gate, retro friction scoring (#300)
87b37a15 feat(githooks): extend the doc-sync gate to CHANGELOG.md (phase 217-changelog-currency-gate) (rec-20260724-003) (#299)
3d1f9b52 chore(security): document brace-expansion audit exception + fix orphaned ledger entry (#298)
d80ce817 docs: sync stale GitHub Pages demo + back-fill CHANGELOG.md through v1.50.0 (#297)
621f87fd feat: close the trust envelope, gate the SETTLE capability class in MCP serve (phase 216-settle-capability-gate) (rec-20260724-005) (#296)
df621ef9 docs: audit sessions ledger-diff findings before closing (phase 215-p0-escape-retro-ledger-diff) (rec-20260724-002) (#295)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260724-004 — Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger (candidate/needs-decision)
  - rec-20260724-006 — Signed or tamper-evident SUMMARY attestations (candidate/needs-decision)
  - rec-20260724-007 — Define and document multi-contributor concurrency semantics for .cadence state (candidate/needs-evidence)
  - rec-20260724-012 — pnpm.overrides is non-functional under the pinned pnpm 9.12.0 — package.json location deprecated, pnpm-workspace.yaml location not yet implemented (candidate/needs-evidence)
  - rec-20260724-013 — cadence recommendation add's next-id derivation only reads recommendations.json, ignoring evidence.json — can silently collide with a dangling evidence row (candidate/needs-evidence)
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
  - `.cadence/ROADMAP.md` — affected by rec-20260724-004 Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger
  - `packages/types/src/summary.ts` — affected by rec-20260724-006 Signed or tamper-evident SUMMARY attestations
  - `packages/core/src/services/settle.ts` — affected by rec-20260724-006 Signed or tamper-evident SUMMARY attestations
  - `docs/team-rollout.md` — affected by rec-20260724-007 Define and document multi-contributor concurrency semantics for .cadence state
  - `package.json` — affected by rec-20260724-012 pnpm.overrides is non-functional under the pinned pnpm 9.12.0 — package.json location deprecated, pnpm-workspace.yaml location not yet implemented
  - `pnpm-workspace.yaml` — affected by rec-20260724-012 pnpm.overrides is non-functional under the pinned pnpm 9.12.0 — package.json location deprecated, pnpm-workspace.yaml location not yet implemented
  - `packages/core/src/services/recommendation-add.ts` — affected by rec-20260724-013 cadence recommendation add's next-id derivation only reads recommendations.json, ignoring evidence.json — can silently collide with a dangling evidence row
  - `packages/core/src/services/doctor.ts` — affected by rec-20260724-013 cadence recommendation add's next-id derivation only reads recommendations.json, ignoring evidence.json — can silently collide with a dangling evidence row

## What landed this session
- **PR #296** — Phase 216-settle-capability-gate: `cadence_settle` gated by the MCP trust envelope. Closes `rec-20260724-005`.
- **PR #297** — GitHub Pages hero image fixed (was stuck on the old bill-split demo gif); `CHANGELOG.md` backfilled from `1.6.1` through `1.50.0` (44 versions, zero gaps, dates cross-checked against real git tag `creatordate`).
- **PR #298** — Documented `GHSA-mh99-v99m-4gvg` (brace-expansion) as an audit exception; fixed a real ledger corruption from an earlier same-day session's bad rebase-conflict resolution via git-history surgery. Filed `rec-20260724-012` and `rec-20260724-013` as follow-ups.
- **PR #299** — Phase 217-changelog-currency-gate: extended `.githooks/check-doc-sync.sh`'s `CLAUDE.md` version gate to also cover `CHANGELOG.md`'s newest heading. Closes `rec-20260724-003` (scoped to gate-only per `dec-20260724-002`).
- **PR #300** — the v1.51.0 release cut. Lockstep version bump across all four published packages; manually corrected `host-claude-code`/`host-codex` to hold lockstep (changesets' default policy alone would have left them a patch behind); fixed the SIGPIPE/pipefail bug in `check-doc-sync.sh` that its own CHANGELOG.md update exposed, with a regression test confirmed red-then-green. Published, tagged, released — independently verified.
- **PR #301** — Phase 218-release-verify-retry-budget: `scripts/release-integrity.mjs`'s post-publish npm verification now retries 10 times (~45s of backoff) instead of 3 (~3s), root-caused directly from the v1.51.0 release run's own failure log. The pre-publish idempotency check keeps its original fast behavior. TDD'd with `vi.useFakeTimers()` — confirmed genuinely red against the old code, green after the fix, no real wall-clock waiting in the test. Closes `rec-20260725-001`.

## Carry-forward gotchas
- **`check-doc-sync.sh` now uses a here-string (`<<<`) instead of `printf | grep -q`** — if you ever touch this file again, do NOT revert to a plain pipe with `grep -q` under `set -o pipefail`; on a large enough doc with an early match, the producer can get SIGPIPE'd and the pipeline's exit code becomes the SIGPIPE code, not grep's real result. A regression test in `doc-sync-hook.test.ts` exists specifically to catch this again.
- **changesets' `updateInternalDependencies: patch` does NOT give you lockstep versioning automatically** — if none of a release's changesets directly touch `host-claude-code`/`host-codex`, `pnpm changeset:version` will only bump them by patch, not to the same minor/major as `core`/`types`. Always check all four package.json versions right after `changeset:version` and manually correct both host packages' package.json + CHANGELOG.md heading if they're off — the v1.50.0 and v1.51.0 cuts both needed this. Worth its own recommendation if it recurs a third time.
- **`scripts/release-integrity.mjs`'s post-publish npm check now retries 10x (~45s)** — if a future release run STILL shows red on that step after this fix, treat it as a real signal (something is actually wrong), not another instance of the old flake; the old flake's specific cause is closed.
- **`cadence recommendation promote` cannot touch an already-shipped/archived rec** — confirmed again this session for `rec-20260724-005`/`-003`/`rec-20260725-001`, all still carrying `shippedRef: "... / PR #TBD"` in the ledger, un-correctable via CLI after archival. Known, recurring gap — not new.
- **`gh pr merge --squash --delete-branch` still occasionally hits the local-checkout-failure pattern** (`'main' is already used by worktree...`) when the local checkout is ON `main` at merge time — merges cleanly with no error when the checkout is on the feature branch itself. Either way the remote merge always succeeds — verify via `gh pr view --json state,mergedAt,mergeCommit` regardless.
- **A mid-session concurrent-session scare turned out to be a same-day, same-machine, earlier-session artifact**, not a live second session — full forensic trace is in PR #298's description. If something similar happens again, check for a live `cadence mcp serve`/`claude` process pair via `ps aux` AND `/proc/<pid>/cwd`, but also consider whether the "foreign" content might just be from an earlier `git rebase`/`stash` on the SAME checkout done hours earlier the same day before assuming true concurrency.

## Next action
**Action:** Run `cadence recommend` to pick the next unit of work — none was pre-selected this handoff. `rec-20260724-012` (broken pnpm overrides) and `rec-20260724-013` (id-minting doesn't check evidence.json) are both fresh, `needs-evidence` candidates worth a look; `rec-20260724-004`/`-006`/`-007` (all `needs-decision`) are older gray-area items still waiting on an operator call.
**Verify:** `cadence progress` should show `IDLE` with no active phase/draft before starting anything new; `npm view @manehorizons/cadence-core version` should show `1.51.0` if you want to reconfirm the release is still live.
**If it fails:** if `cadence recommend` surfaces nothing actionable, check the "Top recommendations" list above (pre-filled from this handoff's generation) for one already `ready-for-milestone`, or ask the operator which gray-area rec to resolve first.
