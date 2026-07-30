---
cadence_handoff: 1
generated_at: 2026-07-29T23:42:33.512Z
label: phase235-shipped-coverage-audit-next
loop_position: IDLE
active_phase: 235-criteria-anchored-review-input
active_draft: 
tier: 
git_branch: 235-criteria-anchored-review-input
git_dirty: true
git_head: a34b0739
git_ahead: 1
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-29 (phase235-shipped-coverage-audit-next)

## TL;DR for the next session
- **Phase 235 (criteria-anchored review verifier) is built, settled, and committed — but NOT pushed and NOT PR'd.** Commit `a34b0739` on `235-criteria-anchored-review-input`, 27 files, +2887/−97, tree otherwise clean. Zero gate bypasses, 7/7 ACs `pass: true` at `executed` evidence. Operator explicitly chose not to push this session.
- Resumed a **dead session's** work: a prior session authored and approved the `235-01` DRAFT then died with zero task progress. Confirmed dead (no process, ~19h idle) and resumed **in place** per the Zombie Session rule rather than re-scaffolding.
- **This is the first phase on this arc to dogfood its own assurance record** — SUMMARY is `schemaVersion: 2` **with** an `assurance` block, because settle ran as `node packages/core/bin/cadence.cjs`. That closes the practical half of the phase-234 handoff's `rec-20260729-001` (the global v1.51.1 binary silently shadows the branch build and writes v1 with no assurance; both report the same `--version`). **Keep using the branch-local binary for every state-mutating command.**
- **Three real defects were caught behind green subagent self-reports** (details in gotchas). The pipeline earned its cost; do not relax the re-verify step.
- **Six recommendations filed this session** (`rec-20260729-002` … `-007`), several of them significant findings about the tool's own enforcement rather than about phase 235.
- **Single next action:** run the retroactive coverage audit (`rec-20260729-006`) in a **fresh session** — operator's explicit instruction. See Next action.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `235-criteria-anchored-review-input` (dirty), 1 ahead / 0 behind origin
- HEAD `a34b0739`
- Recent commits:
```
a34b0739 feat: criteria-anchored code-review findings + anchor ladder (phase 235) (rec-20260727-004, rec-20260727-005)
0726e405 feat: name and lint-enforce the kernel/verifier/consumer boundary (phase 234) (rec-20260727-003) (#330)
cfe582a5 feat: per-settle assurance record derived from gate provenance + AC evidence (phase 233) (#rec-20260728-001) (#328)
38adb8ad Merge remote-tracking branch 'origin/main' into feat/kernel-assurance-v2
01bf09aa fix: run CI on feat/kernel-assurance-v2 PRs, not just main (#329)
3b95218b feat: gate provenance carries verifier identity; SUMMARY schemaVersion 2 (phase 232) (rec-20260727-001) (#327)
127a06b0 chore: drop Node 20 support, raise engine floor to Node >=22 (phase 238) (#324)
df41e3ca chore(cadence): file phase 238 (drop Node 20 support) + backfill phase 231's rec id (#323)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/RECOMMENDATIONS.md   | 16 +++++++++++++
 .cadence/intelligence/evidence.json        |  7 ++++++
 .cadence/intelligence/recommendations.json | 38 ++++++++++++++++++++++++++----
 3 files changed, 57 insertions(+), 4 deletions(-)
```
- Loop: IDLE · phase 235-criteria-anchored-review-input · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260727-012 — cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift) (candidate/ready-for-cadence-spec)
  - rec-20260729-002 — Thread gate provenance into SettleContext so the anchor ladder's executable tier is reachable in the live gate (candidate/needs-decision)
  - rec-20260729-004 — test-coverage gate's repo-wide AC-N token scan collides across phases, so any AC can be satisfied by an unrelated phase's tests (candidate/needs-decision)
  - rec-20260729-006 — Retroactive audit: re-derive how many historical AC PASS records had genuine per-phase test coverage (candidate/needs-evidence)
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
  - dec-20260728-001 — Phase 233 AC-3 tripwire cleared: assurance-record derivation is gate-agnostic
  - dec-20260729-001 — Phase 234 AC-1 narrowed: contracts/ is the type-naming surface, not the resolution surface
  - dec-20260729-002 — Uniform opts? on VerifierPort is what makes zero-special-cases true
  - dec-20260729-003 — Phase 235 scope: criteria-anchoring is code-review only, not spec-review/ui-spec-review/plan-review
  - dec-20260729-004 — Anchor executable tier: non-empty verify + build-test-must-pass ran, no prose heuristic
  - dec-20260729-005 — Criteria-gap refusal reuses code-review's existing HIGH-severity refuse path, not gates.evidenceFloor
  - dec-20260729-006 — D3 unconditional declaration binds the floor outcome, not the empty-gap case
