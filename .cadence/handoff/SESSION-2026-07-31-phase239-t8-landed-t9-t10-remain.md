---
cadence_handoff: 1
generated_at: 2026-07-31T00:38:08.761Z
label: phase239-t8-landed-t9-t10-remain
loop_position: BUILD
active_phase: 239-coverage-phase-scoping
active_draft: 239-01
tier: complex
git_branch: worktree-239-coverage-phase-scoping
git_dirty: true
git_head: 684a4033
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-31 (phase239-t8-landed-t9-t10-remain)

## TL;DR for the next session

- Phase 239 is **8 of 10 tasks recorded DONE** (T1–T8). **T7 and T8 both landed this session**, each after independent adversarial review and multiple fix rounds. Remaining: **T9** docs + changeset, **T10** the dogfood flip.
- **Next action is T9.** It has grown well beyond its original scope — two `As built` amendments have routed **six** separate `docs/reference/commands.md` drifts into it (three caused by T7, three by T8), and no doc-content test covers that prose, so the suite stays green with all six present. Read T9's entry and both amendments before starting.
- **The whole phase is committed through T7** (`684a4033`). T8's work is uncommitted in the working tree. `git status --short`, never `git diff` alone — the pre-filled `diff --stat` below omits untracked files, and that omission has caused a false alarm in this phase already.
- Full pipeline is **24/24 successful, `Tests 3373 passed (3373)`**, verified independently by the main thread (not just by subagents) after every recorded task.
- **AC-10 has zero qualifying coverage** and `.cadence/config.json` still has **no `coverageScheme` key**. T10 must both write real AC-10 tests and actually flip the config — and note that **T10 passes green either way**, so greenness is not evidence the flip happened. This is the single most likely way this phase ships hollow.
- Two recommendations were filed this session (`rec-20260730-001`, `rec-20260730-002`) and neither is promoted. A **third** pattern surfaced late and is unfiled — see gotcha B.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `worktree-239-coverage-phase-scoping` (dirty), 0 ahead / 0 behind origin
- HEAD `684a4033`
- Recent commits:
```
684a4033 WIP: phase 239 T7 DONE — qualified replay by token, Critical closed at fn level
35a71303 WIP: handoff — phase 239 T7 implemented, review FAIL (globs fallback)
638bf793 chore(cadence): stamp session handoff — phase239-t6-implemented-not-recorded-t7-next
08dab471 WIP: handoff — phase 239 coverage phase-scoping, T1-T6
8e92d72d chore(cadence): stamp session handoff — phase239-midbuild-t1t2-done-t3-pending
01bf09aa fix: run CI on feat/kernel-assurance-v2 PRs, not just main (#329)
127a06b0 chore: drop Node 20 support, raise engine floor to Node >=22 (phase 238) (#324)
df41e3ca chore(cadence): file phase 238 (drop Node 20 support) + backfill phase 231's rec id (#323)
```
- Uncommitted (diff --stat):
```
.../239-coverage-phase-scoping/239-01-DRAFT.md     |  23 +++-
 .../239-01-PROGRESS.json                           |  15 +++
 packages/core/src/services/verify.ts               |  44 ++++++-
 packages/core/src/verify/phase-replay.ts           | 130 ++++++++++++++++-----
 packages/core/tests/cli/verify-phase.test.ts       |   6 +
 packages/core/tests/mcp/mcp-server.test.ts         |   6 +
 .../tests/verify/phase-replay-qualified.test.ts    |   9 +-
 packages/core/tests/verify/phase-replay.test.ts    |  10 ++
```
- **CORRECTION — the block above is incomplete.** `diff --stat` never lists untracked
  files. One of T8's three core files is untracked and therefore invisible above:
```
?? packages/core/tests/verify/phase-replay-indeterminate.test.ts   (T8's new test file)
```
  Always verify with `git status --short`. An earlier handoff in this phase carried the
  same omission alongside a stale "Nothing is committed" line, and cost a resuming
  session real time believing the phase had been lost.
 8 files changed, 204 insertions(+), 39 deletions(-)
