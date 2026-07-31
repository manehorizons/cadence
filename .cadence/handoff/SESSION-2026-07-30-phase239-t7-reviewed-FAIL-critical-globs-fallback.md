---
cadence_handoff: 1
generated_at: 2026-07-30T03:39:27.173Z
label: phase239-t7-reviewed-FAIL-critical-globs-fallback
loop_position: BUILD
active_phase: 239-coverage-phase-scoping
active_draft: 239-01
tier: complex
git_branch: worktree-239-coverage-phase-scoping
git_dirty: true
git_head: 638bf793
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-30 (phase239-t7-reviewed-FAIL-critical-globs-fallback)

## TL;DR for the next session

- Phase 239 is **7 of 10 tasks complete in substance, 6 recorded**. T1–T6 are recorded DONE in `PROGRESS.json` (**T6 was recorded this session**, after independent re-verification). **T7 is implemented and green but NOT recorded — its independent review came back `FAIL` with a Critical finding.** Do not record T7. Fix the Critical first.
- **The Critical, in one line:** T7's "repo-wide" qualified scan passes no `globs`, so it silently falls back to the engine's hardcoded `DEFAULT_GLOBS` (`packages/**/*.test.ts{,x}`) and **ignores `verification.testGlobs` entirely**. On a consumer project that isn't a pnpm monorepo it matches zero files and reports **every AC as drifted** — CI red on a healthy phase, with no flag to recover. That is the false-drift bug T7 exists to fix, reintroduced in a new form. Proposed fix is written out below; it fits inside T7's declared `files:`.
- **Everything is committed.** `08dab471` (T1–T6, 22 files) + `638bf793` (prior handoff). T7's two files are uncommitted in the working tree. Nothing is pushed; branch is 0 ahead / 0 behind origin. **Note:** the pre-filled `diff --stat` block below omits **untracked** files — the same omission in the previous handoff made this session briefly believe the whole phase had been lost. Always run `git status --short`, not just `git diff --stat`.
- Full pipeline `pnpm turbo run lint typecheck test build --force` is **24/24 successful** (~37s wall / ~7m user CPU — that ratio is normal parallelism here, not a short-circuit). Verified independently three separate times this session, including once by the main thread after the subagent claimed it.
- **Three findings need an operator disposition before this phase can settle** — the doc-comment falsehoods, the `docs/reference/commands.md` drift (outside T7's declared files), and the `coverageMode` provenance defect (reviewer recommends *file it, don't fix it here*). See "Carry-forward gotchas". None is filed in the ledger yet; per CLAUDE.md's "Unlogged Audit Finding" rule they must not close unlogged.
- Remaining after T7: **T8** indeterminate, **T9** docs + changeset, **T10** dogfood flip. T10 is the phase's own proof and the riskiest.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `worktree-239-coverage-phase-scoping` (dirty), 0 ahead / 0 behind origin
- HEAD `638bf793`
- Recent commits:
```
638bf793 chore(cadence): stamp session handoff — phase239-t6-implemented-not-recorded-t7-next
08dab471 WIP: handoff — phase 239 coverage phase-scoping, T1-T6
8e92d72d chore(cadence): stamp session handoff — phase239-midbuild-t1t2-done-t3-pending
01bf09aa fix: run CI on feat/kernel-assurance-v2 PRs, not just main (#329)
127a06b0 chore: drop Node 20 support, raise engine floor to Node >=22 (phase 238) (#324)
df41e3ca chore(cadence): file phase 238 (drop Node 20 support) + backfill phase 231's rec id (#323)
b14ee304 chore(cadence): file phase 231 recommendation (roadmap-currency doctor check) (#322)
a77263ad docs(planning): backfill ROADMAP.md/MILESTONES.md for phases 118-230 + Phase 0 mapping (#321)
```
- Uncommitted (diff --stat):
```
.../239-01-PROGRESS.json                           | 12 +++++
 packages/core/src/verify/phase-replay.ts           | 54 ++++++++++++++++------
 2 files changed, 52 insertions(+), 14 deletions(-)
```
- **CORRECTION — the block above is incomplete.** `diff --stat` does not list untracked
  files. The real working-tree state is:
