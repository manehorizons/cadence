---
cadence_handoff: 1
generated_at: 2026-07-24T20:16:31.131Z
label: phase-215-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: fef5764d
git_ahead: 3
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-24 (phase-215-shipped)

## TL;DR for the next session
- Synced local `main` with origin (was 3 ahead / 2 behind), landing two rebase conflicts along the way — see gotchas below, both are now written up in cross-tool memory.
- Ran `cadence recommend`, picked `rec-20260724-002` (P0 escape retro: audit findings weren't landing in the ledger), resolved its `needs-decision` gate by choosing a mechanical ledger-diff step over a standing rule or scout-id requirement (`dec-20260724-001`).
- Ran the full loop end-to-end as **phase 215-p0-escape-retro-ledger-diff**: milestone propose/accept/export → SPEC → DRAFT (1 task) → subagent-driven BUILD (implementer + independent reviewer, both clean) → whole-branch review (ready to merge, 1 minor prose nit fixed) → settle (AC-1/AC-2 both PASS at `executed` evidence).
- Landed as **PR #295** (squash-merged, all CI green: 6 test legs + CodeQL + Security) — adds "The Unlogged Audit Finding" to `CLAUDE.md`'s Verification-honesty section, backed by `packages/core/tests/docs/audit-ledger-diff.test.ts`.
- Hit and worked around a real ~15min GitHub platform incident on PR creation (confirmed via githubstatus.com, HTTP 500 on both GraphQL and REST `pulls` endpoints) — polled with a Monitor until it cleared, no workaround needed beyond patience.
- Loop is IDLE, nothing in flight. Local cleanup done: phase-215 worktree removed, worktree branch deleted both locally and on origin.
- Next candidate: `cadence recommend`'s ranked list (see CADENCE context above) — top of the list is `rec-20260724-005` (gate the SETTLE capability class in MCP serve, score 68, ready-for-milestone, priority high, security-relevant).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 3 ahead / 0 behind origin
- HEAD `fef5764d`
- Recent commits:
```
fef5764d chore(cadence): stamp session handoff — 2026-07-24 (phase 213 shipped)
62aa5a33 chore(cadence): stamp session handoff — 2026-07-24
b0791bc3 chore(cadence): stamp session handoff — 2026-07-24
df621ef9 docs: audit sessions ledger-diff findings before closing (phase 215-p0-escape-retro-ledger-diff) (rec-20260724-002) (#295)
1cf84ce5 chore(security): document postcss audit exception (GHSA-r28c-9q8g-f849) (#294)
a24506d9 feat: minimum-evidence floor gate for settle (phase 214-evidence-floor-gate) (rec-20260724-001) (#293)
54511099 chore(cadence): mark rec-20260712-014 shipped (PR #291 / phase 213) (#292)
714f3aa4 feat: enforce minimum test-coverage thresholds in CI (phase 213) (rec-20260712-014) (#291)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260724-005 — Close the trust envelope: gate the SETTLE capability class in MCP serve (candidate/ready-for-milestone)
  - rec-20260724-003 — Generate CHANGELOG entries from settle artifacts and gate releases on changelog currency (candidate/needs-decision)
  - rec-20260724-004 — Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger (candidate/needs-decision)
  - rec-20260724-006 — Signed or tamper-evident SUMMARY attestations (candidate/needs-decision)
  - rec-20260724-007 — Define and document multi-contributor concurrency semantics for .cadence state (candidate/needs-evidence)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
  - dec-20260721-001 — cadence next extends nextAction(), does not subsume quickstart or reimplement
  - dec-20260721-002 — Shared legal-moves computation also powers empty-state footers (rec-20260721-001)
  - dec-20260721-003 — cadence next --json includes schemaVersion: 1
  - dec-20260721-004 — Ship /cadence-next slash command alongside the CLI command
  - dec-20260724-001 — Enforce ledger-diff at audit close, not a standing rule
- Files in play:
  - `packages/types/src/mcp-trust.ts` — affected by rec-20260724-005 Close the trust envelope: gate the SETTLE capability class in MCP serve
  - `packages/core/src/mcp/tools.ts` — affected by rec-20260724-005 Close the trust envelope: gate the SETTLE capability class in MCP serve
  - `CHANGELOG.md` — affected by rec-20260724-003 Generate CHANGELOG entries from settle artifacts and gate releases on changelog currency
  - `.github/workflows/release.yml` — affected by rec-20260724-003 Generate CHANGELOG entries from settle artifacts and gate releases on changelog currency
  - `.cadence/ROADMAP.md` — affected by rec-20260724-004 Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger
  - `packages/types/src/summary.ts` — affected by rec-20260724-006 Signed or tamper-evident SUMMARY attestations
  - `packages/core/src/services/settle.ts` — affected by rec-20260724-006 Signed or tamper-evident SUMMARY attestations
  - `docs/team-rollout.md` — affected by rec-20260724-007 Define and document multi-contributor concurrency semantics for .cadence state

## What landed this session
- **PR #295** (merged, squash, `df621ef`): `CLAUDE.md` gains a new named-failure-mode entry, "The Unlogged Audit Finding," requiring a strategic-audit session to enumerate critical/P0 findings and ledger-diff them against `recommendations.json` (filing anything unmatched via `cadence recommendation add`) before closing. Backed by `packages/core/tests/docs/audit-ledger-diff.test.ts`.
- `rec-20260724-002` promoted through `accepted` → `ready-for-milestone` → `shipped` (ref: `PR #295`); `dec-20260724-001` recorded as the decision that picked the mechanism.
- No changeset — `CLAUDE.md` and `packages/core/tests/` are both outside every published package's `files` allowlist, so no npm-visible behavior changed.

## Carry-forward gotchas
- **Rebasing `.cadence/intelligence/{recommendations,evidence}.json` conflicts can be a genuine same-day `rec-`/`ev-` id collision, not cosmetic JSON noise** — two sessions can independently mint the identical id before either pushes (hit twice this session: once against phase 214's already-shipped `rec-20260724-001`, once again post-merge against phase 215's own `rec-20260724-002`). Don't hand-splice conflict markers: diff `ours`/`theirs` against the merge-base for each side's new ids; if disjoint, take the fuller side wholesale (`git checkout --ours` during a rebase = the branch being rebased *onto*) and re-file the dropped side fresh via `cadence recommendation add` so the CLI assigns a genuinely free id. Written up as `cadence-rec-id-collision-on-rebase` in cross-tool memory.
- **`milestone propose/accept/export` and `recommendation promote`/`decision add` genuinely mutate the ledger even on a primary checkout, and a fresh worktree branches from `origin/main` by default** — so any of these run before `EnterWorktree` get stranded and must be redone inside the worktree. This session did the decision/promotion once on the primary checkout, then discarded it (`git reset --soft` + restore) and redid it inside the worktree once entered — cheap since it's just 2-3 CLI calls, but do it inside the worktree from the start next time.
- **A fresh worktree/clone has no `state.json`** (gitignored, never checked out) — `cadence progress`/`spec new`/etc. all refuse with "not initialized" even though `.cadence/` is fully real. Run `cadence onboard` first (safe on an existing `.cadence/` dir, unlike `cadence init` which refuses) to bootstrap it. `cadence doctor` names this fix directly if hit again.
- **`milestone eligibility` requires `status=accepted` AND `readiness` in `{ready-for-milestone, ready-for-cadence-spec}`** — promoting only readiness (as `dec-20260724-001`'s SPEC assumed) isn't enough; `cadence milestone propose` names the exact missing status and the fix command when it refuses.
- **GitHub had a real ~15min platform-wide incident on Pull Requests today** (19:37–19:56 UTC, confirmed via githubstatus.com) — both `gh pr create`'s GraphQL path and the raw REST `POST /repos/.../pulls` endpoint returned bare HTTP 500s with empty bodies throughout. Not a client-side or request-shape issue; check githubstatus.com before deep-diving a mystery `gh pr create` failure.
- `gh pr merge --squash --delete-branch` again hit the known local-checkout-failure pattern (`'main' is already used by worktree...`) — remote merge succeeded regardless (verified via `gh pr view --json state,mergedAt,mergeCommit`), matching `gh-pr-merge-local-checkout-failure` in memory. The remote branch also survived this time (delete step didn't run either) — cleaned up manually with `git push origin --delete <branch>`.

## Next action
**Action:** Run `cadence recommend` for a fresh ranked list and pick the next candidate. `rec-20260724-005` (gate the SETTLE capability class in MCP serve — extends the existing def-hash-bound grant/revoke/expiry machinery that already gates `APPROVAL_BYPASS`) is the top-ranked, highest-priority, security-relevant item as of this handoff.
**Verify:** `rec-20260724-002` should show as `shipped`, not in the ranked/candidate list.
**If it fails:** if the ranked list looks stale or wrong, run `cadence doctor` first to check ledger integrity before investigating further.
