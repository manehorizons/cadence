---
cadence_handoff: 1
generated_at: 2026-07-31T02:50:21.960Z
label: phase236-shipped-pr337-merged
loop_position: IDLE
active_phase: 229-readme-mermaid-diagram-doc-test
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 2aaa01ec
git_ahead: 14
git_behind: 1
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-31 (phase236-shipped-pr337-merged)

## TL;DR for the next session
- **Phase 236 shipped.** Finding identity (`id`/`target`/`disposition`/`waiver` on `FindingZ`), the widened `AnchorZ.kind` (`+invariant`), and the Finding-type convergence (code-review's local type onto the shared `cadence-types` `Finding`, discriminated by `target`) are merged into `feat/kernel-assurance-v2` as squash commit `5cc4085` (PR #337). `rec-20260727-006` + `rec-20260727-011` are `shipped`. Deliberately schema-only — findings-to-ledger auto-routing (source doc §7.3) was explicitly deferred to an unnumbered follow-on phase (recorded inline in the arc's `ROADMAP.md`).
- **⚠ Phase 239 has landed on `main` AND its worktree is already cleaned up** — a DIFFERENT, concurrent session did this in this exact same primary checkout while this handoff was being written (see next bullet). PR #338 (`90e3ed96`, "phase-attributable AC coverage via qualified token scheme") is merged; `.claude/worktrees/239-coverage-phase-scoping` and its branch are gone (confirmed via `git worktree list` + `git branch -a` + `git fetch --prune`). This directly unblocks `rec-20260729-006` (retroactive coverage audit) — see `rec-20260729-004` on the arc for the mechanism before re-deriving anything. **No 239 cleanup remains — do not attempt it.**
- **⚠ A concurrent session was active in THIS primary checkout `/home/thomas/projects/cadence` at the same time**, not just in a sibling worktree. It committed `8c289e27 chore(cadence): stamp session handoff — phase239-shipped-pr338-merged` (adds `.cadence/handoff/SESSION-2026-07-31.md`, its own unlabeled doc — read it too, it may have fresher/different detail on the 239 landing than this doc's secondhand account) directly to local `main` while this session was mid-write on its own handoff in the same directory. Both sessions' `cadence handoff` calls independently auto-pruned old docs, leaving two uncommitted deletions in the shared working tree that neither session's commit claimed (`SESSION-2026-07-26.md`, `SESSION-2026-07-26-phase-226-...md`) — left alone deliberately rather than guessed at. **If more than one session might still be running against this checkout, re-check `git status`/`git log` immediately before any further git operation here — don't trust anything above as still current.**
- **Single next action:** run the now-unblocked `rec-20260729-006` retroactive coverage audit, or author the ledger-routing follow-on phase 236 deferred.
- Extra scrutiny this session: after the standard subagent-driven build (per-task implementer + reviewer + main-thread re-verify, then whole-branch review), an additional independent Opus-model gap review ran before push — zero Critical/Important findings, two cheap fixes folded into the settle commit, two lower-priority findings filed as `rec-20260731-001`/`rec-20260731-002`.
- **This checkout's `.cadence/` (main) predates the arc** — loop `IDLE`/phase `229-readme-mermaid-diagram-doc-test` below is stale, as is the "Top recommendations"/"Active decisions" list (none of phase 236's or 239's activity is in it). The arc's real ledger/roadmap/decisions live on `feat/kernel-assurance-v2`.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 14 ahead / 1 behind origin
- HEAD `2aaa01ec`
- Recent commits:
```
2aaa01ec chore(cadence): stamp session handoff — phase236-gate-cleared-arc-synced-deja-restored
34bad77e chore(cadence): refresh session handoff after end-of-session sync
5d84bbd9 Merge remote-tracking branch 'origin/main'
bbf9ee60 chore(cadence): stamp session handoff — phase241-anchor-ladder-reachability-landed-on-arc
16d62098 chore(cadence): stamp session handoff — phase235-landed-coverage-audit-blocked-on-239
84dc9bd9 fix: doctor verification-readiness checks every verifier seam (phase 240) (#332)
01bf09aa fix: run CI on feat/kernel-assurance-v2 PRs, not just main (#329)
82e898c5 chore(cadence): stamp session handoff — phase232-shipped-feature-branch-233-next
```
- Uncommitted (diff --stat):
```
.claude/scheduled_tasks.lock |  2 +-
 CLAUDE.md                    | 39 +++++++++++++++++++++++++++++++++++++++
 2 files changed, 40 insertions(+), 1 deletion(-)
```
- Loop: IDLE · phase 229-readme-mermaid-diagram-doc-test · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260727-001 — Assurance manifest: persist verifier family/model for code-review + security-audit (candidate/ready-for-cadence-spec)
  - rec-20260727-002 — SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome (candidate/ready-for-cadence-spec)
  - rec-20260727-012 — cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift) (candidate/ready-for-cadence-spec)
  - rec-20260727-003 — Kernel/verifier contract + lint rule against internal imports (candidate/ready-for-cadence-spec)
  - rec-20260726-005 — coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode (candidate/needs-decision)
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
  - `packages/core/src/gates/types.ts` — affected by rec-20260727-001 Assurance manifest: persist verifier family/model for code-review + security-audit
  - `packages/types/src/summary.ts` — affected by rec-20260727-001 Assurance manifest: persist verifier family/model for code-review + security-audit
  - `packages/core/src/cli/commands/summary.ts` — affected by rec-20260727-002 SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome
  - `packages/core/src/verify/phase-replay.ts` — affected by rec-20260727-002 SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome
  - `.cadence/ROADMAP.md` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/checks/roadmap-currency.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/registry.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/gates/engine.ts` — affected by rec-20260727-003 Kernel/verifier contract + lint rule against internal imports
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260726-005 coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode
  - `packages/core/src/gates/registry.ts` — affected by rec-20260726-005 coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode

## What landed this session
- Resumed via `/resume --list`; two candidates found (main IDLE, sibling 239-worktree BUILD). User asked to continue the kernel-assurance-v2 arc instead, driven by the freshest handoff (`SESSION-2026-07-30-phase236-gate-cleared-arc-synced-deja-restored.md`).
- Set up an isolated worktree `.claude/worktrees/236-finding-identity` on branch `236-finding-identity`, based off `origin/feat/kernel-assurance-v2`; `pnpm install` + `pnpm build` + `cadence onboard --skip-host-wire` (fresh worktree, no `state.json`).
- Authored DRAFT `236-01` (5 ACs, 6 tasks) after a scope clarification with the user: this slice covers finding identity + type convergence + the `RecommendationSourceZ` schema prerequisite only — NOT the actual findings-to-ledger auto-routing behavior, which phase 235's own boundary and the source doc's Slice 3 assign to "phase 236" but which is real I/O-port-threading work split out here. `cadence draft check` → OK; `cadence draft approve` → BUILD.
- Converted `rec-20260727-006` + `rec-20260727-011` onto the phase via `cadence recommendation convert`.
- Ran the `phase-build` pipeline: 6 tasks (T1 schema/FindingZ+AnchorZ, T2 RecommendationSourceZ, T3 pure `finding-identity.ts` content-hash module, T4 wire into `gates/code-review.ts`, T5 converge the two `Finding` types, T6 docs+roadmap+full verify), each with an independent implementer subagent, an independent reviewer subagent, and main-thread re-verification (diff read + tests re-run) before recording DONE. T1's reviewer caught a real gap — `waiver` had no cross-field constraint tying it to `disposition === 'waived'` — fixed directly (two `.refine()`s) and re-verified before recording DONE.
- Fresh whole-branch review (7th subagent): "ready to merge," zero Critical/Important findings, traced the cross-task interaction (identity-stamping is structurally isolated from refuse/pass logic) by hand.
- `cadence settle run --auto`: `schemaVersion: 2`, real assurance record, zero gate bypasses. Both recs promoted to `shipped` with ref `phase 236-finding-identity-disposition-ledger-routing (feat/kernel-assurance-v2 arc, PR pending)` (no prior-art convention existed yet for an arc-phase ref format — this session set one).
- User asked whether the build had been reviewed by Opus; it had not (all subagents ran on session-default Sonnet). Dispatched one more independent Opus-model "gap review" post-whole-branch-review, pre-push. Verdict: zero Critical/Important; 2 Minor + 2 Nitpick findings. Fixed the 2 cheap ones inline (D3 stderr breakdown was silently missing a `critical=` count after T5's type widening; the changeset didn't disclose that `CodeReviewFindingSeverity` also widened to include `'critical'`), amended the still-unpushed settle commit, filed the other 2 (`rec-20260731-001` id-collision property, `rec-20260731-002` doc-citation drift risk) rather than fixing silently.
- Pushed, opened PR #337 into `feat/kernel-assurance-v2` (not `main` — explicit per the source handoff). All CI green first try (`ci-success`, `build`, macOS/Ubuntu/Windows × Node 22), no flakes. User gave explicit merge consent; squash-merged as `5cc4085`. Remote branch deleted; local branch delete failed only because the worktree still held it (known pattern, not a real failure) — cleaned up manually: removed the worktree, force-deleted the local branch after verifying its tip SHA matched the merged PR's `headRefOid` (squash merges always show "not fully merged" to git's ancestry check).
- Unrelated mid-session detour: user's system was swapping heavily (61Gi/62Gi RAM, 45Gi/63Gi swap in use) — root-caused to a `cosmic-launcher` memory leak (37.8GB RSS, 58% of total RAM). Restarted it (`kill -TERM`, session auto-respawned it fresh at ~26MB). RAM used dropped to 24Gi, swap to 26Gi. Unrelated to any CADENCE/build activity — pure desktop-environment leak.

## Carry-forward gotchas

- **Phase 239 landed on `main` (PR #338, `90e3ed96`) and its worktree/branch are already gone** — cleaned up by the concurrent session (see TL;DR), confirmed via `git worktree list` + `git branch -a` + `git fetch --prune` at the end of this session. Nothing to verify or clean up there; don't re-scan for it.
- **`rec-20260729-006` (retroactive coverage audit) is now unblocked** by phase 239 landing. Read `rec-20260729-004` on the arc for the measurement mechanism already taken — don't re-derive it.
- **This checkout had a second, concurrent session in it while this handoff was written.** `.cadence/handoff/SESSION-2026-07-31.md` (unlabeled) is that session's own doc, committed as `8c289e27` — read it for its account of the phase-239 landing before relying solely on this doc's secondhand summary. Two stale-doc auto-prune deletions from both sessions' `cadence handoff` runs (`SESSION-2026-07-26.md`, `SESSION-2026-07-26-phase-226-...-shipped.md`) were left uncommitted in the working tree rather than guessed at — check `git status` for them; committing or restoring is a judgment call for whoever resumes next, not decided here.
- **The findings-to-ledger auto-routing behavior (source doc §7.3) is still unbuilt and unnumbered.** Phase 236 shipped only the schema prerequisite (`RecommendationSourceZ`'s `review` member) plus finding identity/convergence. The actual behavioral work — gate code creating `Recommendation`+`Evidence` entries from findings during settle, new I/O port threading into `gates/code-review.ts` — needs its own phase, scoped from `.cadence/ROADMAP.md`'s phase-236 "As built" amendment and the source doc's §7.3.
- **Two new recs from the Opus gap review, not yet triaged into a phase:** `rec-20260731-001` (two findings sharing `(file, anchor.kind, anchor.ref, severity, normalized message)` collapse to the same `id` — matters once the ledger-routing phase starts keying on identity) and `rec-20260731-002` (docs/concepts.md's new phase-236 subsection has ~10 unpinned `file.ts:NN-NN` citations that will silently rot).
- **`main` is now 14 ahead / (was 1, may have changed again) behind origin** — the 14 ahead are still the same docs-only handoff-stamp commits the prior handoff flagged; they need their own branch+PR, and there's an overlapping PR #236 (open since 07-18) to check first before opening a new one. Not touched this session.
- **`main`'s working tree has pre-existing uncommitted dirt** (`.claude/scheduled_tasks.lock`, `CLAUDE.md`) that predates this session — not mine, left alone. Investigate before assuming it's safe to discard; could be another concurrent session's in-progress edit.
- **`SYNC_TARGET_BRANCH` still needs unsetting when the arc eventually dies** (`gh variable delete SYNC_TARGET_BRANCH`) — unchanged carry-forward from the prior handoff, nothing enforces it.
- **The local `feat/kernel-assurance-v2` branch ref (if still present anywhere) is stale** — this session always based new work directly off `origin/feat/kernel-assurance-v2`, never the local ref. Re-fetch before trusting it.
- **Arc-phase `shippedRef` format was previously unestablished** — this session used `"phase <slug> (feat/kernel-assurance-v2 arc, PR pending)"` for `rec-20260727-006`/`-011`. No prior arc-phase rec had been promoted to `shipped` before this. Follow the same convention for consistency, or update these two if a better convention emerges.
- No stash was taken; the phase-236 worktree was clean at every checkpoint. This primary checkout's pre-existing dirty files (above) were left untouched, not stashed.

## Next action

**Action:** First, re-check `git log`/`git status`/`gh pr list` — this checkout had a second concurrent session active while this doc was written (see gotchas); its own state may have moved further by the time this is read. Then start the now-unblocked `rec-20260729-006` retroactive coverage audit — read `rec-20260729-004` on the arc first for the mechanism and measurements already taken, and confirm phase 239's landing (PR #338) is what it should build on.

**Verify:** `gh pr view 338 --json state,mergedAt` shows `MERGED`; `rec-20260729-004`'s referenced mechanism/measurements are read before the audit starts, not re-derived from scratch.

**If it fails:** if phase 239's landing turns out to be incomplete or the coverage scan it depends on is still the broken unscoped one, stop and say so rather than publishing a figure that would need disclaiming.

**Alternative:** author the ledger-routing follow-on phase 236 deferred (source doc §7.3 — gate code writing `Recommendation`+`Evidence` entries from findings during settle). Scope it from `.cadence/ROADMAP.md`'s phase-236 "As built" amendment; it is not yet a numbered phase.

**Do NOT:** re-scan for or attempt to clean up the 239 worktree — it's already gone. Do NOT build ledger-routing behavior as an extension of phase 236 (it already settled) — scope it as a new phase. Do NOT push main's 14 unpushed commits without opening a PR and checking the overlapping PR #236 first. Do NOT assume this checkout is single-session — verify before any shared-tree git operation.
