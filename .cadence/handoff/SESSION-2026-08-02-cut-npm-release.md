---
cadence_handoff: 1
generated_at: 2026-08-02T22:27:42.391Z
label: cut-npm-release
loop_position: IDLE
active_phase: 246-finding-identity-message-drift
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 75848238
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-02 (cut-npm-release)

## TL;DR for the next session
- This doc supersedes `SESSION-2026-08-02-npm-scope-rename-shipped.md` (same session, same HEAD modulo the handoff-stamp commit itself) — no new work happened between the two, this one just narrows the next action per the operator's explicit ask: **cut the new npm release next.**
- Loop is IDLE, nothing blocking. `main` is at `75848238`, fully synced with origin, no open PRs from this session.
- Phase 250 (npm scope rename `@manehorizons` → `@thomas-powers-jr`) merged this session (#362, `8b42ff4f`) — full detail in the superseded doc above. It deliberately left `npm publish`/`npm deprecate` undone; this session never ran the actual `release-cut` skill.
- At least 4 pending changesets are sitting unreleased since v1.53.0 (2026-08-01): `.changeset/npm-scope-rename.md` (this session, minor, 5 packages), `.changeset/post-gate-refusal-summaries.md`, `.changeset/bypassed-verifier-provenance.md`, `.changeset/refused-settle-summary-preservation.md` (phases 247–249, minor, cadence-core) — but **don't trust this list, `release-cut`'s own inventory step is the source of truth**, this is just what's visible without running it.
- This will be the **first release to publish under the new `@thomas-powers-jr` scope** — the release-cut flow's normal `npm view`/tag/GitHub-release verification steps need to target the new package names, not the old ones out of habit.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `75848238`
- Recent commits:
```
75848238 chore(cadence): stamp session handoff — npm-scope-rename-shipped
8b42ff4f feat: rename npm scope to @thomas-powers-jr (phase 250) (#362)
8f58bde1 feat: post-gate refusal SUMMARYs + finding-durability ledger closeout (phase 249) (rec-20260712-006) (#361)
c96c3017 chore: update GitHub org references for thomas-powers-jr rename (#360)
9d561fbd chore(cadence): session handoff + finding-durability ledger hygiene sweep (#359)
fcd76ad8 feat: honest bypassed-verifier provenance for code-review/security-audit (phase 248) (rec-20260801-004) (#358)
afcb90a9 feat: preserve refused-settle findings across attempts (phase 247) (#357)
98b6a151 chore(cadence): defer finding-identity message-drift dedup, decision-only (phase 246) (#356)
```
- Uncommitted (diff --stat):
```
.claude/scheduled_tasks.lock | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```
- Loop: IDLE · phase 246-finding-identity-message-drift · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260727-012 — cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift) (candidate/ready-for-cadence-spec)
  - rec-20260802-001 — Finding-durability arc: complete, attempt-addressable settle records on every exit path (candidate/ready-for-cadence-spec)
  - rec-20260731-001 — cadence doctor: release-currency check (local package.json vs published npm) (candidate/ready-for-milestone)
  - rec-20260801-001 — docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8 (candidate/ready-for-cadence-spec)
  - rec-20260729-004 — test-coverage gate's repo-wide AC-N token scan collides across phases, so any AC can be satisfied by an unrelated phase's tests (candidate/needs-decision)
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
  - dec-20260728-001 — Phase 233 AC-3 tripwire cleared: assurance-record derivation is gate-agnostic
  - dec-20260729-001 — Phase 234 AC-1 narrowed: contracts/ is the type-naming surface, not the resolution surface
  - dec-20260729-002 — Uniform opts? on VerifierPort is what makes zero-special-cases true
  - dec-20260729-003 — Phase 235 scope: criteria-anchoring is code-review only, not spec-review/ui-spec-review/plan-review
  - dec-20260729-004 — Anchor executable tier: non-empty verify + build-test-must-pass ran, no prose heuristic
  - dec-20260729-005 — Criteria-gap refusal reuses code-review's existing HIGH-severity refuse path, not gates.evidenceFloor
  - dec-20260729-006 — D3 unconditional declaration binds the floor outcome, not the empty-gap case
  - dec-20260731-001 — Findings-to-ledger routing merges same-identity findings by design; the identity hash itself is not changed
  - dec-20260801-001 — Add a settle-time guard for global-CLI-shadowing-branch-build; interim rule is settle via the local build
  - dec-20260801-002 — Finding identity narrowed to (file, normalized message); anchor/severity dropped as identity inputs
  - dec-20260801-003 — Defer finding-identity message-drift dedup: wait for real-provider data, offline analyzer first
  - dec-20260802-001 — Refused gate-loop settles thread acc's findings into the SUMMARY, with a conditional contentHash
  - dec-20260802-002 — Attempt preservation via timestamp-slugged sibling artifact, invisible to all current SUMMARY consumers by construction
  - dec-20260802-003 — Ledger routing stays finalize-only on refusal; Slice 3's revisit trigger amended to name its precondition
