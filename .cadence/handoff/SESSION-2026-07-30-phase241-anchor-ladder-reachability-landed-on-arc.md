---
cadence_handoff: 1
generated_at: 2026-07-30T02:48:05.370Z
label: phase241-anchor-ladder-reachability-landed-on-arc
loop_position: IDLE
active_phase: 229-readme-mermaid-diagram-doc-test
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: 5d84bbd9
git_ahead: 12
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-30 (phase241-anchor-ladder-reachability-landed-on-arc)

## TL;DR for the next session
- **Phase 241 (anchor-ladder reachability) is landed on the arc.** PR #334 squash-merged into `feat/kernel-assurance-v2` as `eddfc6b6`, 21 files / +1248−133; all five CI checks green first try (build, ubuntu/macOS/windows on Node 22, `ci-success`); remote branch deleted. The arc's first five slices — **232, 233, 234, 235, 241** — are all on `feat/kernel-assurance-v2`; **nothing from this arc is on `main`**.
- What it did: `SettleContext` now carries an optional readonly `gateProvenance`, `runSettleGates` hands each gate a **two-level-frozen** snapshot of provenance-so-far, and `gates/code-review.ts` passes it through instead of a literal `[]`. The ladder's `executable` tier is reachable in a live settle for the first time. Closes **`rec-20260729-002`** (high) and **`rec-20260729-007`**; both promoted to `shipped` in the settle commit and now in the ledger's `archived` array.
- **`rec-20260729-003` and `rec-20260729-005` are still open** (per-file rather than per-finding anchoring; boundary-substring anchors masking gaps). Still disclosed in `docs/concepts.md` and pinned by `criteria-anchoring-docs.test.ts`. Nothing was buried.
- **Both local branches were synced to origin at end of session** (merge, not rebase — no history rewritten, no commit discarded). `main` behind 0 / **ahead 12**; `feat/kernel-assurance-v2` behind 0 / **ahead 2**. Both merged trees verified green independently (24/24 turbo tasks each). All 14 commits are unpushed and each line would need a branch + PR to land — even chore commits cannot go direct to `main`.
- **⚠ This checkout's `.cadence/` is stale and the pre-filled State/context blocks below are misleading.** They say loop `IDLE` / phase `229-readme-mermaid-diagram-doc-test`, which predates the whole arc. The arc's real ledger, roadmap, and phase artifacts live on `feat/kernel-assurance-v2` — read them there, not here.
- **Single next action:** the retroactive coverage audit (`rec-20260729-006`), still gated on phase 239 landing. Phase 239's worktree is now **unlocked** (that session appears to have ended), so re-establish whether it landed before assuming the gate is still closed. See `## Next action`.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 12 ahead / 0 behind origin
- HEAD `5d84bbd9`
- Recent commits:
```
5d84bbd9 Merge remote-tracking branch 'origin/main'
bbf9ee60 chore(cadence): stamp session handoff — phase241-anchor-ladder-reachability-landed-on-arc
16d62098 chore(cadence): stamp session handoff — phase235-landed-coverage-audit-blocked-on-239
84dc9bd9 fix: doctor verification-readiness checks every verifier seam (phase 240) (#332)
01bf09aa fix: run CI on feat/kernel-assurance-v2 PRs, not just main (#329)
82e898c5 chore(cadence): stamp session handoff — phase232-shipped-feature-branch-233-next
a0ca4e31 chore(cadence): stamp session handoff — phase238-shipped-phase0-kernel-next
c28ae333 Merge remote-tracking branch 'origin/main'
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

- **Phase 241 — `eddfc6b6` on `feat/kernel-assurance-v2` (PR #334).** One commit: source + tests + docs + changeset + phase artifacts, per the single-commit settle convention. Zero gate bypasses; all 5 ACs `pass: true` at `executed` evidence; SUMMARY `schemaVersion: 2` **with** an assurance record (branch-local binary throughout, never the global v1.51.1 that silently writes v1).
- Built subagent-driven in `.claude/worktrees/241-anchor-ladder-reachability` (worktree since removed, branch deleted by the merge): 4 implementers + 4 independent adversarial reviewers + 1 whole-branch review, every completion claim re-verified in the main thread.
- **T1** — `SettleContext.gateProvenance` (optional, `readonly Readonly<GateProvenance>[]`) + per-gate frozen snapshot in `runSettleGates`, preserving the memoized `coverage()`/`draftMtimeMs()`/`diff()` closures by identity.
- **T2** — `code-review.ts` consumes it (`ctx.gateProvenance ?? []`); `criteria-gap.ts` doc comment corrected (comment-only diff).
- **T3** — end-to-end test driving the **real CLI** over a testkit ephemeral repo, reading the tier out of the persisted `SUMMARY.json`.
- **T4** — corrected the shipped disclosures + new AC-5 doc-content test deriving the gate set from `gatesFor()` rather than a hardcoded list.
- **Dogfooded (this is what closes `rec-20260729-007`):** the DRAFT declares `profile: strict`, so this phase's own SUMMARY records `code-review → ran` (provider `mock`) instead of `skipped: not in the active tier × profile gate set` — the first time criteria-anchoring has run in a real settle on this arc.
- **Five real defects caught by review, all fixed:** (1) `Object.freeze([...gates])` froze only the array, leaving entries sharing object identity with the live accumulator so a gate could rewrite an entry landing in `SUMMARY.json.gates` — **with no cast required**; (2) the AC-1 test stayed green under a mutation dropping every `skipped`/`refused` entry; (3) three further copies of the falsified claim, including **phase 235's unreleased changeset**, which would have published a CHANGELOG calling the tier unreachable in the release that fixes it; (4) doc assertions checked *disjoint fragments*, so "reachable … even without a `status: 'ran'` entry" would have passed; (5) my own `registry.ts` comment still said "no cast required" after I hardened the element type, contradicting `types.ts` seven lines away.
- **Caught by me, not a subagent:** `docs/concepts.md` still framed all three limitations as "open" after one closed; and a full-suite run caught my own bad precondition regex (it demanded two newlines between adjacent DRAFT lines) that three subagents and three reviewers had all reported green around.
- **End-of-session sync** — `main` merged `origin/main` (picking up phase 240 `#332` + the CI fix `#329`); `feat/kernel-assurance-v2` merged `origin/…` (picking up 234, 235, 241). Both clean, no conflicts (including `recommendations.json`, which has collided on past syncs), both merged trees verified green: arc 24/24 core 3420 · types 328; main 24/24 core 3310 · types 303. The count gap is expected — the arc carries the arc phases' tests that `main` does not.
- Repo housekeeping: removed the idle 241 worktree with `git worktree remove` (leaves branches intact), leaving only the primary checkout and the 239 worktree.

