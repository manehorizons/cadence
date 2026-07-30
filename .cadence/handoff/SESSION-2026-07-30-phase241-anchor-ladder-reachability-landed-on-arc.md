---
cadence_handoff: 1
generated_at: 2026-07-30T02:38:23.430Z
label: phase241-anchor-ladder-reachability-landed-on-arc
loop_position: IDLE
active_phase: 229-readme-mermaid-diagram-doc-test
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: 16d62098
git_ahead: 10
git_behind: 2
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-30 (phase241-anchor-ladder-reachability-landed-on-arc)

## TL;DR for the next session
- **Phase 241 (anchor-ladder reachability) is landed on the arc.** PR #334 squash-merged into `feat/kernel-assurance-v2` as `eddfc6b6` at 2026-07-30T02:3xZ; all five CI checks green first try (build, ubuntu/macOS/windows on Node 22, `ci-success`); remote branch deleted. The arc's first five slices — **232, 233, 234, 235, 241** — are all on `feat/kernel-assurance-v2`; **nothing from this arc is on `main`**.
- What it did: `SettleContext` now carries an optional readonly `gateProvenance`, `runSettleGates` hands each gate a **two-level-frozen** snapshot of provenance-so-far, and `gates/code-review.ts` passes it through instead of a literal `[]`. The ladder's `executable` tier is reachable in a live settle for the first time. Closes **`rec-20260729-002`** (high) and **`rec-20260729-007`**; both promoted to `shipped` in the settle commit and now in the ledger's `archived` array.
- **`rec-20260729-003` and `rec-20260729-005` are still open** (per-file rather than per-finding anchoring; boundary-substring anchors masking gaps). They remain disclosed in `docs/concepts.md` and pinned by `criteria-anchoring-docs.test.ts`. Nothing was buried.
- **⚠ This checkout's `.cadence/` is stale and the pre-filled State block below is misleading.** It says loop `IDLE` / phase `229-readme-mermaid-diagram-doc-test` — that predates the whole arc. The arc's real ledger, roadmap, and phase artifacts live on `feat/kernel-assurance-v2`. Read them there, not here.
- **`main` is `ahead 10 / behind 2`, deliberately untouched again this session.** Local `feat/kernel-assurance-v2` is `ahead 1 / behind 3` — the `ahead 1` is an old unpushed phase-233 handoff-stamp commit (`701d1f5b`) that also *deletes* a handoff doc; left alone across two sessions now. Decide what to do with it rather than inheriting it silently.
- **Single next action:** the retroactive coverage audit (`rec-20260729-006`), still gated on phase 239 landing — see `## Next action`. Phase 239 was live in a sibling worktree during this session and is now **unlocked**, so re-check whether it landed before assuming the gate is still closed.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 10 ahead / 2 behind origin
- HEAD `16d62098`
- Recent commits:
```
16d62098 chore(cadence): stamp session handoff — phase235-landed-coverage-audit-blocked-on-239
82e898c5 chore(cadence): stamp session handoff — phase232-shipped-feature-branch-233-next
a0ca4e31 chore(cadence): stamp session handoff — phase238-shipped-phase0-kernel-next
c28ae333 Merge remote-tracking branch 'origin/main'
127a06b0 chore: drop Node 20 support, raise engine floor to Node >=22 (phase 238) (#324)
0cdfb94a Merge remote-tracking branch 'origin/main'
df41e3ca chore(cadence): file phase 238 (drop Node 20 support) + backfill phase 231's rec id (#323)
31a6c327 Merge remote-tracking branch 'origin/main'
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

**Phase 241 — `eddfc6b6` on `feat/kernel-assurance-v2` (PR #334), 21 files, +1248/−133.** One commit: source + tests + docs + changeset + phase artifacts, per the single-commit settle convention. Zero gate bypasses; all 5 ACs `pass: true` at `executed` evidence; SUMMARY `schemaVersion: 2` **with** an assurance record.

Built subagent-driven in `.claude/worktrees/241-anchor-ladder-reachability` (worktree since removed; branch deleted by the merge): 4 implementers + 4 independent adversarial reviewers + 1 whole-branch review, with every completion claim re-verified in the main thread.

- **T1** `SettleContext.gateProvenance` (optional, `readonly Readonly<GateProvenance>[]`) + per-gate frozen snapshot in `runSettleGates`.
- **T2** `code-review.ts` consumes it (`ctx.gateProvenance ?? []`); `criteria-gap.ts` doc comment corrected (comment-only).
- **T3** end-to-end test driving the **real CLI** over a testkit ephemeral repo, reading the tier out of the persisted `SUMMARY.json`.
- **T4** corrected the shipped disclosures + a new AC-5 doc-content test deriving the gate set from `gatesFor()`.

**Dogfooding (this is what closes `rec-20260729-007`):** the DRAFT declares `profile: strict`, so this phase's own SUMMARY records `code-review → ran` (provider `mock`) instead of `skipped: not in the active tier × profile gate set` — the first time criteria-anchoring has run in a real settle on this arc.

**The reviews caught five real defects that would otherwise have shipped:**
1. `Object.freeze([...gates])` froze only the array — entries shared object identity with the live accumulator, so a gate could rewrite an entry landing in `SUMMARY.json.gates` (which feeds the phase-233 assurance record), **with no cast required**. Fixed with a two-level freeze + `Readonly<GateProvenance>` element type.
2. The AC-1 test stayed green under a mutation dropping every `skipped`/`refused` entry from the snapshot. Pinned with a regression test, verified by re-running the mutation.
3. Three further copies of the falsified claim beyond the one in the DRAFT — including **phase 235's own unreleased changeset**, which would have published a CHANGELOG calling the tier unreachable in the very release that fixes it.
4. Doc-content assertions checked *disjoint fragments*, so prose claiming "reachable … even without a `status: 'ran'` entry" would have passed. Tightened to whitespace-normalized **connected clauses** covering both ladder conditions; verified by injecting two counterexamples and confirming failure.
5. My own `registry.ts` comment still said "no cast required" after I hardened the element type — contradicting `types.ts` seven lines away.

**Also fixed by me, not a subagent:** `docs/concepts.md` still framed all three limitations as "open" after one closed; and a full-suite run caught my own bad precondition regex (it demanded two newlines between adjacent DRAFT lines) that three subagents and three reviewers had all reported green around.

## Carry-forward gotchas

- **`gh pr merge --squash --delete-branch` failed locally again** (6th+ session — a known recurring failure here). It printed `fatal: Not possible to fast-forward, aborting.` and left the worktree checked out on the stale local `feat/kernel-assurance-v2` @ `701d1f5b`, which made the phase's own source files *look reverted*. **The remote merge succeeded regardless.** Always verify with `gh pr view <n>` / `git log origin/<base>` before reacting; do not re-merge, re-push, or "restore" anything.
- **Never `git push` from a worktree created as `git worktree add -b <phase> … origin/feat/kernel-assurance-v2`.** The branch's upstream is the *arc branch*, so a bare `git push` would shove the commit straight onto `feat/kernel-assurance-v2` and bypass the PR. Use an explicit refspec (`git push origin refs/heads/<branch>:refs/heads/<branch>`) and verify the arc tip is unchanged afterwards.
- **`EnterWorktree` cannot base off a non-default branch** — its `worktree.baseRef` resolves to `origin/main`. For arc work: `git worktree add -b <slug> .claude/worktrees/<slug> origin/feat/kernel-assurance-v2`, then `EnterWorktree` with `path`. Also: a fresh worktree has **no `state.json`** (gitignored since phase 196), so `draft new` refuses until you run `cadence onboard --skip-host-wire`.
- **Editing an approved DRAFT mid-BUILD makes `draft-read` refuse at settle** (mtime > `draftReadAt`). The fix is re-approve, not `--allow-stale-draft`. Safe to defer: `draft approve` writes only `state.json` (`loopPosition`, `tier`, `draftReadAt`, `openDrafts`) and **never touches `PROGRESS.json`**, so one re-approve after all amendments preserves recorded task outcomes. Six "As built" amendments landed this way.
- **The `mock` code-review verifier only flags added `console.log(` lines.** Any phase whose diff has none gets an empty `codeReview` map, so a phase cannot self-demonstrate anchoring — the `executable` evidence must come from a fixture diff. Stated explicitly in the DRAFT, SUMMARY, commit, and PR; don't let a future green settle imply more.
- **Two structurally unobservable states, both documented rather than faked:** no gate can ever observe a `refused` provenance entry (refusal `return`s out of `runSettleGates` before later gates run), and for the same reason a later gate can never see a refused *test* gate. AC-4 is proven via the two `skipped` variants instead — the substantive one being that `--allow-failing-build` cannot buy an `executable` anchor.
- **Coverage evidence on this phase is weaker than it looks.** The gate still matches ACs by bare `AC-N` token repo-wide, so 241's `AC-1`…`AC-5` could be satisfied by unrelated phases' tests. That is exactly the defect **phase 239** fixes. Recorded here, not hidden.
- **Unpushed local commits, both deliberate:** `main` `ahead 10` (handoff stamps + merge commits) and `feat/kernel-assurance-v2` `ahead 1` (`701d1f5b`, a phase-233 handoff stamp that also deletes `SESSION-2026-07-25-v1-51-0-and-flake-fix-shipped.md`). Neither was touched. **This handoff commit is also unpushed** — push only if switching machines.
- Phase 239's worktree (`.claude/worktrees/239-coverage-phase-scoping`, branch `worktree-239-coverage-phase-scoping` @ `8e92d72d`) is **no longer locked**, so that session appears to have ended. Confirm it is actually dead before touching it.

## Next action

**Action:** Run the **retroactive coverage audit** — `rec-20260729-006` — **once phase 239 has landed**. For every settled phase, re-derive whether each AC's satisfying `AC-N` token actually sits in a test file belonging to *that* phase rather than an unrelated one, and report how many historical AC PASS records had genuine per-phase coverage versus cross-phase-only satisfaction. Read `rec-20260729-004` first (on `feat/kernel-assurance-v2`) for the mechanism and the measurements already taken — do not re-derive them. `cadence verify coverage --explain <AC-N>` is the read-only tool that exposes per-file satisfaction.

**Gate before starting:** phase 239 introduces the phase-qualified token (`239-01/AC-3`) that makes a trustworthy audit possible. Its worktree is now unlocked, so **first establish whether 239 actually landed** (`git log origin/main`, `gh pr list --state merged`, and its worktree's own `.cadence/`). If it has not landed, the audit's number would come from the same broken unscoped scan it is auditing — say so and stop rather than producing a figure you would have to disclaim.

**Verify:** the audit produces a count of settled-phase ACs whose coverage came only from unrelated phases' tests, with a per-phase breakdown; `rec-20260729-006` is promoted or annotated with that evidence.

**If it fails / is bigger than expected:** scope the audit to a recent window (say the last 20 phases) and **report that scoping explicitly** — no silent caps. Expect the truthful result to turn some currently-green historical ACs red; that is the correct outcome and means the finding cannot ship quietly.

**Alternative if 239 has not landed:** the arc's next unblocked slice is the roadmap's **phase 236** (finding identity, disposition, ledger routing — `rec-20260727-006` + `rec-20260727-011`), whose stated gate-to-entry requires resolving `rec-20260727-007` (extract a shared fingerprint primitive from Déjà, `needs-evidence`) **first** — building a bespoke fingerprint before that investigation lands is how two incompatible ones get shipped.

**Do NOT:** fix `rec-20260729-003` / `rec-20260729-005` inline — both are deliberately disclosed, still-open phase-235 limitations with their own scope. Do not "tidy" the coverage gate while auditing it. Do not land arc work on `main`; the arc lands on `feat/kernel-assurance-v2` via per-slice PR. Do not reset or rebase away the two unpushed local commits noted above without asking.