```
 M .cadence/phases/239-coverage-phase-scoping/239-01-PROGRESS.json   (T6 record, loop telemetry)
 M packages/core/src/verify/phase-replay.ts                          (T7 implementation)
?? packages/core/tests/verify/phase-replay-qualified.test.ts         (T7 tests — UNTRACKED, 289 lines)
```
  The previous handoff carried the same omission and additionally said "Nothing is
  committed", which was already false when written — the prior session committed
  `08dab471` two minutes later. Verify with `git status --short`, never `git diff` alone.
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

### 1. T6 recorded DONE (the only state change)

Re-verified independently before recording, per the previous handoff's explicit
instruction not to record it from that document:

- Full pipeline `24 successful, 24 total` (37.8s wall / 7m13s user CPU).
- Read the diff and confirmed T6's load-bearing claim directly: `coverageScheme` and
  `coverageMode` in `packages/types/src/summary.ts` are `.optional()` with **no** Zod
  `.default(...)`, warning comment intact. (A default there would be injected into every
  historical SUMMARY at parse time, change its content hash, and report every past settle
  as tampered.)

`PROGRESS.json` now shows T1–T6 DONE.

### 2. T7 implemented — `phase-replay.ts` + a new test file

Subagent-driven, one implementer. Two files, both inside T7's declared `files:` — no
boundary under-declaration this time (the first task this phase where that held).

- `packages/core/src/verify/phase-replay.ts` — added
  `const qualified = summary.coverageScheme === 'phase-qualified'`; the `no-scoped-files`
  refusal now only fires when `!qualified && taskFiles.length === 0`; the
  `scanTestCoverage` call branches to `{ mode, expectedQualifier: id }` under qualified and
  keeps `{ globs: taskFiles, mode }` under bare. Doc comment rewritten to describe both paths.
- `packages/core/tests/verify/phase-replay-qualified.test.ts` — 5 tests for AC-8.

### 3. A defect the test suite could not see, caught by main-thread re-verification

The implementer reported green and was telling the truth — 24/24, 5 new tests passing —
and the work was still wrong.

Measuring the real scanner rather than trusting the report:

```
scanTestCoverage(repoRoot, { mode: 'assertion', expectedQualifier: '239-01' })
AC-1 … AC-7   qualifying >= 1
AC-8          refs=1   qualifying=0      <-- the AC T7 exists to satisfy
```

**Root cause, with some irony:** the new file's *fixture-hygiene comment* violated the rule
it described. Line 18 read ``// this file covers AC-8 only. The one contiguous
`239-01/AC-8` literal below`` — and that comment *is* a contiguous `239-01/AC-8` literal.
The scanner dedups per `AC-N@file` **first-occurrence-wins**; T2 deliberately filters
*unqualified* occurrences before the dedup add so a bare token can't steal the slot, but
this occurrence is correctly *qualified*, so it passed that filter, took the slot, and was
recorded `qualifying: false` because it sits in a comment outside any asserting span. The
five genuinely-qualifying `it()` titles below it were never reached.

Fixed by the implementer, then **re-measured by the main thread** (not taken on trust):
`AC-8 refs=1 qualifying=1`, retained ref now line 126, an `it()` title inside an asserting
block. AC-1..AC-7 unchanged.

### 4. Independent adversarial review → `FAIL`

Full findings in "Carry-forward gotchas". The review was real: it ran a 7-case scoping
probe, traced the qualifier's provenance through `settle.ts` → `gates/coverage.ts` →
`git/diff-strict.ts` to prove settle-token and replay-token cannot disagree, and verified
the phase-233 claim in the doc comment against the actual `233-01-SUMMARY.json` on
`feat/kernel-assurance-v2`.

### 5. Environment fix (outside the loop, machine-local)

