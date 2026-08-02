---
cadence_handoff: 1
generated_at: 2026-08-02T22:19:52.377Z
label: npm-scope-rename-shipped
loop_position: IDLE
active_phase: 246-finding-identity-message-drift
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 8b42ff4f
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-02 (npm-scope-rename-shipped)

## TL;DR for the next session
- Session opened recovering from a system crash mid-work. Verified nothing was lost: `main` was already fully synced with origin (phase 249's PR #361 merged cleanly after a pull), and a large uncommitted npm-scope-rename phase sitting in `.claude/worktrees/phase-npm-scope-rename` was intact and safely checkpointed.
- Built out and shipped **Phase 250** (rename npm scope `@manehorizons` → `@thomas-powers-jr`) end-to-end: 16 tasks (T1–T16, 6 as-built amendments found mid-build), each independently reviewed and re-verified in the main thread; 3 whole-branch review rounds (round 1 and round 2 each found one real message-honesty bug, both fixed; round 3 came back clean); settled with `--allow-auto-complex` (heavy supervision, honestly recorded); PR #362 merged as `8b42ff4f` after two post-PR CI fixups (a broken docs-site link, confirmed not caused by the phase's own work being CodeQL's separate, pre-existing, non-blocking false "new alert" flag).
- Loop is IDLE. Nothing blocking. Worktree removed, remote branch deleted, local `main` synced.
- **npm publish is genuinely not done.** `npm install @thomas-powers-jr/cadence-core` does not work yet — publishing the 5 renamed packages and deprecating the 5 old ones are explicit, operator-run steps requiring your authenticated npm session, deliberately left undone by phase 250's own Boundaries.
- No source Praxis recommendation closes with this phase (it was triggered directly by the GitHub org rename, not `cadence recommend`) — nothing to promote to `shipped`.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `8b42ff4f`
- Recent commits:
```
8b42ff4f feat: rename npm scope to @thomas-powers-jr (phase 250) (#362)
8f58bde1 feat: post-gate refusal SUMMARYs + finding-durability ledger closeout (phase 249) (rec-20260712-006) (#361)
c96c3017 chore: update GitHub org references for thomas-powers-jr rename (#360)
9d561fbd chore(cadence): session handoff + finding-durability ledger hygiene sweep (#359)
fcd76ad8 feat: honest bypassed-verifier provenance for code-review/security-audit (phase 248) (rec-20260801-004) (#358)
afcb90a9 feat: preserve refused-settle findings across attempts (phase 247) (#357)
98b6a151 chore(cadence): defer finding-identity message-drift dedup, decision-only (phase 246) (#356)
16e6c8b0 chore(release): v1.53.0 -- kernel-assurance-v2 arc merged (phases 232-236, 241-245) (#355)
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
- Crash recovery: confirmed via ledger grep + PR history that no local work was lost; resolved one fast-forward pull conflict (an identical untracked file already landed via the other PR).
- Phase 250 (npm scope rename), all merged in PR #362 (`8b42ff4f`):
  - T2–T4, T6, T7, T9–T11: package identity, import specifiers, hook commands, test suite, docs, comments renamed across the whole monorepo.
  - T5: `cadence doctor` detects a managed hook entry whose command still points at the old scope (previously marker-presence-only).
  - T8, T12: `docs/migration-npm-scope.md` migration guide, linked from all 3 relevant READMEs.
  - T1, T13: final stray-reference sweep test (`packages/core/tests/docs/npm-scope-sweep.test.ts`) + fixed 3 real leftovers it caught in `.github/` files.
  - T14, T16 (whole-branch review findings): fixed the same message-honesty bug in two places — `cadence doctor` and `cadence config explain` both used to report a stale-scope hook as "not found" (factually wrong, an entry does exist). Both now say "stale, needs reinstalling," confirmed live against real scratch-repo fixtures, not just unit tests.
  - T15: retagged 6 ACs' existing real test assertions to this repo's phase-qualified coverage token format (`250-01/AC-N`, not bare `AC-N`); wrote 2 new minimal honest assertions for the 2 ACs that had zero prior coverage (package-identity, migration-doc content) rather than reaching for a coverage bypass.
  - Post-PR-open CI fixup: registered `docs/migration-npm-scope.md` in `website/scripts/routes.mjs` (the docs site's link validator failed the build otherwise) — pushed as a second commit on the same branch, verified with a real local `astro build`.
- PR #362 squash-merged, worktree removed, remote branch deleted, local `main` fast-forwarded to `8b42ff4f`.

## Carry-forward gotchas
- **npm publish/deprecate are still outstanding, deliberately.** Phase 250's Boundaries explicitly forbid `npm publish`/`npm deprecate` — that's the operator's next real-world step, following `docs/migration-npm-scope.md`'s exact sequence. Don't build a phase to automate this without the operator asking; it needs a live authenticated npm session.
- **This repo's `verification.coverageScheme` is `phase-qualified`** (`.cadence/config.json`) — any new AC-carrying test must use `<draft-id>/AC-N` (e.g. `250-01/AC-5`), not bare `AC-N`, or `cadence verify coverage --explain` silently reports NOT SATISFIED even when a real assertion exists. This bit phase 250 hard (discovered only at the whole-branch-review stage, cost a whole extra task T15) — check this proactively on the *next* phase, don't rediscover it the same way. `rec-20260729-004` in this session's CADENCE-context block ("test-coverage gate's repo-wide AC-N token scan collides across phases") is the still-open candidate about hardening this; `dec-20260730-001` already settled the qualified-token design, phase 250 just had to actually use it.
- **`.changeset/*.md` files are now allowlisted in `npm-scope-sweep.test.ts`** (`isPendingChangeset`, added this session) as intentionally-exempt pending release-note prose — same rationale as the pre-existing `CHANGELOG.md` exemption. If a future sweep-style test needs the same treatment, this is precedent, not a one-off hack.
- **`rec-20260731-001`** (candidate, "cadence doctor: release-currency check") has a stale implementation sketch in its own summary text — it still says `npm view @manehorizons/cadence-core version`, which needs the new scope if/when this rec is picked up.
- **Bash cwd does not reliably persist across tool calls in this environment** — hit this twice this session (once nearly staged a commit into the wrong checkout). Always use an explicit `cd ... &&` prefix or `git -C <path>` rather than trusting a `cd` from a prior call stuck.
- `gh pr merge --delete-branch`'s local post-merge checkout step still fails here (`'main' is already used by worktree`) — known, recurring; the remote merge always succeeds regardless, verify via `gh pr view` and delete the remote branch manually if needed (`git push origin --delete <branch>`).
- `docs/handoffs/cadence-handoff-finding-durability-remainder.md` is still sitting untracked in the primary checkout (pre-dates this session, not touched) — untouched per "don't delete/move without being asked."
- `.claude/worktrees/kernel-arc-docs-review` (`feat/kernel-assurance-v2`) and `.claude/worktrees/phase249-refused-settle-post-gate` (now-merged `feat/post-gate-refusal-summaries-phase-249`) are both still present — the latter's branch is already merged (via #361) and its worktree is now safe to remove the same way phase 250's was, if not already done by another session.

## Next action
**Action:** No forced next step — loop is IDLE, nothing blocking. Two live options, ask the operator which (don't assume): (a) run the actual npm publish/deprecate sequence for phase 250's rename, following `docs/migration-npm-scope.md` exactly (`npm publish` for the 5 renamed packages, then `npm deprecate` the 5 old ones with a pointer to the new scope) — needs the operator's live npm session; or (b) start the next unit of work via `cadence recommend` / `cadence progress` (`cadence progress` currently suggests `cadence draft new --title "..."` for phase 251, deriving from the recommendation backlog — see the CADENCE-context block above for live candidates).
**Verify:** for (a), `npm view @thomas-powers-jr/cadence-core version` returns the published version (currently 404s); for (b), `cadence status` shows an active SPEC/DRAFT for the chosen phase.
**If it fails:** for (a), if `npm publish` fails on auth, that's an operator-side npm-login issue, not a CADENCE gate — don't route around it with a workaround. For (b), if the picked recommendation turns out under-scoped, follow the same SPEC-first discipline this session used before committing to a DRAFT.