## Carry-forward gotchas

- **`gh pr merge --squash --delete-branch` failed locally again** (6th+ session — recurring here). It printed `fatal: Not possible to fast-forward, aborting.` and left the worktree checked out on the stale local `feat/kernel-assurance-v2`, which made the phase's own source files **look reverted**. **The remote merge succeeded regardless.** Always verify with `gh pr view <n>` / `git log origin/<base>` before reacting — do not re-merge, re-push, or "restore" anything.
- **Never `git push` bare from a worktree created as `git worktree add -b <phase> … origin/feat/kernel-assurance-v2`.** The branch's upstream is the *arc branch*, so a bare push would land the commit straight on `feat/kernel-assurance-v2` and bypass the PR. Use an explicit refspec (`git push origin refs/heads/<b>:refs/heads/<b>`) and verify the arc tip is unchanged afterwards.
- **`EnterWorktree` cannot base off a non-default branch** — its `worktree.baseRef` resolves to `origin/main`. For arc work: `git worktree add -b <slug> .claude/worktrees/<slug> origin/feat/kernel-assurance-v2`, then `EnterWorktree` with `path`. A fresh worktree also has **no `state.json`** (gitignored since phase 196), so `draft new` refuses until `cadence onboard --skip-host-wire`.
- **Editing an approved DRAFT mid-BUILD makes `draft-read` refuse at settle** (mtime > `draftReadAt`). Fix is re-approve, **not** `--allow-stale-draft`. Safe to defer to just before settle: `draft approve` writes only `state.json` (`loopPosition`, `tier`, `draftReadAt`, `openDrafts`) and **never touches `PROGRESS.json`**, so one re-approve after all amendments preserves recorded task outcomes. Six "As built" amendments landed this way.
- **The `mock` code-review verifier only flags added `console.log(` lines.** Any phase whose diff has none gets an empty `codeReview` map, so a phase cannot self-demonstrate anchoring — `executable` evidence must come from a fixture diff. Disclosed in 241's DRAFT, SUMMARY, commit, and PR; don't let a future green settle imply more.
- **Two structurally unobservable states, documented rather than faked:** no gate can ever observe a `refused` provenance entry (refusal `return`s out of `runSettleGates` before later gates run), and for the same reason no gate can see a refused *test* gate. AC-4 is proven via the two `skipped` variants — the substantive one being that `--allow-failing-build` cannot buy an `executable` anchor.
- **Coverage evidence on phase 241 is weaker than it looks.** The gate still matches ACs by bare `AC-N` token repo-wide, so 241's `AC-1`…`AC-5` could be satisfied by unrelated phases' tests. That is exactly the defect **phase 239** fixes. Recorded in the SUMMARY, not hidden.
- **14 unpushed local commits across two branches, all deliberate.** `main` ahead 12 (handoff stamps + sync merges); `feat/kernel-assurance-v2` ahead 2 — the sync merge plus `701d1f5b`, an old phase-233 handoff stamp that also **deletes** `SESSION-2026-07-25-v1-51-0-and-flake-fix-shipped.md`. Sync used **merge, not rebase**, specifically to avoid rewriting or destroying `701d1f5b`; if you want it gone, that is a destructive call to make explicitly. This handoff commit is also unpushed.
- Phase 239's worktree (`.claude/worktrees/239-coverage-phase-scoping`, branch `worktree-239-coverage-phase-scoping` @ `8e92d72d`) is **no longer locked**, so that session appears to have ended. Confirm it is actually dead before touching it (Zombie Session rule).

