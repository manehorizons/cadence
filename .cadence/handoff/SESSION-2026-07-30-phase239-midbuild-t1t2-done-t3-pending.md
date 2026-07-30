---
cadence_handoff: 1
generated_at: 2026-07-30T01:12:28.711Z
label: phase239-midbuild-t1t2-done-t3-pending
loop_position: BUILD
active_phase: 239-coverage-phase-scoping
active_draft: 239-01
tier: complex
git_branch: worktree-239-coverage-phase-scoping
git_dirty: true
git_head: 01bf09aa
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-30 (phase239-midbuild-t1t2-done-t3-pending)

## TL;DR for the next session
- Phase 239 fixes a **live, shipped defect**: the `test-coverage` gate matches AC↔test by the bare token `AC-N`, but AC ids restart at `AC-1` every phase, so across ~239 phases any past phase's `AC-3` satisfies every future phase's `AC-3`. Measured: `AC-1` is satisfied by **189 unrelated files** — a phase can pass the coverage gate having written zero tests. Present on `origin/main` and in published `@manehorizons/cadence-core@1.51.1`, dating to phase 14 (`54fdc55e`). The sibling half: `replayPhaseCoverage` scopes to DRAFT-declared files and under-declaration makes it report **false drift** (phase 233 replays 5/5 drifting against a SUMMARY recording all five pass/executed — the tests genuinely exist).
- Fix mechanism (settled, `dec-20260730-001`): a **phase-qualified prefix token** `239-01/AC-3`, behind `verification.coverageScheme: 'bare' | 'phase-qualified'`. Prefix form is load-bearing — `/\bAC-\d+\b/` lexes `AC-235-01-3` as `AC-235` (corrupt) but `235-01/AC-3` as `AC-3` (clean).
- **Nothing is committed.** All work is uncommitted in worktree `.claude/worktrees/239-coverage-phase-scoping`, branch `worktree-239-coverage-phase-scoping`, based on `origin/main` (`01bf09aa`), 0 ahead / 0 behind.
- Task state: **T1, T2 recorded DONE** (implemented, adversarially reviewed, one Critical fixed, full 24/24 pipeline verified). **T5 code-complete, review not yet run.** **T3 has its 319-line failing test suite written but `gates/coverage.ts` is untouched** — implementation unstarted. T4, T6–T10 not started.
- **The operator paused the build to reconsider the approach**, on the observation that it "keeps triggering more errors." Read the "Is the approach wrong?" gotcha below before resuming — that assessment is the actual first decision, ahead of any code.
- Single next action: make that continue-or-revise call, then implement T3 against the tests already written.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `worktree-239-coverage-phase-scoping` (dirty), 0 ahead / 0 behind origin
- HEAD `01bf09aa`
- Recent commits:
```
01bf09aa fix: run CI on feat/kernel-assurance-v2 PRs, not just main (#329)
127a06b0 chore: drop Node 20 support, raise engine floor to Node >=22 (phase 238) (#324)
df41e3ca chore(cadence): file phase 238 (drop Node 20 support) + backfill phase 231's rec id (#323)
b14ee304 chore(cadence): file phase 231 recommendation (roadmap-currency doctor check) (#322)
a77263ad docs(planning): backfill ROADMAP.md/MILESTONES.md for phases 118-230 + Phase 0 mapping (#321)
dc710cb4 ci: add opt-in workflow to sync main into a long-lived target branch (#320)
6e7e058d chore(cadence): file phase 0 kernel/assurance-review recommendations (scout-20260727-kernel-review-phase0) (#319)
f47f769a chore: sync session handoffs + intelligence ledger (2026-07-27) (#318)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/DECISIONS.md             |  6 +++
 .cadence/intelligence/decisions.json           |  8 ++++
 packages/core/src/cli/commands/init.ts         |  9 +++++
 packages/core/src/config-edit/fields.ts        | 11 ++++++
 packages/core/src/tutorial/fixtures.ts         |  6 +++
 packages/core/src/verify/coverage.ts           | 53 +++++++++++++++++++++++++-
 packages/core/tests/config-edit/fields.test.ts | 11 +++++-
 packages/types/src/config.ts                   | 39 +++++++++++++++++++
 8 files changed, 140 insertions(+), 3 deletions(-)
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

Nothing committed — all of the below is uncommitted working-tree state.

- **Diagnosis and design.** Confirmed the defect on `origin/main` and in published 1.51.1. An independent Fable design review found what neither the recommendation nor the first analysis had: **CADENCE already contains both competing designs and they contradict each other live.** `replayPhaseCoverage` has been draft-file-scoped since phase 204 (`30cd1950`) with a doc comment naming this exact collision, while the gate scans repo-wide — the gate under-refuses, the replay over-refuses. That killed file-ownership scoping as the fix and selected the qualified token.
- **`dec-20260730-001` recorded** — full rationale for choosing the qualified token over file-scoping and over report-only, including the declaration-gaming vector (listing an old test file in a task's `files:` satisfies a scoped scan without writing a test, since boundary-scan checks touched-vs-declared, not declared-but-untouched).
- **Phase 239 scaffolded and approved into BUILD**: `239-01-DRAFT.md`, tier `complex`, 10 ACs / 10 tasks, 23 declared files.
- **T1 (DONE)** — `verification.coverageScheme` added to the Zod schema and the object-level `.default({...})` literal; `defaultConfig` holds `'bare'`; `init.ts` writes `'phase-qualified'` in its existing verification overlay; `tutorial/fixtures.ts` pins `'bare'`. 5 schema tests + 3 end-to-end `loadConfig` tests.
- **T2 (DONE)** — `expectedQualifier` on `CoverageScanOptions` plus exported pure `tokenHasExpectedQualifier`, filtering in **both** the assertion and mention branches, placed before the per-file dedup add. `AC_TOKEN_RE` untouched. 10 tests.
- **T5 (code complete, unreviewed)** — `coverageScheme` registered in `config-edit/fields.ts` with 3 tests; `fields.test.ts`'s hard-coded field array updated 7 → 8.
- **T3 (partial)** — 319-line failing test suite at `packages/core/tests/gates/coverage-qualified.test.ts`. No implementation.
- **Two DRAFT "As built" amendments** recording boundary under-declarations (`tutorial/fixtures.ts` under T1, `fields.test.ts` under T5), and **AC-5 was rewritten** to bind the end-to-end `loadConfig` path instead of the Zod schema in isolation.

## Carry-forward gotchas

- **Is the approach wrong? Read this before resuming.** The operator paused on the sense that the fix keeps triggering errors. Honest tally of what actually went wrong: (1) repo-wide typecheck break in `tutorial/fixtures.ts`; (2) a Critical back-compat defect in where the default lived; (3) `fields.test.ts`'s hard-coded field count; (4) phantom test failures. Items 1 and 3 are the *same* class — adding a config field ripples to everything that enumerates or hand-builds the config — and both are mundane, mechanical, and already fixed. Item 4 was machine contention, not a defect at all. Only item 2 was a real design error, and it was in the *delivery* (which layer holds the default), not in the qualified-token idea. Nothing found so far invalidates the mechanism. **But the honest observation underneath is real**: every ripple came from *introducing the config knob*, not from the token scheme. If the next session wants to shrink blast radius, the knob is the thing to reconsider, not the token — and note T1/T5 already paid that cost, so removing it now would waste completed work rather than save any.
- **NEVER put the strict value in `defaultConfig`.** `loadConfig` (`config/loader.ts:20-28`) merges the user's `config.json` **over** `defaultConfig`, so a strict default is injected into every pre-existing config *before* Zod runs and the field-level `.default('bare')` never fires — silently flipping every consumer of published 1.51.1 to the strict scheme on upgrade. The phase-139 `coverageMode` precedent does **not** transfer, because `cadence init` writes `coverageMode` explicitly into every config.json so the user's own value wins the merge; no config on earth contains `coverageScheme`. The opt-in belongs in `init.ts` only. Comments in `config.ts` warn against "fixing" this back — leave them.
- **Verify back-compat empirically, not by reading the schema.** The command that proved the bug: replicate the loader merge (or call `loadConfig`) against a real `config.json` and print the resolved `coverageScheme`. Correct output is `bare` for pre-existing / absent / field-absent configs and `phase-qualified` only for an explicit value. AC-5 originally asserted the Zod layer, which was correct while the shipped behavior was broken — that is exactly how the defect slipped through.
- **Expect a third boundary under-declaration at T6.** Adding a config field rippled to `tutorial/fixtures.ts` (T1) and `fields.test.ts` (T5). T6 adds fields to `SUMMARY.json`, so look for hand-built SUMMARY literals and any test pinning an exact SUMMARY key set *before* dispatching, and declare them up front.
- **Fixture-token hygiene in tests.** Once T10 flips this repo to `phase-qualified`, any contiguous `239-01/AC-N` literal inside an asserting block credits coverage for that AC. Tests must build fixture tokens by concatenation (`q('AC-3')` / `f('AC-3')` helpers — see `tests/verify/coverage-scheme.test.ts`) so a file only ever contains contiguous literals for the ACs it genuinely covers. T2 and T3's test files already follow this.
- **Two Minor findings routed to T3, not yet implemented.** An empty-string qualifier is currently accepted and degenerates to "preceded by a bare `/`"; a newline-containing qualifier would diverge between the two scan branches. Both close by validating the resolved draft id at the gate before passing it — and per the "Quiet Fallback" rule, an invalid id must refuse or notice loudly, never silently scan unqualified.
- **T3's likeliest blocker.** `ctx.coverage()` is a memoized shared thunk built in `services/settle.ts`, outside T3's declared files. If the qualifier can't be threaded through it without editing `settle.ts`, that is a real boundary blocker — do not silently run a second unmemoized `scanTestCoverage` in the gate (double scan + divergence risk from the memoized one). Amend the DRAFT and declare the file instead.
- **Machine contention produces convincing false failures.** With several subagents running vitest concurrently, `pnpm turbo run lint typecheck test build --force` failed at ~11.9s with core#test exiting 1 and no test-results line. Clean, it passes 24/24 in ~3m. A sub-30-second "failure" of the full pipeline is contention, not a regression — re-run serially before investigating. One agent at a time is the operator's standing instruction as of this session.
- **Always use `node packages/core/bin/cadence.cjs`, never bare `cadence`.** The global v1.51.1 install shadows the branch build and both print the same `--version`, so the shadowing is invisible.
- **`--allow-auto-complex` was used at approve** and recorded as an anomaly; it will appear in `SUMMARY.gateBypasses`. `auto × complex` is soft-capped by DESIGN.md §4 M2, and `complex` is correct here (10 tasks / 23 files exceeds `standard`'s `maxTasks: 5, maxFiles: 8`). The alternative — switching the repo profile `auto` → `standard` — was deliberately declined as too broad a side effect for one outlier phase; it remains the operator's call.
- **`rec-20260729-004` is NOT in main's ledger.** The whole `rec-20260729-*` series was filed during the phase-235 session and lives only in unpushed commits on the kernel-assurance arc. Promotion at settle is therefore impossible from this branch — record the linkage in the commit message and promote once the arc merges to `main`. Do not re-file it as a new rec (ledger fragmentation) and do not blanket-copy `recommendations.json` across worktrees.
- **Phase 235 is still uncommitted and unpushed** in `.claude/worktrees/235-criteria-anchored-review-input` (2 commits ahead of `origin/feat/kernel-assurance-v2`, no PR). Unrelated to phase 239, but it is the arc that owns `rec-20260729-004`.
- **PR #332 (phase 240, doctor verification-readiness) was open against `main`** during this session from a concurrent session. Checked at dispatch time: zero file overlap with phase 239's 23 files. Re-check before landing — if it merged first, rebase and re-run the suite.
- **Local `main` in the primary checkout is 9 ahead / 1 behind `origin/main`** (unpushed chore/handoff/merge commits, pre-existing). This worktree branched from `origin/main`, not local `main`, deliberately — branching off local `main` would sweep those nine commits into this PR's squash.

## Next action

**Action:** First, make the continue-or-revise call with the operator — see the "Is the approach wrong?" gotcha above, which contains the honest tally. The recommendation there is to continue: the mechanism is sound, the failures were mechanical ripple plus one delivery-layer error plus one environmental artifact, and T1/T2/T5 already absorbed the config-knob cost that produced most of them.

If continuing, implement **T3** against the 319-line test suite already sitting at `packages/core/tests/gates/coverage-qualified.test.ts` (do not rewrite it — read it first and make it pass). T3 resolves `verification.coverageScheme` from config, passes the active draft id as `expectedQualifier` under `phase-qualified`, and extends each refusal to print the literal expected token (`239-01/AC-3`). It must also validate the resolved draft id — empty or malformed must refuse or notice loudly, never silently scan unqualified. Bare-scheme behavior must stay byte-for-byte unchanged, including sealed-gate handling, `--allow-missing-coverage`, `--force`, `coverageBypassed`, and the weak-link / skip-only paths. Watch for the `ctx.coverage()` memoized-thunk blocker described above.

Then continue strictly one task at a time (operator instruction — the machine saturates): T4 `--explain`, T6 SUMMARY fields, T7 replay-by-token, T8 indeterminate, T9 docs + changeset, T10 dogfood flip. One implementer, then one independent reviewer, then main-thread re-verification of the diff before `cadence done <T>`. Never record DONE from a subagent report.

**Verify:** `pnpm turbo run lint typecheck test build` green repo-wide, run serially with no other agents active (a sub-30-second failure is contention, not a regression). The phase's own proof is T10: after flipping this repo to `phase-qualified`, `settle run --auto` via `node packages/core/bin/cadence.cjs` must pass with all ten ACs covered under the new scheme. The headline evidence for AC-9 is that replaying phase 233 goes from 5 false drifts to 5 indeterminate / 0 drift.

**If it fails:** if T3 hits the `ctx.coverage()` boundary blocker, amend the DRAFT to declare `services/settle.ts` rather than double-scanning or editing out of boundary. If the settle refuses at T10, the gate is right until proven otherwise — fix the cause, do not reach for `--force` or `--allow-missing-coverage`; a refusal there means the implementation genuinely does not work end-to-end, which is exactly what T10 exists to detect.
