---
cadence_handoff: 1
generated_at: 2026-08-15T16:41:41.482Z
label: dp-b-settled-holding-for-push
loop_position: IDLE
active_phase: 280-dispatch-contract
active_draft: 
tier: 
git_branch: worktree-dp-b-dispatch-contract
git_dirty: true
git_head: 568544e8
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-15 (dp-b-settled-holding-for-push)

## TL;DR for the next session
- DP-B (phase 280-dispatch-contract, draft 280-01) is **fully built (17/17 tasks), settled, and committed** at `568544e8` on `worktree-dp-b-dispatch-contract` — **held, not pushed**, on explicit operator instruction ("Hold for now").
- Full suite is green: 4243/4243 tests, lint, typecheck, build. `settle run --auto` passed cleanly (not forced, not bypassed).
- `deep-verify`/`code-review` recorded honestly as **mock fallback** (`codex`/host-cli timed out 3× this session — a documented limitation, not a bug) — but a genuinely independent fresh-subagent whole-branch review already happened outside the gate machinery and found + fixed 3 real defects. See "Carry-forward gotchas" for why that isn't reflected in `SUMMARY.json`.
- A real bug was found and fixed this session: `recordTaskOutcome` (`record.ts`) previously replaced a task's whole PROGRESS.json row on every re-record, silently dropping `execution`/`isolation`/`modelClass` — violating AC-2's explicit "never de-escalates" requirement. Fixed with 2 regression tests.
- Two new recommendations filed: `rec-20260815-002` (cadence `done` bypasses the new record-time checks) and `rec-20260815-003` (recording a genuine orchestrator-driven review status in the audit trail, distinct from mock).
- **Next action is the operator's**: push the branch + open the PR (or hold further). Once merged, promote `rec-20260718-003/004/005` from `settle-pending` to `shipped` with the real PR ref.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `worktree-dp-b-dispatch-contract` (dirty), 0 ahead / 0 behind origin
- HEAD `568544e8`
- Recent commits:
```
568544e8 feat: dispatch contract -- record-time boundary/redundancy enforcement (phase 280)
06d87907 feat: dispatch policy engine -- execution class + inline/dispatch verdict (phase 279) (#428)
b0144966 fix(security): remediate 11 open Dependabot alerts in website/ (#427)
5632a410 chore(cadence): promote v1.59.0 recommendations to shipped (#426)
8dfd3954 docs: lead with cadence demo, demote tutorial/init --demo, fix npm homepage (#425)
8d8fa55e chore(release): v1.59.0 -- cadence demo/onboarding + filter-regex ReDoS guard (#424)
dd6c3c51 fix: reject nested-quantifier patterns in --filter-regex (ReDoS guard) (#422)
6e5a2d03 feat: cadence demo + progressive-disclosure onboarding stages (phase 278) (#421)
```
- Loop: IDLE · phase 280-dispatch-contract · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260807-005 — Make phase-qualified the default AC coverage scheme (bare still ships collision bug) (candidate/ready-for-cadence-spec)
  - rec-20260814-002 — cadence verify coverage --explain's 'Overall: SATISFIED' can disagree with the real settle gate's verdict (candidate/ready-for-cadence-spec)
  - rec-20260809-001 — scanTestCoverage dedups AC-token occurrences per-file by first match only, dropping later qualifying refs (candidate/ready-for-cadence-spec)
  - rec-20260801-001 — docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8 (candidate/ready-for-cadence-spec)
  - rec-20260809-003 — vitest.shared.ts's Windows-timeout comment cites the now-fixed dispatcher cap test (candidate/ready-for-cadence-spec)
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
  - dec-20260808-001 — D-A: Do not rename the mock provider identity
  - dec-20260808-002 — D-B: Do not require a real verifier provider at cadence init
  - dec-20260808-003 — v1.56 Phase O sequenced after Phase P, not before (amends HANDOFF-v1.56 §5 priority table)
  - dec-20260808-004 — J.1 (overall: strong structurally unreachable) resolved for the profile-override path; still true for the default auto-profile path
  - dec-20260808-005 — Phase L's providerSelection field widens to a third state covering empty-diff false-pass, not just configured/fallback
  - dec-20260808-007 — providerSelection field: optional enum, no default, no schemaVersion bump (corrected citation)
  - dec-20260808-008 — Phase 263 (v1.56 Phase L): narrow providerSelection persistence to 5 seams, exclude deep-verify/per-task-verify
  - dec-20260808-009 — Phase M: render-time join over AssuranceRecordZ schema change for providerSelection
  - dec-20260808-010 — Phase M: umbrella mock-capability label, not per-verifier-family variants
  - dec-20260809-001 — Bundle rec-20260806-010 + rec-20260809-002 into one CI-timeout-remediation phase
  - dec-20260809-002 — Phase P (267): mock abstains on review gates rather than passing them
  - dec-20260809-004 — Phase 267 (P.1, corrected): mock abstention is identity-at-recording, not no-dispatch
  - dec-20260809-005 — Phase 267 (P.1, mechanism correction): plan-review/spec-review/ui-spec-review abstain via converge.ts's shared sidecar, not registry.ts
  - dec-20260810-001 — Phase 267 (T6): repo profile flipped auto -> standard, closing dec-20260804-001's revisit trigger
  - dec-20260810-002 — Phase 267 (fix round): converge.ts sidecar persists verdict:'abstained'+pass:false/converged:false for mockAbstained entries, not pass:true+sibling flag
  - dec-20260810-003 — Phase 267 (fix round 3): code-review.ts's own CODE-REVIEW.json sidecar also abstains under mock, independent of registry.ts's SUMMARY-level relabel
  - dec-20260810-004 — Phase O (268): build the drift counter now, defer O.3's measured threshold
  - dec-20260810-005 — Phase O (268): add an indeterminate rung to DoctorSeverity, resolving v1.55 J.2
  - dec-20260811-001 — D-E: security-audit stays unreachable through v1.56 (option 2, matrix change, deferred to v1.57)
  - dec-20260811-002 — Reaffirm deep-verify/per-task-verify provenance exclusion through v1.56.0, defer to v1.57
  - dec-20260812-002 — D-H: 'unobservable' evidence class sits off-ladder, orthogonal to AcEvidenceZ
  - dec-20260812-003 — D-I: reaffirm security-audit deferral at profile=standard, do not reopen the DELTAS matrix in v1.57
  - dec-20260812-004 — D-G (corrected measurement): unobservable-AC criteria get a new settle-time verdict class, DRAFT-time refusal deferred to v1.58
  - dec-20260813-001 — W.0: rec-20260812-004 is a duplicate of rec-20260809-001 -- reconciled into the earlier filing
  - dec-20260813-002 — Phase U (v1.57 arc): skipped -- D-I already reaffirmed security-audit deferral
  - dec-20260813-003 — W.2: reaffirm dec-20260810-004's deferral of O.3's measured threshold -- corrected real-data measurement recorded, no new number invented
  - dec-20260813-004 — W.3: reaffirm documented-blocker posture -- no CLI path exists to close a milestone whose sole rec shipped out-of-band; building one is out of scope for a decisions-only phase
  - dec-20260813-005 — W.4: split the default -- existing-project upgrade default stays 'bare', but recommend fresh cadence init default to 'phase-qualified' in a future phase
  - dec-20260814-001 — D-M: accept archiveReason=manual for the pre-phase-102 archive backfill
  - dec-20260815-001 — D-DQ1: Task execution class -- declared field wins, heuristic cross-checks via coherence warn
  - dec-20260815-002 — D-DQ2: boundaryEnforcement escalates to block, dispatch-scoped, once DP-B lands
  - dec-20260815-003 — D-DQ3: contextBudgetThreshold stays inert this arc -- tokenUtilization is a fake signal
  - dec-20260815-004 — D-DQ4: stop-condition coherence severity is warn, not a blocker, for now
