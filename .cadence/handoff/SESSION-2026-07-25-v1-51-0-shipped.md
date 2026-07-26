---
cadence_handoff: 1
generated_at: 2026-07-25T00:43:19.969Z
label: v1-51-0-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: d7dedf12
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-25 (v1-51-0-shipped)

## TL;DR for the next session
- **v1.51.0 is live on npm, all four packages, tag, and GitHub Release confirmed independently** (not just trusted from the workflow's own report — the workflow's "Create GitHub Release and verify registry" step reported red on `host-codex` due to npm-CDN propagation lag, but `npm view` on all four packages, the `v1.51.0` tag, and `gh release view` all confirmed fully live and correct; the red was cosmetic, per this repo's own documented flake pattern).
- This was a long session: phase 216 (gate `cadence_settle` in the MCP trust envelope), a GitHub Pages demo-gif fix + 44-version `CHANGELOG.md` backfill, a real ledger-corruption investigation and fix (an earlier session's bad rebase-conflict resolution left an orphaned recommendation — traced and repaired via git-history surgery on unpushed local commits, not just papered over), a `brace-expansion` audit exception, phase 217 (extend the doc-sync gate to `CHANGELOG.md`), and finally this release cut.
- **Two real bugs found and fixed during the release cut itself, not deferred**: (1) changesets' `updateInternalDependencies: patch` policy alone left `host-claude-code`/`host-codex` at `1.50.1` instead of lockstep `1.51.0` — manually corrected. (2) A genuine latent SIGPIPE/`pipefail` race in `.githooks/check-doc-sync.sh` (`printf | grep -q` on a doc large enough that grep exits before printf finishes writing) that the CHANGELOG.md backfill's own size (~97KB) was large enough to trigger for the first time — it blocked the release commit itself, was root-caused, fixed with a herestring, and covered by a real regression test (confirmed red against the old checker, green against the fixed one).
- Loop is IDLE, nothing in flight. `main` is 0 ahead / 0 behind origin — fully synced, nothing unpushed.
- Two new recommendations from this session are `needs-evidence`, not yet actioned: `rec-20260724-012` (pnpm's `overrides` mechanism doesn't work at all under the pinned pnpm 9.12.0, in either config location) and `rec-20260724-013` (`cadence recommendation add`'s id-minting only checks `recommendations.json`, not `evidence.json` — the actual root cause that let the ledger corruption happen). Neither is a blocker; both are real, worth picking up.
- No blockers. Next session should run `cadence recommend` fresh — nothing pre-selected this handoff.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 0 ahead / 0 behind origin
- HEAD `d7dedf12`
- Recent commits:
```
d7dedf12 chore(release): v1.51.0 -- SETTLE trust-envelope gate, evidence-floor gate, CHANGELOG-currency gate, retro friction scoring (#300)
87b37a15 feat(githooks): extend the doc-sync gate to CHANGELOG.md (phase 217-changelog-currency-gate) (rec-20260724-003) (#299)
3d1f9b52 chore(security): document brace-expansion audit exception + fix orphaned ledger entry (#298)
d80ce817 docs: sync stale GitHub Pages demo + back-fill CHANGELOG.md through v1.50.0 (#297)
621f87fd feat: close the trust envelope, gate the SETTLE capability class in MCP serve (phase 216-settle-capability-gate) (rec-20260724-005) (#296)
df621ef9 docs: audit sessions ledger-diff findings before closing (phase 215-p0-escape-retro-ledger-diff) (rec-20260724-002) (#295)
1cf84ce5 chore(security): document postcss audit exception (GHSA-r28c-9q8g-f849) (#294)
a24506d9 feat: minimum-evidence floor gate for settle (phase 214-evidence-floor-gate) (rec-20260724-001) (#293)
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
- **PR #296** — Phase 216-settle-capability-gate: `cadence_settle` gated by the MCP trust envelope, `enforceApprovalBypassGrant` renamed `enforceGatedToolGrant`. Closes `rec-20260724-005`.
- **PR #297** — GitHub Pages hero image fixed (was stuck on the old bill-split demo gif while `README.md` had moved on to the test-gutting demo), and `CHANGELOG.md` backfilled from `1.6.1` through `1.50.0` (44 versions, zero gaps, dates cross-checked against real git tag `creatordate`).
- **PR #298** — Documented `GHSA-mh99-v99m-4gvg` (brace-expansion) as an audit exception, and fixed a real ledger corruption: an earlier session that day had mis-resolved a rebase conflict, leaving `.cadence/intelligence/RECOMMENDATIONS.md`/`evidence.json` carrying an orphaned recommendation (`rec-20260724-011`, a genuine bug about `cadence build task`/`done <id>` silently accepting a malformed task id) with no backing entry in `recommendations.json`. Root-caused via an Opus forensic investigation, then fixed via git-history surgery on the unpushed local commits (detach at last-clean commit → cherry-pick to the split point → strip the orphaned fragments → properly re-file via `cadence recommendation add` → replay the rest) rather than papering over it. Filed `rec-20260724-012` and `rec-20260724-013` as follow-ups.
- **PR #299** — Phase 217-changelog-currency-gate: extended `.githooks/check-doc-sync.sh`'s existing `CLAUDE.md` version gate to also cover `CHANGELOG.md`'s newest heading, at commit/push time and in CI. Closes `rec-20260724-003` (scoped to gate-only per `dec-20260724-002`; auto-generating changelog prose from `SUMMARY.json` deferred).
- **PR #300** — the v1.51.0 release cut itself. Lockstep version bump across all four published packages; fixed the SIGPIPE/pipefail bug in `check-doc-sync.sh` that its own CHANGELOG.md update exposed (see TL;DR); manually corrected `host-claude-code`/`host-codex` to hold lockstep. Published to npm, tagged, GitHub Release created — all independently verified.

## Carry-forward gotchas
- **`check-doc-sync.sh` now uses a here-string (`<<<`) instead of `printf | grep -q`** — if you ever touch this file again, do NOT revert to a plain pipe with `grep -q` under `set -o pipefail`; on a large enough doc with an early match, the producer can get SIGPIPE'd and the pipeline's exit code becomes the SIGPIPE code, not grep's real result. The regression test (`doc-sync-hook.test.ts`, "finds an early match in a document much larger than a typical pipe buffer") exists specifically to catch this again.
- **changesets' `updateInternalDependencies: patch` does NOT give you lockstep versioning automatically** — if none of a release's changesets directly touch `host-claude-code`/`host-codex`, `pnpm changeset:version` will only bump them by patch (matching their bumped internal deps), not to the same minor/major as `core`/`types`. Always run `for p in core types host-claude-code host-codex testkit; do grep version packages/$p/package.json; done` right after `changeset:version` and manually correct package.json + the CHANGELOG.md heading (not the body) for both host packages if they're off — same fix the v1.50.0 cut needed too. Worth its own recommendation if this recurs a third time.
- **`cadence recommendation promote` cannot touch an already-shipped/archived rec** — confirmed again this session (`rec-20260724-005`, `rec-20260724-003` both still carry `shippedRef: "phase NNN / PR #TBD"` in the ledger, un-correctable via CLI after archival). Known gap, not new — see prior handoff for the same note on `rec-20260724-001`.
- **`gh pr merge --squash --delete-branch` still occasionally hits the local-checkout-failure pattern** (`'main' is already used by worktree...`) when the local checkout is ON `main` at merge time — but merges cleanly with no error when the local checkout is on the feature/release branch itself at merge time (confirmed both ways this session). Either way, the remote merge always succeeds — verify via `gh pr view --json state,mergedAt,mergeCommit` regardless.
- **The `Release` workflow's "Create GitHub Release and verify registry" step failed on `host-codex` specifically due to npm-CDN propagation lag** (`npm view` retried 3x internally and still saw `1.50.0` momentarily) even though the publish step itself had already succeeded for all four packages seconds earlier. Independently re-verified via `npm view`/`git ls-remote --tags`/`gh release view` — all fully correct. Do not `gh run rerun --failed` on this workflow; it re-runs `pnpm -r publish` and fails hard on already-published versions.
- **A concurrent-session scare mid-session turned out to be a same-day, same-machine, earlier-session artifact**, not a live second session — see PR #298's description for the full forensic trace. If something similar happens again: check `ps aux` for a live `cadence mcp serve`/`claude` pair, but also check whether the "foreign" content might just be from an earlier `git rebase`/`stash` on the SAME checkout done hours earlier the same day, before assuming true concurrency.

## Next action
**Action:** Run `cadence recommend` to pick the next unit of work — none was pre-selected this handoff. `rec-20260724-012` (broken pnpm overrides) and `rec-20260724-013` (id-minting doesn't check evidence.json) are both fresh, `needs-evidence` candidates worth a look; `rec-20260724-004`/`-006`/`-007` (all `needs-decision`) are older gray-area items still waiting on an operator call.
**Verify:** `cadence progress` should show `IDLE` with no active phase/draft before starting anything new; `npm view @manehorizons/cadence-core version` should show `1.51.0` if you want to reconfirm the release is still live.
**If it fails:** if `cadence recommend` surfaces nothing actionable, check the "Top recommendations" list above (pre-filled from this handoff's generation) for one already `ready-for-milestone`, or ask the operator which gray-area rec to resolve first.
