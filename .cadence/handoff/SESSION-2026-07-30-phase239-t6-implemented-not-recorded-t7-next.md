---
cadence_handoff: 1
generated_at: 2026-07-30T02:59:49.838Z
label: phase239-t6-implemented-not-recorded-t7-next
loop_position: BUILD
active_phase: 239-coverage-phase-scoping
active_draft: 239-01
tier: complex
git_branch: worktree-239-coverage-phase-scoping
git_dirty: true
git_head: 8e92d72d
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-30 (phase239-t6-implemented-not-recorded-t7-next)

## TL;DR for the next session
- Phase 239 (phase-qualified coverage tokens) is **6 of 10 tasks complete in substance, 5 recorded**. T1–T5 are recorded DONE in `PROGRESS.json`. **T6 is fully implemented, independently reviewed, and green — but deliberately NOT recorded DONE.** The operator asked for a handoff at that pause point rather than approving the record. Recording it is the first action, not a formality: verify the work is still green first, then `build task T6 --status=DONE`.
- **Nothing is committed.** Every line of phase 239 lives as uncommitted/untracked work in this worktree. The only commits on this branch are handoff stamps. `git diff --stat` above lists the 13 modified files but **not** the 7 untracked ones — the whole `.cadence/phases/239-coverage-phase-scoping/` directory (DRAFT + PROGRESS) and 6 new test files. Losing the working tree loses the phase.
- Remaining: **T7** replay-by-token, **T8** indeterminate, **T9** docs + changeset, **T10** dogfood flip. T10 is the phase's own proof and the riskiest — it flips this repo to `phase-qualified` and must settle green through the real gate.
- The build ran one task at a time (operator's standing instruction): one implementer, one independent adversarial reviewer per task, then main-thread re-verification before recording. That loop caught real defects on every single task — see gotchas.
- Full pipeline `pnpm turbo run lint typecheck test build --force` is **24/24 successful** as of this handoff (~37s wall, ~7m user CPU — that ratio is normal parallelism here, not a short-circuit).
- The DRAFT was amended **four times** this session. Every amendment is recorded inline as an `As built` note. Read them before touching T7–T10; they change what tasks own what files.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `worktree-239-coverage-phase-scoping` (dirty), 0 ahead / 0 behind origin
- HEAD `8e92d72d`
- Recent commits:
```
8e92d72d chore(cadence): stamp session handoff — phase239-midbuild-t1t2-done-t3-pending
01bf09aa fix: run CI on feat/kernel-assurance-v2 PRs, not just main (#329)
127a06b0 chore: drop Node 20 support, raise engine floor to Node >=22 (phase 238) (#324)
df41e3ca chore(cadence): file phase 238 (drop Node 20 support) + backfill phase 231's rec id (#323)
b14ee304 chore(cadence): file phase 231 recommendation (roadmap-currency doctor check) (#322)
a77263ad docs(planning): backfill ROADMAP.md/MILESTONES.md for phases 118-230 + Phase 0 mapping (#321)
dc710cb4 ci: add opt-in workflow to sync main into a long-lived target branch (#320)
6e7e058d chore(cadence): file phase 0 kernel/assurance-review recommendations (scout-20260727-kernel-review-phase0) (#319)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/DECISIONS.md             |   6 ++
 .cadence/intelligence/decisions.json           |   8 ++
 packages/core/src/cli/commands/init.ts         |   9 ++
 packages/core/src/config-edit/fields.ts        |  11 ++
 packages/core/src/gates/coverage.ts            | 136 +++++++++++++++++++++----
 packages/core/src/services/settle.ts           |  58 ++++++++++-
 packages/core/src/services/verify.ts           |  57 ++++++++++-
 packages/core/src/tutorial/fixtures.ts         |   6 ++
 packages/core/src/verify/coverage.ts           | 105 ++++++++++++++++++-
 packages/core/tests/cli/init.test.ts           |  17 ++++
 packages/core/tests/config-edit/fields.test.ts |  11 +-
 packages/types/src/config.ts                   |  39 +++++++
 packages/types/src/summary.ts                  |  14 +++
 13 files changed, 448 insertions(+), 29 deletions(-)
```
- Loop: BUILD · phase 239-coverage-phase-scoping · tier complex

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
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260726-005 coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode
  - `packages/core/src/gates/registry.ts` — affected by rec-20260726-005 coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode

## What landed this session
- **Session takeover.** This session began by resuming a worktree still held by a LIVE session (pid 1007475 on pts/6, confirmed via the worktree lock file's recorded pid+starttime matching `/proc`). Work was refused until the operator closed it cleanly; the lock released itself and no torn state was found.
- **T3 — gate wired to the scheme** (`gates/coverage.ts`, +121/−20). Resolves `verification.coverageScheme`; validates the active draft id with `/^[A-Za-z0-9._-]+$/` before any scan; refuses loudly on a missing/malformed id; `--force` passes with a loud notice while `coverageBypassed` stays false; every refusal names the literal expected token via an `expected()` helper. Bare scheme byte-for-byte unchanged. Recorded DONE.
- **T4 — `verify coverage --explain` made scheme-aware** (`verify/coverage.ts`, `services/verify.ts`). The qualifier is checked *before* the mode/span logic so a bare token reports a qualifier problem while a correctly-qualified token outside an asserting block still reports a span problem. `CoverageExplainResult` gained optional `expectedQualifier` (key omitted entirely under bare, so `--json` shape is unchanged). `runVerifyCoverage` resolves the qualifier via a best-effort `state.json` read and prints a loud `UNQUALIFIED` notice when it cannot. Recorded DONE.
- **T5 — `coverageScheme` exposed through `config edit`** (`config-edit/fields.ts`), count pin 7→8. Recorded DONE.
- **T5 also closed AC-5 clause (b)**, which was implemented in T1's `init.ts` overlay but had **zero** asserting coverage anywhere. Added an `init.test.ts` case spawning the real CLI and asserting the written `config.json`. Mutation-verified.
- **T6 — SUMMARY provenance + the evidence rewiring** (`types/src/summary.ts`, `services/settle.ts`, comment-only touch to `gates/coverage.ts`). Adds optional `coverageScheme`/`coverageMode` to SUMMARY (success AND refused paths), and makes the shared memoized `ctx.coverage()` thunk scheme-aware. 12 new tests. **Implemented + reviewed + green, NOT recorded.**
- Four DRAFT `As built` amendments: T3 (double-scan deviation), T6 (scope extended to the evidence rewiring), T4 (declares `verify/coverage.ts`), T5 (declares `tests/cli/init.test.ts`).

## Carry-forward gotchas

- **T6 is not recorded. Do not record it from this document.** Re-verify first — the repo's own rule is that a completion claim in a doc is not proof. Run the full pipeline, confirm 24/24, then record. The notes to use are in the "Next action" block.
- **NEVER give SUMMARY's new fields a Zod `.default(...)`.** `cadence summary verify` Zod-parses SUMMARY.json and then content-hashes the **parsed** object (`services/summary-hash.ts` ← `services/summary-verify.ts` ← `cli/commands/summary.ts`). A default would be injected into every historical SUMMARY at parse time, change its digest, and report **every past settle as tampered**. `coverageScheme`/`coverageMode` are `.optional()` with no default, and `tests/summary-coverage-scheme.test.ts` fails the moment someone "fixes" this. Comments in `types/src/summary.ts` warn against it — leave them.
- **The scheme-aware thunk has blast radius beyond evidence.** `ctx.coverage()` also feeds `gates/deep-verify.ts` and `gates/interactive.ts`. Under `phase-qualified`, `MockVerifier` auto-fails any AC with zero linked tests, so an AC whose only reference is a cross-phase bare token now **fails deep-verify and refuses the settle**. That is correct and is now tested — but expect it to bite during T10's dogfood flip if any AC lacks a genuinely qualified reference.
- **T10 will be stricter than it looks.** After the flip, an AC needs a `239-01/AC-N` token inside an asserting block. Bare `AC-N` mentions in this repo's ~239 phases of history stop counting. If the settle refuses at T10, the gate is right until proven otherwise — fix the cause, do not reach for `--force` or `--allow-missing-coverage`.
- **Fixture-token hygiene is mandatory in new test files.** Once this repo runs `phase-qualified`, any contiguous `239-01/AC-N` literal inside an asserting block credits coverage for that AC. Build fixture tokens by concatenation (`q('AC-3')` / `'01-01' + '/' + 'AC-1'`) so a file only ever contains contiguous literals for ACs it genuinely covers. All five 239 test files already follow this.
- **Two scans under the qualified scheme, by design.** `gates/coverage.ts` runs its own qualified scan while the shared thunk runs another. This is an efficiency wart, not a correctness one — both use identical options and cannot disagree. Collapsing it would mean rewriting T3's test file, which specifies a gate-local scan. Recorded in the gate's docstring.
- **Always use `node packages/core/bin/cadence.cjs`, never bare `cadence`.** The global v1.51.1 install shadows the branch build and both print the same `--version`, so the shadowing is invisible.
- **CLI tests spawn `packages/core/dist/cli/index.js`.** Rebuild before running them or you test stale code. `pnpm turbo run build` is enough.
- **Run subset tests with `--coverage.enabled=false`**, otherwise global coverage thresholds fail the run spuriously and look like real failures.
- **A concurrent session is active in a sibling worktree** (`.claude/worktrees/241-anchor-ladder-reachability`). Do not assume shared-tree git operations on `main` are uncontested, and expect occasional vitest contention. A sub-30-second full-pipeline *failure* is contention, not a regression — re-run serially before investigating.
- **`origin/main` moved during this session.** Phase 240 landed as `84dc9bd9` (PR #332, doctor verification-readiness). This branch is 1 behind it. Zero file overlap with phase 239's set; the only future contact point is `docs/reference/commands.md` at T9. Rebase before landing, not before T7.
- **`rec-20260729-004` is NOT in main's ledger** — the `rec-20260729-*` series lives only in unpushed commits on the kernel-assurance arc. Promotion at settle is impossible from this branch; record the linkage in the commit message and promote once the arc merges. Do not re-file it and do not blanket-copy `recommendations.json`.
- **`--allow-auto-complex` was used at approve** and will appear in `SUMMARY.gateBypasses`. Expected, already recorded as an anomaly.
- No stash was taken this session; the working tree is left dirty and intact.

## Next action

**Action:** Re-verify T6 independently, then record it, then start T7.

1. Confirm you are in this worktree (`pwd` must end `.claude/worktrees/239-coverage-phase-scoping`) and on `worktree-239-coverage-phase-scoping`.
2. `pnpm turbo run lint typecheck test build --force` — expect `24 successful, 24 total`.
3. Only if green, record T6:
   `node packages/core/bin/cadence.cjs build task T6 --status=DONE --notes "SUMMARY records coverageScheme/coverageMode as additive optional fields (no Zod default — a default would break every historical SUMMARY's content hash), on both the success and refused paths. Made the shared memoized ctx.coverage() thunk scheme-aware, which fixes evidence derivation, deep-verify and interactive in one move; ac-evidence.ts needed no change because scanTestCoverage keeps bare AC-N map keys. Independent review PASS_WITH_CONCERNS; closed the Major by adding deep-verify qualified/bare tests, plus two comment fixes."`
4. Then T7 (`### T7: Replay a qualified-scheme phase repo-wide by token`, `done: AC-8`, `depends: T2`). Read its DRAFT entry first. Per the handoff that started this session, the headline evidence for AC-8/AC-9 is that replaying phase 233 goes from **5 false drifts to 5 indeterminate / 0 drift** — `replayPhaseCoverage` currently scopes to DRAFT-declared files, and under-declaration makes it report false drift.
5. Keep the loop: one task at a time, one implementer, one independent adversarial reviewer, main-thread re-verification of the diff and suite, then record. Never record DONE from a subagent's report.

**Verify:** `pnpm turbo run lint typecheck test build --force` green repo-wide, run with no other agents active. `PROGRESS.json` shows T1–T6 DONE after step 3.

**If it fails:** if the pipeline is red, do NOT record T6 — read the failure. A sub-30-second failure is machine contention (a sibling session is active in worktree 241); re-run serially first. If a genuine regression appears in `gates/`, `verify/`, `config/`, `config-edit/`, or `summary-coverage-scheme`, it is from this session's uncommitted work and the diff is the place to look. If T7 hits a boundary blocker, amend the DRAFT with an `As built` note and declare the file — that is the established pattern here, used four times already this session — rather than silently reaching outside the declared set.