## Next action

**Action:** Run the **retroactive coverage audit** — `rec-20260729-006` — **once phase 239 has landed**. For every settled phase, re-derive whether each AC's satisfying `AC-N` token actually sits in a test file belonging to *that* phase rather than an unrelated one, and report how many historical AC PASS records had genuine per-phase coverage versus cross-phase-only satisfaction. Read `rec-20260729-004` first (on `feat/kernel-assurance-v2`) for the mechanism and the measurements already taken — do not re-derive them.

**Verify:** `cadence verify coverage --explain <AC-N>` is the read-only tool that exposes per-file satisfaction. The audit succeeds when it produces a count of settled-phase ACs whose coverage came only from unrelated phases' tests, with a per-phase breakdown, and `rec-20260729-006` is promoted or annotated with that evidence.

**Gate before starting:** phase 239 introduces the phase-qualified token (`239-01/AC-3`) that makes a trustworthy audit possible. Its worktree is now unlocked, so **first establish whether 239 actually landed** — `git log origin/main`, `gh pr list --state merged`, and that worktree's own `.cadence/`. If it has not landed, the audit's number would come from the same broken unscoped scan it is auditing: say so and stop rather than producing a figure you would have to disclaim.

**If it fails / is bigger than expected:** scope the audit to a recent window (say the last 20 phases) and **report that scoping explicitly** — no silent caps. Expect the truthful result to turn some currently-green historical ACs red; that is the correct outcome and means the finding cannot ship quietly.

**Alternative if 239 has not landed:** the arc's next unblocked slice is the roadmap's **phase 236** (finding identity, disposition, ledger routing — `rec-20260727-006` + `rec-20260727-011`), whose stated gate-to-entry requires resolving `rec-20260727-007` first (extract a shared fingerprint primitive from Déjà, `needs-evidence`) — building a bespoke fingerprint before that investigation lands is how two incompatible ones get shipped.

**Do NOT:** fix `rec-20260729-003` / `rec-20260729-005` inline — both are deliberately disclosed, still-open phase-235 limitations with their own scope. Do not "tidy" the coverage gate while auditing it. Do not land arc work on `main`; the arc lands on `feat/kernel-assurance-v2` via per-slice PR. Do not reset or rebase away the unpushed local commits without asking.
