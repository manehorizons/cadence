---
cadence_handoff: 1
generated_at: 2026-08-08T00:20:15.688Z
label: phase-261-draft-approved-build-pending
loop_position: BUILD
active_phase: 261-historical-ac-coverage-audit-pre-phase-239
active_draft: 261-01
tier: standard
git_branch: worktree-261-historical-ac-coverage-audit
git_dirty: true
git_head: fb84baab
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-08 (phase-261-draft-approved-build-pending)

## TL;DR for the next session
- **Repo synced to v1.55.0** at session start (rebased local `main` onto `origin/main`, which had already shipped the v1.55.0 release, phase 260, and a required-checks change the replayed handoff hadn't seen).
- **Ledger hygiene done**: `rec-20260729-004` (coverage-gate cross-phase token collision) was already shipped as phase 239 but never marked closed — corrected to `shipped`, ref phase 239/PR #338. Filed `rec-20260807-005` for the still-open question of whether phase 239's `phase-qualified` scheme should become the *default* (it's currently opt-in; only this repo's own `.cadence/config.json` uses it).
- **Phase 261 (`261-historical-ac-coverage-audit-pre-phase-239`) DRAFT is APPROVED, loop is in BUILD, nothing implemented yet.** It answers `rec-20260729-006`: a read-only, best-effort audit classifying every pre-phase-239 historical AC-PASS record into `self-attested` / `self-attested-shared` / `not-found-in-declared-files` / `unreachable`, using only literal (non-glob) declared test-file paths — never a repo-wide token scan (proven noise-dominated: 88% of test files contain a bare `AC-N` as fixture data, not real coverage evidence).
- **The DRAFT went through two rounds of independent fresh-context review** (not just this session's own advisor) that found 6 real blocking issues across both rounds — an unsatisfiable AC invariant, an overclaiming bucket, a classification mechanism that needed unexported internals, a noise-dominated scan, an over-broad "unreachable" trigger, and a file-declaration index that collapsed to zero `self-attested` phases under repo-wide glob declarations. The final literal-path-only design was empirically verified to reproduce the original hand-derived split exactly: **112 phases high-confidence / 79 ambiguous / 64 no-evidence, out of 255**.
- **Next action is dispatching BUILD** for `261-01`'s 4 tasks (implementer + independent reviewer per task, per this repo's convention) — see `## Next action` below. This was deliberately NOT started this session; only "prep + decide + approve" was authorized.
- No blockers. Worktree is clean to resume from; this handoff commit itself is the only new local commit.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `worktree-261-historical-ac-coverage-audit` (dirty), 0 ahead / 0 behind origin
- HEAD `fb84baab`
- Recent commits:
```
fb84baab chore(release): v1.55.0 -- integrity release (#384)
c23e1092 chore: register security-success/codeql-success as required checks (rec-20260807-002) (#383)
38421916 fix: vitest 2->4 major upgrade, close deferred audit exceptions (phase 260) (#382)
a942ff64 chore(deps-dev): bump @changesets/cli from 2.31.0 to 2.31.1 (#225)
2b234a4d chore(deps-dev): bump tsx from 4.22.4 to 4.23.1 (#226)
1ead3247 chore(deps-dev): bump eslint from 10.4.1 to 10.8.0 (#325)
1f76e77d chore(deps): bump @anthropic-ai/sdk from 0.100.1 to 0.115.0 (#326)
16b22002 chore(deps): bump github/codeql-action from 4 to 4.37.3 (#336)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/RECOMMENDATIONS.md   |  35 +++++-----
 .cadence/intelligence/evidence.json        |  14 ++++
 .cadence/intelligence/recommendations.json | 107 +++++++++++++++++++----------
 3 files changed, 104 insertions(+), 52 deletions(-)
```
- Loop: BUILD · phase 261-historical-ac-coverage-audit-pre-phase-239 · tier standard

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260731-001 — cadence doctor: release-currency check (local package.json vs published npm) (candidate/ready-for-milestone)
  - rec-20260801-001 — docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8 (candidate/ready-for-cadence-spec)
  - rec-20260730-001 — phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode (candidate/needs-decision)
  - rec-20260730-002 — Coverage dedup: a qualified AC token outside an asserting block silently zeroes that AC's coverage (candidate/needs-decision)
  - rec-20260802-006 — Extend security audit CI coverage to website/ workspace (candidate/needs-decision)
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
  - dec-20260803-001 — Conduction stays operator-initiated: guard and gate set retained; mock-provider default is a separate ordinary config decision
  - dec-20260804-001 — Defer baseline profile change to v1.56 Phase P
  - dec-20260806-001 — 256-01's assurance:strong record is void -- empty-diff false pass, not a real certification result
- Files in play:
  - `packages/core/src/doctor/run.ts` — affected by rec-20260731-001 cadence doctor: release-currency check (local package.json vs published npm)
  - `.githooks/pre-push` — affected by rec-20260731-001 cadence doctor: release-currency check (local package.json vs published npm)
  - `docs/reference/commands.md` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/config-edit/fields.ts` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/verify/phase-replay.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode
  - `packages/core/src/services/verify.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode
  - `packages/types/src/summary.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode
  - `packages/core/src/verify/coverage.ts` — affected by rec-20260730-002 Coverage dedup: a qualified AC token outside an asserting block silently zeroes that AC's coverage
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260730-002 Coverage dedup: a qualified AC token outside an asserting block silently zeroes that AC's coverage
  - `docs/security/audit-exceptions.md` — affected by rec-20260802-006 Extend security audit CI coverage to website/ workspace
  - `.github/workflows/security.yml` — affected by rec-20260802-006 Extend security audit CI coverage to website/ workspace
  - `scripts/check-audit-exceptions.mjs` — affected by rec-20260802-006 Extend security audit CI coverage to website/ workspace
  - `website/pnpm-lock.yaml` — affected by rec-20260802-006 Extend security audit CI coverage to website/ workspace

## What landed this session
- Synced local `main` to `origin/main` (v1.55.0) via `git rebase --autostash`; rebuilt `cadence-types` + `cadence-core` locally.
- Corrected `rec-20260729-004`'s ledger status to `shipped` (ref phase 239/PR #338) via `cadence recommendation promote`.
- Added a corrective evidence note to `rec-20260729-006` (`ev-20260807-010`) documenting that its "needs the fix first" claim was stale.
- Filed `rec-20260807-005`: should `phase-qualified` become the default coverage scheme (currently opt-in only).
- Created worktree `.claude/worktrees/261-historical-ac-coverage-audit` (branch `worktree-261-historical-ac-coverage-audit`, based on `origin/main`).
- Ran `cadence onboard` to bootstrap `state.json` in the fresh worktree (gitignored, not copied by `git worktree add`).
- Authored, independently reviewed (2 rounds via fresh-context subagents), revised (3 total drafts), and approved `.cadence/phases/261-historical-ac-coverage-audit-pre-phase-239/261-01-DRAFT.md` — converted from `rec-20260729-006`.
- Ran `cadence draft approve 261-historical-ac-coverage-audit-pre-phase-239 01` — loop is now BUILD, no tasks started.

## Carry-forward gotchas
- **Read `261-01-DRAFT.md`'s Objective in full before touching T1/T2** — it documents two dead-end designs (repo-wide bare-token scan; glob-resolved file-declaration index) and *why* they were rejected, empirically, with real counts. An implementer re-deriving this from scratch will likely re-walk the same dead ends; the Objective exists precisely to prevent that.
- **The design deliberately needs zero new exports from `coverage.ts`** — `scanTestCoverage`, `anyTestFilesMatched`, `uncoveredAcs`, `weaklyLinkedAcs`, `skippedOnlyLinkedAcs` are all already public and sufficient. If an implementer finds themselves wanting `toMatcher`/`globToRegExp` (module-private) or a new export, that's a signal they've drifted back toward the rejected glob-resolution design — check the Boundaries section, which explicitly forbids it.
- **This repo runs `coverageScheme: "phase-qualified"`** (`.cadence/config.json`) — every new test T1/T2/T3 write must use `261-01/AC-N` qualifier prefixes in `it(...)` names, or phase 261's own settle coverage gate won't attest to it. This is spelled out in AC-6 and each task's `verify:` line — don't miss it.
- **`cadence` on PATH is the global npm install, not this worktree's build.** Use `node packages/core/bin/cadence.cjs` for every state-mutating command in this worktree (this session's own established convention, and a repo-wide known trap — see CLAUDE.md's "cadence on PATH is global, not worktree" precedent).
- **`.codex/`, `.flywheel/`, `.flywheel-DEGRADED` in the working tree are unrelated local tooling** (a separate personal daemon at `/home/thomas/projects/flywheel/` that hooks into `.claude/settings.json`) — not phase 261 artifacts, not something to investigate or clean up.
- **Do not commit yet** — nothing from this session has been committed. The DRAFT, ledger corrections, and this handoff doc are all uncommitted/untracked in the worktree. Per this repo's single-commit-settle convention, source + tests + docs + phase artifacts land together in one commit at SETTLE, not before.
- Three other pre-existing, unrelated worktrees remain on disk (`253-dependency-override-remediation`, `kernel-arc-docs-review`, `phase249-refused-settle-post-gate`) — untouched this session.

## Next action

**Action:** From this worktree, dispatch BUILD for `261-01` via the `phase-build` skill (worktree isolation, wave-based subagent dispatch, one implementer + one independent reviewer per task, main-thread re-verification of every completion claim, whole-branch review, single-commit settle, PR with changeset). Task order per the DRAFT: T1 (per-AC classifier) → T2 (corpus-wide index + walker/aggregate report, depends on T1) → T3 (CLI wiring, depends on T2) → T4 (run against real corpus, record findings, depends on T3).

**Verify:** `node packages/core/bin/cadence.cjs progress` should advance past `cadence build task T1 --status=DONE` as tasks complete; `pnpm --filter @thomas-powers-jr/cadence-core test` should stay green throughout; AC-4's invariant (`self-attested + self-attested-shared + not-found-in-declared-files + unreachable` == total `acResults` examined) should hold in T4's real findings artifact.

**If it fails:** if an implementer's task design drifts toward a repo-wide token scan or glob-resolving the file-declaration index, stop and re-read the DRAFT's Objective — both were deliberately rejected with evidence, not overlooked. If `cadence progress` reports anything other than BUILD/`261-01`, check `.cadence/state.json` directly before trusting this handoff's snapshot.