- Files in play:
  - `packages/types/src/config.ts` — affected by rec-20260807-005 Make phase-qualified the default AC coverage scheme (bare still ships collision bug)
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260807-005 Make phase-qualified the default AC coverage scheme (bare still ships collision bug)
  - `packages/core/src/verify/coverage.ts` — affected by rec-20260807-005 Make phase-qualified the default AC coverage scheme (bare still ships collision bug)
  - `docs/reference/commands.md` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/config-edit/fields.ts` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `vitest.shared.ts` — affected by rec-20260809-003 vitest.shared.ts's Windows-timeout comment cites the now-fixed dispatcher cap test

## What landed this session
- **Reattached to a crashed prior session's DP-B build** (locked worktree, dead PID confirmed via `ps`, unlocked per the Zombie Session protocol) and ran the remaining ~10 of 17 tasks to completion via the phase-build pipeline: implement → independent reviewer subagent → orchestrator re-verification, per task.
- **Whole-branch review** (fresh subagent, post all 17 tasks) caught 3 real defects invisible to per-task review: a stale `anyTaskDispatched` predicate in `gates/registry.ts` (mirrored `boundary-scan.ts`'s own escalation logic but wasn't kept in sync), a stale `boundaryEnforcement` scope note in `docs/reference/config.md`, and a missing `.changeset/dispatch-contract.md`. All three fixed, each with its own regression test where code changed.
- **Fixed T11's `previouslyRecorded` bug** (found by extra-scrutiny review before compaction): re-recording a task zeroed its own prior `touchedFiles` via an off-by-inclusion in the `priorTasks` filter.
- **Fixed a second, distinct re-record bug this half-session**: `record.ts`'s full-row-replace pattern silently dropped `execution`/`isolation`/`modelClass` on any re-record that didn't repeat the flags — found by the one real `code-review` pass that completed before host-cli started timing out. Fixed to preserve prior values unless explicitly overridden; 2 new regression tests in `record.test.ts`.
- **Root-caused and fixed a real, reproducible coverage-gate false-refusal on AC-6**: `scanTestCoverage`'s assertion-mode per-file dedup (`key = id@relPath`, first-occurrence-wins) discarded 3 genuinely-qualifying `it()` occurrences in favor of one non-qualifying `describe()` title occurrence in the same file. This is a **pre-existing, already-filed bug** (`rec-20260807-001`, first reported phase 258) — hit for a third confirmed time here. Worked around in-file (dropped the redundant token from the `describe` title) rather than touching the shared scanner, which is out of DP-B's task boundaries. Filed detailed evidence (`ev-20260815-003`) including a newly-discovered escalation: the same dedup also corrupts `deep-verify`'s independent-AI-verifier input (it consumes the same deduped `ctx.coverage()` map), and two consecutive `settle run --auto` invocations against identical code produced disjoint deep-verify offender sets — real non-determinism, separate from the dedup bug.
- **Fixed a smaller, unrelated bug on AC-5**: T14's refused-settle-path provenance test was already complete and correct but titled with a bare `'AC-5: ...'` instead of `'280-01/AC-5: ...'`, so it didn't count as evidence under `coverageScheme: 'phase-qualified'`. One-line title fix, both `it()` blocks.
- **Settled cleanly**: `cadence settle run --auto` passed with no bypass flags. `deep-verify` ran under `mock` (host-cli/`codex` timed out at 180s twice); `code-review`'s one real pass caught the `record.ts` bug, then a follow-up run also fell back to `mock` (self-consistently recorded `skipped`, not a persisted pass, per the gate's own honest-fallback design).
- **Post-settle: a real, non-mock deep-verify pass was obtained and reviewed.** With `CADENCE_HOST_CLI_TIMEOUT_MS` bumped to 480000 (8 min, up from the 180s default), a standalone script reconstructing `deep-verify.ts`'s exact `VerifyInput` (parsed ACs from `280-01-DRAFT.md`, `scanTestCoverage` under the same `assertion`/`280-01`-qualified options, a `git diff HEAD~1 HEAD` over the DRAFT-declared touched files, capped the same way) and invoking the real `HostCliVerifier`/`codex` class directly returned **`provider: "host-cli"`, all 7 ACs `pass: true`** with specific, differentiated per-AC reasoning, in 216.5s. This is genuine independent verification through the identical mechanism `deep-verify.ts` uses — it just ran outside the actual `settle run` process (the loop was already `IDLE`), so it deliberately was **not** written into the settled `280-01-SUMMARY.json` (which stays honestly `mock` — that field records what ran through the real gate at settle time, and this ran through a side-channel script afterward, with its own `contentHash` implications). Recorded here as corroborating evidence only. Full verdict JSON:
  ```json
  {
    "AC-1": "pass — TaskZ/parser preserve stop, packet renders the bold label, packet.test verifies stop text + byte-identical no-stop fixture",
    "AC-2": "pass — record-time delta, block refusal, first-sighting filtering, owner stderr, bypassed error events implemented and exercised",
    "AC-3": "pass — warn mode records git delta, gates notification, emits stated fallback reasons for no-draft/empty declared-file-union",
    "AC-4": "pass — best-effort git collection returns empty on failure; record-time code reports git-unavailable skip, retains self-report fallback",
    "AC-5": "pass — CLI/record persist all provenance fields; shared settle task-results logic covers normal and refused paths; additive schema preserves historical hashes",
    "AC-6": "pass — host-adapters.md has the required side-channel/runtime-forbidden/orchestrator-approval callout; docs test exercises it",
    "AC-7": "pass — coherenceCheck emits exactly the warn-only STOP_CONDITION_MISSING condition for files-bearing tasks without stop; tests cover exclusions"
  }
  ```
  Script preserved at `/tmp/claude-1000/-home-thomas-projects-cadence/87e1ceea-f3f8-4246-99f7-55d0ab25bb5d/scratchpad/retry-deep-verify.mjs` (session-scratchpad only, not committed) if this needs re-running or adapting for another phase.
- **Single commit** (`568544e8`, 52 files) carries source + tests + docs + `.changeset/dispatch-contract.md` + all phase artifacts including the one refused-attempt `SUMMARY-snapshot` sibling. `rec-20260718-003/004/005` auto-advanced to `settle-pending` by `settle run` itself.
- Filed `rec-20260815-002` (`cadence done` bypasses per-task-verify and the new record-time boundary/redundancy checks — evidence: `done.ts:13` calls `recordTaskOutcome` directly, bypassing `buildTaskService`) and `rec-20260815-003` (see TL;DR).

## Carry-forward gotchas
- **DP-B's own DRAFT declares no `stop:` fields on any of its 17 tasks** — a dogfooding irony, since T5's own new `STOP_CONDITION_MISSING` coherence check warns 17 times against 280-01's own DRAFT on every `draft approve`/`draft check`. Harmless (warn-severity, never blocks), but the next phase authored after this lands should declare `stop:` from the start rather than repeat the gap.
- **`boundary-scan` recorded `skipped` at settle**, reason `"boundaryEnforcement is not \"block\""`. This is correct, not a sign the T10/T14 fix didn't land: confirmed via `grep -c '"execution"' 280-01-PROGRESS.json` → `0` — no task in this phase's own build was ever recorded with `--execution dispatch`, so `anyTaskDispatched` is false and the dispatch-scoped escalation this phase *implements* was never exercised by its own live build, only by its tests. Don't read the `skipped` status as evidence of a regression.
- **7 `files-outside-boundary` WARN anomalies fired at the final settle** (`plan.test.ts`, `draft-parser.test.ts`, `packet.test.ts`, `settle.test.ts`, `check.test.ts`, `draft-approve.test.ts`, `draft-check.test.ts` — all collateral test-file fixes made by the orchestrator across the whole-branch-review fix rounds, never declared in any task's `files:`). Non-blocking, correct behavior — but real signal that a 17-task build genuinely accumulates out-of-boundary edits even when each task individually stays disciplined.
- **`deep-verify`/`code-review` never got a live, non-mock pass this session.** `CADENCE_HOST_CLI_BIN=codex` is set in this shell; codex timed out at the 180s default 3 separate times (2 deep-verify, 1 code-review) — a documented `host-cli` "never exits" limitation (`docs/providers.md`), not a cadence bug, likely worsened by DP-B's large diff (66KB) and back-to-back retries with no cooldown. `claude`/host-cli is categorically unusable for this from inside a headless Claude Code session — `CLAUDECODE=1` trips the self-invocation guard immediately, every time, by design (avoids unbounded recursion). A genuinely independent whole-branch review DID happen this session (fresh Agent-tool subagent, found 3 real defects — see "What landed"), but it's invisible to `SUMMARY.json` since it runs outside cadence's own gate machinery. Do **not** hand-edit `SUMMARY.json`'s `deepVerify.observedProvider` to claim a stronger status than `mock` — discussed at length with the operator this session; `rec-20260815-003` is the sanctioned path to actually earning a recordable non-mock status. If you want a genuine non-mock pass, either retry with `CADENCE_HOST_CLI_TIMEOUT_MS` bumped well past 180000, or dispatch a fresh subagent manually (outside settle) the same way this session did.
- **`rec-20260718-003/004/005` sit at `settle-pending`, not `shipped`.** `settle run` auto-advances converted recs on settle, but promoting to `shipped` needs `--ref` citing the real PR — do that once the PR referenced below actually exists and merges, not before.
- **The coverage-dedup bug is real, pre-existing, and NOT fixed** (`rec-20260807-001`, third confirmed hit this session, evidence attached as `ev-20260815-003`). It also newly-confirmed to corrupt `deep-verify`'s own AI-verifier input (same deduped `ctx.coverage()` map feeds both), and two consecutive settle runs against identical code showed genuine non-determinism in `deep-verify`'s offender set. Deliberately left unfixed here — `packages/core/src/verify/coverage.ts` is outside every DP-B task's declared `files:`, and CLAUDE.md's single-phase-commit convention means it needs its own phase, not a rider on this one.
- **Commit subject was amended once, pre-push** (dropped a placeholder `(#DP-B)` ref that looked like a fake PR number) — safe, no shared state affected, nothing to redo.

## Next action
- Action: with the operator's explicit go-ahead, `git push -u origin worktree-dp-b-dispatch-contract` then `gh pr create` against `main` (title should carry `(phase 280)`, body should summarize the dispatch-contract feature + the record.ts fix, per this repo's PR convention). Do not push or open the PR without that explicit go-ahead — it was deliberately held this session.
- Verify: `gh pr checks` green (`ci-success`), then independently confirm via `gh pr view` before considering it landed — same discipline as every other PR in this repo.
- After merge: promote `rec-20260718-003/004/005` to `shipped --ref "PR #<n>"`, and consider whether `rec-20260815-002`/`rec-20260815-003` are ready to convert to their own phases.
- If it fails: a red `ci-success` on this branch would be a genuine surprise given 4243/4243 passed locally — investigate for real rather than re-running blind (per the Flake Reflex rule), and check whether it's the known macOS/Node22 `settle-codereview-convergence.test.ts` timeout flake before assuming it's caused by this change.