```
- Loop: BUILD · phase 239-coverage-phase-scoping · tier complex

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260727-001 — Assurance manifest: persist verifier family/model for code-review + security-audit (candidate/ready-for-cadence-spec)
  - rec-20260727-002 — SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome (candidate/ready-for-cadence-spec)
  - rec-20260727-012 — cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift) (candidate/ready-for-cadence-spec)
  - rec-20260727-003 — Kernel/verifier contract + lint rule against internal imports (candidate/ready-for-cadence-spec)
  - rec-20260730-001 — phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode (candidate/needs-decision)
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
  - `packages/core/src/services/verify.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode

## What landed this session

- **T6 recorded DONE** — re-verified independently first (pipeline 24/24 + read the diff to confirm the SUMMARY fields are `.optional()` with no Zod `.default()`), per the prior handoff's instruction not to record it from that document.
- **T7 recorded DONE** — qualified-scheme replay matches by token instead of DRAFT file-scoping; `no-scoped-files` never fires under `phase-qualified`.
- **T8 recorded DONE** — `indeterminate` replay state for pre-scheme SUMMARYs (AC-9), plus the `testGlobs` wiring at the `services/verify.ts` call site that finally closes T7's Critical end-to-end (AC-8).
- **`rec-20260730-001`** filed — `phase-replay` ignores `SUMMARY.coverageMode` provenance and re-derives coverage under the live config's mode.
- **`rec-20260730-002`** filed — coverage dedup is first-occurrence-wins, so a qualified AC token outside an asserting block silently zeroes that AC's coverage.
- **DRAFT amended ten times**, all inline `As built` notes, `coherence: OK` after each: AC-8's wording, T7's files (×3), T8's action line / `files:` (×2) / the phase-233 figure, T9's files (×2).
- **Machine-local fix (not repo content):** `/home/thomas/.local/bin/cadence` was pinned to Node 20.20.2 and had been hard-failing since phase 238 raised the floor to `>=22`. Repointed to `v22.22.3`.

### Defects caught that a green pipeline could not see

Recorded because the pattern matters more than the individual bugs — every one of these was found by measurement or adversarial review, never by the suite:

1. **AC-8 had zero qualifying coverage** while 24/24 passed. The new test file's own fixture-hygiene *comment* contained a contiguous `239-01/AC-8` literal, took the per-file dedup slot, and was recorded `qualifying: false` — silently masking five good `it()` titles below it. → `rec-20260730-002`.
2. **T7's "repo-wide" scan was not repo-wide** (review 1, FAIL). It passed no `globs` and fell back to hardcoded `DEFAULT_GLOBS`, ignoring `verification.testGlobs`. Measured end-to-end: `verify coverage --explain` SATISFIED/exit 0 while `verify phase` reported drift/exit 1, same repo, same commit.
3. **AC-8's own wording specified a defect** (review 2). A literal whole-repo scan under `mention` mode credits AC-8 from this phase's own `RECOMMENDATIONS.md`, `evidence.json` and handoff doc — planning prose satisfying its own coverage replay. The AC was amended; the code was not loosened.
4. **T8's `indeterminate` broke 4 tests and hollowed out 7 more into vacuous passes.** The 4 reds were cheap; the 7 vacuous ones were invisible. One survived two separate sweeps and was only caught by the reviewer's independent replication.
5. **The indeterminate headline said "no drift"** for a phase whose coverage was never verified — across 245 SUMMARYs lacking the field, 21 previously-drifting phases would have printed clean, and the degradation notice never reached stderr (the `init --ci` workflow is gated on exit code alone). Both fixed.

### A review finding that was itself wrong