- Files in play:
  - `.cadence/ROADMAP.md` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/checks/roadmap-currency.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/registry.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/services/settle.ts` — affected by rec-20260802-001 Finding-durability arc: complete, attempt-addressable settle records on every exit path
  - `packages/core/src/gates/registry.ts` — affected by rec-20260802-001 Finding-durability arc: complete, attempt-addressable settle records on every exit path
  - `packages/core/src/gates/code-review.ts` — affected by rec-20260802-001 Finding-durability arc: complete, attempt-addressable settle records on every exit path
  - `packages/core/src/gates/security-audit.ts` — affected by rec-20260802-001 Finding-durability arc: complete, attempt-addressable settle records on every exit path
  - `packages/core/src/doctor/run.ts` — affected by rec-20260731-001 cadence doctor: release-currency check (local package.json vs published npm)
  - `.githooks/pre-push` — affected by rec-20260731-001 cadence doctor: release-currency check (local package.json vs published npm)
  - `docs/reference/commands.md` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/config-edit/fields.ts` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/verify/coverage.ts` — affected by rec-20260729-004 test-coverage gate's repo-wide AC-N token scan collides across phases, so any AC can be satisfied by an unrelated phase's tests
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260729-004 test-coverage gate's repo-wide AC-N token scan collides across phases, so any AC can be satisfied by an unrelated phase's tests

## What landed this session
- Same as `SESSION-2026-08-02-npm-scope-rename-shipped.md`: crash recovery (nothing lost), phase 250 (npm scope rename) built, reviewed, and merged as PR #362, worktree/branch cleanup, first handoff doc written and committed (`75848238`).
- No release-cut work happened this session — this doc exists purely to hand that off cleanly as the next unit of work.

## Carry-forward gotchas
- **This is the first release under the new scope.** Every one of `release-cut`'s independent-verification steps (`npm view`, `git ls-remote --tags`, `gh release view`) needs to check `@thomas-powers-jr/cadence-*`, not `@manehorizons/cadence-*` — muscle-memory from every prior release cut in this repo will reach for the old name. The old packages stay live/deprecated-not-deleted; don't touch them beyond the `npm deprecate` step phase 250's migration doc already describes.
- **`npm whoami` needs to resolve to `thomas-powers-jr`** before anything publish-shaped runs — phase 250's DRAFT already confirmed this was live as of this session, but re-verify, don't assume it's still true in a fresh session/environment.
- **Audit changesets for real** — don't trust the 4-changeset list in the TL;DR above, it's an unverified grep from this session, not `release-cut`'s actual inventory step. In particular check whether PR #360 (GitHub org rename, pure URL string updates) needed a changeset and didn't get one — if so that's a gap to fix, not silently skip, per this repo's "Deferred Changeset" failure mode.
- **`verification.coverageScheme` is `phase-qualified`** (`.cadence/config.json`) — irrelevant to release-cut itself, but if release-cut's own doc-sync verification pass touches any test file, the same `<draft-id>/AC-N` token rule applies. See the superseded doc for the full story (cost phase 250 an extra task, T15).
- **`gh pr merge --delete-branch`'s local post-merge checkout step fails here** (`'main' is already used by worktree`) — known, recurring. The remote merge always succeeds regardless; verify via `gh pr view` and delete the remote branch manually (`git push origin --delete <branch>`) if `--delete-branch` didn't.
- **Bash cwd does not reliably persist across tool calls in this environment** — always use an explicit `cd ... &&` prefix or `git -C <path>` rather than trusting a `cd` from a prior call stuck; this bit the prior session mid-work.
- `docs/handoffs/cadence-handoff-finding-durability-remainder.md` is still sitting untracked in the primary checkout (pre-dates this session, not touched).
- `.claude/worktrees/kernel-arc-docs-review` (`feat/kernel-assurance-v2`, long-lived arc branch) and `.claude/worktrees/phase249-refused-settle-post-gate` (branch already merged via #361, worktree not yet cleaned up) are both still present — the latter is safe to `git worktree remove` the same way phase 250's was.

## Next action
**Action:** Invoke the `release-cut` skill (`/release-cut` or equivalent) to cut and publish the release that includes phase 250's npm scope rename — inventory unreleased phases (246–250) and their changesets, lockstep version bump, full doc-sync verification pass (this repo's own doc-content tests plus the manual stale-version-reference grep), release PR, operator-triggered `Release` workflow, and independent npm/tag/GitHub-release verification against the **new** `@thomas-powers-jr` package names.
**Verify:** `npm view @thomas-powers-jr/cadence-core version` returns the new published version (currently 404s); `git ls-remote --tags` shows the new version tag; `gh release view <tag>` shows a real GitHub release.
**If it fails:** if `npm publish` fails on auth, that's an operator-side `npm login`/2FA issue for `thomas-powers-jr`'s account, not a CADENCE gate — surface it plainly, don't route around it. If the `Release` workflow itself reports red, follow this repo's known-flake protocol (`docs/release.md` / this repo's own "Release Re-Run" failure mode in CLAUDE.md) — verify reality independently (npm/tags/GH release) before ever re-running the workflow; a red run is often an npm-CDN propagation race, not a real failure.