`/home/thomas/.local/bin/cadence` was a wrapper pinning Node **20.20.2**, which has hard-
failed since phase 238 raised the engine floor to `>=22`. Repointed to `v22.22.3`;
`cadence --version` now works. This is a machine-local file, not repo content — nothing to
commit. **The `node packages/core/bin/cadence.cjs` discipline still applies regardless** —
the global install shadows the branch build and both print the same `--version`.

## Carry-forward gotchas

### A. T7's open review findings (must be resolved before T7 is recorded)

**A1 · CRITICAL — the "repo-wide" scan is not repo-wide.**
`phase-replay.ts:163-166` calls `scanTestCoverage(repoRoot, { mode, expectedQualifier: id })`
with **no `globs`**. `coverage.ts:88` then falls back to
`DEFAULT_GLOBS = ['packages/**/*.test.ts', 'packages/**/*.test.tsx']`. So the qualified
branch scans the *engine's hardcoded default globs*, ignoring both the DRAFT's files (correct,
intended) **and `verification.testGlobs` (not intended, and a regression)**. The bare branch
never had this dependency — `globs: taskFiles` are literal declared paths that work for any
layout.

Proven by the reviewer's 7-case probe:
```
B bare,      test in apps/,          DRAFT declares it => ok drift=0 covered=true
C qualified, test in apps/,          DRAFT declares it => ok drift=1 covered=false
D bare,      packages/x/a.spec.ts,   DRAFT declares it => ok drift=0 covered=true
E qualified, packages/x/a.spec.ts,   DRAFT declares it => ok drift=1 covered=false
```
The same phase the bare path reports covered, the qualified path reports drifted.

*Failure scenario:* a consumer project that is not a pnpm monorepo sets
`verification.testGlobs: ["src/**/*.spec.ts"]` + `coverageScheme: "phase-qualified"`. The
gate passes at settle (it scans the configured globs — `gates/coverage.ts:143-149`) and the
SUMMARY records `phase-qualified`. Later `cadence verify phase --changed` scans
`packages/**/*.test.ts` in a repo with no `packages/` directory, matches zero files, reports
every AC uncovered → exit 1, **CI red on a healthy phase**. `PhaseReplayConfig` has no globs
field, so there is no recovery flag.