T8's reviewer filed a Medium claiming phase 233's "5 false drifts" figure was false and the real number was 1. **Rejected on measurement.** `feat/kernel-assurance-v2` *is* reachable (an earlier claim that it wasn't had been propagated into this DRAFT); extracting it with `git archive` and replaying the real artifacts gives `mention=1, assertion=5`. `defaultConfig.verification.coverageMode` is `'assertion'` and `services/verify.ts` passes the config's mode, so the shipped CLI reports **5**. The reviewer had measured via direct function call, inheriting `PhaseReplayConfig`'s function-level `'mention'` default — a mode the CLI never uses. Accepting it would have corrected three source comments and the DRAFT into being wrong.

## Carry-forward gotchas

### A. T10 can ship hollow while passing — read this before T9/T10

- **`.cadence/config.json` has no `coverageScheme` key**, so this repo still resolves to `bare`. If T10 doesn't actually write the flip, the phase dogfoods its own gate under the *old* scheme and proves nothing.
- **T10 passes green either way.** Under `bare` it passes via cross-phase token collision; under `phase-qualified` it passes because AC-1..AC-9 all have qualifying refs. **Greenness is not evidence the flip happened** — verify the config value explicitly.
- **AC-10 currently has `refs=0 qualifying=0`.** It is the only AC with no coverage at all. T9/T10 must produce real asserting tests carrying `239-01/AC-10`, not just docs.
- After the flip, bare `AC-N` mentions across ~239 phases of history stop counting. If the settle refuses at T10, **the gate is right until proven otherwise** — do not reach for `--force` or `--allow-missing-coverage`.

### B. A third unfiled recommendation — operator decision needed

The `mention`/`assertion` default split has now produced a **wrong conclusion three separate times in this one phase**: the T8 implementer's fixture (an empty `it()` body didn't qualify because `defaultConfig` is `assertion` while `PhaseReplayConfig` defaults to `mention`), `rec-20260730-001`, and T8 review's rejected F3. The split is real and deliberate (`types/src/config.ts:207` Zod default `'mention'`, `:550` `defaultConfig` `'assertion'` — the same lenient-Zod/strict-defaultConfig pattern T1 navigated for `coverageScheme`), but it is a repeat trap for both humans and agents.

**Not filed** — three occurrences in one phase looks like a pattern worth a rec, but the operator was asked and had not decided when the session closed. Do not file it silently; raise it.

### C. Fixture-token hygiene is subtler than "put it in an asserting block"

The scanner dedups per `AC-N@file` **first-occurrence-wins**. A *correctly-qualified* token in a comment, `describe()` title, or any non-asserting position earlier in the file takes the slot, records `qualifying: false`, and silently zeroes every good occurrence below it. This has bitten twice in this phase (T7's implementer, then T8's). Build fixture tokens by interpolation/concatenation (`${id}/AC-1`), and make sure a file's **first** occurrence of each AC it genuinely covers sits inside an asserting block. Verify with the probe in "Next action", never by eye.

### D. T9 is much larger than its DRAFT line suggests

Six `docs/reference/commands.md` drifts are routed into it across two `As built` amendments — three from T7 (the file-scoping prose at `:2309-2311`, the no-scoped-files refusal at `:2315-2316`, the exit-code table at `:2338-2341`) and three from T8 (the JSON result shape at `:2325-2328` now also carries `indeterminate`/`note`; exit `0` now also means "not verifiable"; `no-scoped-files` can no longer fire for a pre-scheme SUMMARY). **No doc-content test covers this prose** — the reviewer grepped `packages/core/tests/docs/*.test.ts` and found zero hits for `verify phase` or `driftCount` — so the suite stays green with all six present. T9's own new doc test should extend to cover it rather than assuming the existing surface does.

### E. Environment and tooling