- Files in play:
  - `.cadence/ROADMAP.md` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/checks/roadmap-currency.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/registry.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/gates/types.ts` — affected by rec-20260729-002 Thread gate provenance into SettleContext so the anchor ladder's executable tier is reachable in the live gate
  - `packages/core/src/gates/registry.ts` — affected by rec-20260729-002 Thread gate provenance into SettleContext so the anchor ladder's executable tier is reachable in the live gate
  - `packages/core/src/gates/code-review.ts` — affected by rec-20260729-002 Thread gate provenance into SettleContext so the anchor ladder's executable tier is reachable in the live gate
  - `packages/core/src/verify/anchor.ts` — affected by rec-20260729-002 Thread gate provenance into SettleContext so the anchor ladder's executable tier is reachable in the live gate
  - `packages/core/src/verify/coverage.ts` — affected by rec-20260729-004 test-coverage gate's repo-wide AC-N token scan collides across phases, so any AC can be satisfied by an unrelated phase's tests
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260729-004 test-coverage gate's repo-wide AC-N token scan collides across phases, so any AC can be satisfied by an unrelated phase's tests
  - `packages/core/src/verify/phase-replay.ts` — affected by rec-20260729-006 Retroactive audit: re-derive how many historical AC PASS records had genuine per-phase test coverage

## What landed this session

**Phase 235 — criteria-anchored review verifier** (`rec-20260727-004` + `rec-20260727-005`, both promoted to `shipped`). Commit `a34b0739`, local only.

- `packages/types/src/summary.ts` — `AnchorTierZ` (`executable|structured|declared|undeclared`) and `AnchorZ` (`{kind:'ac'|'boundary'|'none', ref?, tier}`) as a **peer** schema to `AcEvidenceZ` (D5), not a reuse; `FindingZ.anchor` optional/additive so every pre-existing SUMMARY still parses (pinned by a real-schema test).
- `packages/core/src/verify/anchor.ts` — pure DI `resolveAnchor` implementing the §7.1 ladder. `executable` needs BOTH a task citing the AC with a non-empty `verify` AND a `build-test-must-pass` provenance entry at `status === 'ran'`; `skipped`/`refused`/missing/empty all fail it.
- `packages/core/src/verify/criteria-gap.ts` — pure `anchorFindings` tagging findings and deriving `{gapCount, severityDistribution}`. A gap is `tier === 'undeclared'`.
- `packages/core/src/verify/code-review.ts` — `CodeReviewInput` gained `acceptanceCriteria`/`boundaries`/`taskRefs` (additive optional); `MockCodeReviewVerifier` gained an opt-in `extraMarkers` seam with zero-config output byte-for-byte unchanged.
- `packages/core/src/gates/code-review.ts` — pure `buildCodeReviewInput` populates the input from `ctx.draft`; gap tagging wired in. `highs`/`pass` still computed from the **raw** findings, so anchoring can never change pass/refuse.
- `packages/core/src/contracts/index.ts` — republishes `CodeReviewTaskRef` through the phase-234 contract surface.
- `docs/concepts.md` + new doc test pinning `GATE_ORDER`, the HIGH-refuse contract, and pre-235 SUMMARY parsing. Changeset carries both packages at `minor`.
- **Four decisions recorded:** `dec-20260729-003` (scope: code-review only, resolving §10 open question 3), `-004` (executable-tier runnable-command rule), `-005` (gap refusal reuses the existing HIGH path, NOT `gates.evidenceFloor`), `-006` (D3 binds the floor *outcome*, not the empty-gap case).
- **Verification:** 24/24 turbo tasks; 3410 core tests / 374 files; all packages green. Five independent review passes (wave-1, T2, T4, T5+T6, whole-branch), all zero Critical/Important. Whole-branch review returned **READY TO MERGE** with all 7 ACs **DELIVERED**.

## Carry-forward gotchas

- **NOT PUSHED, NO PR.** `a34b0739` is local only, 1 ahead of `origin/feat/kernel-assurance-v2`. Operator chose not to push. When landing: `gh pr create --base feat/kernel-assurance-v2` — **base must be set at creation**; `gh pr edit --base` is broken on the installed `gh 2.45.0` (GraphQL error on deprecated Projects Classic). Workaround if needed: `gh api repos/manehorizons/cadence/pulls/<n> -X PATCH -f base=<branch>`.
- **THE BIG ONE — the test-coverage gate proves far less than it appears (`rec-20260729-004`, high).** `scanTestCoverage` scans `packages/**/*.test.ts` repo-wide and links an AC by the bare `/\bAC-\d+\b/` token. AC ids are phase-local and restart at `AC-1` every phase, so the namespace collides across 235 phases of accumulated tests. Measured live for this phase: AC-1 satisfied by **189** unrelated files, AC-2 by 156, AC-3 by 147, AC-4 by 116, AC-5 by 91, AC-6 by 49, AC-7 by 34. **Phase 235 would have passed the coverage gate having written zero tests.** Proof it isn't theoretical: AC-5/AC-6 belong to T5 and were already fully satisfied *before T5 was implemented*, by matches like `it('Slice 23 AC-6: unknown rec id → empty result, exit 0')` from unrelated recommendation-CLI slices. Enforcement strength is inversely proportional to AC number (AC-20: 1 span; AC-8: 64), so it's an accident of numbering. `assertion` mode hardened **where** a token sits, never **which phase owns it**. Because settle derives per-AC PASS from task status + coverage evidence, per-AC PASS for a typical phase collapses toward the agent's own DONE self-report. Note the corpus already drifts toward a fix (`Slice 22 AC-6:` prefixes) but the regex can't see the qualifier. **This is a defect in the proof, not proof that past work was undone** — `build-test-must-pass`, per-task `verify:`, and the review gates were unaffected and gave real signal.
- **Criteria-anchoring has never run end-to-end (`rec-20260729-007`).** This phase's own settle recorded `code-review -> skipped: not in the active tier × profile gate set` (standard × standard). So a phase that enhanced `code-review` never ran it. Compounded by `rec-20260729-002`: `SettleContext` exposes no prior-gate provenance to a `GateImpl`, so the live gate passes `gateProvenance: []` and the **`executable` tier is structurally unreachable in production**. The ladder's top rung is currently dead outside unit tests. To verify for real, settle a phase at strict×standard or standard×complex and inspect `summaryPatch.codeReview`.
- **Always settle with `node packages/core/bin/cadence.cjs`, never bare `cadence`.** The global v1.51.1 install shadows the branch build and writes `schemaVersion: 1` with no assurance record; **both print the same `--version`**, so the shadowing is invisible. This session's SUMMARY is v2 with assurance precisely because the branch binary was used.
- **Subagent self-reports were wrong three times — do not relax the re-verify step.** (1) T3 reported green while the repo-wide typecheck failed (`TS2305: CodeReviewTaskRef` not exported from `contracts/index.ts`) — its single-file test *could not* catch it, because tests here are neither typechecked nor linted. (2) T2 used `t.done === ac.id`, but `Task.done` is a comma-separated string (`AC-2, AC-3`), silently making `executable` unreachable for every multi-AC task — most of them; fixed by using the canonical `parseAcRefs` (`parse/ac-refs.ts`). (3) T4 reported green while 2 pre-existing CLI tests failed, because its D3 stderr notice fired on zero-finding runs.
- **`git add -A` would have committed a `/tmp` path.** The settle's boundary scan flagged `/tmp/claude-1000/t5-backup/code-review.ts.original` as "touched but not declared" — `PROGRESS.json`'s `touchedFiles` records scratch-file touches (known unreliable, same as the phase-234 handoff noted). Harmless here (outside the repo), but stage explicitly.
- **CLI tests spawn `dist/`.** After editing anything under `packages/core/src`, **rebuild before running `tests/cli/*`** or you will read a stale result. This bit me once: a correct fix looked broken purely because `turbo build` predated the edit.
- **Tests are neither typechecked nor linted** (`tsconfig.base.json` excludes `**/*.test.ts`; every lint script is `eslint src`) — so type-level assertions in tests are **inert**. Insist on runtime assertions. (`rec-20260728-002` from the prior session still open.)
- **A `/g` RegExp is stateful.** T5's mock seam needed a `lastIndex = 0` reset before `.test()`, or an idiomatic `/pattern/g` marker would match intermittently across diff lines. Same defense `verify/coverage.ts` already applies to `AC_TOKEN_RE`.
- **`draft-read` and `code-review` are BOTH skipped at standard × standard.** I re-approved the draft to refresh `draftReadAt` after amending the DRAFT five times — that turned out to be unnecessary. `draft approve` is safe for this though: it only touches `state.json` (incl. `draftReadAt`) and never `PROGRESS.json`, so recorded task outcomes survive (verified before and after).
- **Never run two reviewer subagents against one worktree simultaneously**, and forbid `git restore`/`git checkout --`/`stash`/`reset` in every subagent prompt (carried forward from phase 234, where both caused real damage). All mutation experiments this session used `cp` backups with `sha256sum`-proved restores.
- Stale worktrees still worth a cleanup pass: `.claude/worktrees/234-kernel-verifier-consumer-boundary` (merged, remote-deleted branch, holds only its handoff), `.claude/worktrees/233-per-settle-assurance-record`, and `.claude/worktrees/171-installer-settings-parse-failure-recovery` (stale since 2026-07-11).
- Local `main` was `ahead 9 / behind 1` at session start (unpushed merge+handoff commits, missing `01bf09aa`). Untouched this session.

## Next action

**Action:** Run the **retroactive coverage audit** — `rec-20260729-006`. This is the operator's explicit instruction from 2026-07-29: *"Let's run the audit once 235 lands (but in a new session after handoff)."* You are that new session.

The audit: for every settled phase, re-derive whether each AC's satisfying `AC-N` token actually sits in a test file belonging to **that** phase rather than an unrelated one, and report how many historical AC PASS records had genuine per-phase coverage versus cross-phase-only satisfaction. Read `rec-20260729-004` first for the full mechanism and the measurements already taken — do not re-derive them from scratch. `cadence verify coverage --explain <AC-N>` is the read-only tool that exposes per-file satisfaction and is how the finding was found; `cadence verify phase` re-derives a settled phase's coverage but currently uses the same unscoped scan, so treat its output as suspect until phase-scoping lands.

Scope note: the audit is **read-only measurement**, not the fix. `rec-20260729-004` is `needs-decision` — the operator picks between scoping the scan to the phase's own files, phase-qualifying the token, or reporting matched files in gate output. Expect the fix to turn some currently-green historical ACs red; that is the correct outcome but means it cannot ship quietly, and it likely deserves its own phase rather than a bolt-on.

**Before starting, decide with the operator whether to land phase 235 first.** `a34b0739` is committed but unpushed with no PR. It is self-contained and green, so it can sit — but it is 1 ahead of `origin/feat/kernel-assurance-v2` and a second session working this arc would collide with it.

**Verify:** the audit produces a count of settled-phase ACs whose coverage came only from unrelated phases' tests, with the per-phase breakdown; `rec-20260729-006` is promoted or annotated with that evidence.

**If it fails / is bigger than expected:** the honest fallback is to scope the audit to a recent window (say the last 20 phases) and report that scoping explicitly rather than silently sampling — `no silent caps`. If the phase-scoping fix has to land before the audit can produce a trustworthy number, say so and stop rather than reporting a figure derived from the broken scan.

**Do NOT:** promote `rec-20260729-002`/`-003`/`-005`/`-007` or fix them inline — all four are deliberately deferred phase-235 limitations, disclosed in `docs/concepts.md` and the changeset. Do not "tidy" the coverage gate as a side quest while auditing it.