*Proposed fix* (fits inside T7's declared `files:`):
```ts
export interface PhaseReplayConfig {
  coverageMode?: 'mention' | 'assertion';
  /** Configured verification.testGlobs; defaults to the engine defaults when absent. */
  testGlobs?: string[];
}
// ...
qualified
  ? { mode, expectedQualifier: id, ...(config.testGlobs ? { globs: config.testGlobs } : {}) }
  : { globs: taskFiles, mode },
```
`services/verify.ts` (T8's file) then wires `config.verification?.testGlobs` in one line.
Until wired, the default resolves to today's behavior, so nothing regresses in the interim.
**Add a test whose fixture test file lives outside `packages/`** — none of the current five do,
which is why the suite is green on a Critical.

If the operator instead decides globs-threading is out of T7's scope, then the doc comment
**must** stop claiming "whole-repo scan" and "strictly safer", and the gap must be filed as a
recommendation before settle. Shipping the current comment is not an option.

**A2 · MAJOR — two false claims in the rewritten doc comment.**
`phase-replay.ts:~68` says the qualified scan is *"deliberately a whole-repo scan"* — false,
it is a `DEFAULT_GLOBS` scan. `~80-81` says *"Repo-wide scoping under the qualifier is
therefore strictly safer than file-scoping, not a relaxation of it"* — false, and disproven by
probe cases B→C and D→E above. It is safer only for files inside `packages/**/*.test.ts{,x}`.
This repo's manual names "a confidently-worded false comment" as a real defect, and one was
already caught this phase. Either fix the code so the sentences become true (preferred) or
correct the sentences.

**A3 · MAJOR — `docs/reference/commands.md` drift, outside T7's declared files.**
Three now-false unconditional statements about `verify phase`:
`:2309-2311` ("scoped to `draft.tasks[].files` — never a whole-repo scan"),
`:2315-2316` ("A DRAFT that declares no task files refuses outright"),
`:2338-2341` (the exit-code-2 list entry for `no-scoped-files`).
All three are now true only under the bare scheme. *Failure scenario:* an operator on a
`phase-qualified` project designs CI around a `no-scoped-files` refusal that can never fire.
**This cannot be fixed inside T7 as declared** — route it to T9 (which already owns docs) or
extend T7's `files:` with an `As built` amendment. The reviewer could not find an executable
doc-content test covering this prose, so the suite stays green with the drift present —
operator review is the only backstop.

**A4 · MAJOR (design) — `coverageMode` provenance is recorded but ignored.**
`phase-replay.ts:159` uses `config.coverageMode ?? 'mention'` — the **live config's** mode —
while T6 writes `summary.coverageMode` into every new SUMMARY precisely as provenance.
Reproduced:
```
SUMMARY.coverageMode='mention', replayed with config 'mention'   => drift=0 covered=true
SUMMARY.coverageMode='mention', replayed with config 'assertion' => drift=1 covered=false
```
*Failure scenario:* a phase settles under `mention` with a legal comment-borne token. Weeks
later the operator runs `cadence config edit coverageMode assertion`. The next
`verify phase --changed` reports that phase **drifted** and reds CI — a lie: nothing about the
phase changed, the standard did.

**Reviewer's recommendation, which I endorse: file it, do NOT fix it in T7.** It is
pre-existing (the bare path had it before T7 and still does); a correct fix
(`summary.coverageMode ?? config.coverageMode`) would change the **bare** path for any
post-239 SUMMARY, violating T7's byte-for-byte boundary; and fixing it *only* under the
qualified branch would leave two schemes silently resolving the same question differently —
the exact hazard `settle.ts:432-434`'s own comment warns about. **Needs a
`cadence recommendation add` before this phase closes** (CLAUDE.md, "The Unlogged Audit
Finding"). Not yet filed — awaiting operator decision.

**A5 · MINOR — T7 falsifies a T6 comment.** `services/settle.ts:546-547` says the field is
*"Deliberately NOT read back out of a parsed SUMMARY anywhere: it is provenance, not an
input."* T7 now branches control flow on it — it **is** an input. A future agent could read
that line, conclude the field is write-only, and "simplify" the emission, silently breaking
every qualified replay. Outside T7's `files:`; needs routing like A3.

**A6 · MINOR — the qualified path hard-refuses on a DRAFT it never uses.** Under `qualified`
the DRAFT contributes nothing (`taskFiles` is dead, `acIds` come from `summary.acResults`),
yet it is still read and parsed first and a failure aborts with `draft-missing` /
`draft-unparseable`. A later heading typo in a settled phase's DRAFT reds CI even though the
coverage evidence is intact. **Reviewer explicitly does not recommend fixing in T7** — moving
the read changes the bare path's error precedence. Follow-up note only.

**A7 · MINOR — tests 4 and 5 are guarded by the wrong precondition.**
`phase-replay-qualified.test.ts:229-263, 265-293` both use an empty `filesLine`, so under a
reverted implementation they fail on `no-scoped-files` rather than on the qualifier semantics
their titles claim. They are **not** vacuous (they do catch the likely mutation of dropping
`expectedQualifier`), but giving one a non-empty `filesLine` would make it isolate what it
claims. Also: `summaryBody` accepts `'bare'` but no test passes it — the explicit-`bare`-vs-
absent equivalence is untested here (reviewer verified it holds).

### B. The dedup hazard — my own finding, unfiled, needs an operator call

A **correctly-qualified** token in a non-asserting position (a comment) earlier in a file
consumes that AC's per-file dedup slot and is recorded `qualifying: false`, silently zeroing
out every qualifying occurrence below it. `coverage.ts:130-139`'s comment anticipates the
*bare*-token case explicitly and not this one. This bit T7 tonight and cost a full
review round-trip.

This looks like a product-level sharp edge, not a phase-239 slip. Candidate for
`cadence recommendation add`. **Deliberately not filed** — operator asked to decide rather than
have it filed speculatively.

### C. T10 will be stricter than it looks — and is currently under-configured

- **This worktree's `.cadence/config.json` has NO `coverageScheme` key**, so it resolves to
  `bare`. Unless T10 actually flips it, phase 239 dogfoods its own gate under the **old**
  scheme — the phase would prove nothing. The reviewer checked both outcomes: bare passes
  (via cross-phase collision) and qualified also passes (all eight implemented ACs have ≥1
  qualifying ref). **Either way T10 goes green, so greenness is not evidence the flip
  happened.** Verify the config value explicitly.
- After the flip an AC needs a `239-01/AC-N` token **inside an asserting block**. Bare `AC-N`
  mentions across ~239 phases of history stop counting. If the settle refuses at T10, the gate
  is right until proven otherwise — do not reach for `--force` or `--allow-missing-coverage`.
- **Fixture-token hygiene is mandatory in every new test file**, and the rule is subtler than
  "put it in an asserting block" — see finding B. Build fixture tokens by concatenation or
  template interpolation (`${id}/AC-1`) so no contiguous literal appears for an AC the file
  does not genuinely cover, **and make sure the file's first occurrence of its own AC token is
  the qualifying one.**
- Known benign leak: `phase-replay-qualified.test.ts` contributes a non-qualifying bare `AC-8`
  (line 7 comment) and a non-qualifying bare `AC-1` (line 51, the DRAFT fixture's
  `### AC-1: sample ac`) under the *bare* scheme. Inert today; vanishes at T10.

### D. Still-current gotchas carried forward from the previous handoff

- **NEVER give SUMMARY's new fields a Zod `.default(...)`.** `cadence summary verify`
  Zod-parses SUMMARY.json then content-hashes the **parsed** object. A default would be
  injected into every historical SUMMARY, change its digest, and report **every past settle as
  tampered**. `tests/summary-coverage-scheme.test.ts` fails the moment someone "fixes" this.
- **The scheme-aware thunk has blast radius beyond evidence.** `ctx.coverage()` also feeds
  `gates/deep-verify.ts` and `gates/interactive.ts`. Under `phase-qualified`, `MockVerifier`
  auto-fails any AC with zero linked tests, so an AC whose only reference is a cross-phase bare
  token now fails deep-verify and refuses the settle. Correct, tested — but expect it to bite
  at T10.
- **Two scans under the qualified scheme, by design.** `gates/coverage.ts` runs its own
  qualified scan while the shared thunk runs another. An efficiency wart, not a correctness
  one; both use identical options and cannot disagree. Recorded in the gate's docstring.
- **Always `node packages/core/bin/cadence.cjs`, never bare `cadence`** — the global install
  shadows the branch build and both print the same `--version`.
- **CLI tests spawn `packages/core/dist/cli/index.js`** — rebuild before running them or you
  test stale code. This also applies to any `dist/`-reading probe script (the coverage probes
  in this doc read `dist/`).
- **Run subset tests with `--coverage.enabled=false`** or global thresholds fail the run
  spuriously and look like real failures.
- **`rec-20260729-004` is NOT in main's ledger** — the `rec-20260729-*` series lives only in
  unpushed commits on the kernel-assurance arc. Promotion at settle is impossible from this
  branch; record the linkage in the commit message and promote once the arc merges. Do not
  re-file it and do not blanket-copy `recommendations.json`.
- **`--allow-auto-complex` was used at approve** and will appear in `SUMMARY.gateBypasses`.
  Expected, already recorded as an anomaly.
- **`origin/main` moved.** Phase 240 landed as `84dc9bd9` (PR #332). Zero file overlap with
  phase 239; the only contact point is `docs/reference/commands.md` at T9 — which finding A3
  now makes a live concern. Rebase before landing, not before T8.

### E. Session-hygiene notes

- **Multiple concurrent sessions were live in this repo tonight** — at one point two in the
  primary checkout plus one in this worktree. Per CLAUDE.md's "Zombie Session", two sessions
  racing one draft corrupt `PROGRESS.json`/`state.json` non-deterministically, and vitest
  contention produces sub-30-second failures that look like real regressions. Before resuming,
  check `ps` for other sessions holding this worktree; the prior one exited cleanly at ~22:06
  after writing its handoff.
- No stash was taken. The working tree is left dirty and intact.
- Nothing was pushed. Nothing was committed this session.

## Next action

**Action:** Decide the disposition of review finding A1 (Critical), fix it, re-review, then
record T7. **Do not record T7 from this document** — the repo's own rule is that a completion
claim in a doc is not proof, and this task has already produced one defect a green suite could
not see.

1. Confirm you are in this worktree (`pwd -P` must end `.claude/worktrees/239-coverage-phase-scoping`)
   on branch `worktree-239-coverage-phase-scoping`, and that no other session holds it (`ps`).
2. Confirm the working tree still holds T7's two files — **`git status --short`, not
   `git diff`** (see the CORRECTION in the state block):
   ```
    M packages/core/src/verify/phase-replay.ts
   ?? packages/core/tests/verify/phase-replay-qualified.test.ts
   ```
3. **Operator decision required on A1.** Either:
   - (a) *preferred* — thread `testGlobs` through `PhaseReplayConfig` as written in gotcha A1,
     and add a test whose fixture test file lives **outside** `packages/`; or
   - (b) declare it out of T7's scope, correct the doc comment's two false claims (A2), and
     file a recommendation before settle.
   Whichever is chosen, A2 must be resolved — the comment cannot ship as written under either
   option.
4. **Route A3 and A5** (both outside T7's declared `files:`): either extend T7 with an
   `As built` amendment to the DRAFT — the established pattern here, used four times already
   this phase — or assign them to T9, which already owns docs. Do not silently edit files
   outside the declared set.
5. **File the unlogged findings.** A4 (`coverageMode` provenance) and finding B (the dedup
   hazard) both need `cadence recommendation add` before this phase closes, per CLAUDE.md's
   "The Unlogged Audit Finding". Neither is filed — the operator asked to decide rather than
   have them filed speculatively. **This is the item most likely to be silently dropped.**
6. Re-run the pipeline and the coverage probe yourself, then record T7 with notes naming the
   Critical and its resolution.
7. Then T8 (`### T8: Report pre-scheme phases as indeterminate instead of drifting`,
   `done: AC-9`, `depends: T7`). Headline evidence for AC-9: replaying phase 233 goes from
   **5 false drifts to 5 indeterminate / 0 drift**. The reviewer independently confirmed 233's
   SUMMARY records exactly 5 ACs, all `pass: true / evidence: "executed"`, with zero test files
   named in its DRAFT — so the fixture is real.
8. Keep the loop: one task at a time, one implementer, one independent adversarial reviewer,
   main-thread re-verification of the diff and suite, then record. **Never record DONE from a
   subagent's report** — this session is the third consecutive one where that rule caught a
   real defect.

**Verify:**
```
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null
pnpm turbo run lint typecheck test build --force     # expect 24 successful, 24 total
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
AC-1..AC-8 must each show `qualifying >= 1`. AC-9/AC-10 at zero is expected until T8/T9 land.
`PROGRESS.json` shows T1–T7 DONE only after step 6.

**If it fails:** a sub-30-second pipeline failure is machine contention from a sibling session
— re-run serially before investigating. If a genuine regression appears in `gates/`, `verify/`,
`config/`, `config-edit/`, or `summary-coverage-scheme`, it is from this phase's uncommitted
work and the diff is the place to look. If a task hits a boundary blocker, amend the DRAFT with
an `As built` note and declare the file rather than silently reaching outside the declared set.