- **Node 22 is required.** `source ~/.nvm/nvm.sh && nvm use 22` before anything. The default shell node here is 20.20.2 and fails the engine floor.
- **Always `node packages/core/bin/cadence.cjs`, never bare `cadence`.** The global wrapper resolves to the **primary checkout's** binary, not this worktree's, and both print the same `--version`. (The wrapper's Node-20 pin was fixed this session, so it now runs — which makes the shadowing *easier* to hit, not harder.)
- **Running the CLI from a scratch directory resets the shell cwd.** After any `cd` outside the worktree, re-anchor with `cd` + `pwd -P` before running a state-mutating command. This bit mid-session.
- **Rebuild before any `dist/`-reading probe or CLI test** — they spawn/import `packages/core/dist/`.
- **Subset tests need `--coverage.enabled=false`** or global thresholds fail spuriously and look like real failures.

### F. Still-current from earlier handoffs

- **NEVER give SUMMARY's new fields a Zod `.default(...)`.** `cadence summary verify` Zod-parses then content-hashes the **parsed** object; a default would be injected into every historical SUMMARY, change its digest, and report every past settle as tampered. `tests/summary-coverage-scheme.test.ts` fails if someone "fixes" this.
- **`rec-20260729-004` is NOT in main's ledger** — the `rec-20260729-*` series lives only in unpushed commits on the kernel-assurance arc. Promotion at settle is impossible from this branch; record linkage in the commit message and promote once the arc merges. Do not re-file and do not blanket-copy `recommendations.json`.
- **`--allow-auto-complex` was used at approve** and will appear in `SUMMARY.gateBypasses`. Expected, already recorded as an anomaly.
- **`origin/main` moved** — phase 240 landed as `84dc9bd9` (PR #332). Zero file overlap with 239; the only contact point is `docs/reference/commands.md` at T9, which gotcha D now makes a live concern. Rebase before landing.
- **Multiple concurrent sessions ran in this repo tonight.** Two were live in the primary checkout at one point. Check `ps` for other sessions holding this worktree before resuming; vitest contention produces sub-30-second failures that look like real regressions.

- No stash was taken this session; the working tree is left dirty and intact.

## Next action

**Action:** Start **T9** (docs + changeset, `done: AC-10`, `depends: T3, T8`). Read T9's DRAFT entry and **both** of its `As built` amendments first — six `commands.md` drifts are routed into it that its original action line does not mention (gotcha D).

1. Confirm you are in this worktree (`pwd -P` ends `.claude/worktrees/239-coverage-phase-scoping`) on branch `worktree-239-coverage-phase-scoping`, and that no other session holds it (`ps`).
2. Confirm the tree with **`git status --short`** (not `git diff`). Expect T8's work uncommitted, including the untracked `packages/core/tests/verify/phase-replay-indeterminate.test.ts`.
3. `source ~/.nvm/nvm.sh && nvm use 22` — required.
4. Do T9: update `docs/concepts.md`'s `test-coverage` gate row and `docs/reference/config.md`'s field table for `coverageScheme`, fix all six `commands.md` drifts, add `packages/core/tests/docs/coverage-scheme-docs.test.ts` pinning the pairing (**and extend it to cover the `verify phase` prose — nothing covers it today**), and write `.changeset/coverage-phase-scoping.md` covering core + types. **The feature PR carries its own changeset; do not defer it to the release PR.**
5. Then **T10** — and treat gotcha A as the acceptance bar, not a footnote: write real asserting tests carrying `239-01/AC-10`, flip `.cadence/config.json` to `phase-qualified`, and verify the flip explicitly rather than inferring it from a green run.
6. Keep the loop: one task at a time, one implementer, one **independent adversarial** reviewer, main-thread re-verification of the diff and suite, then record. **Never record DONE from a subagent's report** — every task this session produced at least one defect the suite could not see.

**Verify:**
```
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
pnpm turbo run lint typecheck test build --force      # expect 24 successful, 24 total
```
plus the coverage probe (rebuild `dist/` first if `src/` changed):
```
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node -e "
(async () => {
  const m = await import('./packages/core/dist/verify/coverage.js');
  const q = await m.scanTestCoverage(process.cwd(), { mode: 'assertion', expectedQualifier: '239-01' });
  for (const id of ['AC-1','AC-2','AC-3','AC-4','AC-5','AC-6','AC-7','AC-8','AC-9','AC-10']) {
    const refs = q.get(id) || [];
    console.log(id, 'refs=' + refs.length, 'qualifying=' + refs.filter(r=>r.qualifying!==false).length);
  }
})();"
```
AC-1..AC-9 are each `qualifying >= 1` today. **AC-10 must reach `qualifying >= 1` before T10 can honestly settle.**

**If it fails:** a sub-30-second pipeline failure is machine contention from a sibling session — re-run serially before investigating. If the settle refuses at T10 under the qualified scheme, the gate is right until proven otherwise: find the AC that genuinely lacks a qualified asserting reference and write the test. Do not reach for `--force`, `--allow-missing-coverage`, or `--allow-auto-complex` to get green. If a task needs a file outside its declared `files:`, amend the DRAFT with an inline `As built` note and declare it — that pattern has been used ten times in this phase and is the established norm here, not an exception.
